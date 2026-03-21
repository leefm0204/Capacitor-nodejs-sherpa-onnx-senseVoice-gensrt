/**
 * Capacitor Node.js Transcription App
 * Frontend for speech-to-text transcription using SenseVoice
 */

// ─── Imports ─────────────────────────────────────────────────────────────────────
import { FilePicker } from "@capawesome/capacitor-file-picker";
import { NodeJS } from "capacitor-nodejs";

// ─── Configuration ─────────────────────────────────────────────────────────────

// File system paths (default; user-overridable via Settings)
const DEFAULT_VIDEO_FOLDER_PATH = "/sdcard/Movies";

// Processing settings
const TRANSCRIPTION_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

// Status constants
const FILE_STATUS = {
  PENDING: "pending",
  PROCESSING: "processing",
  COMPLETED: "completed",
  ERROR: "error",
  CANCELLED: "cancelled",
};

// ─── State ─────────────────────────────────────────────────────────────────────
let stagedFiles = [];
let pendingDataPathResolve = null;
const pendingFileProcesses = new Map();
const processedFiles = new Set(); // Track files that have been successfully processed
let currentProcessingFile = null;
let stopRequested = false;

// DOM Reference Cache - Map<filename, { root, fill, elapsed, remaining, speed, badge, message }>
const domCache = new Map();

// UI-side progress tracking (for robust speed/ETA when backend values are missing)
// Map<fileName, { lastTs: number, lastProcessedSec: number, emaSpeed: number }>
const progressTrackers = new Map();

// Zoom settings
const ZOOM_STORAGE_KEY = "app_zoom_v1";
const DEFAULT_ZOOM = 100;
const MIN_ZOOM = 40;  // 50% of original 80% = 40%
const MAX_ZOOM = 120; // 150% of original 80% = 120%

// ─── DOM Elements ─────────────────────────────────────────────────────────────
//** @type {Object} */
const elements = {
  toastContainer: document.getElementById("toastContainer"),
  fileList: document.getElementById("fileList"),
  emptyState: document.getElementById("emptyState"),
  pickFilesArea: document.getElementById("pick-files"),
  processFilesBtn: document.getElementById("processFilesBtn"),
  stopProcessBtn: document.getElementById("stopProcessBtn"),
  clearListBtn: document.getElementById("clearListBtn"),

  // Tabs
  tabTranscribeBtn: document.getElementById("tabTranscribeBtn"),
  tabSettingsBtn: document.getElementById("tabSettingsBtn"),
  transcribeTab: document.getElementById("transcribeTab"),
  settingsTab: document.getElementById("settingsTab"),

  // Settings form
  videoFolderPath: document.getElementById("videoFolderPath"),
  vadThreshold: document.getElementById("vadThreshold"),
  vadMinSpeech: document.getElementById("vadMinSpeech"),
  vadMinSilence: document.getElementById("vadMinSilence"),
  vadMaxSpeech: document.getElementById("vadMaxSpeech"),
  vadWindowSize: document.getElementById("vadWindowSize"),
  vadNumThreads: document.getElementById("vadNumThreads"),
  recNumThreads: document.getElementById("recNumThreads"),
  recLanguage: document.getElementById("recLanguage"),
  chunkSizeSeconds: document.getElementById("chunkSizeSeconds"),
  saveSettingsBtn: document.getElementById("saveSettingsBtn"),
  resetSettingsBtn: document.getElementById("resetSettingsBtn"),
  settingsStatus: document.getElementById("settingsStatus"),

  // Zoom controls
  zoomSlider: document.getElementById("zoomSlider"),
  zoomValue: document.getElementById("zoomValue"),

  // Help box
  configHelpBtn: document.getElementById("configHelpBtn"),
  configHelpBox: document.getElementById("configHelpBox"),
  configHelpClose: document.getElementById("configHelpClose"),

  // Preset select
  presetSelect: document.getElementById("presetSelect"),
};

// ─── Logging ──────────────────────────────────────────────────────────────────
/**
 * Log with timestamp
 * @param {'info'|'warn'|'error'} level - Log level
 * @param {string} message - Log message
 * @param {any} [data] - Optional data
 */
function log(level, message, data = null) {
  const timestamp = new Date().toISOString();
  const prefix = `[${timestamp}] [${level.toUpperCase()}]`;

  if (data) {
    console.log(`${prefix} ${message}`, data);
  } else {
    console.log(`${prefix} ${message}`);
  }
}

// ─── UI Helpers ─────────────────────────────────────────────────────────────

/**
 * Show toast notification
 * @param {string} message - Message to display
 * @param {'success'|'error'} type - Toast type
 */
function showToast(message, type) {
  const toast = document.createElement("div");
  toast.className = `toast toast-${type}`;

  const icon = type === "success" ? "fa-check-circle" : "fa-exclamation-circle";
  toast.innerHTML = `<i class="fas ${icon}"></i><span>${message}</span>`;

  elements.toastContainer.appendChild(toast);

  const duration = type === "error" ? 5000 : 3500;
  setTimeout(() => {
    toast.classList.add("toast-hiding");
    toast.addEventListener("animationend", () => toast.remove(), {
      once: true,
    });
  }, duration);
}

