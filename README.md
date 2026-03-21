# Node.js Sherpa-ONNX SenseVoice SRT Generator

A mobile-first Android application that generates **SRT subtitles** for video files using the **SenseVoice** speech-to-text model. Built with Capacitor and embedded Node.js, this app processes video files entirely on-device without requiring internet connectivity.

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
- **Modern UI**: Beautiful glassmorphism design with dark theme and nebula background
- **Customizable Settings**: Adjustable VAD parameters, thread counts, and language options
- **Zoom Controls**: Adjustable UI scaling (40%-120%) with keyboard shortcuts
- **Quick Presets**: 8 optimized presets for different content types

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Vanilla JavaScript, CSS3 with glassmorphism design |
| **Backend** | Embedded Node.js (via Capacitor-NodeJS) |
| **STT Engine** | SenseVoice model via sherpa-onnx |
| **Audio Processing** | FFmpeg-based audio extraction (statically linked) |
| **Platform** | Android (Capacitor) |
| **Native Bridge** | node-addon-api (N-API) |

### Project Structure

```
nodejs-sherpa-onnx-senseVoice-gensrt/
├── src/                          # Client-side frontend code
│   ├── index.html               # Main HTML with UI components
│   ├── Picture1_013446.png      # Nebula background image
│   └── js/
│       └── app.js               # Frontend logic & UI management
├── static/nodejs/               # Embedded Node.js server
│   ├── server.js                # Main transcription server (1070 lines)
│   ├── progress_tracker.js      # Progress calculation module
│   ├── v8_memory.js             # Memory management system
│   ├── package.json             # Server dependencies
│   └── sherpa-onnx-node/        # Native sherpa-onnx bindings
│       ├── addon.js             # N-API bindings
│       ├── srt-writer.js        # SRT file writer
│       ├── extract-audio-to-pcm.js  # FFmpeg audio extractor
│       └── ...                  # Other helper modules
├── capacitor-nodejs/            # Capacitor-NodeJS bridge
├── node-addon-api/              # Native build environment
│   ├── CMakeLists.txt          # CMake build configuration
│   ├── buildnode.sh            # Android build script
│   ├── src/                    # C++ source files
│   ├── sherpa-onnx-c-api-onnxruntime/  # Prebuilt sherpa-onnx
│   ├── FFmpeg/                 # Prebuilt FFmpeg static libs
│   └── libnode/                # Prebuilt libnode.so
├── android/                     # Native Android project
├── dist/                        # Built frontend assets
├── package.json                 # Root project config
├── vite.config.ts              # Vite build configuration
├── capacitor.config.json       # Capacitor configuration
└── README.md                   # This file
```

## 🔧 How It Works

### Processing Pipeline

```
┌─────────────────┐
│  Video File     │  MP4, MKV, TS, WebM, etc.
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Audio Extract  │  FFmpeg → 16kHz mono PCM
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  VAD Processing │  Silero VAD detects speech segments
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  Recognition    │  SenseVoice model transcribes speech
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SRT Writer     │  Streaming subtitle generation
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  SRT File       │  Saved alongside original video
└─────────────────┘
```

### 1. **File Selection**
Users select video files through the Capacitor File Picker. The app supports both absolute file paths and content:// URIs.

### 2. **Audio Extraction**
The Node.js server uses statically-linked FFmpeg libraries to extract audio from video files and converts it to **16kHz mono PCM** format required by sherpa-onnx.

### 3. **Voice Activity Detection**
Silero VAD processes the audio stream to detect speech segments, filtering out silence and non-speech sounds. Configurable parameters control sensitivity.

### 4. **Speech Recognition**
The SenseVoice model transcribes detected speech segments into text with inverse text normalization. Supports auto language detection or manual selection.

### 5. **SRT Generation**
A streaming SRT writer incrementally writes subtitle segments, merging adjacent segments for better readability.

### 6. **Progress Tracking**
Real-time progress updates are sent to the frontend, showing elapsed time, remaining time, processing speed (EMA-smoothed), and segment count.

## 🚀 Getting Started

