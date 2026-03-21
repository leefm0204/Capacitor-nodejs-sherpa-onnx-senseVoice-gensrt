# SenseVoice Subtitle Generator

A mobile-first Android application that generates subtitles for video files using the **SenseVoice** speech-to-text model. Built with Capacitor and embedded Node.js, this app processes video files entirely on-device without requiring internet connectivity.

## 🌟 Features

- **On-Device Processing**: Complete offline transcription using SenseVoice model
- **Multi-Format Support**: Handles MP4, MKV, WebM, TS, MTS, M2TS, AVI, MOV, FLV, and more
- **Real-Time Progress Tracking**: Live progress updates with speed and ETA calculations
- **Streaming SRT Generation**: Subtitles are written incrementally during transcription
- **Voice Activity Detection (VAD)**: Silero VAD for accurate speech segment detection
- **Memory Optimized**: Advanced V8 memory management for mobile devices
- **Modern UI**: Beautiful glassmorphism design with dark theme
- **Customizable Settings**: Adjustable VAD parameters, thread counts, and language options
- **Zoom Controls**: Adjustable UI scaling (40%-120%)

## 🏗️ Architecture

### Tech Stack

- **Frontend**: Vanilla JavaScript, CSS3 with glassmorphism design
- **Backend**: Embedded Node.js (via Capacitor-NodeJS)
- **STT Engine**: SenseVoice model via sherpa-onnx
- **Audio Processing**: FFmpeg-based audio extraction
- **Platform**: Android (Capacitor)

### Project Structure

```
senseVoice-gensrt/
├── src/                          # Client-side frontend code
│   ├── index.html               # Main HTML with UI components
│   ├── Picture1_013446.png      # Nebula background image
│   └── js/
│       └── app.js               # Frontend logic & UI management
├── static/nodejs/               # Embedded Node.js server
│   ├── server.js                # Main transcription server
│   ├── progress_tracker.js      # Progress calculation module
│   ├── v8_memory.js             # Memory management system
│   ├── package.json             # Server dependencies
│   └── sherpa-onnx-node/        # Native sherpa-onnx bindings
├── capacitor-nodejs/            # Capacitor-NodeJS bridge
├── android/                     # Native Android project
├── dist/                        # Built frontend assets
├── package.json                 # Root project config
├── vite.config.ts              # Vite build configuration
└── capacitor.config.json       # Capacitor configuration
```

## 🔧 How It Works

### 1. **File Selection**
Users select video files through the Capacitor File Picker. The app supports both absolute file paths and content:// URIs.

### 2. **Audio Extraction**
The Node.js server uses FFmpeg C-module to extract audio from video files and converts it to 16kHz mono PCM format required by sherpa-onnx.

### 3. **Voice Activity Detection**
Silero VAD processes the audio stream to detect speech segments, filtering out silence and non-speech sounds.

### 4. **Speech Recognition**
The SenseVoice model transcribes detected speech segments into text with inverse text normalization.

### 5. **SRT Generation**
A streaming SRT writer incrementally writes subtitle segments, merging adjacent segments for better readability.

### 6. **Progress Tracking**
Real-time progress updates are sent to the frontend, showing elapsed time, remaining time, and processing speed.

## 🚀 Getting Started

### Prerequisites

- Node.js 18+ installed
- Android Studio with SDK
- Android device or emulator (API 24+)
- Models placed in `/sdcard/models/senseVoice/`:
  - `model.onnx` - SenseVoice STT model
  - `tokens.txt` - Model vocabulary
  - `silero_vad.onnx` - Voice activity detection model

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd senseVoice-gensrt
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

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

## ⚙️ Configuration

### Quick Presets

The **Quick Presets** dropdown provides instant access to optimized settings for common content types:

