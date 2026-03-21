'use strict';

// ----------------------------------------------------------------
// V8 Memory Management (must be loaded first)
// ----------------------------------------------------------------
const { MemoryManager } = require('./v8_memory.js');

// Initialize memory manager with optimized config for mobile
const memoryManager = new MemoryManager({
  initialHeapSize: 64,
  maxHeapSize: 256,              // Lower for mobile devices
  heapUsageThreshold: 0.7,       // Trigger GC at 70% (more conservative)
  externalMemoryThreshold: 0.75, // Trigger GC when external memory high
  rssThreshold: 200,             // Lower RSS threshold for mobile
  checkInterval: 3000,           // Check every 3 seconds (more frequent)
  aggressiveGCInterval: 1500,    // Aggressive GC every 1.5s when needed
  logLevel: 'info',
});

// Start memory monitoring
memoryManager.startMonitoring();

// Log memory stats on file completion
memoryManager.on('gc', (data) => {
  console.log('[Node.js] GC completed:', {
    freed: `${data.freed.toFixed(2)}MB`,
    heapAfter: `${data.after.heap.used.toFixed(2)}MB`,
  });
});

memoryManager.on('warning', (stats) => {
  console.warn('[Node.js] Memory warning:', {
    heap: `${stats.heap.used.toFixed(2)}MB (${stats.heap.usagePercent.toFixed(1)}%)`,
    rss: `${stats.process.rss.toFixed(2)}MB`,
  });
});

// ----------------------------------------------------------------
// server.js — Simplified streaming transcription server
// ----------------------------------------------------------------
// Refactored to use straightforward chunk processing similar to gensrt.js

const path = require('path');
const fs   = require('node:fs');
const fsp  = require('node:fs/promises');

// ----------------------------------------------------------------
// Lazy-loaded heavy modules
// ----------------------------------------------------------------
let sherpaOnnx = null;
function getSherpaOnnx() {
    if (!sherpaOnnx) {sherpaOnnx = require('sherpa-onnx-node');}
    return sherpaOnnx;
}

// Audio extractor - supports any FFmpeg-supported format (MP4, TS, MKV, WebM, etc.)
let extractAudio = null;
function getExtractAudio() {
    if (!extractAudio) {extractAudio = require('./sherpa-onnx-node/extract-audio-to-pcm.js');}
    return extractAudio;
}

const { channel, getDataPath } = require('bridge');
const { helloWorld }           = require('hello-world-npm');
const { ProgressTracker }      = require('./progress_tracker.js');
// ----------------------------------------------------------------
// CACHE CLEANUP - Clear sherpa-onnx cache files before processing
// ----------------------------------------------------------------
async function clearCacheDirectory() {
    try {
        const dataPath = getDataPath();
        const cacheDir = path.join(dataPath, 'cache');
        
        // Check if cache directory exists
        try {
            await fsp.access(cacheDir);
        } catch {
            // Cache dir doesn't exist, nothing to clean
            return;
        }
        
        // Read all entries in cache directory
        const entries = await fsp.readdir(cacheDir);
        
        if (entries.length === 0) {
            console.log('[Node.js] Cache directory is empty');
            return;
        }
        
        // Delete all cache files
        let deletedCount = 0;
        let deletedSize = 0;
        
        for (const entry of entries) {
            const fullPath = path.join(cacheDir, entry);
            try {
                const stat = await fsp.stat(fullPath);
                deletedSize += stat.size;
                await fsp.unlink(fullPath);
                deletedCount++;
            } catch (e) {
                console.error('[Node.js] Failed to delete cache file:', fullPath, e.message);
            }
        }
        
        console.log('[Node.js] Cache cleaned:', {
            deletedFiles: deletedCount,
            freedSize: `${(deletedSize / 1024 / 1024).toFixed(2)}MB`
        });
        
    } catch (e) {
        console.error('[Node.js] Cache cleanup error:', e.message);
    }
}

// ----------------------------------------------------------------
// STATE & RESOURCE TRACKING
// ----------------------------------------------------------------
const serverState = {
    isProcessing:  false,
    currentFile:   null,
    stopRequested: false,
};

const activeResources = new Set();

// ----------------------------------------------------------------
// CONFIG (Aligned with gensrt.js for consistency)
// ----------------------------------------------------------------
const MOVIES_FOLDER = '/sdcard/Movies';
const modelDir = '/sdcard/models/senseVoice';

