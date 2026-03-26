// lib/extract-audio-to-pcm.js
//
// JavaScript wrapper for the native extract-audio-to-pcm.cc addon.
//
// Supports ANY container FFmpeg understands: MP4, M4A, MPEG-TS, MKV, WebM, etc.
// Audio is decoded, downmixed to mono, and resampled to 16 kHz Float32.
//
// Exported API:
//   extractAudioToPCM(path)                          → { samples, sampleRate, channels, srcSampleRate }
//   extractAudioToPCMAsync(path, cb)                 → void
//   extractAudioToPCMStream(path, onChunk)           → void
//     onChunk(err, { samples, sampleRate, channels } | null, isDone)
//

const addon = require("./addon");

/**
 * Extract audio from any FFmpeg-supported container format.
 * Decodes audio, downmixes to mono, resamples to 16 kHz Float32.
 *
 * @param {string} path - Path to the audio/video file
 * @returns {{ samples: Float32Array, sampleRate: number, channels: number, srcSampleRate: number }}
 * @throws {Error} If extraction fails
 */
function extractAudioToPCM(path) {
  return addon.ExtractAudiotoPCM(path);
}

/**
 * Extract audio asynchronously (full buffer).
 *
 * @param {string} path - Path to the audio/video file
 * @param {(err: Error|null, result?: { samples: Float32Array, sampleRate: number, channels: number, srcSampleRate: number }) => void} cb
 */
function extractAudioToPCMAsync(path, cb) {
  addon.ExtractAudiotoPCMAsync(path, cb);
}

/**
 * Extract audio with streaming callback.
 *
 * @param {string} path - Path to the audio/video file
 * @param {(err: Error|null, chunk: { samples: Float32Array, sampleRate: number, channels: number }|null, isDone: boolean) => void} onChunk
 * @returns {Promise<void>} Resolves when extraction completes, rejects on error
 */
function extractAudioToPCMStream(path, onChunk) {
  return new Promise((resolve, reject) => {
    addon.ExtractAudiotoPCMStream(path, (err, chunk, isDone) => {
      // Handle error case
      if (err) {
        reject(err);
        return;
      }

      // Skip null chunks (done signal with no data)
      if (isDone && chunk === null) {
        resolve();
        return;
      }

      // Pass valid chunks to the callback
      if (chunk !== null) {
        onChunk(chunk, isDone);
      }

      // Resolve on done signal
      if (isDone) {
        resolve();
      }
    });
  });
}

module.exports = {
  extractAudioToPCM,
  extractAudioToPCMAsync,
  extractAudioToPCMStream,
};