| Preset | Threshold | Min Speech | Min Silence | Best For |
|--------|-----------|------------|-------------|----------|
| **🎬 Movies & TV Shows** | 0.45 | 0.2s | 0.45s | Dialogue over background music, short exchanges |
| **🎤 Lectures & Presentations** | 0.55 | 0.35s | 0.7s | Clear speech with longer pauses between topics |
| **🎵 Music Videos / Noisy** | 0.65 | 0.4s | 0.6s | Filtering out background noise and music |
| **🗣️ Rapid Dialogue / Comedy** | 0.35 | 0.15s | 0.35s | Quick back-and-forth exchanges, short interjections |
| **📺 News Broadcasts** | 0.5 | 0.25s | 0.55s | Professional delivery with natural pacing |
| **🎙️ Podcasts & Interviews** | 0.45 | 0.3s | 0.5s | Conversational speech patterns |
| **📚 Audiobooks & Narration** | 0.5 | 0.4s | 0.6s | Continuous narration with consistent pacing |
| **💼 Business Meetings** | 0.5 | 0.35s | 0.65s | Multi-speaker discussions with pauses |

**How to Use:**
1. Navigate to the **Settings** tab
2. Select a preset from the **Quick Presets** dropdown
3. Settings are automatically applied and saved
4. Fine-tune individual parameters if needed

### Manual Configuration

#### VAD Settings (Voice Activity Detection)

The VAD parameters control how speech segments are detected and extracted from audio. Proper tuning affects both **accuracy** (catching all speech) and **segmentation** (how subtitles are split).

| Parameter | Default | Range | Impact on Accuracy & Segmentation |
|-----------|---------|-------|-----------------------------------|
| **Threshold** | 0.5 | 0.0 - 1.0 | **Higher (0.6-0.8):** More strict detection. Fewer false positives but may miss quiet speech, background music, or whispered dialogue. Results in fewer, cleaner segments.<br>**Lower (0.2-0.4):** More sensitive. Catches quiet speech and soft consonants but may trigger on background noise, music, or breathing. Creates more segments, some potentially spurious.<br>**Recommended:** 0.4-0.6 for clean audio, 0.3 for noisy environments |
| **Min Speech Duration** | 0.25s | ≥0.0s | **Higher (0.5-1.0s):** Filters out short utterances, interjections, and false starts. Reduces subtitle count but may miss brief dialogue.<br>**Lower (0.1-0.2s):** Captures short words and quick exchanges. More segments but may include non-speech sounds.<br>**Recommended:** 0.2-0.3s for natural dialogue, 0.4s+ for lectures/presentations |
| **Min Silence Duration** | 0.5s | ≥0.0s | **Higher (0.8-1.5s):** Merges speech with brief pauses into single segments. Fewer, longer subtitles. May combine separate sentences.<br>**Lower (0.2-0.4s):** Splits at every pause. More segments with better sentence boundaries. May fragment rapid speech excessively.<br>**Recommended:** 0.4-0.6s for movies, 0.6-0.8s for speeches |
| **Num Threads** | 1 | 1-8 | **Performance only.** Does not affect accuracy. Higher values speed up VAD processing on multi-core devices but increase battery drain.<br>**Recommended:** 1-2 for battery life, 4+ for fast batch processing |

**Note:** VAD Window Size is fixed at 512 samples (optimal for most content).

### Recognizer Settings (SenseVoice Model)

| Parameter | Default | Range | Impact on Accuracy & Segmentation |
|-----------|---------|-------|-----------------------------------|
| **Num Threads** | 2 | 1-8 | **Performance only.** Does not affect transcription accuracy.<br>**Higher (4-8):** Faster processing but more CPU/battery usage.<br>**Lower (1-2):** Slower but more battery-efficient.<br>**Recommended:** 2-4 for balance, 1 for battery saving |
| **Language** | Auto | - | **Auto Detect:** Model automatically detects language. Works well for clear, single-language audio but may struggle with code-switching or heavy accents.<br>**Manual (zh/en/ja/ko/yue):** Forces specific language. Improves accuracy when you know the audio language. Essential for mixed-language content or strong dialects.<br>**Recommended:** Auto for mixed content, manual for known language |
| **Sample Rate** | 16000 Hz | Fixed | **Fixed requirement.** SenseVoice model requires 16kHz audio. Do not change.<br>**Impact:** Audio is automatically resampled during extraction |
| **Feature Dim** | 80 | Fixed | **Fixed requirement.** Mel-frequency feature dimension. Do not change.<br>**Impact:** Part of model architecture |