const config = {
  videoFolderPath: MOVIES_FOLDER,
  sampleRate: 16000,
  featDim: 80,
  bufferSizeInSeconds: 30, // Same as gensrt.js

  // Buffer management (from gensrt.js)
  buffer: {
    chunkSizeInSeconds: 5,
    maxChunkSize: 80000, // 5s * 16000Hz
    overflowThreshold: 0.8,
  },

  vad: {
    sileroVad: {
      model: path.join(modelDir, 'silero_vad.onnx'),
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.5,
      maxSpeechDuration: 60,
      windowSize: 512,
    },
    sampleRate: 16000,
    debug: false,
    numThreads: 1,
  },

  recognizer: {
    featConfig: {
      sampleRate: 16000,
      featureDim: 80,
    },
    modelConfig: {
      senseVoice: {
        model: path.join(modelDir, 'model.onnx'),
        language: '',
        useInverseTextNormalization: 1,
      },
      tokens: path.join(modelDir, 'tokens.txt'),
      numThreads: 2,
      debug: false,
      provider: 'cpu',
    },
  },

  // Memory management
  memory: {
    maxHeapMB: 1024,
    gcInterval: 10000,
  },
};

function isPlainObject(x) {
  return x !== null && typeof x === 'object' && !Array.isArray(x);
}

function applyRuntimeConfigUpdate(update) {
  // Only allow safe subset of fields to be changed at runtime.
  if (!isPlainObject(update)) {return;}

  // Video folder path update
  if (typeof update.videoFolderPath === 'string' && update.videoFolderPath.trim()) {
    config.videoFolderPath = update.videoFolderPath.trim().replace(/\/+$/, '');
  }

  // VAD updates
  if (typeof update.vad?.numThreads === 'number') {
    config.vad.numThreads = Math.max(1, Math.floor(update.vad.numThreads));
  }

  const vadUpdate = update.vad?.sileroVad;
  if (isPlainObject(vadUpdate)) {
    if (typeof vadUpdate.threshold === 'number') {
      config.vad.sileroVad.threshold = Math.max(0, Math.min(1, vadUpdate.threshold));
    }
    if (typeof vadUpdate.minSpeechDuration === 'number') {
      config.vad.sileroVad.minSpeechDuration = Math.max(0, vadUpdate.minSpeechDuration);
    }
    if (typeof vadUpdate.minSilenceDuration === 'number') {
      config.vad.sileroVad.minSilenceDuration = Math.max(0, vadUpdate.minSilenceDuration);
    }
    if (typeof vadUpdate.maxSpeechDuration === 'number') {
      config.vad.sileroVad.maxSpeechDuration = Math.max(1, vadUpdate.maxSpeechDuration);
    }
    if (typeof vadUpdate.windowSize === 'number') {
      config.vad.sileroVad.windowSize = Math.max(64, Math.floor(vadUpdate.windowSize));
    }
  }

  // Recognizer updates
  const recUpdate = update.recognizer?.modelConfig;
  if (isPlainObject(recUpdate)) {
    if (typeof recUpdate.numThreads === 'number') {
      config.recognizer.modelConfig.numThreads = Math.max(1, Math.floor(recUpdate.numThreads));
    }

    const svUpdate = recUpdate.senseVoice;
    if (isPlainObject(svUpdate)) {
      if (typeof svUpdate.language === 'string') {
        config.recognizer.modelConfig.senseVoice.language = svUpdate.language;
      }
    }
  }
}


// ----------------------------------------------------------------
// Helpers
// ----------------------------------------------------------------
function send(type, payload = {}) {
    channel.send('msg-from-nodejs', { type, ...payload });
}

function safeFree(obj) {
  if (!obj) {return;}
  try {
    activeResources.delete(obj);
    
    // Release external/native memory first if method exists
    if (typeof obj.releaseExternalMemory === 'function') {
      obj.releaseExternalMemory();
    }
    
    // Free the object using available method
    if (typeof obj.free === 'function') {obj.free();}
    else if (typeof obj.delete === 'function') {obj.delete();}
    else if (typeof obj.destroy === 'function') {obj.destroy();}
    
    // Nullify all enumerable properties to release references
    for (const key in obj) {
      try {
        if (obj.hasOwnProperty(key)) {
          obj[key] = null;
        }
      } catch {
        // Ignore errors when nullifying properties
      }
    }
  } catch (e) {
    console.error('[Node.js] Resource cleanup error:', e.message);
  }
}