### Prerequisites

- **Node.js** 18+ installed
- **Android Studio** with SDK
- **Android device or emulator** (API 24+, ARM64-v8a)
- **Models** placed in `/sdcard/models/senseVoice/`:
  - `model.onnx` - SenseVoice STT model
  - `tokens.txt` - Model vocabulary
  - `silero_vad.onnx` - Voice activity detection model

### Model Download

Download the required SenseVoice model from the official release:

**Model:** [sherpa-onnx-sense-voice-funasr-nano-2025-12-17](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-2025-12-17.tar.bz2)

```bash
# Download and extract
cd /sdcard/models
mkdir -p senseVoice
cd senseVoice
wget https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-2025-12-17.tar.bz2
tar -xjf sherpa-onnx-sense-voice-funasr-nano-2025-12-17.tar.bz2
# Copy required files: model.onnx, tokens.txt
```

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd nodejs-sherpa-onnx-senseVoice-gensrt
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```
   This will also install dependencies in `static/nodejs/` automatically.

3. **Build the frontend**
   ```bash
   npm run build
   ```

4. **Sync with Android**
   ```bash
   npx cap sync android
   ```

5. **Open in Android Studio**
   ```bash
   npx cap open android
   ```

6. **Build and run**
   - Open Android Studio
   - Build the project
   - Run on your device

### Build Commands

```bash
# Build frontend only
npm run build

# Build and sync for Android
npm run build:android

# Lint code
npm run lint
```

### Building Native Modules

To rebuild the native sherpa-onnx Node.js module for Android:

```bash
cd node-addon-api
chmod +x buildnode.sh
./buildnode.sh
```

**Requirements:**
- Android NDK 29+
- CMake 3.18+
- Prebuilt sherpa-onnx C-API with ONNX Runtime
- Prebuilt FFmpeg static libraries for ARM64

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

### Common Issues & Solutions

| Problem | Solution |
|---------|----------|
| Missing quiet dialogue | Lower VAD Threshold (0.3-0.4) or decrease Min Speech Duration |
| Too many short segments | Increase Min Silence Duration (0.7-1.0s) or raise VAD Threshold |
| Subtitles combine multiple sentences | Decrease Min Silence Duration (0.3-0.4s) |
| Background noise triggering detection | Increase VAD Threshold (0.6-0.7) and Min Speech Duration |
| Processing is slow | Increase thread counts (VAD: 2-4, Recognition: 4-6) |
| Heavy accent not recognized | Manually set Language instead of Auto Detect |

## 📱 Usage

### Transcribing Videos

1. **Open the app** on your Android device
2. **Tap "Pick Videos"** to select video files
3. **Review the file list** - files are staged for processing
4. **(Optional) Adjust settings** in the Settings tab
5. **Tap "Process Files"** to start transcription
6. **Monitor progress** - real-time updates show speed and ETA
7. **SRT files generated** - saved alongside original videos

Example output:
```srt
1
00:00:01,230 --> 00:00:04,560
Hello, this is a subtitle example