/**
 * Show error toast message
 * @param {string} message - Error message to display
 */
function showError(message) {
  showToast(message, "error");
}

/**
 * Show success toast message
 * @param {string} message - Success message to display
 */
function showSuccess(message) {
  showToast(message, "success");
}

// ─── Settings / Tabs ─────────────────────────────────────────────────────────

const SETTINGS_STORAGE_KEY = "sherpa_settings_v1";

const DEFAULT_SETTINGS = {
  videoFolderPath: DEFAULT_VIDEO_FOLDER_PATH,
  vad: {
    sileroVad: {
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.5,
      maxSpeechDuration: 60,
      windowSize: 512,
    },
    numThreads: 1,
  },
  recognizer: {
    modelConfig: {
      senseVoice: {
        language: "",
      },
      numThreads: 2,
    },
  },
  // Audio processing chunk size (seconds of audio per chunk)

  // Smaller chunks = more frequent VAD processing, potentially better segment detection
  chunkSizeSeconds: 2.0, // Default: 2 seconds (32000 samples at 16kHz)
};

// Quick Presets Definitions
const PRESETS = {
  movies: {
    name: "Movies & TV Shows",
    vad: {
      threshold: 0.45,
      minSpeechDuration: 0.2,
      minSilenceDuration: 0.45,
      maxSpeechDuration: 60,
    },
  },
  lectures: {
    name: "Lectures & Presentations",
    vad: {
      threshold: 0.55,
      minSpeechDuration: 0.35,
      minSilenceDuration: 0.7,
      maxSpeechDuration: 90,
    },
  },
  music: {
    name: "Music Videos / Noisy Content",
    vad: {
      threshold: 0.65,
      minSpeechDuration: 0.4,
      minSilenceDuration: 0.6,
      maxSpeechDuration: 45,
    },
  },
  rapid: {
    name: "Rapid Dialogue / Comedy",
    vad: {
      threshold: 0.35,
      minSpeechDuration: 0.15,
      minSilenceDuration: 0.35,
      maxSpeechDuration: 30,
    },
  },
  news: {
    name: "News Broadcasts",
    vad: {
      threshold: 0.5,
      minSpeechDuration: 0.25,
      minSilenceDuration: 0.55,
      maxSpeechDuration: 60,
    },
  },
  podcast: {
    name: "Podcasts & Interviews",
    vad: {
      threshold: 0.45,
      minSpeechDuration: 0.3,
      minSilenceDuration: 0.5,
      maxSpeechDuration: 90,
    },
  },
  audiobook: {
    name: "Audiobooks & Narration",
    vad: {
      threshold: 0.5,
      minSpeechDuration: 0.4,
      minSilenceDuration: 0.6,
      maxSpeechDuration: 120,
    },
  },
  meeting: {
    name: "Business Meetings",
    vad: {
      threshold: 0.5,
      minSpeechDuration: 0.35,
      minSilenceDuration: 0.65,
      maxSpeechDuration: 120,
    },
  },
};

function setSettingsStatus(text) {
  if (elements.settingsStatus) {
    elements.settingsStatus.textContent = text || "";
  }
}

function safeParseFloat(v, fallback) {
  const n = Number.parseFloat(String(v));
  return Number.isFinite(n) ? n : fallback;
}

function safeParseInt(v, fallback) {
  const n = Number.parseInt(String(v), 10);
  return Number.isFinite(n) ? n : fallback;
}

function getSavedSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveSettingsLocal(settings) {
  localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
}

function applySettingsToForm(settings) {
  if (!settings) {
    return;
  }
  if (elements.videoFolderPath) {
    elements.videoFolderPath.value = String(
      settings.videoFolderPath || DEFAULT_VIDEO_FOLDER_PATH,
    );
  }
  if (elements.vadThreshold) {
    elements.vadThreshold.value = String(settings.vad.sileroVad.threshold);
  }
  if (elements.vadMinSpeech) {
    elements.vadMinSpeech.value = String(
      settings.vad.sileroVad.minSpeechDuration,
    );
  }
  if (elements.vadMinSilence) {
    elements.vadMinSilence.value = String(
      settings.vad.sileroVad.minSilenceDuration,
    );
  }
  if (elements.vadMaxSpeech) {
    elements.vadMaxSpeech.value = String(
      settings.vad.sileroVad.maxSpeechDuration,
    );
  }
  if (elements.vadWindowSize) {
    elements.vadWindowSize.value = String(settings.vad.sileroVad.windowSize);
  }
  if (elements.vadNumThreads) {
    elements.vadNumThreads.value = String(settings.vad.numThreads ?? 1);
  }

  if (elements.recNumThreads) {
    elements.recNumThreads.value = String(
      settings.recognizer.modelConfig.numThreads,
    );
  }
  if (elements.recLanguage) {
    elements.recLanguage.value = String(
      settings.recognizer.modelConfig.senseVoice.language ?? "",
    );
  }
  if (elements.chunkSizeSeconds) {
    elements.chunkSizeSeconds.value = String(settings.chunkSizeSeconds ?? 2.0);
  }
}