function safeFreeWave(wave) {
  if (!wave) {return;}
  try {
    // Clear the samples buffer to release memory first
    if (wave.samples) {
      wave.samples = null;
    }
    
    // Free the object using available method
    if (typeof wave.free === 'function') {wave.free();}
    else if (typeof wave.delete === 'function') {wave.delete();}
    
    // Nullify all enumerable properties to release references
    for (const key in wave) {
      try {
        if (wave.hasOwnProperty(key)) {
          wave[key] = null;
        }
      } catch {
        // Ignore errors when nullifying properties
      }
    }
  } catch (e) {
    console.error('[Node.js] Wave cleanup error:', e.message);
  }
}

function isVideoFile(fileName) {
    // Support all common video/audio extensions
    const ext = path.extname(fileName).toLowerCase();
    return [
        '.ts', '.mts', '.m2ts',  // MPEG-2 TS
        '.mp4', '.m4a',          // MP4/M4A
        '.mkv',                  // Matroska
        '.webm',                 // WebM
        '.avi', '.mov', '.flv',  // Other common formats
    ].includes(ext);
}

// ------------------------------------------------------------
// SRT WRITER - Uses the sherpa-onnx-node SrtWriter wrapper
// ------------------------------------------------------------
const { SrtWriter } = require('./sherpa-onnx-node/srt-writer.js');

// ----------------------------------------------------------------
// Factory functions (aligned with gensrt.js)
// ----------------------------------------------------------------
function createRecognizer() {
  const so = getSherpaOnnx();
  const recognizer = new so.OfflineRecognizer(config.recognizer);
  if (recognizer.setMaxHeapSize) {
    recognizer.setMaxHeapSize(config.memory.maxHeapMB);
  }
  activeResources.add(recognizer);
  return recognizer;
}

function createVad() {
  const so = getSherpaOnnx();
  const vad = new so.Vad(config.vad, config.bufferSizeInSeconds);
  activeResources.add(vad);
  return vad;
}

function createBuffer() {
    const so = getSherpaOnnx();
    const buf = new so.CircularBuffer(config.bufferSizeInSeconds * config.sampleRate);
    activeResources.add(buf);
    return buf;
}