### Performance vs. Accuracy Trade-offs

| Setting Change | Accuracy Impact | Performance Impact | Segment Count |
|----------------|-----------------|-------------------|---------------|
| ↑ VAD Threshold | ↓ May miss quiet speech | ↑ Fewer segments = faster | ↓ Decreases |
| ↓ VAD Threshold | ↑ Catches more speech | ↓ More segments = slower | ↑ Increases |
| ↑ Min Speech | ↓ Misses short utterances | ↑ Faster (less to process) | ↓ Decreases |
| ↓ Min Speech | ↑ Catches brief words | ↓ More segments to process | ↑ Increases |
| ↑ Min Silence | ↑ Better sentence merging | ↑ Faster (fewer segments) | ↓ Decreases |
| ↓ Min Silence | ↑ Better sentence boundaries | ↓ More segments | ↑ Increases |
| ↑ Threads | No change | ↑↑ Much faster | No change |

### Common Issues & Solutions

**Problem: Missing quiet dialogue**
→ Lower VAD Threshold (0.3-0.4) or decrease Min Speech Duration

**Problem: Too many short segments**
→ Increase Min Silence Duration (0.7-1.0s) or raise VAD Threshold

**Problem: Subtitles combine multiple sentences**
→ Decrease Min Silence Duration (0.3-0.4s)

**Problem: Background noise triggering detection**
→ Increase VAD Threshold (0.6-0.7) and Min Speech Duration

**Problem: Processing is slow**
→ Increase thread counts (VAD: 2-4, Recognition: 4-6)

**Problem: Heavy accent not recognized**
→ Manually set Language instead of Auto Detect

### Memory Management

The app includes advanced memory management optimized for mobile devices:

- **Max Heap Size**: 256MB (conservative for mobile)
- **GC Triggers**: 70% heap usage, 75% external memory
- **RSS Threshold**: 200MB
- **Monitoring**: Every 3 seconds
- **Aggressive GC**: Every 1.5s under high pressure

## 📱 Usage

### Transcribing Videos

1. **Open the app** on your Android device
2. **Tap "Pick Videos"** to select video files
3. **Review the file list** - files are staged for processing
4. **Tap "Process Files"** to start transcription
5. **Monitor progress** - real-time updates show speed and ETA
6. **SRT files generated** - saved alongside original videos

### Settings Tab

Access the Settings tab to customize:
- Video folder path
- VAD sensitivity parameters
- Processing thread counts
- Recognition language preference

### Zoom Controls

Adjust UI scaling using:
- **Slider**: Settings tab zoom slider
- **Keyboard**: Ctrl/Cmd + +/- (desktop)
- **Reset**: Ctrl/Cmd + 0 (desktop)

## 🎨 UI Design

### Design Tokens

- **Colors**: Deep purple/indigo gradient palette
- **Typography**: Outfit (display), JetBrains Mono (code)
- **Effects**: Glassmorphism with backdrop blur
- **Animations**: Smooth transitions and shimmer effects

### Responsive Layout

- Optimized for mobile and tablet screens
- Safe area insets for notch devices
- Landscape mode support
- Touch-friendly controls (48px minimum)

## 🔍 Technical Details

### Server Components

#### `server.js`
Main transcription server handling:
- File processing pipeline
- VAD and recognizer initialization
- Streaming SRT generation
- Progress tracking
- Memory management integration
- Configuration updates