function readSettingsFromForm() {
  const settings = structuredClone(DEFAULT_SETTINGS);

  settings.videoFolderPath =
    String(
      elements.videoFolderPath?.value ?? DEFAULT_VIDEO_FOLDER_PATH,
    ).trim() || DEFAULT_VIDEO_FOLDER_PATH;

  settings.vad.sileroVad.threshold = Math.min(
    1,
    Math.max(0, safeParseFloat(elements.vadThreshold?.value, 0.5)),
  );
  settings.vad.sileroVad.minSpeechDuration = Math.max(
    0,
    safeParseFloat(elements.vadMinSpeech?.value, 0.25),
  );
  settings.vad.sileroVad.minSilenceDuration = Math.max(
    0,
    safeParseFloat(elements.vadMinSilence?.value, 0.5),
  );
  settings.vad.sileroVad.maxSpeechDuration = Math.max(
    1,
    safeParseFloat(elements.vadMaxSpeech?.value, 60),
  );
  settings.vad.sileroVad.windowSize = Math.max(
    64,
    safeParseInt(elements.vadWindowSize?.value, 512),
  );
  settings.vad.numThreads = Math.max(
    1,
    safeParseInt(elements.vadNumThreads?.value, 1),
  );

  settings.recognizer.modelConfig.numThreads = Math.max(
    1,
    safeParseInt(elements.recNumThreads?.value, 2),
  );
  settings.recognizer.modelConfig.senseVoice.language = String(
    elements.recLanguage?.value ?? "",
  ).trim();

  return settings;
}

function mergeSettings(base, override) {
  // minimal deep merge for our known shape
  const out = structuredClone(base);
  if (typeof override?.videoFolderPath === "string") {
    out.videoFolderPath = override.videoFolderPath;
  }
  if (override?.vad?.sileroVad) {
    out.vad.sileroVad = { ...out.vad.sileroVad, ...override.vad.sileroVad };
  }
  if (override?.recognizer?.modelConfig) {
    out.recognizer.modelConfig = {
      ...out.recognizer.modelConfig,
      ...override.recognizer.modelConfig,
    };
  }
  if (override?.recognizer?.modelConfig?.senseVoice) {
    out.recognizer.modelConfig.senseVoice = {
      ...out.recognizer.modelConfig.senseVoice,
      ...override.recognizer.modelConfig.senseVoice,
    };
  }
  return out;
}

async function pushSettingsToBackend(settings) {
  await NodeJS.whenReady();
  NodeJS.send({ eventName: "update-config", args: [settings] });
}

function setActiveTab(tabName) {
  const isSettings = tabName === "settings";

  // Toggle tab content visibility
  if (elements.transcribeTab) {
    elements.transcribeTab.classList.toggle("active", !isSettings);
  }
  if (elements.settingsTab) {
    elements.settingsTab.classList.toggle("active", isSettings);
  }

  // Update tab button styles
  if (elements.tabTranscribeBtn) {
    elements.tabTranscribeBtn.classList.toggle("active", !isSettings);
  }
  if (elements.tabSettingsBtn) {
    elements.tabSettingsBtn.classList.toggle("active", isSettings);
  }
}

// ─── Zoom Control ─────────────────────────────────────────────────────────────

/**
 * Get saved zoom level
 * @returns {number}
 */