// ----------------------------------------------------------------
// UNIFIED: Core transcription pipeline for 16kHz PCM waveform
// ----------------------------------------------------------------
// Sherpa-onnx only processes 16kHz mono PCM. Whether the source is
// .mp4, .ts, or .wav, by the time it reaches sherpa-onnx it's just
// PCM samples. This unified function handles the VAD + recognition
// pipeline.
//
// chunkSource types:
//   { type: 'sync', samples: Float32Array, sampleRate: number, inputFile: string }
//      - For WAV files: direct sample access
//   { type: 'stream', inputFile: string, clientDuration: number }
//      - For MP4/TS: streaming via extractMP4toPCMStream
// ----------------------------------------------------------------
async function transcribePcmWaveform(
    fileName,
    fileDuration,
    chunkSource,
    clientDuration = 0
) {
    const startTime = Date.now();
    
    // FIX: Use the full input file path for SRT output, not just fileName
    // The error 'EROFS: read-only file system, open '123.ts.srt'' happened because
    // the path was relative instead of absolute. We need to use the inputFile path.
    let outPath;
    if (chunkSource.type === 'stream' && chunkSource.inputFile) {
        // For MP4/TS files: write SRT next to the input file
        outPath = chunkSource.inputFile + '.srt';
    } else if (chunkSource.type === 'sync' && chunkSource.inputFile) {
        // For WAV files: write SRT next to the input file
        outPath = chunkSource.inputFile + '.srt';
    } else {
        // Fallback: use fileName only (may cause EROFS if not absolute path)
        outPath = fileName + '.srt';
    }

    const fileDurationActual = clientDuration > 0 ? clientDuration : fileDuration;

    send('file_start', { fileName, duration: fileDurationActual });

    // Create recognizer, VAD, buffer
    const recognizer = createRecognizer();
    const vad = createVad();
    const buffer = createBuffer();

    // Create SRT writer
    const srtWriter = new SrtWriter(outPath);
    srtWriter.initialize();

    // Create progress tracker
    const tracker = new ProgressTracker(fileName, fileDurationActual, {
        updateThrottle: 2000,
        sendCallback: (data) => {
            send('transcription_progress', {
                fileName: data.filename,
                progress: data.progress,
                elapsed: data.elapsed,
                duration: data.duration,
                processedSec: data.processed,
                speed: data.speed,
                remaining: data.remaining,
                segmentsCount: data.segmentsCount || 0,
                status: `Transcribing... (${data.segmentsCount ? `${data.segmentsCount} segments` : `${data.processed.toFixed(0)}s`}${data.duration > 0 ? ` / ${data.duration.toFixed(0)}s` : ''})`
            });
        }
    });

    let processedSamples = 0;
    let totalSegmentsCount = 0;

    // Internal helper: process a single Float32Array chunk through VAD and recognizer
    const processPcmChunk = (float32) => {
        if (serverState.stopRequested || !float32 || float32.length === 0) {return;}

        // Adapt buffer management based on memory pressure
        const memReport = memoryManager.getReport();
        const heapUsage = memReport.current.heap.usagePercent;
        
        // If heap > 80%, process more aggressively to clear buffers faster
        const dynamicOverflowThreshold = heapUsage > 80 ? 0.4 : config.buffer.overflowThreshold;
        const bufferCapacity = config.bufferSizeInSeconds * config.sampleRate;

        // === Buffer management (optimized with subarray) ===

        // Check buffer overflow - process if getting full
        const currentSize = buffer.size();
        const overflowThreshold = bufferCapacity * dynamicOverflowThreshold;

        if (currentSize > overflowThreshold) {
            const processSize = Math.min(currentSize, config.buffer.maxChunkSize);
            if (processSize > 0) {
                const frame = buffer.get(buffer.head(), processSize);
                buffer.pop(processSize);
                vad.acceptWaveform(frame);
            }
        }

        // Split large chunks to prevent overflow
        const maxPushSize = config.buffer.maxChunkSize;
        let offset = 0;

        while (offset < float32.length) {
            const chunkSize = Math.min(maxPushSize, float32.length - offset);
            // Use subarray instead of slice to avoid copying
            const subChunk = float32.subarray(offset, offset + chunkSize);

            // Check if we have space before pushing
            if (buffer.size() + chunkSize > bufferCapacity) {
                const processSize = Math.min(buffer.size(), config.buffer.maxChunkSize);
                if (processSize > 0) {
                    const frame = buffer.get(buffer.head(), processSize);
                    buffer.pop(processSize);
                    vad.acceptWaveform(frame);
                }
            }

            try {
                buffer.push(subChunk);
            } catch (error) {
                console.log('[Node.js] Buffer overflow, emergency processing:', error.message);
                const emergencyProcessSize = Math.min(buffer.size(), Math.floor(buffer.size() / 2));
                if (emergencyProcessSize > 0) {
                    const frame = buffer.get(buffer.head(), emergencyProcessSize);
                    buffer.pop(emergencyProcessSize);
                    vad.acceptWaveform(frame);
                }
                // Try again with smaller chunk
                const smallerChunk = subChunk.subarray(0, Math.min(subChunk.length, 1024));
                buffer.push(smallerChunk);
            }

            offset += chunkSize;
        }

        // Regular VAD processing
        while (buffer.size() >= config.vad.sileroVad.windowSize) {
            const availableSize = Math.min(buffer.size(), config.vad.sileroVad.windowSize);
            const frame = buffer.get(buffer.head(), availableSize);
            buffer.pop(availableSize);
            vad.acceptWaveform(frame);
        }

        // Process VAD segments immediately
        let vadSegmentsProcessed = 0;
        while (!vad.isEmpty()) {
            const seg = vad.front();
            vad.pop();

            const stream = recognizer.createStream();
            try {
                stream.acceptWaveform({
                    samples: seg.samples,
                    sampleRate: config.sampleRate,
                });
                recognizer.decode(stream);
                const result = recognizer.getResult(stream);
                if (result && result.text) {
                    const start = seg.start / config.sampleRate;
                    const duration = seg.samples.length / config.sampleRate;
                    const text = result.text.trim();
                    srtWriter.addSegment(start, duration, text);
                    totalSegmentsCount++;
                    vadSegmentsProcessed++;
                }
            } finally {
                safeFree(stream);
            }
            
            // Periodically force small sleep if pressure critical to allow GC/Bridge work
            if (heapUsage > 90 && vadSegmentsProcessed % 10 === 0) {
                console.warn('[Node.js] Critical memory during VAD processing');
            }
        }

        processedSamples += float32.length;
        const processedSec = processedSamples / config.sampleRate;
        tracker.update(processedSec, totalSegmentsCount);
    };

    try {
        // Process based on source type
        if (chunkSource.type === 'stream') {
            // Streaming mode: MP4/TS/MKV/WebM files
            const { inputFile } = chunkSource;

            // Add detailed file diagnostics (Async)
            fsp.stat(inputFile).then(stat => {
                console.log('[Node.js] File diagnostics:', {
                    inputFile,
                    exists: true,
                    size: `${(stat.size / 1024 / 1024).toFixed(2)}MB`,
                    extension: path.extname(inputFile).toLowerCase()
                });
            }).catch(diagErr => {
                console.error('[Node.js] File diagnostics failed:', diagErr.message);
            });

            console.log('[Node.js] Stream processing (multi-format mode):', {
                inputFile,
                extension: path.extname(inputFile).toLowerCase()
            });

            // Wrap the chunk handler to allow early termination
            let chunkHandler = null;
            const processChunk = (chunk) => {
                if (!chunkHandler || serverState.stopRequested) {return;}
                chunkHandler(chunk);
            };

            // Use the unified audio extractor
            const extractor = getExtractAudio();

            let chunksReceived = 0;
            let totalSamplesFromChunks = 0;

            console.log('[Node.js] Starting audio extraction:', {
                inputFile,
                hasExtractor: !!extractor,
                hasExtractFunc: typeof extractor.extractAudioToPCMStream === 'function'
            });

            // Start audio extraction via streaming
            const streamPromise = extractor.extractAudioToPCMStream(inputFile, (chunk, isDone) => {
                if (serverState.stopRequested) {return;}

                // Process non-null chunks
                if (chunk && chunk.samples instanceof Float32Array && chunk.samples.length > 0) {
                    chunksReceived++;
                    totalSamplesFromChunks += chunk.samples.length;

                    if (chunksReceived === 1 || chunksReceived % 20 === 0) {
                        console.log('[Node.js] Chunk received:', {
                            chunkIndex: chunksReceived,
                            samplesLength: chunk.samples.length,
                            totalSamplesSoFar: totalSamplesFromChunks,
                            isDone
                        });
                    }

                    processChunk(chunk);
                }
            });

            // Define chunk handler with access to processing objects
            chunkHandler = (chunk) => {
                if (serverState.stopRequested) {return;}

                // Validate chunk
                if (!chunk || !(chunk.samples instanceof Float32Array) || chunk.samples.length === 0) {
                    return;
                }

                processPcmChunk(chunk.samples);
            };

            // Wait for stream to complete
            try {
                await streamPromise;
            } catch (extractErr) {
                // Extraction failed - log error details
                console.error('[Node.js] Audio extraction failed:', {
                    fileName,
                    error: extractErr.message,
                    inputFile,
                    chunksReceived,
                    totalSamplesFromChunks,
                    processedSamples,
                    hasSamples: processedSamples > 0,
                    stack: extractErr.stack
                });

                // If we got some samples, continue with what we have
                // Otherwise re-throw the error
                if (processedSamples === 0) {
                    throw extractErr;
                }
                console.warn('[Node.js] Continuing with partial samples:', processedSamples);
            }

            // Log completion
            console.log('[Node.js] Audio stream completed:', {
                fileName,
                totalSamples: processedSamples,
                totalDurationSec: (processedSamples / config.sampleRate).toFixed(2),
                chunksProcessed: processedSamples > 0 ? 'yes' : 'no',
                inputFile
            });

            // If no samples were extracted, warn about empty output
            if (processedSamples === 0) {
                console.error('[Node.js] WARNING: No audio samples extracted from file!', {
                    fileName,
                    inputFile,
                    extension: path.extname(fileName).toLowerCase()
                });
            }

        } else if (chunkSource.type === 'sync') {
            // Synchronous mode: WAV file with direct samples access
            const { samples } = chunkSource;
            const windowSize = config.vad.sileroVad.windowSize;
            const totalSamples = samples.length;

            for (let i = 0; i < totalSamples; i += windowSize) {
                if (serverState.stopRequested) {break;}

                const chunk = samples.subarray(i, Math.min(i + windowSize, totalSamples));
                processPcmChunk(chunk);

                // Keep event loop healthy
                if (i % (windowSize * 20) === 0) {
                    await new Promise(r => setImmediate(r));
                }
            }
        }

        // Check if stopped by user
        if (serverState.stopRequested) {
            console.log('[Node.js] Processing stopped by request');
            await srtWriter.finalize();
            send('file_error', { fileName, error: 'Stopped by user' });
            return;
        }

        // Finalize: flush VAD and process remaining segments
        console.log('[Node.js] Finalizing transcription...');
        vad.flush();

        let finalSegmentsCount = 0;
        while (!vad.isEmpty()) {
            const seg = vad.front();
            vad.pop();

            const stream = recognizer.createStream();
            try {
                stream.acceptWaveform({
                    samples: seg.samples,
                    sampleRate: config.sampleRate,
                });
                recognizer.decode(stream);
                const result = recognizer.getResult(stream);
                if (result && result.text) {
                    const start = seg.start / config.sampleRate;
                    const duration = seg.samples.length / config.sampleRate;
                    const text = result.text.trim();
                    srtWriter.addSegment(start, duration, text);
                    totalSegmentsCount++;
                    finalSegmentsCount++;
                }
            } finally {
                safeFree(stream);
            }
        }

        console.log('[Node.js] Finalization complete:', {
            segmentsFromFlush: finalSegmentsCount,
            totalSamples: processedSamples,
            totalDurationSec: (processedSamples / config.sampleRate).toFixed(2)
        });

        // Finalize SRT writer
        srtWriter.finalize();

        // Complete progress tracker
        tracker.complete(totalSegmentsCount);

        const elapsed = (Date.now() - startTime) / 1000;
        const processedSec = processedSamples / config.sampleRate;

        send('file_complete', {
            fileName,
            srtPath: outPath,
            elapsed,
            duration: fileDurationActual,
            processedSec,
            totalSegments: totalSegmentsCount
        });
        console.log(`[Node.js] Done! ${fileName} - ${elapsed.toFixed(2)}s`);

    } catch (e) {
        console.error('[Node.js] Process error:', {
            fileName,
            error: e.message,
            stack: e.stack,
            totalSamplesProcessed: processedSamples
        });
        send('file_error', { fileName, error: e.message });
    } finally {
        // Cleanup
        safeFree(vad);
        safeFree(recognizer);
        safeFree(buffer);

        // Clear any remaining resources
        for (const resource of activeResources) {
            safeFree(resource);
        }
        activeResources.clear();

        // Force GC after processing
        memoryManager.forceGC('After transcription');
    }
}

