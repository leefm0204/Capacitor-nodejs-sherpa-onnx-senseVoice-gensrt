# A Sherpa-ONNX SenseVoice SRT Generator Android APK that compile using Capacitorjs.

 mobile-first Android application that generates **SRT subtitles** for video files using the **SenseVoice** speech-to-text model. Built with Capacitor and embedded Node.js, this app processes video files entirely on-device without requiring internet connectivity.

![Platform](https://img.shields.io/badge/platform-Android-green)
![Node.js](https://img.shields.io/badge/node.js-embedded-green)
![STT Engine](https://img.shields.io/badge/STT-SenseVoice-blue)
![License](https://img.shields.io/badge/license-ISC-gray)

## 🌟 Features

- **On-Device Processing**: Complete offline transcription using SenseVoice model
- **Multi-Format Support**: Handles MP4, MKV, WebM, TS, MTS, M2TS, AVI, MOV, FLV, M4A, and more
- **Real-Time Progress Tracking**: Live progress updates with speed and ETA calculations
- **Streaming SRT Generation**: Subtitles are written incrementally during transcription
- **Voice Activity Detection (VAD)**: Silero VAD for accurate speech segment detection
- **Memory Optimized**: Advanced V8 memory management for mobile devices (256MB heap limit)
- **Customizable Settings**: Adjustable VAD parameters, thread counts, and language options
- **Quick Presets**: 8 optimized presets for different content types


## 🔧 How It Works

### 1. **File Selection**
User select video files from default videos folder through the @capawesome/capacitor-file-picker. The absolute filepath from combination of filename from pickedfile result and the default video folder, we can directly access phone external storage.

### 2. **Audio Extraction**
instead of using FFmpeg-Kit that run on client side, The Node.js server (Capacitor-Nodejs) uses statically-linked FFmpeg libraries to extract audio from video files and converts it to **16kHz mono PCM** format required by sherpa-onnx.

### 3. **Voice Activity Detection**
Silero VAD processes the audio stream to detect speech segments, filtering out silence and non-speech sounds. Configurable parameters control sensitivity.

### 4. **Speech Recognition**
The SenseVoice model transcribes detected speech segments into text with inverse text normalization. Supports auto language detection or manual selection.

### 5. **SRT Generation**
A streaming SRT writer incrementally writes subtitle segments, merging adjacent segments for better readability.

### 6. **Progress Tracking**
Real-time progress updates are sent to the frontend, showing elapsed time, remaining time, processing speed (EMA-smoothed), and segm 🚀 Getting Started

### Prerequisites
In order not to increase apk size, pls place the model file in, example
- **Models** placed in `/sdcard/models/senseVoice/`:
  - `model.onnx` - SenseVoice STT model
  - `tokens.txt` - Model vocabulary
  - `silero_vad.onnx` - Voice activity detection model

Atually most of the model have the similar recognizer and vad config. so you may use other model too like nemoCtc, paraformer etc.

### Model Download

Download the required SenseVoice model from the official release:

**Model Download:** 
both model also able to run but the int8 are more mobile friendly. remember to rename it to model.onnx or u may change model name in the server.js , app.js to model.int8.onnx.
1.[sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-int8-2025-12-17.tar.bz2)

2. [sherpa-onnx-sense-voice-funasr-nano-2025-12-17](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-2025-12-17.tar.bz2)


### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nodejs-sherpa-onnx-senseVoice-gensrt
   ```

2. **Install dependencies**
   ```bash
   npm run install
   ```
   This will also install dependencies in `static/nodejs/` automatically.

3. **Build the frontend**
   ```bash
   npm run buildnode 
   ```
after setup the capacitor related, run this command build and compile all the required library and sherpa-onnx.node. "cd node-addon-api && bash buildnode.sh && cd ~/nodejs-sherpa-onnx-senseVoice-gensrt",

4. **Sync with Android**
   ```bash
   npm run buildapk
   ```
this will build the apk. ("bash ~/nodejs-sherpa-onnx-senseVoice-gensrt/buildapk.sh") 



## ⚙️ Configuration

### Quick Presets

The **Quick Presets** dropdown provides instant access to optimized settings for common content types:

| Preset | Threshold | Min Speech | Min Silence | Max Speech | Best For |
|--------|-----------|------------|-------------|------------|----------|
| **🎬 Movies & TV Shows** | 0.45 | 0.2s | 0.45s | 60s | Dialogue over background music |
| **🎤 Lectures & Presentations** | 0.55 | 0.35s | 0.7s | 90s | Clear speech with longer pauses |
| **🎵 Music Videos / Noisy** | 0.65 | 0.4s | 0.6s | 45s | Filtering background noise |
| **🗣️ Rapid Dialogue / Comedy** | 0.35 | 0.15s | 0.35s | 30s | Quick back-and-forth exchanges |
| **📺 News Broadcasts** | 0.5 | 0.25s | 0.55s | 60s | Professional delivery |
| **🎙️ Podcasts & Interviews** | 0.45 | 0.3s | 0.5s | 90s | Conversational speech |
| **📚 Audiobooks & Narration** | 0.5 | 0.4s | 0.6s | 120s | Continuous narration |
| **💼 Business Meetings** | 0.5 | 0.35s | 0.65s | 120s | Multi-speaker discussions |

**How to Use:**
1. Navigate to the **Settings** tab
2. Select a preset from the **Quick Presets** dropdown
3. Settings are automatically applied and saved
4. Fine-tune individual parameters if needed

### Manual Configuration

#### VAD Settings (Voice Activity Detection)

| Parameter | Default | Range | Impact |
|-----------|---------|-------|--------|
| **Threshold** | 0.5 | 0.0 - 1.0 | **Higher (0.6-0.8):** More strict, fewer false positives, may miss quiet speech<br>**Lower (0.2-0.4):** More sensitive, catches quiet speech but may trigger on noise |
| **Min Speech Duration** | 0.25s | ≥0.0s | **Higher (0.5-1.0s):** Filters out short utterances<br>**Lower (0.1-0.2s):** Captures brief words and interjections |
| **Min Silence Duration** | 0.5s | ≥0.0s | **Higher (0.8-1.5s):** Merges speech with brief pauses<br>**Lower (0.2-0.4s):** Splits at every pause for better sentence boundaries |
| **Max Speech Duration** | 60s | ≥1s | Maximum continuous speech segment before forced split |
| **Num Threads** | 1 | 1-8 | Performance only. Higher = faster but more battery drain |

#### Recognizer Settings (SenseVoice Model)

| Parameter | Default | Range | Impact |
|-----------|---------|-------|--------|
| **Num Threads** | 2 | 1-8 | **Performance only.** 2-4 recommended for balance |
| **Language** | Auto | - | **Auto:** Automatic detection<br>**Manual:** zh/en/ja/ko/yue for known languages |
| **Use Inverse Text Normalization** | Yes | - | Converts numbers, dates to written form |

### Performance vs. Accuracy Trade-offs

| Setting Change | Accuracy | Speed | Segments |
|----------------|----------|-------|----------|
| ↑ VAD Threshold | ↓ May miss quiet speech | ↑ Faster (fewer segments) | ↓ Decreases |
| ↓ VAD Threshold | ↑ Catches more speech | ↓ Slower (more segments) | ↑ Increases |
| ↑ Min Speech | ↓ Misses short utterances | ↑ Faster | ↓ Decreases |
| ↓ Min Speech | ↑ Catches brief words | ↓ Slower | ↑ Increases |
| ↑ Min Silence | ↑ Better sentence merging | ↑ Faster | ↓ Decreases |
| ↓ Min Silence | ↑ Better sentence boundaries | ↓ Slower | ↑ Increases |
| ↑ Threads | No change | ↑↑ Much faster | No change |



### Settings Tab

Access the Settings tab to customize:
- Video folder path (default: `/sdcard/Movies`) or u may input ur desire folder path as long as start with 'sdcard'.
- VAD sensitivity parameters
- Processing thread counts
- Recognition language preference
- Quick preset selection


## 📝 Notes

### File Paths

- **Videos**: Read from `/sdcard/Movies` by default (configurable)
- **SRT Output**: Saved alongside original videos (`<video>.srt`)
- **Models**: put the model in `/sdcard/models/senseVoice/` (configurable)

- Optimized for mobile devices with limited RAM
- Automatic garbage collection under pressure
- External memory released explicitly
- Resource cleanup on file completion
- Aggressive GC mode when heap > 90%

### Supported Formats

The app uses statically-linked FFmpeg for audio extraction, supporting:
- **Video**: MP4, MKV, WebM, TS, MTS, M2TS, AVI, MOV, FLV
- **Audio**: M4A, WAV, MP3, AAC (any FFmpeg-supported format)
- **Containers**: MPEG-TS, Matroska, ISO-BMFF, RIFF


## 📄 License

### Application Code
This project's source code is licensed under the **ISC License**.

Permission to use, copy, modify, and/or distribute this software for any purpose with or without fee is hereby granted, provided that the above copyright notice and this permission notice appear in all copies.

THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.

### SenseVoice Model License
The **SenseVoice** speech-to-text model used in this project is licensed under the **FunASR Model Open Source License Agreement (Version 1.1)** by Alibaba Group.

**✅ Permitted Uses:**
- **Personal Use**: Allowed
- **Commercial Use**: Allowed (with attribution)
- **Open Source Distribution**: Allowed (with attribution)
- **Modification**: Allowed (including fine-tuned derivatives)

**📋 Attribution Requirements:**
When using, modifying, or distributing this software (including the SenseVoice model), you must:
1. ✅ Credit **FunASR / Alibaba Group** as the model source
2. ✅ Retain **"SenseVoice"** model naming
3. ✅ Include a link to the original [FunASR project](https://github.com/FunAudioLLM/SenseVoice)

**⚠️ Risk Disclaimer:**
The SenseVoice model is provided "as is" for reference and learning purposes. Alibaba Group assumes no responsibility for any direct or indirect losses resulting from use or modification. Users assume all risks.

See [MODEL_LICENSE](./MODEL_LICENSE) for the full license text.

## 🙏 Acknowledgments

This project builds upon excellent open-source projects:

- **[FunASR / SenseVoice](https://github.com/FunAudioLLM/SenseVoice)** by **Alibaba Group** - High-quality ASR model (FunASR Model Open Source License 1.1)
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** - ONNX runtime for speech processing by K2-FSA
- **[Capacitor](https://capacitorjs.com/)** - Cross-platform native runtime
- **[Capacitor-NodeJS](https://github.com/hampoelz/Capacitor-NodeJS)** - Mobile Embedded Node.js server plugin
- **[@capawesome/capacitor-file-picker](https://github.com/capawesome-team/capacitor-plugins/tree/main/packages/file-picker)** - file picker plugin
- **[Silero VAD](https://github.com/snakers4/silero-vad)** - Pre-trained voice activity detection
- **[FFmpeg](https://ffmpeg.org/)** - Multimedia processing libraries
- **[node-addon-api](https://github.com/nodejs/node-addon-api)** - N-API bindings for Node.js
- 


---

**Built with ❤️ for offline speech-to-text transcription**

*Last updated: March 2026*