function getSavedZoom() {
  try {
    const raw = localStorage.getItem(ZOOM_STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const zoom = Number.parseInt(raw, 10);
    return Number.isFinite(zoom) ? zoom : null;
  } catch {
    return null;
  }
}

/**
 * Save zoom level to storage
 * @param {number} zoom - Zoom percentage
 */
function saveZoom(zoom) {
  localStorage.setItem(ZOOM_STORAGE_KEY, String(zoom));
}

/**
 * Apply zoom level to the app
 * @param {number} zoom - Zoom percentage
 */
function applyZoom(zoom) {
  const clampedZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
  
  // Apply zoom to the document body - this scales everything like browser zoom
  document.body.style.zoom = `${clampedZoom / 100}`;
  
  // Update zoom value display
  if (elements.zoomValue) {
    elements.zoomValue.textContent = `${clampedZoom}%`;
  }

  // Update slider position
  if (elements.zoomSlider) {
    elements.zoomSlider.value = String(clampedZoom);
  }
}

/**
 * Initialize zoom control
 */
function initZoom() {
  const savedZoom = getSavedZoom() ?? DEFAULT_ZOOM;
  applyZoom(savedZoom);

  // Add slider event listener
  if (elements.zoomSlider) {
    elements.zoomSlider.addEventListener("input", (e) => {
      const zoom = Number.parseInt(e.target.value, 10);
      applyZoom(zoom);
    });

    elements.zoomSlider.addEventListener("change", (e) => {
      const zoom = Number.parseInt(e.target.value, 10);
      saveZoom(zoom);
      showSuccess(`Zoom set to ${zoom}%`);
    });
  }

  // Add keyboard shortcuts (Ctrl/Cmd + / - / 0)
  document.addEventListener("keydown", (e) => {
    // Ignore if typing in an input field
    if (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA") {
      return;
    }

    const isMac = navigator.platform.toUpperCase().indexOf("MAC") >= 0;
    const modifierKey = isMac ? e.metaKey : e.ctrlKey;

    if (modifierKey) {
      let newZoom = null;

      if (e.key === "+" || e.key === "=") {
        // Zoom in (Ctrl/Cmd + + or =)
        e.preventDefault();
        const currentZoom = getSavedZoom() ?? DEFAULT_ZOOM;
        newZoom = Math.min(MAX_ZOOM, currentZoom + 10);
      } else if (e.key === "-" || e.key === "_") {
        // Zoom out (Ctrl/Cmd + -)
        e.preventDefault();
        const currentZoom = getSavedZoom() ?? DEFAULT_ZOOM;
        newZoom = Math.max(MIN_ZOOM, currentZoom - 10);
      } else if (e.key === "0") {
        // Reset zoom (Ctrl/Cmd + 0)
        e.preventDefault();
        newZoom = DEFAULT_ZOOM;
      }

      if (newZoom !== null) {
        applyZoom(newZoom);
        saveZoom(newZoom);
        showSuccess(`Zoom: ${newZoom}%`);
      }
    }
  });
}

// ─── File List & Progress UI ─────────────────────────────────────────────────

/**
 * Create a new file item element
 * @param {string} filename - Name of file
 * @param {string} [status='pending'] - Initial status
 * @returns {HTMLElement}
 */
function createFileItem(filename, status = FILE_STATUS.PENDING) {
  const fileItem = document.createElement("div");
  fileItem.className = "file-item";
  fileItem.dataset.filename = filename;
  fileItem.innerHTML = `
    <div class="file-header">
      <span class="file-name">${filename}</span>
      <span class="file-badge badge-${status}">${status.charAt(0).toUpperCase() + status.slice(1)}</span>
    </div>
    <div class="file-progress">
      <div class="progress-bar"><div class="progress-fill"></div></div>
      <div class="progress-info">
        <span>Elapsed: <span class="elapsed">0.0</span>s</span>
        <span>Remaining: <span class="remaining">0.0</span>s</span>
        <span>Speed: <span class="speed-value">--</span>x</span>
      </div>
    </div>
    <div class="file-message message-secondary">
      <i class="fas fa-clock"></i>
      <span class="message-text">Staged for processing</span>
    </div>
  `;

  // Cache elements for future updates
  domCache.set(filename, {
    root: fileItem,
    badge: fileItem.querySelector(".file-badge"),
    fill: fileItem.querySelector(".progress-fill"),
    elapsed: fileItem.querySelector(".elapsed"),
    remaining: fileItem.querySelector(".remaining"),
    speed: fileItem.querySelector(".speed-value"),
    message: fileItem.querySelector(".file-message"),
    status: status,
  });

  return fileItem;
}

/**
 * Create status message element
 * @param {string} text - Message text
 * @param {string} type - Message type (secondary/success/danger)
 * @returns {string} HTML string
 */
function createStatusMessage(text, type = "secondary") {
  const iconMap = {
    secondary: "fa-clock",
    success: "fa-check-circle",
    danger: "fa-exclamation-circle",
    warning: "fa-exclamation-triangle",
  };
  return `<i class="fas ${iconMap[type] || iconMap.secondary}"></i><span class="message-text">${text}</span>`;
}

/**
 * Update file status in UI
 * @param {string} filename - Name of file
 * @param {string} status - Status (pending/processing/completed/error/cancelled)
 * @param {object} [details={}] - Additional details
 */
function updateFileStatus(filename, status, details = {}) {
  // Reset UI-side tracker when a new processing starts
  if (status === FILE_STATUS.PROCESSING || status === "processing") {
    progressTrackers.set(filename, {
      lastTs: Date.now(),
      lastProcessedSec: 0,
      emaSpeed: 0,
    });
  }
  
  let cached = domCache.get(filename);
  
  if (!cached) {
    const fileItem = createFileItem(filename, status);
    elements.fileList.appendChild(fileItem);
    elements.emptyState.style.display = "none";
    cached = domCache.get(filename);
  }

  const { badge, fill: progressFill, message: messageEl } = cached;

  // Update cached status
  cached.status = status;

  if (badge) {
    badge.className = `file-badge badge-${status}`;
    badge.textContent = status.charAt(0).toUpperCase() + status.slice(1);
  }

  if (status === FILE_STATUS.PROCESSING) {
    if (progressFill) {
      progressFill.style.width = "0%";
      progressFill.style.background = "";
    }
    if (messageEl) {
      messageEl.className = "file-message message-secondary";
      messageEl.innerHTML = createStatusMessage(
        "0 segments transcribed...",
        "secondary",
      );
    }
  } else if (status === FILE_STATUS.COMPLETED) {
    if (progressFill) {
      progressFill.style.width = "100%";
    }
    const srtPathDisplay = details.srtPath || "SRT file generated";
    const totalSegments = details.totalSegments || 0;
    if (messageEl) {
      messageEl.className = "file-message message-success";
      messageEl.innerHTML = createStatusMessage(
        `${totalSegments} segment${totalSegments !== 1 ? 's' : ''} | SRT saved: ${srtPathDisplay}`,
        "success",
      );
    }
  } else if (status === FILE_STATUS.ERROR) {
    if (progressFill) {
      progressFill.style.width = "100%";
      progressFill.style.background = "var(--danger)";
    }
    const errorMsg = details?.error || "Unknown error";
    if (messageEl) {
      messageEl.className = "file-message message-danger";
      messageEl.innerHTML = createStatusMessage(`Error: ${errorMsg}`, "danger");
    }
  } else if (status === FILE_STATUS.CANCELLED) {
    if (progressFill) {
      progressFill.style.width = "100%";
    }
    if (messageEl) {
      messageEl.className = "file-message message-warning";
      messageEl.innerHTML = createStatusMessage("Stopped by user", "warning");
    }
  }
}

/**
 * Update file progress in UI
 * @param {string} filename - Name of file
 * @param {object} progressData - Progress data
 */
const progressUpdateTimers = new Map(); // Throttle timers per file

function updateFileProgress(filename, progressData) {
  const cached = domCache.get(filename);
  if (!cached) {
    return;
  }

  // Throttle updates to max 10fps (100ms) to prevent UI flooding
  if (progressUpdateTimers.has(filename)) {
    return;
  }

  progressUpdateTimers.set(
    filename,
    setTimeout(() => {
      progressUpdateTimers.delete(filename);

      const { fill: progressFill, elapsed: elapsedElem, remaining: remainingElem, speed: speedElem, message: messageEl } = cached;
      const segmentsCount = progressData.segmentsCount || 0;

      // Update progress bar based on segments (use percentage for visual bar)
      const percentage = Math.min(100, Math.max(0, progressData.progress || 0));
      if (progressFill) {
        requestAnimationFrame(() => {
          progressFill.style.width = `${percentage}%`;
        });
      }

      if (elapsedElem) {
        const e = progressData.elapsed || 0;
        elapsedElem.textContent = typeof e === "number" ? e.toFixed(1) : "0.0";
      }

      if (remainingElem) {
        const r = progressData.remaining || 0;
        remainingElem.textContent =
          typeof r === "number" ? Math.max(0, r).toFixed(1) : "0.0";
      }

      if (speedElem) {
        const s = progressData.speed;
        speedElem.textContent =
          !s || s === "N/A" || s === "--"
            ? "--"
            : typeof s === "number"
              ? s.toFixed(2)
              : "--";
      }

      // Update message to show segments count (only during processing)
      if (messageEl && cached.status === FILE_STATUS.PROCESSING) {
        messageEl.className = "file-message message-secondary";
        messageEl.innerHTML = createStatusMessage(
          `${segmentsCount} segment${segmentsCount !== 1 ? 's' : ''} transcribed...`,
          "secondary",
        );
      }
    }, 100),
  );
}

/**
 * Render staged files in the file list
 */
function renderStagedFiles() {
  if (stagedFiles.length === 0) {
    const stagedItems = elements.fileList.querySelectorAll(".file-item");
    stagedItems.forEach((item) => {
      const messageText =
        item.querySelector(".message-text")?.textContent || "";
      if (
        messageText.includes("Staged for upload") ||
        messageText.includes("Staged for processing")
      ) {
        const filename = item.dataset.filename;
        domCache.delete(filename);
        item.remove();
      }
    });

    if (elements.fileList.querySelectorAll(".file-item").length === 0) {
      elements.emptyState.style.display = "flex";
    }
    return;
  }

  elements.emptyState.style.display = "none";
  const fragment = document.createDocumentFragment();
  let addedAny = false;

  for (const f of stagedFiles) {
    if (!domCache.has(f.name)) {
      const el = createFileItem(f.name, "pending");
      fragment.appendChild(el);
      addedAny = true;
    }
  }

  if (addedAny) {
    elements.fileList.appendChild(fragment);
  }
}

// ─── File Processing Logic ───────────────────────────────────────────────────

/**
 * Process a single file (send to Node.js for transcription)
 * @param {Object} file - File object with name, path, duration
 * @returns {Promise<void>}
 */
async function processSingleFile(file) {
  currentProcessingFile = file.name;
  let cleanupDone = false;
  let cleanupFn = null;

  try {
    await NodeJS.whenReady();

    // Use file.path if it looks like an absolute path, otherwise fallback to Settings.videoFolderPath
    const fileName = file.name || file.fileName;
    let realPath = file.path;

    const saved = getSavedSettings();
    const effectiveSettings = mergeSettings(DEFAULT_SETTINGS, saved);

    let baseFolder =
      effectiveSettings.videoFolderPath || DEFAULT_VIDEO_FOLDER_PATH;
    baseFolder = String(baseFolder).trim();
    // Remove trailing slashes to avoid accidental double-slash paths
    baseFolder = baseFolder.replace(/\/+$/, "");
    if (!baseFolder.startsWith("/")) {
      baseFolder = `/${baseFolder}`;
    }

    // FIX-APP-3: Strip file:// prefix and handle content:// URIs
    if (realPath?.startsWith("file://")) {
      realPath = realPath.slice("file://".length);
    }

    // content:// URIs cannot be opened by the native addon directly.
    // Fall back to the folder+filename path which the native layer can open.
    if (
      !realPath ||
      !realPath.startsWith("/") ||
      realPath.startsWith("content://")
    ) {
      realPath = `${baseFolder}/${fileName}`;
    }

    // Diagnostic: always log the final resolved path so we can verify it
    log("info", "Resolved file path", { fileName, realPath });

    updateFileStatus(file.name, FILE_STATUS.PROCESSING);

    // Send to Node.js backend for processing
    NodeJS.send({
      eventName: "transcribe-file",
      args: [
        {
          fileName: file.name,
          filePath: realPath,
          duration: file.duration,
        },
      ],
    });

    // Wait for Node.js transcription to complete
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        if (!cleanupDone && pendingFileProcesses.has(file.name)) {
          const proc = pendingFileProcesses.get(file.name);
          if (proc?.cleanup) {
            proc.cleanup();
          }
          pendingFileProcesses.delete(file.name);
          reject(new Error("Transcription timeout (10m)"));
        }
      }, TRANSCRIPTION_TIMEOUT_MS);

      cleanupFn = () => {
        cleanupDone = true;
        clearTimeout(timeout);
        pendingFileProcesses.delete(file.name);
      };

      pendingFileProcesses.set(file.name, {
        resolve: () => {
          cleanupFn();
          resolve();
        },
        reject: (err) => {
          cleanupFn();
          reject(err);
        },
        cleanup: cleanupFn,
      });
    });
  } catch (error) {
    if (pendingFileProcesses.has(file.name)) {
      pendingFileProcesses.delete(file.name);
    }
    // Don't update status if cancelled (already updated by stop handler)
    if (error.message !== "Stopped by user") {
      updateFileStatus(file.name, FILE_STATUS.ERROR, { error: error.message });
    }
    throw error;
  } finally {
    currentProcessingFile = null;
  }
}

