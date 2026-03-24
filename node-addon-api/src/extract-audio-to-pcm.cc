// src/extract-audio-to-pcm.cc
//
// FFmpeg-based audio extractor — replaces minimp4 + fdk-aac + manual TS demux.
//
// Supports ANY container FFmpeg understands: MP4, M4A, MPEG-TS, MKV, WebM, etc.
// Audio is decoded, downmixed to mono, and resampled to 16 kHz Float32.
//
// Exported API (identical signatures to the old implementation):
//   ExtractMP4toPCM(path)                          → { samples, sampleRate,
//   channels, srcSampleRate } ExtractMP4toPCMAsync(path, cb)                 →
//   void ExtractMP4toPCMStream(path, onChunk)            → void
//     onChunk(err, { samples, sampleRate, channels } | null, isDone)
//
// Build deps (binding.gyp):
//   'libraries': [ '-lavformat', '-lavcodec', '-lavutil', '-lswresample' ]
//   'include_dirs': [ '<!@(pkg-config --cflags-only-I libavformat
//   libswresample)' ]
//
#include <napi.h>

#include <cstdio>
#include <cstring>
#include <functional>
#include <memory>
#include <string>
#include <vector>

extern "C" {
#include <libavcodec/avcodec.h>
#include <libavformat/avformat.h>
#include <libavformat/avio.h>
#include <libavutil/channel_layout.h>
#include <libavutil/error.h>
#include <libavutil/opt.h>
#include <libswresample/swresample.h>
}

// ============================================================
// Path Validation - Security fix for path traversal
// ============================================================
static bool isSafePath(const std::string& path) {
    // Check for empty path
    if (path.empty()) return false;
    
    // Check for null bytes (common injection attempt)
    if (path.find('\0') != std::string::npos) return false;
    
    // Check for path traversal attempts
    if (path.find("..") != std::string::npos) return false;
    
    // Ensure path is absolute (important for security)
    if (path[0] != '/') return false;
    
    return true;
}

// ============================================================
// Constants
// ============================================================
static constexpr int kTargetRate = 16000;
static constexpr int kChunkSamples = 16000 * 2;  // ~2 s per JS callback

// ============================================================
// Chunk callback type
//   Return false to abort decoding early.
// ============================================================
using ChunkCb = std::function<bool(std::vector<float> &&)>;

// ============================================================
// RAII wrappers — keep resource cleanup exception-safe
// ============================================================
struct FmtCtxGuard {
  AVFormatContext *ctx = nullptr;
  ~FmtCtxGuard() {
    if (ctx) avformat_close_input(&ctx);
  }
};

struct CodecCtxGuard {
  AVCodecContext *ctx = nullptr;
  ~CodecCtxGuard() {
    if (ctx) avcodec_free_context(&ctx);
  }
};

struct SwrCtxGuard {
  SwrContext *ctx = nullptr;
  ~SwrCtxGuard() {
    if (ctx) swr_free(&ctx);
  }
};

// FrameGuard that properly handles frame allocation/unref
// Following demux_decode.c pattern: allocate once, unref after each use
struct FrameGuard {
  AVFrame *f;
  FrameGuard() : f(av_frame_alloc()) {}
  ~FrameGuard() {
    if (f) av_frame_free(&f);
  }
  // Reset frame for reuse (after avcodec_receive_frame)
  void reset() {
    if (f) av_frame_unref(f);
  }
  // Get a fresh frame for next receive operation
  AVFrame* getFresh() {
    if (!f) f = av_frame_alloc();
    else av_frame_unref(f);
    return f;
  }
};

struct PacketGuard {
  AVPacket *p;
  PacketGuard() : p(av_packet_alloc()) {}
  ~PacketGuard() {
    if (p) av_packet_free(&p);
  }
  void reset() {
    if (p) av_packet_unref(p);
  }
};

