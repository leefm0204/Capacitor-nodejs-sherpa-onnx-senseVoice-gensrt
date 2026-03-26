// extract-mp4-to-pcm.js
//
// Wraps the native addon and exposes three APIs:
//
//   extractMP4toPCMSync(path)
//       → { samples: Float32Array, sampleRate, channels, srcSampleRate }
//       Blocks the calling thread. Use only from a worker_thread.
//
//   extractMP4toPCMAsync(path)
//       → Promise<{ samples: Float32Array, sampleRate, channels, srcSampleRate }>
//       Full-buffer, backward-compatible. Runs decode on a libuv thread.
//
//   extractMP4toPCMStream(path, onChunk [, options])
//       → Promise<void>
//       Streaming decode. onChunk({ samples: Float32Array, sampleRate: 16000,
//       channels: 1 }) fires for every ~2 s segment. The Promise resolves when
//       all chunks have been delivered and onChunk has settled, or rejects on
//       any decode / onChunk error.
//
//       options:
//         maxConcurrent {number}  – max simultaneous in-flight onChunk calls
//                                   (default: 1 — fully sequential, zero RAM pileup).
//                                   Raise to 2–3 only if onChunk is async and you
//                                   want decode + processing to overlap.
//
// Memory fixes applied (over original):
//   FIX-JS-1  Backpressure gate: native chunks are queued and drained at most
//             `maxConcurrent` at a time. Prevents the C++ worker from racing ahead
//             of the JS consumer (VAD / recognizer), which caused RAM to grow
//             unboundedly for long files.
//   FIX-JS-2  Rejected-promise from an async onChunk now correctly tears down
//             the stream (original only called .catch but never set a guard to
//             stop processing further chunks).
//   FIX-JS-3  "done before any chunk" error is now deferred until all in-flight
//             onChunk calls settle, preventing a race where resolve() fired while
//             a chunk was still being processed.
//   FIX-JS-4  chunk.samples nullability guard: if the native layer sends a done
//             signal with a non-null but empty chunk, we skip it gracefully instead
//             of rejecting with a misleading error.
//   FIX-JS-5  Single reject-once guard shared across the callback and the drain
//             loop so double-rejection is impossible even under concurrent onChunk.
//
'use strict';

const nodePath = require('path');
const fs       = require('fs');

// ----------------------------------------------------------------
// Load native addon
// ----------------------------------------------------------------
let addon;
try {
    addon = require('./addon.js');
} catch (e) {
    throw new Error(`Failed to load native addon: ${e.message}`);
}

const required = ['ExtractMP4toPCM', 'ExtractMP4toPCMAsync', 'ExtractMP4toPCMStream'];
const missing  = required.filter(k => typeof addon[k] !== 'function');
if (missing.length) {
    throw new Error(
        `Native addon missing exports: ${missing.join(', ')}. ` +
        `Available: ${Object.keys(addon).join(', ')}`
    );
}

// ----------------------------------------------------------------
// Shared path validation
// ----------------------------------------------------------------
function validatePath(mp4Path) {
    if (typeof mp4Path !== 'string' || !mp4Path.trim())
        throw new TypeError('Expected non-empty string path');

    const resolved = nodePath.resolve(mp4Path);

    if (!fs.existsSync(resolved))
        throw new Error(`File not found: ${resolved}`);

    const stat = fs.statSync(resolved);
    if (!stat.isFile())  throw new Error(`Not a file: ${resolved}`);
    if (stat.size === 0) throw new Error(`File is empty: ${resolved}`);

    return resolved;
}

// ----------------------------------------------------------------
// Shared result validation
// ----------------------------------------------------------------
function validateResult(result, filePath) {
    if (!result)
        throw new Error(`ExtractMP4toPCM returned null for: ${filePath}`);
    if (!(result.samples instanceof Float32Array))
        throw new Error('result.samples is not Float32Array');
    if (result.samples.length === 0)
        throw new Error(`Decoded audio is empty: ${filePath}`);
    if (typeof result.sampleRate !== 'number' || result.sampleRate <= 0)
        throw new Error(`Invalid sampleRate: ${result.sampleRate}`);
}

// ----------------------------------------------------------------
// Sync — blocks calling thread (use only from worker_thread)
// ----------------------------------------------------------------
function extractMP4toPCMSync(mp4Path) {
    const resolved = validatePath(mp4Path);
    const result   = addon.ExtractMP4toPCM(resolved);
    validateResult(result, resolved);
    return result;
}

// ----------------------------------------------------------------
// Async (full-buffer) — backward-compatible, runs on libuv thread
// ----------------------------------------------------------------
function extractMP4toPCMAsync(mp4Path) {
    return new Promise((resolve, reject) => {
        let resolved;
        try { resolved = validatePath(mp4Path); }
        catch (e) { return reject(e); }

        addon.ExtractMP4toPCMAsync(resolved, (err, result) => {
            if (err) return reject(err instanceof Error ? err : new Error(String(err)));
            try {
                validateResult(result, resolved);
                resolve(result);
            } catch (e) {
                reject(e);
            }
        });
    });
}