// ─── Node.js Event Handlers ───────────────────────────────────────────────────

/**
 * Handle messages from Node.js backend
 */
NodeJS.addListener("msg-from-nodejs", (event) => {
  const data = event.args?.[0];
  if (!data) {
    return;
  }

  log("info", "NodeJS event", data.type);

  // Handle data path response
  if (data.type === "data_path_response" && pendingDataPathResolve) {
    const p = data.dataPath;
    if (typeof p === "string" && p.length > 0) {
      pendingDataPathResolve(p);
    } else {
      pendingDataPathResolve(null);
    }
    pendingDataPathResolve = null;
    return;
  }

  // Handle progress updates
  if (data.type === "transcription_progress" && data.fileName) {
    const progressRaw = typeof data.progress === "number" ? data.progress : 0;
    const progress = Math.min(100, Math.max(0, progressRaw));
    const elapsed = typeof data.elapsed === "number" ? data.elapsed : 0;
    const speed = typeof data.speed === "number" ? data.speed : 0;
    const remaining = typeof data.remaining === "number" ? data.remaining : 0;
    const segmentsCount = typeof data.segmentsCount === "number" ? data.segmentsCount : 0;

    updateFileProgress(data.fileName, {
      progress,
      elapsed,
      remaining,
      speed: speed > 0 ? speed : "--",
      segmentsCount,
    });
    return;
  }

  // Handle file completion or error
  if (data.fileName && pendingFileProcesses.has(data.fileName)) {
    const proc = pendingFileProcesses.get(data.fileName);

    switch (data.type) {
      case "file_complete":
        processedFiles.add(data.fileName); // Mark as processed
        showSuccess(`Saved SRT: ${data.srtPath || data.fileName}`);
        updateFileStatus(data.fileName, FILE_STATUS.COMPLETED, {
          srtPath: data.srtPath,
          totalSegments: data.totalSegments || 0,
        });
        proc?.resolve();
        break;
      case "file_error":
        log("error", "File processing failed", {
          fileName: data.fileName,
          error: data.error,
        });
        // Don't update status if already cancelled
        if (data.error !== "Stopped by user") {
          updateFileStatus(data.fileName, FILE_STATUS.ERROR, {
            error: data.error,
          });
        }
        proc?.reject(new Error(data.error || "Processing failed"));
        break;
    }
  }

  // Handle other event types
  switch (data.type) {
    case "config_updated":
      setSettingsStatus("Backend config updated.");
      break;
    case "config_update_error":
      setSettingsStatus(
        `Backend config update error: ${data.error || "Unknown"}`,
      );
      break;
    case "server_ready":
      log("info", "Node.js ready", { engine: data.engine });
      break;
    case "file_start":
      // Update file duration if server provides it (more accurate)
      if (data.duration && data.duration > 0) {
        const file = stagedFiles.find((f) => f.name === data.fileName);
        if (file) {
          file.duration = data.duration;
        }
      }
      updateFileStatus(data.fileName, "processing");
      break;
    case "cache_cleared":
      if (data.deleted && typeof data.deleted === "object") {
        const t = data.deleted.tempPcm ?? 0;
        showSuccess(`Cache cleared: ${t} files removed`);
      } else if (typeof data.count === "number") {
        showSuccess(`Cache cleared: ${data.count} files removed`);
      } else {
        showSuccess(`Cache cleared`);
      }
      break;
    case "cache_error":
      showError(`Cache clear error: ${data.error}`);
      break;
  }
});