// ----------------------------------------------------------------
// WAV File Processing - wrapper around unified pipeline
// ----------------------------------------------------------------
async function processWavFile(filePath, fileName) {
    const so = getSherpaOnnx();
    const wave = so.readWave(filePath);
    const fileDuration = wave.samples.length / wave.sampleRate;

    try {
        await transcribePcmWaveform(
            fileName,
            fileDuration,
            {
                type: 'sync',
                samples: wave.samples,
                sampleRate: wave.sampleRate,
                inputFile: filePath
            },
            fileDuration
        );
    } finally {
        safeFreeWave(wave);
        memoryManager.forceGC('After WAV transcription');
    }
}

// ----------------------------------------------------------------
// Audio File Processing (MP4/TS/MKV/WebM/etc.) - wrapper around unified pipeline
// ----------------------------------------------------------------
async function processAudioStream(inputFile, fileName, clientDuration = 0) {
    // Use client-provided duration, fallback to 0
    const fileDuration = clientDuration > 0 ? clientDuration : 0;
    const ext = path.extname(fileName).toLowerCase();

    // Verify file exists and is readable before passing to native code
    try {
        await fsp.access(inputFile, fs.constants.R_OK);
        const stat = await fsp.stat(inputFile);
        console.log('[Node.js] File access verified:', {
            inputFile,
            size: `${(stat.size / 1024 / 1024).toFixed(2)}MB`,
            readable: true
        });
    } catch (e) {
        console.error('[Node.js] File access error:', {
            inputFile,
            error: e.message,
            code: e.code
        });
        throw new Error(`Cannot access file: ${inputFile} (${e.code || e.message})`);
    }

    console.log('[Node.js] Processing audio stream (multi-format mode):', {
        inputFile,
        fileName,
        extension: ext,
        duration: fileDuration
    });

    // Call the unified pipeline with streaming PCM source
    await transcribePcmWaveform(
        fileName,
        fileDuration,
        // Stream source: extractAudio provides chunks via callback
        {
            type: 'stream',
            inputFile: inputFile,
            clientDuration: clientDuration
        },
        clientDuration
    );
}