// ============================================================
// Helper: Decode and process a single frame
// Returns: true to continue, false to abort
// ============================================================
static bool processDecodedFrame(AVCodecContext *decCtx, AVFrame *frame,
                                SwrContext *swrCtx, ChunkCb &chunkCb,
                                bool &aborted, std::vector<float> &resampleBuf) {
  // Estimate max output samples after resampling
  int outSamples = (int)av_rescale_rnd(
      swr_get_delay(swrCtx, decCtx->sample_rate) + frame->nb_samples,
      kTargetRate, decCtx->sample_rate, AV_ROUND_UP);

  if (outSamples <= 0) return true;

  if (resampleBuf.size() < (size_t)outSamples) {
    resampleBuf.resize(outSamples * 1.5);
  }
  uint8_t *outPtr = reinterpret_cast<uint8_t *>(resampleBuf.data());

  int converted = swr_convert(swrCtx, &outPtr, outSamples,
                              const_cast<const uint8_t **>(frame->extended_data),
                              frame->nb_samples);
  if (converted > 0) {
    // Copy out only the converted samples to a move-ready vector
    std::vector<float> chunk(resampleBuf.begin(), resampleBuf.begin() + converted);
    if (!chunkCb(std::move(chunk))) {
      aborted = true;
      return false;
    }
  }
  return true;
}

// ============================================================
// Helper: Flush decoder and resampler
// ============================================================
static void flushDecodersAndResampler(AVCodecContext *decCtx, SwrContext *swrCtx,
                                      ChunkCb &chunkCb, bool &aborted,
                                      std::vector<float> &resampleBuf) {
  // Flush decoder by sending NULL packet
  int ret = avcodec_send_packet(decCtx, nullptr);
  if (ret < 0) return;

  FrameGuard frame;
  
  // Get all remaining frames from decoder
  while (!aborted) {
    ret = avcodec_receive_frame(decCtx, frame.getFresh());
    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
    if (ret < 0) break;

    if (!processDecodedFrame(decCtx, frame.f, swrCtx, chunkCb, aborted, resampleBuf)) {
      frame.reset();
      return;
    }
    frame.reset();
  }

  // Flush resampler tail
  while (!aborted) {
    int outSamples = (int)av_rescale_rnd(swr_get_delay(swrCtx, decCtx->sample_rate),
                                         kTargetRate, decCtx->sample_rate, AV_ROUND_UP);
    if (outSamples <= 0) break;

    if (resampleBuf.size() < (size_t)outSamples) resampleBuf.resize(outSamples);
    uint8_t *outPtr = reinterpret_cast<uint8_t *>(resampleBuf.data());

    int converted = swr_convert(swrCtx, &outPtr, outSamples, nullptr, 0);
    if (converted <= 0) break;

    std::vector<float> chunk(resampleBuf.begin(), resampleBuf.begin() + converted);
    if (!chunkCb(std::move(chunk))) {
      aborted = true;
      return;
    }
  }
}