// ─── Button Click Handlers ───────────────────────────────────────────────────

/**
 * Handle file picker click - select files for transcription
 */
elements.pickFilesArea.addEventListener("click", async () => {
  try {
    const result = await FilePicker.pickFiles({
      multiple: true,
      // File/container type determination is done by the Node backend using
      // magic bytes (see static/nodejs/sherpa-onnx-node/extract-mp4-to-pcm.js).
      // Some Android pickers rely on MIME filters; keep this broad to avoid
      // excluding valid inputs due to incorrect extensions/MIME types.
      types: ["videos"],
    });

    if (result.files && result.files.length > 0) {
      for (const file of result.files) {
        const fileObj = {
          name: file.name,
          // Keep the raw path for diagnostics; processSingleFile sanitises it.
          path: file.path,
          // FIX-APP-1: FilePicker.pickFiles returns duration in milliseconds.
          // Convert to seconds here so every downstream consumer agrees.
          duration: file.duration,
          types: file.types,
        };

        // FIX-APP-2: log what the picker actually gave us
        log("info", "FilePicker result", {
          name: file.name,
          path: file.path, // may be null, content://, or /storage/...
          type: file.type,
          duration_ms: file.duration,
        });

        const exists = stagedFiles.some((f) => f.name === fileObj.name);
        if (!exists) {
          stagedFiles.push(fileObj);
        }
      }

      renderStagedFiles();
    }
  } catch (error) {
    if (!error.message?.includes("cancelled")) {
      showError(`Picker error: ${error.message}`);
    }
  }
});