// ----------------------------------------------------------------
// Unified entry point
// ----------------------------------------------------------------
async function processFile(filePath, fileName, clientDuration = 0) {
    const ext = path.extname(fileName).toLowerCase();

    if (ext === '.wav') {
        await processWavFile(filePath, fileName);
        return;
    }

    if (isVideoFile(fileName)) {
        // Video/audio files - use streaming extractor
        await processAudioStream(filePath, fileName, clientDuration);
        return;
    }

    throw new Error(
        `Unsupported input format: ${ext || '(no extension)'} (expected .wav or video/audio file like .mp4, .ts, .mkv, .webm, .m4a)`
    );
}

// ----------------------------------------------------------------
// Model validation
// ----------------------------------------------------------------
async function validateModelFiles() {
    const files = [
        config.recognizer.modelConfig.senseVoice.model,
        config.recognizer.modelConfig.tokens,
        config.vad.sileroVad.model,
    ];

    for (const f of files) {
        try { await fsp.access(f); } catch {
            throw new Error(`Model file not found: ${f}`);
        }
    }
}

// ----------------------------------------------------------------
// Channel listeners
// ----------------------------------------------------------------
// Note: These are server-level listeners that persist for app lifetime
// They don't hold per-file references, so no cleanup needed

channel.addListener('transcribe-file', async (args) => {
    const data     = Array.isArray(args) ? args[0] : args;
    const fileName = data.fileName;
    const filePath = data.filePath || '';

    // FIX-SRV-3: guard against duration still in ms (> 24 h in seconds is impossible)
    let duration = typeof data.duration === 'number' && data.duration > 0 ? data.duration : 0;
    if (duration > 86400) {
        console.warn('[Node.js] duration looks like milliseconds, converting:', duration);
        duration = duration / 1000;
    }

    // FIX-SRV-2: log the exact path received before any transformation
    console.log('[Node.js] Received transcription request:', { fileName, filePath, duration });

    if (serverState.isProcessing) {
        return send('file_error', { fileName, error: 'Already processing another file.' });
    }

    // --------------------------------------------------------------
    // PRE-PROCESSING MEMORY MANAGEMENT
    // --------------------------------------------------------------
    // Check memory state before processing and clean up if needed
    const memStats = memoryManager.getReport();
    const heapUsagePercent = memStats.current.heap.usagePercent;
    const rssMB = memStats.current.process.rss;

    // Force GC and clear cache if memory usage is elevated
    if (heapUsagePercent > 40 || rssMB > 120) {
        console.log('[Node.js] Elevated memory before processing:', {
            heap: `${heapUsagePercent.toFixed(1)}%`,
            rss: `${rssMB.toFixed(1)}MB`
        });

        // Force GC to release unused memory
        memoryManager.forceGC('Before new file processing');

        // Clear cache directory to free disk space and prevent cache buildup
        await clearCacheDirectory();

        // Brief pause to let GC complete
        await new Promise(resolve => setTimeout(resolve, 100));
    }

    serverState.isProcessing  = true;
    serverState.stopRequested = false;
    serverState.currentFile   = fileName;

    try {
        await validateModelFiles();
        
        // FIX-SRV-1: Trust the path app.js resolved. Only fall back to
        // MOVIES_FOLDER when filePath is genuinely empty/missing.
        // Do NOT override a valid absolute path that app.js already resolved.
        let realPath;
        if (filePath && filePath.startsWith('/')) {
            // app.js resolved the path correctly — use it as-is
            realPath = filePath;
        } else {
            // filePath was empty or relative — use server-side fallback
            // but prefer the runtime config value over the hardcoded constant
            const folder = (config.videoFolderPath || MOVIES_FOLDER).replace(/\/+$/, '');
            realPath = `${folder}/${fileName}`;
            console.warn('[Node.js] filePath missing/relative, using fallback:', realPath);
        }
        
        console.log('[Node.js] Final realPath:', realPath);
        await processFile(realPath, fileName, duration);
    } catch (e) {
        console.error('[Node.js] Unhandled error:', e);
        send('file_error', { fileName, error: e.message });
    } finally {
        serverState.isProcessing = false;
        serverState.currentFile  = null;

        // Clear cache after processing to prevent accumulation
        await clearCacheDirectory();

        // Force GC after file processing completes
        memoryManager.forceGC('After file processing');

        // Wait for GC to complete before allowing next file
        // This is critical for batch processing to prevent memory buildup
        await new Promise(resolve => setTimeout(resolve, 150));

        // Final GC pass to catch any remaining references
        memoryManager.forceGC('Post-processing cleanup');
    }
});