2
00:00:05,120 --> 00:00:08,890
Multiple segments are merged for readability
```

### Settings Tab

Access the Settings tab to customize:
- Video folder path (default: `/sdcard/Movies`)
- VAD sensitivity parameters
- Processing thread counts
- Recognition language preference
- Quick preset selection

### Zoom Controls

Adjust UI scaling using:
- **Slider**: Settings tab zoom slider (40%-120%)
- **Keyboard**: `Ctrl/Cmd + +` (zoom in), `Ctrl/Cmd + -` (zoom out), `Ctrl/Cmd + 0` (reset)
- **Touch**: Pinch-to-zoom gesture support

## 🎨 UI Design

### Design Tokens

- **Colors**: Deep purple/indigo gradient palette with glassmorphism
- **Typography**: Outfit (display), JetBrains Mono (code/numbers)
- **Effects**: Backdrop blur, radial gradients, shimmer animations
- **Animations**: Smooth transitions, pulse effects, slide-in animations

### Responsive Layout

- Optimized for mobile and tablet screens
- Safe area insets for notch devices
- Landscape mode support
- Touch-friendly controls (48px minimum touch targets)
- High contrast text for readability

## 🔍 Technical Details

### Server Components

#### `server.js` (1070 lines)
Main transcription server handling:
- File processing pipeline with streaming support
- VAD and recognizer initialization
- Circular buffer management (30s buffer, 5s chunks)
- Streaming SRT generation
- Progress tracking with EMA speed calculation
- Memory management integration
- Configuration updates (hot-reloadable)
- Stop/resume functionality

**Key Features:**
- Lazy module loading for heavy dependencies
- Subarray-based zero-copy buffer operations
- Emergency overflow handling
- File diagnostics and logging
- Multi-format support via FFmpeg streaming

#### `progress_tracker.js`
Progress calculation module:
- Elapsed time tracking
- EMA-smoothed speed calculation (α=0.25)
- ETA estimation
- Throttled updates (2s interval, 100ms minimum)
- Segment count tracking

#### `v8_memory.js`
Advanced memory management:
- Heap monitoring (70% threshold)
- External memory tracking (75% threshold)
- RSS monitoring (300MB threshold)
- Automatic GC triggering
- Memory pressure detection
- Aggressive GC mode under critical pressure
- Periodic memory trend analysis

**Configuration:**
```javascript
{
  initialHeapSize: 64,      // MB
  maxHeapSize: 256,         // MB (mobile-optimized)
  heapUsageThreshold: 0.7,  // 70%
  externalMemoryThreshold: 0.75,
  rssThreshold: 200,        // MB
  checkInterval: 3000,      // 3 seconds
  aggressiveGCInterval: 1500 // 1.5 seconds
}
```

### Frontend Components

#### `app.js` (1326 lines)
Frontend application logic:
- File picker integration (Capacitor File Picker)
- UI state management with DOM caching
- Progress visualization with requestAnimationFrame
- Settings management with localStorage persistence
- Zoom controls with keyboard shortcuts
- Toast notifications
- Tab navigation
- Preset management
- Progress tracking (UI-side EMA for robustness)

#### `index.html` (1465 lines)
UI structure with:
- Glassmorphism design with backdrop blur
- Responsive grid layouts
- Tab-based navigation (Transcribe/Settings)
- Settings form with validation
- File list with progress bars and badges
- Toast notification container
- Help box with detailed configuration guide
- Zoom slider and preset selector

### Native Components

#### C++ Source Files (`node-addon-api/src/`)
- `sherpa-onnx-node-addon-api.cc` - Main N-API entry point
- `vad.cc` - Voice activity detection wrapper
- `non-streaming-asr.cc` - Offline recognizer wrapper
- `extract-audio-to-pcm.cc` - FFmpeg audio extraction
- `srt-writer.cc` - SRT file writer
- `audio-tagging.cc`, `keyword-spotting.cc`, etc. - Additional features

#### Build System
- **CMake** 3.18+ for cross-platform builds
- **node-addon-api** for N-API bindings
- **ARM64 optimizations**: NEON SIMD, link-time optimization
- **Statically linked**: FFmpeg (avcodec, avformat, avutil, swresample, swscale)
- **Dynamically linked**: sherpa-onnx, ONNX Runtime, libnode

### SRT Format

Output SRT files follow standard format:
```srt
1
00:00:01,230 --> 00:00:04,560
Hello, this is a subtitle example