/**
 * Handle process files click - start batch transcription
 */
elements.processFilesBtn.addEventListener("click", async () => {
  if (!stagedFiles.length) {
    showError("No files selected.");
    return;
  }

  // Filter to only process files that haven't been completed yet
  const filesToProcess = stagedFiles.filter((f) => !processedFiles.has(f.name));

  if (filesToProcess.length === 0) {
    showError("All files have already been processed.");
    return;
  }

  stopRequested = false;
  elements.processFilesBtn.disabled = true;
  elements.processFilesBtn.textContent = "Processing...";

  try {
    for (const file of filesToProcess) {
      if (stopRequested) {
        break;
      }
      try {
        await processSingleFile(file);
      } catch (e) {
        log("error", "File processing failed", {
          fileName: file.name,
          error: e.message,
        });
        // Continue to next file, show error status
      }
    }

    if (stopRequested) {
      showSuccess("Processing stopped.");
    } else {
      showSuccess("Processing sequence finished.");
    }
  } finally {
    elements.processFilesBtn.disabled = false;
    elements.processFilesBtn.textContent = "Process Files";
    currentProcessingFile = null;
  }
});

/**
 * Handle stop button click - stop current processing
 */
elements.stopProcessBtn.addEventListener("click", async () => {
  stopRequested = true;

  await NodeJS.whenReady();
  NodeJS.send({ eventName: "stop-process", args: [] });

  // Reject current pending file to unwind batch loop and mark as cancelled
  if (
    currentProcessingFile &&
    pendingFileProcesses.has(currentProcessingFile)
  ) {
    const proc = pendingFileProcesses.get(currentProcessingFile);
    pendingFileProcesses.delete(currentProcessingFile);

    // Mark file as cancelled in UI
    updateFileStatus(currentProcessingFile, FILE_STATUS.CANCELLED);

    // Reject the promise to unwind the batch loop
    proc?.reject(new Error("Stopped by user"));
  }

  // Release UI immediately
  elements.processFilesBtn.disabled = false;
  elements.processFilesBtn.textContent = "Process Files";

  showSuccess("Stop requested.");
});

/**
 * Handle clear list button click
 */
elements.clearListBtn.addEventListener("click", async () => {
  elements.fileList.innerHTML = "";
  elements.fileList.appendChild(elements.emptyState);
  elements.emptyState.style.display = "block";
  stagedFiles = [];
  processedFiles.clear(); // Clear processed files tracking
  showSuccess("List cleared.");
});

// ─── Settings UI Wiring ───────────────────────────────────────────────────────

if (elements.tabTranscribeBtn) {
  elements.tabTranscribeBtn.addEventListener("click", () =>
    setActiveTab("transcribe"),
  );
}
if (elements.tabSettingsBtn) {
  elements.tabSettingsBtn.addEventListener("click", () =>
    setActiveTab("settings"),
  );
}