// ============================================================
// Core decode loop
// ============================================================
static std::string decodeCore(const std::string &path, int &srcRateOut,
                              ChunkCb chunkCb) {
  // --- Security: Validate path before opening ---
  if (!isSafePath(path)) {
    return "Invalid file path: path traversal or unsafe characters detected";
  }
  
  // --- Open container ---
  FmtCtxGuard fmt;
  int ret = avformat_open_input(&fmt.ctx, path.c_str(), nullptr, nullptr);
  if (ret < 0) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(ret, errbuf, sizeof(errbuf));
    fprintf(stderr, "Could not open source file %s: %s\n", path.c_str(), errbuf);
    return std::string("Cannot open file: ") + path + " (" + errbuf + ")";
  }

  // --- Retrieve stream information ---
  ret = avformat_find_stream_info(fmt.ctx, nullptr);
  if (ret < 0) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(ret, errbuf, sizeof(errbuf));
    return "Cannot read stream info: " + std::string(errbuf);
  }

  // --- Find best audio stream ---
  const AVCodec *codec = nullptr;
  int streamIdx = av_find_best_stream(fmt.ctx, AVMEDIA_TYPE_AUDIO, -1, -1, &codec, 0);
  if (streamIdx < 0) return "No audio stream found";
  if (!codec) return "No decoder available for audio stream";

  AVStream *stream = fmt.ctx->streams[streamIdx];

  // --- Open decoder ---
  CodecCtxGuard dec;
  dec.ctx = avcodec_alloc_context3(codec);
  if (!dec.ctx) return "avcodec_alloc_context3 failed";

  ret = avcodec_parameters_to_context(dec.ctx, stream->codecpar);
  if (ret < 0) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(ret, errbuf, sizeof(errbuf));
    return std::string("avcodec_parameters_to_context failed: ") + errbuf;
  }

  ret = avcodec_open2(dec.ctx, codec, nullptr);
  if (ret < 0) {
    char errbuf[AV_ERROR_MAX_STRING_SIZE];
    av_strerror(ret, errbuf, sizeof(errbuf));
    return std::string("avcodec_open2 failed: ") + errbuf;
  }

  srcRateOut = dec.ctx->sample_rate;

  // --- Build SwrContext with high-quality resampling settings ---
  SwrCtxGuard swr;
  // Use new FFmpeg API: swr_alloc_set_opts2 returns int, not SwrContext*
  AVChannelLayout outLayout = AV_CHANNEL_LAYOUT_MONO;
  int ret2 = swr_alloc_set_opts2(&swr.ctx,
                                 &outLayout,
                                 AV_SAMPLE_FMT_FLT,
                                 kTargetRate,
                                 &dec.ctx->ch_layout,
                                 dec.ctx->sample_fmt,
                                 dec.ctx->sample_rate,
                                 0,
                                 nullptr);
  if (ret2 < 0 || !swr.ctx) {
    // Fallback to basic allocation if opts-based init fails
    swr.ctx = swr_alloc();
    if (!swr.ctx) return "swr_alloc failed";

    av_opt_set_chlayout(swr.ctx, "out_chlayout", &outLayout, 0);
    av_opt_set_int(swr.ctx, "out_sample_rate", kTargetRate, 0);
    av_opt_set_sample_fmt(swr.ctx, "out_sample_fmt", AV_SAMPLE_FMT_FLT, 0);

    av_opt_set_chlayout(swr.ctx, "in_chlayout", &dec.ctx->ch_layout, 0);
    av_opt_set_int(swr.ctx, "in_sample_rate", dec.ctx->sample_rate, 0);
    av_opt_set_sample_fmt(swr.ctx, "in_sample_fmt", dec.ctx->sample_fmt, 0);
  }

  // High-quality resampling settings for better audio fidelity
  // Use linear interpolation with larger filter size for better frequency response
  av_opt_set_int(swr.ctx, "resampler", SWR_ENGINE_SWR, 0);
  av_opt_set_int(swr.ctx, "filter_size", 64, 0);        // Larger filter = better anti-aliasing
  av_opt_set_int(swr.ctx, "phase_shift", 10, 0);        // Higher phase shift precision
  av_opt_set_double(swr.ctx, "linear_interp", 1.0, 0);  // Enable linear interpolation
  av_opt_set_double(swr.ctx, "cutoff", 0.95, 0);        // 95% of Nyquist for better high-freq preservation

  if (swr_init(swr.ctx) < 0) return "swr_init failed";

  // --- Decode / resample loop ---
  PacketGuard pkt;
  FrameGuard frame;
  std::vector<float> resampleBuf;
  resampleBuf.reserve(kTargetRate); // Pre-allocate 1s buffer
  
  bool aborted = false;
  bool gotAudio = false;

  while (!aborted && av_read_frame(fmt.ctx, pkt.p) >= 0) {
    if (pkt.p->stream_index != streamIdx) {
      pkt.reset();
      continue;
    }

    ret = avcodec_send_packet(dec.ctx, pkt.p);
    pkt.reset();

    if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) continue;
    if (ret < 0) continue;

    while (!aborted) {
      ret = avcodec_receive_frame(dec.ctx, frame.getFresh());
      if (ret == AVERROR(EAGAIN) || ret == AVERROR_EOF) break;
      if (ret < 0) break;

      gotAudio = true;
      if (!processDecodedFrame(dec.ctx, frame.f, swr.ctx, chunkCb, aborted, resampleBuf)) {
        frame.reset();
        break;
      }
      frame.reset();
    }
  }

  if (!aborted && gotAudio) {
    flushDecodersAndResampler(dec.ctx, swr.ctx, chunkCb, aborted, resampleBuf);
  }

  if (!gotAudio) return "No audio frames decoded";
  return aborted ? "Aborted" : "";
}