2
00:00:05,120 --> 00:00:08,890
Multiple segments are merged for readability
```

### Buffer Management

The app uses a circular buffer for streaming audio processing:
- **Buffer Size**: 30 seconds (480,000 samples at 16kHz)
- **Chunk Size**: 5 seconds (80,000 samples)
- **Overflow Threshold**: 80% (dynamic, reduces to 40% under memory pressure)
- **Emergency Processing**: Automatic when buffer full
- **VAD Window**: 512 samples (32ms at 16kHz)

## 🛠️ Development

### Code Style

- **Linter**: ESLint with custom config
- **Formatter**: Biome
- **Module System**: ES modules (frontend), CommonJS (backend)
- **Type Safety**: JSDoc annotations in frontend code

### Key Dependencies

#### Frontend
```json
{
  "@capacitor/core": "latest",
  "@capacitor/android": "^8.2.0",
  "@capawesome/capacitor-file-picker": "^8.0.2",
  "capacitor-nodejs": "file:capacitor-nodejs"
}
```

#### Backend
```json
{
  "sherpa-onnx-node": "file:sherpa-onnx-node",
  "hello-world-npm": "^1.1.1"
}
```

#### Native Build
- `node-addon-api` - N-API bindings
- `sherpa-onnx-c-api-onnxruntime` - STT engine
- `FFmpeg` - Audio extraction (statically linked)
- `libnode` - Embedded Node.js runtime

### Debugging

1. **Frontend**: Chrome DevTools (remote debugging via `chrome://inspect`)
2. **Backend**: Android Logcat for Node.js logs
3. **Memory**: Built-in V8 memory monitoring logs
4. **Performance**: Progress tracker speed metrics

### Performance Optimization

- **Throttled UI updates**: 10fps max for progress bars
- **RequestAnimationFrame**: GPU-friendly DOM updates
- **Subarray usage**: Zero-copy buffer operations
- **Lazy module loading**: Heavy modules loaded on demand
- **Streaming processing**: No full-file loading
- **EMA speed tracking**: Smooth, responsive speed estimates
- **DOM caching**: Pre-cached element references
- **Memory pressure adaptation**: Dynamic buffer management

## 📝 Notes

### File Paths

- **Videos**: Read from `/sdcard/Movies` by default (configurable)
- **SRT Output**: Saved alongside original videos (`<video>.srt`)
- **Models**: Must be in `/sdcard/models/senseVoice/`
- **Cache**: `/sdcard/cache/` (auto-cleaned before processing)

### Memory Considerations

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

### Limitations

- **Platform**: Android only (ARM64-v8a)
- **Model**: SenseVoice nano model (optimized for mobile)
- **Languages**: Auto-detection or manual (zh/en/ja/ko/yue)
- **Sample Rate**: Fixed at 16kHz (model requirement)
- **Timeout**: 10 minutes per file (configurable in `app.js`)

## 🐛 Troubleshooting

### Common Issues

**"EROFS: read-only file system"**
- Ensure video files are on writable storage (`/sdcard/`)
- Check file paths are absolute
- Verify app has storage permissions

**"Transcription timeout"**
- Large files may exceed 10-minute default
- Check memory pressure in logs
- Reduce thread count if device overheats
- Increase timeout in `app.js` if needed

**"No speech detected"**
- Lower VAD threshold in settings (try 0.3-0.4)
- Check audio quality of source file
- Verify model files are present and correct
- Increase Min Speech Duration

**High memory usage**
- Check V8 memory logs (`[V8 Memory]`)
- Reduce buffer size if needed
- Close other background apps
- Enable aggressive GC mode manually

**"Module not found: sherpa-onnx-node"**
- Rebuild native modules: `cd node-addon-api && ./buildnode.sh`
- Ensure prebuilt libraries are in correct locations
- Check Android ABI compatibility (arm64-v8a only)

**Audio extraction fails**
- Verify video file is not corrupted
- Check FFmpeg logs in Node.js console
- Try converting file to MP4 first

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
- **[Capacitor-NodeJS](https://github.com/hampoelz/Capacitor-NodeJS)** - Embedded Node.js server
- **[Silero VAD](https://github.com/snakers4/silero-vad)** - Pre-trained voice activity detection
- **[FFmpeg](https://ffmpeg.org/)** - Multimedia processing libraries
- **[node-addon-api](https://github.com/nodejs/node-addon-api)** - N-API bindings for Node.js

## 📞 Support

For issues, questions, or contributions:
1. Check existing documentation in this README
2. Review troubleshooting section
3. Inspect logs via Android Logcat
4. Enable debug logging in settings

---

**Built with ❤️ for offline speech-to-text transcription**

*Last updated: March 2026*