if (elements.saveSettingsBtn) {
  elements.saveSettingsBtn.addEventListener("click", async () => {
    try {
      const settings = readSettingsFromForm();
      saveSettingsLocal(settings);
      await pushSettingsToBackend(settings);
      setSettingsStatus(
        "Saved. New settings will apply to new transcriptions.",
      );
      showSuccess("Settings saved");
    } catch (e) {
      setSettingsStatus(`Save failed: ${e?.message || e}`);
      showError(`Settings save failed: ${e?.message || e}`);
    }
  });
}

if (elements.resetSettingsBtn) {
  elements.resetSettingsBtn.addEventListener("click", async () => {
    const settings = structuredClone(DEFAULT_SETTINGS);
    applySettingsToForm(settings);
    saveSettingsLocal(settings);
    try {
      await pushSettingsToBackend(settings);
      setSettingsStatus("Reset to defaults.");
      showSuccess("Settings reset");
    } catch (e) {
      setSettingsStatus(`Reset failed: ${e?.message || e}`);
      showError(`Settings reset failed: ${e?.message || e}`);
    }
  });
}

// ─── Startup ───────────────────────────────────────────────────────────────────

// Initialize on load
NodeJS.whenReady().then(async () => {
  // Load settings from storage and push to backend so server matches UI
  const saved = getSavedSettings();
  const effectiveSettings = mergeSettings(DEFAULT_SETTINGS, saved);
  applySettingsToForm(effectiveSettings);
  try {
    await pushSettingsToBackend(effectiveSettings);
  } catch (e) {
    // Non-fatal: backend may not support update-config yet
    log("warn", "Failed to push settings to backend", e?.message || e);
  }

  NodeJS.send({ eventName: "request-state", args: [] });
  log("info", "App ready");
});

// Initialize zoom control (doesn't require NodeJS)
initZoom();

// ─── Help Box Toggle ───────────────────────────────────────────────────────────

/**
 * Toggle configuration help box
 */
function toggleHelpBox() {
  if (elements.configHelpBox) {
    const isActive = elements.configHelpBox.classList.contains("active");
    if (isActive) {
      elements.configHelpBox.classList.remove("active");
    } else {
      elements.configHelpBox.classList.add("active");
      // Scroll to help box if needed
      elements.configHelpBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
  }
}

/**
 * Close configuration help box
 */
function closeHelpBox() {
  if (elements.configHelpBox) {
    elements.configHelpBox.classList.remove("active");
  }
}

// Add help button click listener
if (elements.configHelpBtn) {
  elements.configHelpBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    toggleHelpBox();
  });
}

// Add close button click listener
if (elements.configHelpClose) {
  elements.configHelpClose.addEventListener("click", (e) => {
    e.stopPropagation();
    closeHelpBox();
  });
}

// Close help box when clicking outside
document.addEventListener("click", (e) => {
  if (elements.configHelpBox && elements.configHelpBox.classList.contains("active")) {
    const isClickInsideHelpBox = elements.configHelpBox.contains(e.target);
    const isClickOnHelpBtn = elements.configHelpBtn?.contains(e.target);

    if (!isClickInsideHelpBox && !isClickOnHelpBtn) {
      closeHelpBox();
    }
  }
});

// ─── Quick Presets Handler ───────────────────────────────────────────────────────

/**
 * Apply preset settings to the form
 * @param {string} presetKey - Preset key (movies, lectures, etc.)
 */
function applyPreset(presetKey) {
  const preset = PRESETS[presetKey];
  if (!preset) {
    return;
  }

  // Apply VAD settings
  if (elements.vadThreshold && preset.vad?.threshold !== undefined) {
    elements.vadThreshold.value = String(preset.vad.threshold);
  }
  if (elements.vadMinSpeech && preset.vad?.minSpeechDuration !== undefined) {
    elements.vadMinSpeech.value = String(preset.vad.minSpeechDuration);
  }
  if (elements.vadMinSilence && preset.vad?.minSilenceDuration !== undefined) {
    elements.vadMinSilence.value = String(preset.vad.minSilenceDuration);
  }
  if (elements.vadMaxSpeech && preset.vad?.maxSpeechDuration !== undefined) {
    elements.vadMaxSpeech.value = String(preset.vad.maxSpeechDuration);
  }

  // Show confirmation
  showSuccess(`Applied: ${preset.name}`);

  // Auto-save settings to backend
  const settings = readSettingsFromForm();
  saveSettingsLocal(settings);
  pushSettingsToBackend(settings).catch((e) => {
    log("warn", "Failed to auto-save preset settings", e?.message || e);
  });
}

// Add preset select change listener
if (elements.presetSelect) {
  elements.presetSelect.addEventListener("change", (e) => {
    const presetKey = e.target.value;
    if (presetKey && PRESETS[presetKey]) {
      applyPreset(presetKey);
      // Keep the selected value visible (don't reset)
      // User can select again if they want to change
    }
  });
}