channel.addListener('get-data-path', () => {
    send('data_path_response', { dataPath: getDataPath() || process.cwd() });
});

channel.addListener('update-config', (args) => {
    try {
        const update = Array.isArray(args) ? args[0] : args;
        // Prevent changing config while actively processing (avoid inconsistencies mid-file)
        if (serverState.isProcessing) {
            return send('config_update_error', { error: 'Cannot update config while processing.' });
        }
        applyRuntimeConfigUpdate(update);
        send('config_updated', {
            vad: { numThreads: config.vad.numThreads, sileroVad: { ...config.vad.sileroVad } },
            recognizer: {
                modelConfig: {
                    numThreads: config.recognizer.modelConfig.numThreads,
                    senseVoice: {
                        language: config.recognizer.modelConfig.senseVoice.language,
                    },
                },
            },
        });
    } catch (e) {
        send('config_update_error', { error: e.message });
    }
});

channel.addListener('request-state', () => {
    send('server_ready', { engine: helloWorld() });
});

channel.addListener('get-memory-stats', () => {
    const report = memoryManager.getReport();
    send('memory-stats-response', {
        current: report.current,
        trend: report.trend,
        peaks: report.peaks,
        gcCount: report.gc.count,
    });
});

channel.addListener('stop-process', () => {
    serverState.stopRequested = true;
});