#### `progress_tracker.js`
Progress calculation module:
- Elapsed time tracking
- Speed calculation (EMA smoothed)
- ETA estimation
- Throttled updates (2s interval)

#### `v8_memory.js`
Advanced memory management:
- Heap monitoring
- External memory tracking
- RSS monitoring
- Automatic GC triggering
- Memory pressure detection
- Aggressive GC mode

### Frontend Components

#### `app.js`
Frontend application logic:
- File picker integration
- UI state management
- Progress visualization
- Settings management
- Zoom controls
- Toast notifications
- Tab navigation

#### `index.html`
UI structure with:
- Glassmorphism design
- Responsive layout
- Tab-based navigation
- Settings form
- File list with progress bars
- Toast notification container

### SRT Format

Output SRT files follow standard format:
```
1
00:00:01,230 --> 00:00:04,560
Hello, this is a subtitle example

2
00:00:05,120 --> 00:00:08,890
Multiple segments are merged for readability
```

### Buffer Management

The app uses a circular buffer for streaming audio processing:
- **Buffer Size**: 30 seconds
- **Chunk Size**: 5 seconds (80000 samples)
- **Overflow Threshold**: 80%
- **Emergency Processing**: Automatic when buffer full

## 🛠️ Development

### Code Style

- **Linter**: ESLint with custom config
- **Formatter**: Biome
- **Module System**: ES modules (frontend), CommonJS (backend)

### Key Dependencies

#### Frontend
- `@capacitor/core` - Capacitor runtime
- `@capacitor/android` - Android platform
- `@capawesome/capacitor-file-picker` - File selection
- `capacitor-nodejs` - Embedded Node.js bridge

#### Backend
- `sherpa-onnx-node` - STT engine bindings
- `hello-world-npm` - Test dependency
- `v8` - Memory management APIs

### Debugging

1. **Frontend**: Chrome DevTools (remote debugging)
2. **Backend**: Android Logcat for Node.js logs
3. **Memory**: Built-in memory monitoring logs

### Performance Optimization

- **Throttled UI updates**: 10fps max for progress bars
- **RequestAnimationFrame**: GPU-friendly DOM updates
- **Subarray usage**: Zero-copy buffer operations
- **Lazy module loading**: Heavy modules loaded on demand
- **Streaming processing**: No full-file loading

## 📝 Notes

### File Paths

- Videos are read from `/sdcard/Movies` by default
- SRT files are saved alongside original videos
- Models must be in `/sdcard/models/senseVoice/`

### Memory Considerations

- Optimized for mobile devices with limited RAM
- Automatic garbage collection under pressure
- External memory released explicitly
- Resource cleanup on file completion

### Supported Formats

The app uses FFmpeg for audio extraction, supporting:
- **Video**: MP4, MKV, WebM, TS, MTS, M2TS, AVI, MOV, FLV
- **Audio**: M4A, WAV, MP3 (any FFmpeg-supported format)

## 🐛 Troubleshooting

### Common Issues

**"EROFS: read-only file system"**
- Ensure video files are on writable storage
- Check file paths are absolute

**"Transcription timeout"**
- Large files may exceed 10-minute default
- Check memory pressure in logs
- Reduce thread count if device overheats

**"No speech detected"**
- Lower VAD threshold in settings
- Check audio quality of source file
- Verify model files are present

**High memory usage**
- Check V8 memory logs
- Reduce buffer size if needed
- Close other background apps

## 📄 License

ISC License

## 🙏 Acknowledgments

- [SenseVoice](https://github.com/FunAudioLLM/SenseVoice) - ASR model
- [sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx) - ONNX runtime
- [Capacitor](https://capacitorjs.com/) - Cross-platform framework
- [Capacitor-NodeJS](https://github.com/hampoelz/Capacitor-NodeJS) - Embedded Node.js Server
- [Silero VAD](https://github.com/snakers4/silero-vad) - Voice activity detection

---

**Built with ❤️ for offline speech-to-text transcription**