// ============================================================
// FULL-BUFFER ASYNC
// ============================================================
struct AsyncWorkerFull : Napi::AsyncWorker {
  std::string path_;
  std::vector<float> samples_;
  int srcRate_ = 0;
  Napi::FunctionReference cb_;

  AsyncWorkerFull(std::string path, Napi::Function cb)
      : Napi::AsyncWorker(cb), path_(std::move(path)) {
    cb_ = Napi::Persistent(cb);
  }
  
  // FIX: Proper cleanup of FunctionReference
  ~AsyncWorkerFull() override {
    cb_.Reset();
  }

  void Execute() override {
    std::string err =
        decodeCore(path_, srcRate_, [&](std::vector<float> &&chunk) {
          samples_.insert(samples_.end(), chunk.begin(), chunk.end());
          return true;
        });
    if (!err.empty()) SetError(err);
  }

  void OnOK() override {
    Napi::Env env = Env();
    auto buf = Napi::ArrayBuffer::New(env, samples_.size() * sizeof(float));
    std::memcpy(buf.Data(), samples_.data(), buf.ByteLength());
    Napi::Object obj = Napi::Object::New(env);
    obj.Set("samples", Napi::Float32Array::New(env, samples_.size(), buf, 0));
    obj.Set("sampleRate", (double)kTargetRate);
    obj.Set("channels", 1);
    obj.Set("srcSampleRate", (double)srcRate_);
    cb_.Call({env.Null(), obj});
  }

  void OnError(const Napi::Error &e) override {
    cb_.Call({e.Value(), Env().Null()});
  }
};

// ============================================================
// STREAMING ASYNC
// ============================================================
struct ChunkPayload {
  std::vector<float> samples;
  std::string error;
  bool done = false;
  
  // Constructor for std::make_unique compatibility
  ChunkPayload(std::vector<float> s, std::string e, bool d)
      : samples(std::move(s)), error(std::move(e)), done(d) {}
};

struct AsyncWorkerStream : Napi::AsyncWorker {
  std::string path_;
  int srcRate_ = 0;
  Napi::ThreadSafeFunction tsfn_;
  std::vector<float> accum_;

  AsyncWorkerStream(std::string path, Napi::Function onChunk, Napi::Env env)
      : Napi::AsyncWorker(onChunk), path_(std::move(path)) {
    accum_.reserve(kChunkSamples + 4096);
    tsfn_ = Napi::ThreadSafeFunction::New(env, onChunk, "ExtractMP4toPCMStream",
                                          0, 1, [](Napi::Env) {});
  }
  
  // FIX: Proper cleanup - ThreadSafeFunction will release automatically,
  // but explicit cleanup in destructor is clearer
  ~AsyncWorkerStream() override {
    // tsfn_.Release() is called automatically by Napi::ThreadSafeFunction destructor
    // But we can call it explicitly to be sure
    tsfn_.Release();
  }

  void fireChunk(std::vector<float> chunk, bool done, std::string err) {
    if (chunk.empty() && !done && err.empty()) return;
    
    // Use std::unique_ptr for exception-safe memory management
    auto payload = std::make_unique<ChunkPayload>(std::move(chunk), std::move(err), done);
    
    auto status = tsfn_.NonBlockingCall(
        payload.get(), [](Napi::Env env, Napi::Function cb, ChunkPayload *p) {
          // Note: p is owned by the unique_ptr, but we need to delete it here
          // since NonBlockingCall doesn't transfer ownership
          std::unique_ptr<ChunkPayload> guard(p);

          if (!p->error.empty()) {
            cb.Call({Napi::Error::New(env, p->error).Value(), env.Null(),
                     Napi::Boolean::New(env, true)});
            return;
          }

          if (p->done && p->samples.empty()) {
            cb.Call({env.Null(), env.Null(), Napi::Boolean::New(env, true)});
            return;
          }

          auto buf = Napi::ArrayBuffer::New(env, p->samples.size() * sizeof(float));
          std::memcpy(buf.Data(), p->samples.data(), buf.ByteLength());
          Napi::Object obj = Napi::Object::New(env);
          obj.Set("samples", Napi::Float32Array::New(env, p->samples.size(), buf, 0));
          obj.Set("sampleRate", (double)kTargetRate);
          obj.Set("channels", 1);
          cb.Call({env.Null(), obj, Napi::Boolean::New(env, p->done)});
        });

    // Only release if NonBlockingCall succeeded (callback will take ownership)
    if (status == napi_ok) {
      payload.release();  // Callback now owns the memory
    }
    // If status != napi_ok, unique_ptr will auto-delete on scope exit
  }