// ----------------------------------------------------------------
// Periodic memory statistics (for debugging)
// ----------------------------------------------------------------
let memoryLogIntervalId = null;
if (process.memoryUsage) {
    memoryLogIntervalId = setInterval(() => {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        console.log('[Node.js] Memory usage:', { rss: `${rssMB}MB`, heap: `${heapUsedMB}/${heapTotalMB}MB` });
    }, 30000);
}

// ----------------------------------------------------------------
// Cleanup function - call this when shutting down
// ----------------------------------------------------------------
function cleanupServer() {
    console.log('[Node.js] Cleaning up server resources...');

    // Stop memory monitoring
    memoryManager.stopMonitoring();

    // Clear intervals
    if (memoryLogIntervalId) {clearInterval(memoryLogIntervalId);}

    // Remove all channel listeners
    if (typeof channel.removeAllListeners === 'function') {
        channel.removeAllListeners();
    }

    // Free any remaining active resources
    for (const resource of activeResources) {
        safeFree(resource);
    }
    activeResources.clear();

    // Force final garbage collection
    memoryManager.forceGC('Server shutdown');

    // Get final memory report
    const report = memoryManager.getReport();
    console.log('[Node.js] Final memory report:', {
      peakRSS: `${report.peaks.rss.toFixed(2)}MB`,
      peakHeap: `${report.peaks.heap.toFixed(2)}MB`,
      totalGCs: report.gc.count,
      finalHeap: `${report.current.heap.used.toFixed(2)}MB`,
    });

    console.log('[Node.js] Server cleanup complete');
}

// Register cleanup on process exit
process.on('exit', cleanupServer);
process.on('SIGINT', () => {
    cleanupServer();
    process.exit(0);
});
process.on('SIGTERM', () => {
    cleanupServer();
    process.exit(0);
});

console.log('[Node.js] Simplified streaming server initialized.');
