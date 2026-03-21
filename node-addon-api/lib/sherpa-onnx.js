/** @typedef {import('./types').WaveObject} WaveObject */
/**
 * @typedef {import('./types').OnlineRecognizerResult} OnlineRecognizerResult
 */
/**
 * @typedef {import('./types').OfflineRecognizerResult} OfflineRecognizerResult
 */

const addon = require('./addon.js')
const streaming_asr = require('./streaming-asr.js');
const non_streaming_asr = require('./non-streaming-asr.js');
const non_streaming_tts = require('./non-streaming-tts.js');
const vad = require('./vad.js');
const slid = require('./spoken-language-identification.js');
const sid = require('./speaker-identification.js');
const at = require('./audio-tagg.js');
const punct = require('./punctuation.js');
const kws = require('./keyword-spotter.js');
const sd = require('./non-streaming-speaker-diarization.js');
const speech_denoiser = require('./non-streaming-speech-denoiser.js');
const extractMp4ToPcm = require('./extract-mp4-to-pcm.js');
const srtWriter = require('./srt-writer.js');

module.exports = {
  OnlineRecognizer : streaming_asr.OnlineRecognizer,
  OfflineRecognizer : non_streaming_asr.OfflineRecognizer,
  OfflineTts : non_streaming_tts.OfflineTts,
  GenerationConfig : non_streaming_tts.GenerationConfig,
  readWave : addon.readWave,
  writeWave : addon.writeWave,
  SrtWriter : srtWriter.SrtWriter,
  Display : streaming_asr.Display,
  Vad : vad.Vad,
  CircularBuffer : vad.CircularBuffer,
  SpokenLanguageIdentification : slid.SpokenLanguageIdentification,
  SpeakerEmbeddingExtractor : sid.SpeakerEmbeddingExtractor,
  SpeakerEmbeddingManager : sid.SpeakerEmbeddingManager,
  AudioTagging : at.AudioTagging,
  OfflinePunctuation : punct.OfflinePunctuation,
  OnlinePunctuation : punct.OnlinePunctuation,
  KeywordSpotter : kws.KeywordSpotter,
  OfflineSpeakerDiarization : sd.OfflineSpeakerDiarization,
  OfflineSpeechDenoiser : speech_denoiser.OfflineSpeechDenoiser,
  version : addon.version,
  gitSha1 : addon.gitSha1,
  gitDate : addon.gitDate,
  // Extract MP4 to PCM (friendly JS names)
  extractMP4toPCMSync : extractMp4ToPcm.extractMP4toPCMSync,
  extractMP4toPCMAsync : extractMp4ToPcm.extractMP4toPCMAsync,
  extractMP4toPCMStream : extractMp4ToPcm.extractMP4toPCMStream,

  // Extract MP4 to PCM (native export names)
  ExtractMP4toPCM : addon.ExtractMP4toPCM,
  ExtractMP4toPCMAsync : addon.ExtractMP4toPCMAsync,
  ExtractMP4toPCMStream : addon.ExtractMP4toPCMStream,
}