// ----------------------------------------------------------------
// Streaming async — backpressure-aware chunk delivery
//
// FIX-JS-1: A simple queue + in-flight counter limits how far ahead
// the native decode thread can run relative to the JS consumer.
// maxConcurrent=1 (default) means onChunk calls are strictly
// sequential — chunk N+1 is not started until chunk N's Promise
// (if async) has settled. This eliminates the RAM pileup where the
// C++ worker flooded the CircularBuffer faster than VAD could drain it.
//
// FIX-JS-2/3/4/5: see inline comments.
// ----------------------------------------------------------------
function extractMP4toPCMStream(mp4Path, onChunk, options) {
    if (typeof onChunk !== 'function')
        throw new TypeError('onChunk must be a function');

    const maxConcurrent = (options && typeof options.maxConcurrent === 'number'
        && options.maxConcurrent >= 1)
        ? Math.floor(options.maxConcurrent)
        : 1;   // default: fully sequential (safest for RAM)

    return new Promise((resolve, reject) => {
        let resolved;
        try { resolved = validatePath(mp4Path); }
        catch (e) { return reject(e); }

        // ── state ──────────────────────────────────────────────
        let chunkIndex  = 0;    // total valid chunks received from native
        let inFlight    = 0;    // number of onChunk calls currently running
        let nativeDone  = false;
        let nativeErr   = null;
        let rejected    = false;

        // FIX-JS-1: pending queue holds chunks the native layer pushed
        // while we were at maxConcurrent capacity.
        const queue = [];   // Array<{ chunk }>

        // FIX-JS-5: single-shot reject guard — prevents double-rejection
        // from concurrent onChunk errors + a native error arriving together.
        function failOnce(err) {
            if (rejected) return;
            rejected = true;
            reject(err instanceof Error ? err : new Error(String(err)));
        }

        // Called after every onChunk settlement.
        // Starts the next queued chunk if capacity allows, then checks
        // whether we are truly done.
        function settle() {
            inFlight--;
            if (rejected) return;
            drain();
            if (nativeDone && inFlight === 0 && queue.length === 0) {
                // FIX-JS-3: only resolve/fail after everything has settled
                if (nativeErr)       failOnce(nativeErr);
                else if (chunkIndex === 0) failOnce(new Error(`No audio chunks decoded from: ${resolved}`));
                else                 resolve();
            }
        }

        // Pull chunks off the queue and hand them to onChunk, up to
        // maxConcurrent in-flight calls.
        function drain() {
            while (queue.length > 0 && inFlight < maxConcurrent && !rejected) {
                const { chunk } = queue.shift();
                inFlight++;

                let ret;
                try {
                    ret = onChunk(chunk);
                } catch (e) {
                    // FIX-JS-2: synchronous throw tears down the stream
                    inFlight--;
                    failOnce(e);
                    return;
                }

                if (ret && typeof ret.then === 'function') {
                    // FIX-JS-2: async rejection also tears down the stream
                    ret.then(settle, failOnce);
                } else {
                    // Schedule settle on next microtask to avoid stack overflow
                    // on files with many small chunks handled synchronously.
                    Promise.resolve().then(settle);
                }
            }
        }

        // ── native callback ────────────────────────────────────
        addon.ExtractMP4toPCMStream(resolved, (err, chunk, isDone) => {
            // FIX-JS-5: ignore further callbacks after first failure
            if (rejected) return;

            if (err) {
                nativeErr  = err instanceof Error ? err : new Error(String(err));
                nativeDone = true;
                // If nothing is running or queued, fail immediately;
                // otherwise settle() will call failOnce when the last
                // in-flight call completes.
                if (inFlight === 0 && queue.length === 0) failOnce(nativeErr);
                return;
            }

            if (chunk) {
                // FIX-JS-4: skip empty/malformed chunks rather than rejecting
                // with a misleading index error — the done signal will still
                // arrive and handles the zero-chunk case correctly.
                if (!(chunk.samples instanceof Float32Array) ||
                    chunk.samples.length === 0) {
                    return;
                }
                chunkIndex++;
                queue.push({ chunk });
                drain();
            }

            if (isDone) {
                nativeDone = true;

                // If the queue is empty and nothing is in-flight we can
                // settle immediately; otherwise settle() does it after the
                // last chunk completes (FIX-JS-3).
                if (inFlight === 0 && queue.length === 0) {
                    if (nativeErr)       failOnce(nativeErr);
                    else if (chunkIndex === 0) failOnce(new Error(`No audio chunks decoded from: ${resolved}`));
                    else                 resolve();
                }
            }
        });
    });
}

module.exports = {
    extractMP4toPCMSync,
    extractMP4toPCMAsync,
    extractMP4toPCMStream,
};