  void Execute() override {
    std::string err =
        decodeCore(path_, srcRate_, [&](std::vector<float> &&chunk) -> bool {
          if (chunk.empty()) return true;
          accum_.insert(accum_.end(), chunk.begin(), chunk.end());
          while (accum_.size() >= (size_t)kChunkSamples) {
            std::vector<float> toSend(accum_.begin(),
                                      accum_.begin() + kChunkSamples);
            accum_.erase(accum_.begin(), accum_.begin() + kChunkSamples);
            fireChunk(std::move(toSend), false, "");
          }
          return true;
        });

    if (!accum_.empty() && err.empty()) {
      fireChunk(std::move(accum_), true, "");
      accum_.clear();
    } else {
      fireChunk({}, true, err);
    }
    tsfn_.Release();
  }

  void OnOK() override {}
  void OnError(const Napi::Error &) override {}
};

// ============================================================
// SYNC
// ============================================================
static Napi::Value ExtractSync(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 1 || !info[0].IsString()) {
    Napi::TypeError::New(env, "expected string path").ThrowAsJavaScriptException();
    return env.Null();
  }
  int srcRate = 0;
  std::vector<float> samples;

  std::string err = decodeCore(
      info[0].As<Napi::String>(), srcRate, [&](std::vector<float> &&chunk) {
        samples.insert(samples.end(), chunk.begin(), chunk.end());
        return true;
      });

  if (!err.empty()) {
    Napi::Error::New(env, err).ThrowAsJavaScriptException();
    return env.Null();
  }

  auto buf = Napi::ArrayBuffer::New(env, samples.size() * sizeof(float));
  std::memcpy(buf.Data(), samples.data(), buf.ByteLength());
  Napi::Object obj = Napi::Object::New(env);
  obj.Set("samples", Napi::Float32Array::New(env, samples.size(), buf, 0));
  obj.Set("sampleRate", (double)kTargetRate);
  obj.Set("channels", 1);
  obj.Set("srcSampleRate", (double)srcRate);
  return obj;
}

// ============================================================
// FULL-BUFFER ASYNC
// ============================================================
static Napi::Value ExtractAsync(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "expected (string, callback)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  (new AsyncWorkerFull(info[0].As<Napi::String>(),
                       info[1].As<Napi::Function>()))
      ->Queue();
  return env.Undefined();
}

// ============================================================
// STREAMING ASYNC
// ============================================================
static Napi::Value ExtractStream(const Napi::CallbackInfo &info) {
  Napi::Env env = info.Env();
  if (info.Length() < 2 || !info[0].IsString() || !info[1].IsFunction()) {
    Napi::TypeError::New(env, "expected (string, onChunk)")
        .ThrowAsJavaScriptException();
    return env.Undefined();
  }
  (new AsyncWorkerStream(info[0].As<Napi::String>(),
                         info[1].As<Napi::Function>(), env))
      ->Queue();
  return env.Undefined();
}

// ============================================================
// Module init
// ============================================================
void InitExtractAudiotoPCM(Napi::Env env, Napi::Object exports) {
  exports.Set("ExtractAudiotoPCM", Napi::Function::New(env, ExtractSync));
  exports.Set("ExtractAudiotoPCMAsync", Napi::Function::New(env, ExtractAsync));
  exports.Set("ExtractAudiotoPCMStream",
              Napi::Function::New(env, ExtractStream));
}
