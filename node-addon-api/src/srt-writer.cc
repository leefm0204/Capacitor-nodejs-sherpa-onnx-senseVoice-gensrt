// scripts/node-addon-api/src/srt-writer.cc
//
// Optimized SRT writer for mobile - minimizes JS heap usage by handling
// formatting and I/O in native code.

#include <fstream>
#include <iomanip>
#include <iostream>
#include <string>
#include <vector>
#include <sstream>

#include "napi.h"

class SrtWriter : public Napi::ObjectWrap<SrtWriter> {
 public:
   static Napi::Object Init(Napi::Env env, Napi::Object exports) {
     Napi::Function func = DefineClass(env, "SrtWriter", {
       InstanceMethod("initialize", &SrtWriter::Initialize),
       InstanceMethod("addSegment", &SrtWriter::AddSegment),
       InstanceMethod("finalize", &SrtWriter::Finalize),
     });

     // Keep a persistent reference to prevent garbage collection
     constructor_ref = Napi::Persistent(func);
     constructor_ref.SuppressDestruct();

     exports.Set("SrtWriter", func);
     return exports;
   }

   SrtWriter(const Napi::CallbackInfo& info) : Napi::ObjectWrap<SrtWriter>(info) {
     if (info.Length() > 0 && info[0].IsString()) {
       filename_ = info[0].As<Napi::String>().Utf8Value();
     }
   }

 private:
  static Napi::FunctionReference constructor_ref;
  std::string filename_;
  std::ofstream file_;
  int segment_index_ = 0;

  struct Segment {
    float start;
    float duration;
    std::string text;
  };
  std::vector<Segment> buffer_;

  // Constants for merging logic - FIX: made static constexpr
  static constexpr float MAX_MERGE_DURATION = 8.0f;
  static constexpr float MAX_GAP = 0.4f;
  static constexpr size_t MAX_CHARS = 80;
  static constexpr size_t BUFFER_FLUSH_THRESHOLD = 5;

  static std::string FormatTime(float t) {
    int total_ms = static_cast<int>(t * 1000);
    int ms = total_ms % 1000;
    int total_s = total_ms / 1000;
    int s = total_s % 60;
    int m = (total_s / 60) % 60;
    int h = total_s / 3600;

    char buf[16];
    snprintf(buf, sizeof(buf), "%02d:%02d:%02d,%03d", h, m, s, ms);
    return std::string(buf);
  }

  void WriteToFile(const Segment& seg) {
    if (!file_.is_open()) return;
    
    segment_index_++;
    file_ << segment_index_ << "\n"
          << FormatTime(seg.start) << " --> " << FormatTime(seg.start + seg.duration) << "\n"
          << seg.text << "\n\n";
  }

  void FlushBuffer(bool force_all = false) {
    if (buffer_.empty()) return;

    // We keep the last segment in the buffer to check for potential merges with the next chunk
    size_t limit = force_all ? buffer_.size() : (buffer_.size() > 1 ? buffer_.size() - 1 : 0);
    
    for (size_t i = 0; i < limit; ++i) {
      WriteToFile(buffer_[i]);
    }

    if (limit > 0) {
      buffer_.erase(buffer_.begin(), buffer_.begin() + limit);
    }
  }

  Napi::Value Initialize(const Napi::CallbackInfo& info) {
    file_.open(filename_, std::ios::out | std::ios::trunc);
    return Napi::Boolean::New(info.Env(), file_.is_open());
  }

  Napi::Value AddSegment(const Napi::CallbackInfo& info) {
    Napi::Env env = info.Env();
    if (info.Length() < 3 || !info[0].IsNumber() || !info[1].IsNumber() || !info[2].IsString()) {
      return env.Undefined();
    }

    float start = info[0].As<Napi::Number>().FloatValue();
    float duration = info[1].As<Napi::Number>().FloatValue();
    std::string text = info[2].As<Napi::String>().Utf8Value();

    if (!buffer_.empty()) {
      Segment& last = buffer_.back();
      float gap = start - (last.start + last.duration);
      float combined_duration = (start + duration) - last.start;
      size_t combined_chars = last.text.length() + text.length() + 1;

      if (gap >= 0 && gap < MAX_GAP && 
          combined_duration <= MAX_MERGE_DURATION && 
          combined_chars <= MAX_CHARS) {
        last.duration = combined_duration;
        last.text += " " + text;
      } else {
        buffer_.push_back({start, duration, text});
      }
    } else {
      buffer_.push_back({start, duration, text});
    }

    // Keep memory usage low: write segments once we have a few buffered
    if (buffer_.size() >= BUFFER_FLUSH_THRESHOLD) {
      FlushBuffer();
    }

    return env.Undefined();
  }

  Napi::Value Finalize(const Napi::CallbackInfo& info) {
    FlushBuffer(true);
    if (file_.is_open()) {
      file_.close();
    }
    return info.Env().Undefined();
  }
};

// Static member definition
Napi::FunctionReference SrtWriter::constructor_ref;

void InitSrtWriter(Napi::Env env, Napi::Object exports) {
  SrtWriter::Init(env, exports);
}
