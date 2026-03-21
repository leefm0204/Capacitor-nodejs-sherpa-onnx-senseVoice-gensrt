# SenseVoice SRT Generator

A mobile-first Android app that generates **SRT subtitles** for video files using the **SenseVoice** speech-to-text model by Alibaba Group. Works completely offline.

![Platform](https://img.shields.io/badge/platform-Android-green)
![License](https://img.shields.io/badge/license-ISC-gray)

## 🌟 Features

- **Offline Processing**: On-device transcription, no internet required
- **Multi-Format**: MP4, MKV, WebM, TS, AVI, MOV, FLV, M4A
- **Real-Time Progress**: Live speed and ETA tracking
- **Smart VAD**: Silero voice activity detection
- **Memory Optimized**: Built for mobile devices
- **Modern UI**: Glassmorphism design with dark theme
- **Quick Presets**: 8 optimized settings for different content types

## 📥 Installation

### Prerequisites
- Node.js 18+
- Android Studio with SDK
- Android device (API 24+, ARM64)

### Steps

1. **Clone & Install**
   ```bash
   git clone <repository-url>
   cd nodejs-sherpa-onnx-senseVoice-gensrt
   npm install
   ```

2. **Download Model**
   
   Download from: [sherpa-onnx-sense-voice-funasr-nano-2025-12-17](https://github.com/k2-fsa/sherpa-onnx/releases/download/asr-models/sherpa-onnx-sense-voice-funasr-nano-2025-12-17.tar.bz2)
   
   Extract to `/sdcard/models/senseVoice/`:
   - `model.onnx`
   - `tokens.txt`
   - `silero_vad.onnx`

3. **Build & Run**
   ```bash
   npm run build
   npx cap sync android
   npx cap open android
   ```
   Then build and run in Android Studio.

## 🚀 Usage

1. Open the app on your Android device
2. Tap **"Pick Videos"** to select files
3. Tap **"Process Files"** to start transcription
4. SRT files are saved alongside your videos

## ⚙️ Quick Settings

### Presets (Settings Tab)
| Preset | Best For |
|--------|----------|
| 🎬 Movies & TV Shows | Dialogue with background music |
| 🎤 Lectures | Clear speech with pauses |
| 🎵 Music Videos | Noisy content, filters music |
| 🗣️ Rapid Dialogue | Quick conversations |
| 📺 News | Professional delivery |
| 🎙️ Podcasts | Conversational speech |
| 📚 Audiobooks | Continuous narration |
| 💼 Meetings | Multi-speaker discussions |

### Manual Tuning
- **Lower VAD Threshold** (0.3-0.4): Catch quiet speech
- **Higher VAD Threshold** (0.6-0.7): Filter background noise
- **More Threads** (4-6): Faster processing, more battery
- **Manual Language**: Set zh/en/ja/ko/yue for known languages

## 📁 Project Structure

```
nodejs-sherpa-onnx-senseVoice-gensrt/
├── src/                    # Frontend (HTML/JS/CSS)
├── static/nodejs/          # Backend server
├── node-addon-api/         # Native build
├── android/                # Android project
└── README.md               # Full documentation
```

See [README.md](./README.md) for complete documentation.

## 🔧 Tech Stack

- **Frontend**: Vanilla JavaScript, CSS3
- **Backend**: Embedded Node.js (Capacitor-NodeJS)
- **STT Engine**: SenseVoice by Alibaba Group (FunASR)
- **Audio**: FFmpeg (statically linked)
- **Platform**: Android (Capacitor)

## 📜 License

### Application Code
**ISC License** - See LICENSE file for details.

### SenseVoice Model
Licensed under **FunASR Model Open Source License 1.1** by Alibaba Group.

**✅ Allowed:**
- Personal use
- Commercial use (with attribution)
- Open source distribution (with attribution)
- Modification

**📋 Requirements:**
1. Credit **FunASR / Alibaba Group**
2. Retain **"SenseVoice"** naming
3. Link to [FunASR project](https://github.com/FunAudioLLM/SenseVoice)

**⚠️ Disclaimer:** Model provided "as is" without warranty.

See [MODEL_LICENSE](./MODEL_LICENSE) for full terms.

## 🙏 Credits

- **[FunASR / SenseVoice](https://github.com/FunAudioLLM/SenseVoice)** by **Alibaba Group** - ASR model
- **[sherpa-onnx](https://github.com/k2-fsa/sherpa-onnx)** - ONNX runtime
- **[Capacitor](https://capacitorjs.com/)** - Cross-platform framework
- **[Capacitor-NodeJS](https://github.com/hampoelz/Capacitor-NodeJS)** - Embedded Node.js

## 🐛 Troubleshooting

| Issue | Solution |
|-------|----------|
| No speech detected | Lower VAD threshold to 0.3-0.4 |
| Too many segments | Increase Min Silence to 0.7-1.0s |
| Slow processing | Increase threads to 4-6 |
| Missing quiet dialogue | Lower VAD threshold, decrease Min Speech |

For detailed help, see [README.md](./README.md).

---

**Built with ❤️ for offline transcription**
