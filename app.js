import { FFmpeg } from "./vendor/ffmpeg/index.js";

const APP_VERSION = "v0.3.9";

const presets = {
  small: { resolution: "720", crf: 33 },
  balanced: { resolution: "1080", crf: 30 },
  clear: { resolution: "1080", crf: 26 },
};

const langMap = {
  en: "eng",
  zh: "chi_sim",
  ja: "jpn",
  ko: "kor",
  fr: "fra",
  de: "deu",
  ru: "rus",
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  fileSummary: document.querySelector("#fileSummary"),
  fileName: document.querySelector("#fileName"),
  fileMeta: document.querySelector("#fileMeta"),
  clearFile: document.querySelector("#clearFile"),
  preview: document.querySelector("#preview"),
  tabs: document.querySelectorAll(".tab"),
  compressPanel: document.querySelector("#compressPanel"),
  subtitlePanel: document.querySelector("#subtitlePanel"),
  resolution: document.querySelector("#resolution"),
  quality: document.querySelector("#quality"),
  qualityLabel: document.querySelector("#qualityLabel"),
  stripAudio: document.querySelector("#stripAudio"),
  compressMode: document.querySelector("#compressMode"),
  compressBtn: document.querySelector("#compressBtn"),
  subtitleBtn: document.querySelector("#subtitleBtn"),
  ocrOptions: document.querySelector("#ocrOptions"),
  sourceLang: document.querySelector("#sourceLang"),
  targetLang: document.querySelector("#targetLang"),
  ocrInterval: document.querySelector("#ocrInterval"),
  ocrCrop: document.querySelector("#ocrCrop"),
  subtitleFontSize: document.querySelector("#subtitleFontSize"),
  subtitleFontSizeLabel: document.querySelector("#subtitleFontSizeLabel"),
  subtitlePosition: document.querySelector("#subtitlePosition"),
  subtitleColor: document.querySelector("#subtitleColor"),
  subtitleBg: document.querySelector("#subtitleBg"),
  subtitleBgOpacity: document.querySelector("#subtitleBgOpacity"),
  subtitleBgOpacityLabel: document.querySelector("#subtitleBgOpacityLabel"),
  deepseekKey: document.querySelector("#deepseekKey"),
  saveApiSettings: document.querySelector("#saveApiSettings"),
  progressPanel: document.querySelector("#progressPanel"),
  statusText: document.querySelector("#statusText"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  taskSteps: document.querySelector("#taskSteps"),
  resultPanel: document.querySelector("#resultPanel"),
  beforeSize: document.querySelector("#beforeSize"),
  afterSize: document.querySelector("#afterSize"),
  savedSize: document.querySelector("#savedSize"),
  downloadLink: document.querySelector("#downloadLink"),
  subtitleResult: document.querySelector("#subtitleResult"),
  subtitlePreview: document.querySelector("#subtitlePreview"),
  downloadZhSrt: document.querySelector("#downloadZhSrt"),
  downloadBilingualSrt: document.querySelector("#downloadBilingualSrt"),
  audioResult: document.querySelector("#audioResult"),
  audioPreview: document.querySelector("#audioPreview"),
  downloadAudio: document.querySelector("#downloadAudio"),
  burnResult: document.querySelector("#burnResult"),
  burnedVideoPreview: document.querySelector("#burnedVideoPreview"),
  burnMeta: document.querySelector("#burnMeta"),
  downloadBurnedVideo: document.querySelector("#downloadBurnedVideo"),
  shareBurnedVideo: document.querySelector("#shareBurnedVideo"),
  errorBox: document.querySelector("#errorBox"),
  updateToast: document.querySelector("#updateToast"),
  updateText: document.querySelector("#updateText"),
  reloadUpdate: document.querySelector("#reloadUpdate"),
  clearCacheUpdate: document.querySelector("#clearCacheUpdate"),
};

let selectedFile = null;
let sourceUrl = null;
let outputUrl = null;
let zhSrtUrl = null;
let bilingualSrtUrl = null;
let audioUrl = null;
let burnedVideoUrl = null;
let ffmpeg = null;
let ffmpegReady = false;
let speechPipeline = null;
let speechModelLoading = null;
let screenWakeLock = null;
let shouldKeepScreenAwake = false;
let taskStepState = [];
let burnedVideoFile = null;

window.lucide?.createIcons();

loadApiSettings();
checkAppVersion();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("./service-worker.js")
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          if (!worker) return;
          worker.addEventListener("statechange", () => {});
        });
      })
      .catch((error) => {
        console.warn("Service worker registration failed", error);
      });
  });
}

els.reloadUpdate?.addEventListener("click", async () => {
  await clearAppCacheAndReload();
});

els.clearCacheUpdate?.addEventListener("click", async () => {
  await clearAppCacheAndReload();
});

function showUpdateToast(message) {
  if (els.updateText) els.updateText.textContent = message;
  els.updateToast?.classList.remove("is-hidden");
}

async function checkAppVersion() {
  try {
    const response = await fetch(`./version.json?t=${Date.now()}`, {
      cache: "no-store",
    });
    if (!response.ok) return;
    const data = await response.json();
    if (data.version && data.version !== APP_VERSION) {
      showUpdateToast(`发现新版本 ${data.version}`);
    }
  } catch (error) {
    console.warn("Version check failed", error);
  }
}

async function clearAppCacheAndReload() {
  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
    if ("caches" in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map((key) => caches.delete(key)));
    }
  } finally {
    window.location.href = `${window.location.pathname}?t=${Date.now()}`;
  }
}

function formatSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "-";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${size.toFixed(size >= 10 || unit === 0 ? 0 : 1)} ${units[unit]}`;
}

async function fetchFile(file) {
  return new Uint8Array(await file.arrayBuffer());
}

function cleanVideoName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-compressed.mp4`;
}

function cleanNativeVideoName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-compressed.webm`;
}

function cleanSubtitleName(name, suffix) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-${suffix}.srt`;
}

function cleanAudioName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-audio.webm`;
}

function cleanAacName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-audio.aac`;
}

function cleanBurnedVideoName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-zh-subtitles.webm`;
}

function burnedVideoFormatNote(hasAudio) {
  const audioText = hasAudio ? "已保留原视频声音" : "未能保留原视频声音";
  return `${audioText}。浏览器本机压制当前导出 WebM；如需 MP4，需要额外转码。`;
}

function isMp4LikeFile(file) {
  return /\.(mp4|m4v|mov)$/i.test(file.name) || /mp4|quicktime/i.test(file.type);
}

function loadClassicScript(src, globalName) {
  return new Promise((resolve, reject) => {
    if (globalName && window[globalName]) {
      resolve(window[globalName]);
      return;
    }

    const existing = document.querySelector(`script[src="${src}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve(globalName ? window[globalName] : undefined), { once: true });
      existing.addEventListener("error", reject, { once: true });
      return;
    }

    const script = document.createElement("script");
    script.src = src;
    script.onload = () => resolve(globalName ? window[globalName] : undefined);
    script.onerror = () => reject(new Error("音频快速提取模块加载失败"));
    document.head.appendChild(script);
  });
}

const AAC_SAMPLE_RATES = [96000, 88200, 64000, 48000, 44100, 32000, 24000, 22050, 16000, 12000, 11025, 8000, 7350];
const MP4_FAST_CHUNK_SIZE = 4 * 1024 * 1024;
const TRANSFORMERS_JS_URL = "https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1";
const SPEECH_MODEL = "onnx-community/whisper-tiny";
const whisperLangMap = {
  en: "english",
  zh: "chinese",
  ja: "japanese",
  ko: "korean",
  fr: "french",
  de: "german",
  ru: "russian",
};

function parseAacObjectType(codec) {
  const match = String(codec || "").match(/mp4a\.40\.(\d+)/i);
  return match ? Number(match[1]) : 2;
}

function createAdtsHeader(sampleLength, sampleRate, channelCount, objectType) {
  const sampleRateIndex = AAC_SAMPLE_RATES.indexOf(sampleRate);
  if (sampleRateIndex < 0) {
    throw new Error(`暂不支持 ${sampleRate}Hz AAC 音频快速提取`);
  }

  const profile = Math.max(1, Math.min(4, objectType || 2)) - 1;
  const channelConfig = Math.max(1, Math.min(7, channelCount || 2));
  const fullLength = sampleLength + 7;
  const header = new Uint8Array(7);

  header[0] = 0xff;
  header[1] = 0xf1;
  header[2] = ((profile & 0x03) << 6) | ((sampleRateIndex & 0x0f) << 2) | ((channelConfig >> 2) & 0x01);
  header[3] = ((channelConfig & 0x03) << 6) | ((fullLength >> 11) & 0x03);
  header[4] = (fullLength >> 3) & 0xff;
  header[5] = ((fullLength & 0x07) << 5) | 0x1f;
  header[6] = 0xfc;

  return header;
}

function sampleToUint8Array(sample) {
  if (sample.data instanceof Uint8Array) return sample.data;
  return new Uint8Array(sample.data);
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove("is-hidden");
}

function apiSettingFields() {
  return ["deepseekKey"];
}

function loadApiSettings() {
  try {
    const saved = JSON.parse(localStorage.getItem("videoSubtitleApiSettings") || "{}");
    apiSettingFields().forEach((key) => {
      if (saved[key] && els[key]) els[key].value = saved[key];
    });
  } catch {
    localStorage.removeItem("videoSubtitleApiSettings");
  }
}

function collectApiSettings() {
  const settings = {};
  apiSettingFields().forEach((key) => {
    settings[key] = els[key]?.value?.trim() || "";
  });

  if (els.saveApiSettings?.checked) {
    localStorage.setItem("videoSubtitleApiSettings", JSON.stringify(settings));
  } else {
    localStorage.removeItem("videoSubtitleApiSettings");
  }

  return settings;
}

function validateTranslateSettings(settings) {
  if (!settings.deepseekKey) {
    throw new Error("请先填写 API 设置：DeepSeek Key");
  }
}

function clearError() {
  els.errorBox.textContent = "";
  els.errorBox.classList.add("is-hidden");
}

function setProgress(ratio, status) {
  els.progressPanel.classList.remove("is-hidden");
  const safeRatio = Math.max(0, Math.min(1, ratio || 0));
  const percent = Math.round(safeRatio * 100);
  els.statusText.textContent = status;
  els.progressText.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
}

function progressDetail(ratio, status) {
  const safeRatio = Math.max(0, Math.min(1, ratio || 0));
  return `${Math.round(safeRatio * 100)}% · ${status}`;
}

function setTaskSteps(steps) {
  taskStepState = steps.map((step) => ({
    id: step.id,
    label: step.label,
    status: step.status || "pending",
    detail: step.detail || "",
  }));
  renderTaskSteps();
}

function updateTaskStep(id, status, detail = "") {
  const step = taskStepState.find((item) => item.id === id);
  if (!step) return;
  step.status = status;
  step.detail = detail;
  renderTaskSteps();
}

function clearTaskSteps() {
  taskStepState = [];
  renderTaskSteps();
}

function renderTaskSteps() {
  if (!els.taskSteps) return;
  els.taskSteps.replaceChildren();
  els.taskSteps.classList.toggle("is-hidden", taskStepState.length === 0);

  taskStepState.forEach((step) => {
    const item = document.createElement("li");
    item.className = `task-step is-${step.status}`;

    const dot = document.createElement("span");
    dot.className = "task-dot";
    dot.setAttribute("aria-hidden", "true");

    const textWrap = document.createElement("span");
    textWrap.className = "task-copy";

    const label = document.createElement("strong");
    label.textContent = step.label;
    textWrap.appendChild(label);

    if (step.detail) {
      const detail = document.createElement("small");
      detail.textContent = step.detail;
      textWrap.appendChild(detail);
    }

    item.append(dot, textWrap);
    els.taskSteps.appendChild(item);
  });
}

function subtitleTaskSteps() {
  return [
    { id: "awake", label: "保持屏幕常亮" },
    { id: "audio", label: "本机提取音频" },
    { id: "speech", label: "本机语音转文字" },
    { id: "translate", label: "AI 翻译润色" },
    { id: "srt", label: "生成字幕文件" },
    { id: "burn", label: "本机压制字幕视频" },
  ];
}

function ocrTaskSteps() {
  return [
    { id: "awake", label: "保持屏幕常亮" },
    { id: "ocr", label: "识别画面字幕" },
    { id: "translate", label: "AI 翻译润色" },
    { id: "srt", label: "生成字幕文件" },
  ];
}

async function requestScreenWakeLock() {
  if (!shouldKeepScreenAwake || screenWakeLock || !("wakeLock" in navigator)) return;

  try {
    screenWakeLock = await navigator.wakeLock.request("screen");
    screenWakeLock.addEventListener("release", () => {
      screenWakeLock = null;
      if (shouldKeepScreenAwake) {
        updateTaskStep("awake", "warning", "屏幕常亮被系统释放，请保持页面在前台");
      }
    });
    updateTaskStep("awake", "active", "屏幕常亮已开启");
  } catch (error) {
    console.warn("Screen wake lock unavailable", error);
    updateTaskStep("awake", "warning", "当前浏览器未开启常亮，请手动保持屏幕点亮");
  }
}

async function acquireScreenWakeLock() {
  shouldKeepScreenAwake = true;
  if (!("wakeLock" in navigator)) {
    updateTaskStep("awake", "warning", "当前浏览器不支持常亮，请手动保持屏幕点亮");
    return;
  }
  await requestScreenWakeLock();
}

async function releaseScreenWakeLock() {
  shouldKeepScreenAwake = false;
  if (!screenWakeLock) return;

  const lock = screenWakeLock;
  screenWakeLock = null;
  await lock.release().catch(() => {});
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible" && shouldKeepScreenAwake) {
    requestScreenWakeLock();
  }
});

function withTimeout(promise, ms, message) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

function isAndroidBrowser() {
  return /Android/i.test(navigator.userAgent);
}

function canUseNativeCompressor() {
  return Boolean(window.MediaRecorder && HTMLCanvasElement.prototype.captureStream);
}

function shouldUseNativeCompressor() {
  const mode = els.compressMode?.value || "auto";
  if (mode === "native") return true;
  if (mode === "ffmpeg") return false;
  return isAndroidBrowser();
}

function pickNativeMimeType() {
  const types = ["video/webm;codecs=vp9", "video/webm;codecs=vp8", "video/webm"];
  return types.find((type) => MediaRecorder.isTypeSupported(type)) || "";
}

function nativeVideoBitsPerSecond() {
  const quality = Number(els.quality.value);
  if (quality >= 33) return 650000;
  if (quality >= 29) return 1200000;
  return 2200000;
}

function targetCanvasSize(video) {
  const maxSide = els.resolution.value === "source" ? Math.max(video.videoWidth, video.videoHeight) : Number(els.resolution.value);
  const ratio = Math.min(1, maxSide / Math.max(video.videoWidth, video.videoHeight));
  const width = Math.max(2, Math.round((video.videoWidth * ratio) / 2) * 2);
  const height = Math.max(2, Math.round((video.videoHeight * ratio) / 2) * 2);
  return { width, height };
}

function waitForVideoEvent(video, eventName) {
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      video.removeEventListener(eventName, onEvent);
      video.removeEventListener("error", onError);
    };
    const onEvent = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("视频读取失败"));
    };
    video.addEventListener(eventName, onEvent, { once: true });
    video.addEventListener("error", onError, { once: true });
  });
}

function setCompressBusy(isBusy) {
  els.compressBtn.disabled = isBusy || !selectedFile;
  els.compressBtn.querySelector("span").textContent = isBusy ? "压缩中" : "开始压缩";
}

function setSubtitleBusy(isBusy) {
  els.subtitleBtn.disabled = isBusy || !selectedFile;
  els.subtitleBtn.querySelector("span").textContent = isBusy ? "生成中" : "生成并压制字幕";
}

function revokeUrl(url) {
  if (url) URL.revokeObjectURL(url);
}

function resetResult() {
  revokeUrl(outputUrl);
  outputUrl = null;
  els.resultPanel.classList.add("is-hidden");
  els.downloadLink.removeAttribute("href");
}

function resetSubtitleResult() {
  revokeUrl(zhSrtUrl);
  revokeUrl(bilingualSrtUrl);
  revokeUrl(audioUrl);
  revokeUrl(burnedVideoUrl);
  zhSrtUrl = null;
  bilingualSrtUrl = null;
  audioUrl = null;
  burnedVideoUrl = null;
  burnedVideoFile = null;
  els.subtitleResult.classList.add("is-hidden");
  els.subtitlePreview.value = "";
  els.downloadZhSrt.removeAttribute("href");
  els.downloadBilingualSrt.removeAttribute("href");
  els.audioResult?.classList.add("is-hidden");
  els.audioPreview?.removeAttribute("src");
  els.downloadAudio?.removeAttribute("href");
  els.burnResult?.classList.add("is-hidden");
  els.burnedVideoPreview?.removeAttribute("src");
  if (els.burnMeta) els.burnMeta.textContent = "";
  els.downloadBurnedVideo?.removeAttribute("href");
  if (els.shareBurnedVideo) els.shareBurnedVideo.disabled = true;
  clearTaskSteps();
}

function setPreset(value) {
  const preset = presets[value];
  if (!preset) return;
  els.resolution.value = preset.resolution;
  els.quality.value = String(preset.crf);
  updateQualityLabel();
  document.querySelectorAll('input[name="preset"]').forEach((input) => {
    input.closest(".preset").classList.toggle("is-active", input.value === value);
  });
}

function updateQualityLabel() {
  const value = Number(els.quality.value);
  if (value <= 26) {
    els.qualityLabel.value = "清晰";
  } else if (value <= 31) {
    els.qualityLabel.value = "普通";
  } else {
    els.qualityLabel.value = "更小";
  }
}

function updateSubtitleStyleLabels() {
  if (els.subtitleFontSizeLabel) {
    els.subtitleFontSizeLabel.value = `${els.subtitleFontSize.value}%`;
  }
  if (els.subtitleBgOpacityLabel) {
    els.subtitleBgOpacityLabel.value = `${els.subtitleBgOpacity.value}%`;
  }
}

function subtitleStyleSettings() {
  return {
    fontScale: Number(els.subtitleFontSize?.value || 100) / 100,
    position: els.subtitlePosition?.value || "bottom",
    color: els.subtitleColor?.value || "#ffffff",
    background: els.subtitleBg?.value || "#000000",
    backgroundOpacity: Number(els.subtitleBgOpacity?.value || 58) / 100,
  };
}

function currentSubtitleMode() {
  return document.querySelector('input[name="subtitleMode"]:checked')?.value || "speech";
}

function setSelectedFile(file) {
  clearError();
  resetResult();
  resetSubtitleResult();

  if (!file) return;
  const videoExt = /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
  if (!file.type.startsWith("video/") && !videoExt) {
    showError("请选择视频文件。");
    return;
  }

  selectedFile = file;
  revokeUrl(sourceUrl);
  sourceUrl = URL.createObjectURL(file);

  els.fileName.textContent = file.name;
  els.fileMeta.textContent = `${formatSize(file.size)} · ${file.type || "video"}`;
  els.fileSummary.classList.remove("is-hidden");
  els.preview.src = sourceUrl;
  els.preview.classList.remove("is-hidden");
  els.compressBtn.disabled = false;
  els.subtitleBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  revokeUrl(sourceUrl);
  sourceUrl = null;
  resetResult();
  resetSubtitleResult();
  els.fileInput.value = "";
  els.preview.removeAttribute("src");
  els.preview.classList.add("is-hidden");
  els.fileSummary.classList.add("is-hidden");
  els.progressPanel.classList.add("is-hidden");
  els.compressBtn.disabled = true;
  els.subtitleBtn.disabled = true;
  clearError();
}

function switchTab(tabName) {
  els.tabs.forEach((tab) => tab.classList.toggle("is-active", tab.dataset.tab === tabName));
  els.compressPanel.classList.toggle("is-active", tabName === "compress");
  els.subtitlePanel.classList.toggle("is-active", tabName === "subtitle");
  if (tabName === "subtitle") {
    els.progressPanel.classList.add("is-hidden");
  }
}

async function getFFmpeg() {
  if (ffmpegReady) return ffmpeg;

  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      setProgress(progress, "正在处理视频");
    });
  }

  setProgress(0.04, "加载视频引擎");
  await withTimeout(
    ffmpeg.load({
      coreURL: new URL("./vendor/ffmpeg/ffmpeg-core.js", import.meta.url).href,
      wasmURL: new URL("./vendor/ffmpeg/ffmpeg-core.wasm", import.meta.url).href,
    }),
    90000,
    "视频引擎加载超时。请刷新页面，或清除该站点缓存后重试。",
  );
  ffmpegReady = true;
  return ffmpeg;
}

function buildCompressArgs(inputName, outputName) {
  const args = ["-i", inputName];
  const maxSide = els.resolution.value;

  if (maxSide !== "source") {
    args.push(
      "-vf",
      `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`,
    );
  }

  args.push("-c:v", "libx264", "-preset", "veryfast", "-crf", els.quality.value, "-movflags", "+faststart");

  if (els.stripAudio.checked) {
    args.push("-an");
  } else {
    args.push("-c:a", "aac", "-b:a", "96k");
  }

  args.push(outputName);
  return args;
}

async function compressVideoNative() {
  if (!canUseNativeCompressor()) {
    throw new Error("当前浏览器不支持安卓兼容压缩模式。");
  }

  setProgress(0.02, "使用安卓兼容模式");
  const video = document.createElement("video");
  video.src = sourceUrl || URL.createObjectURL(selectedFile);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.left = "-10px";
  video.style.top = "-10px";
  document.body.appendChild(video);

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const { width, height } = targetCanvasSize(video);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const canvasStream = canvas.captureStream(24);
    const tracks = [...canvasStream.getVideoTracks()];
    let audioContext = null;

    if (!els.stripAudio.checked) {
      try {
        audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(video);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        source.connect(audioContext.destination);
        tracks.push(...destination.stream.getAudioTracks());
      } catch (error) {
        console.warn("Native compressor audio track unavailable", error);
      }
    }

    const mimeType = pickNativeMimeType();
    const recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType,
      videoBitsPerSecond: nativeVideoBitsPerSecond(),
    });
    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });

    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("兼容模式压缩失败")), { once: true });
    });

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, width, height);
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      setProgress(Math.min(0.95, video.currentTime / duration), "安卓兼容压缩中");
      requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await video.play();
    if (!els.stripAudio.checked) video.muted = false;
    draw();
    await new Promise((resolve) => {
      video.addEventListener("ended", resolve, { once: true });
    });
    drawing = false;
    recorder.stop();
    await stopped;
    tracks.forEach((track) => track.stop());
    await audioContext?.close().catch(() => {});

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    outputUrl = URL.createObjectURL(blob);
    els.beforeSize.textContent = formatSize(selectedFile.size);
    els.afterSize.textContent = formatSize(blob.size);
    const savedRatio = Math.max(0, 1 - blob.size / selectedFile.size);
    els.savedSize.textContent = `${Math.round(savedRatio * 100)}%`;
    els.downloadLink.href = outputUrl;
    els.downloadLink.download = cleanNativeVideoName(selectedFile.name);
    els.downloadLink.querySelector("span").textContent = "下载压缩视频";
    els.resultPanel.classList.remove("is-hidden");
    setProgress(1, "压缩完成");
  } finally {
    video.remove();
  }
}

async function compressVideo() {
  if (!selectedFile) return;

  clearError();
  resetResult();
  setCompressBusy(true);
  setProgress(0, "准备压缩");

  try {
    if (shouldUseNativeCompressor() && canUseNativeCompressor()) {
      await compressVideoNative();
      return;
    }

    const inputName = `input-${Date.now()}.${selectedFile.name.split(".").pop() || "mp4"}`;
    const outputName = `output-${Date.now()}.mp4`;
    const engine = await getFFmpeg();
    setProgress(0.08, "读取视频");
    await engine.writeFile(inputName, await fetchFile(selectedFile));

    await engine.exec(buildCompressArgs(inputName, outputName));
    setProgress(0.96, "生成文件");

    const data = await engine.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    outputUrl = URL.createObjectURL(blob);

    els.beforeSize.textContent = formatSize(selectedFile.size);
    els.afterSize.textContent = formatSize(blob.size);
    const savedRatio = Math.max(0, 1 - blob.size / selectedFile.size);
    els.savedSize.textContent = `${Math.round(savedRatio * 100)}%`;
    els.downloadLink.href = outputUrl;
    els.downloadLink.download = cleanVideoName(selectedFile.name);
    els.resultPanel.classList.remove("is-hidden");
    setProgress(1, "压缩完成");

    await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputName).catch(() => {});
  } catch (error) {
    console.error(error);
    if (!shouldUseNativeCompressor() && canUseNativeCompressor()) {
      try {
        resetResult();
        await compressVideoNative();
        return;
      } catch (nativeError) {
        console.error(nativeError);
      }
    }
    showError(error.message || "压缩失败。请换一个视频试试，或降低分辨率后重试。");
    setProgress(0, "失败");
  } finally {
    setCompressBusy(false);
  }
}

async function extractAudio() {
  if (isMp4LikeFile(selectedFile)) {
    try {
      return await extractAudioFastMp4();
    } catch (error) {
      console.warn("Fast MP4 audio extraction unavailable, falling back", error);
    }
  }

  if (isAndroidBrowser() && window.MediaRecorder) {
    return extractAudioNative();
  }

  const engine = await getFFmpeg();
  const ext = selectedFile.name.split(".").pop() || "mp4";
  const inputName = `subtitle-input-${Date.now()}.${ext}`;
  const outputName = `subtitle-audio-${Date.now()}.m4a`;

  setProgress(0.08, "提取并压缩音频");
  await engine.writeFile(inputName, await fetchFile(selectedFile));
  await engine.exec(["-i", inputName, "-vn", "-ac", "1", "-ar", "16000", "-c:a", "aac", "-b:a", "48k", outputName]);
  const data = await engine.readFile(outputName);

  await engine.deleteFile(inputName).catch(() => {});
  await engine.deleteFile(outputName).catch(() => {});

  return new File([data.buffer], cleanSubtitleName(selectedFile.name, "audio").replace(".srt", ".m4a"), {
    type: "audio/mp4",
  });
}

async function extractAudioFastMp4() {
  setProgress(0.08, "加载本地音频解析模块");
  const MP4Box = await withTimeout(
    loadClassicScript("./vendor/mp4box/mp4box.all.min.js", "MP4Box"),
    15000,
    "本地音频解析模块加载超时，请刷新后重试"
  );
  if (!MP4Box?.createFile) throw new Error("音频快速提取模块不可用");

  const mp4boxFile = MP4Box.createFile();
  const samples = [];
  let audioTrack = null;

  await new Promise((resolve, reject) => {
    let settled = false;
    let idleTimer = null;
    let readerFinished = false;
    const timeoutTimer = window.setTimeout(() => {
      finish(new Error("本地快速提取音频超时"));
    }, 90000);

    const finish = (error) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timeoutTimer);
      window.clearTimeout(idleTimer);
      mp4boxFile.stop?.();
      if (error) reject(error);
      else resolve();
    };

    mp4boxFile.onError = (error) => finish(new Error(error || "MP4 音轨读取失败"));
    mp4boxFile.onReady = (info) => {
      audioTrack = (info.tracks || []).find((track) => track.type === "audio" && /^mp4a/i.test(track.codec || ""));
      if (!audioTrack) {
        finish(new Error("没有找到可快速提取的 AAC 音轨"));
        return;
      }

      mp4boxFile.setExtractionOptions(audioTrack.id, null, { nbSamples: 1000 });
      mp4boxFile.start();
      setProgress(0.14, "找到音频轨道，开始本地拆分");
    };

    mp4boxFile.onSamples = (_id, _user, batch) => {
      samples.push(...batch);
      setProgress(readerFinished ? 0.22 : 0.18, "正在本地拆分音频轨道");
      window.clearTimeout(idleTimer);
      if (readerFinished) {
        idleTimer = window.setTimeout(() => finish(), 200);
      }
    };

    (async () => {
      try {
        for (let offset = 0; offset < selectedFile.size && !settled; offset += MP4_FAST_CHUNK_SIZE) {
          const end = Math.min(offset + MP4_FAST_CHUNK_SIZE, selectedFile.size);
          const readRatio = selectedFile.size ? end / selectedFile.size : 1;
          const readStatus = audioTrack ? "分块拆分音频轨道" : "分块查找音频轨道";
          setProgress(Math.min(0.18, 0.08 + readRatio * 0.1), readStatus);

          const buffer = await withTimeout(
            selectedFile.slice(offset, end).arrayBuffer(),
            20000,
            "读取视频文件超时，请重新选择视频后再试"
          );
          buffer.fileStart = offset;
          mp4boxFile.appendBuffer(buffer);

          await new Promise((resume) => window.setTimeout(resume, 0));
        }

        readerFinished = true;
        mp4boxFile.flush();
        idleTimer = window.setTimeout(() => {
          if (samples.length) finish();
          else finish(new Error("没有提取到音频数据"));
        }, 1200);
      } catch (error) {
        finish(error);
      }
    })();
  });

  if (!samples.length || !audioTrack) {
    throw new Error("没有提取到音频数据");
  }

  const sampleRate = audioTrack.audio?.sample_rate || 48000;
  const channelCount = audioTrack.audio?.channel_count || 2;
  const objectType = parseAacObjectType(audioTrack.codec);
  const chunks = [];

  samples.forEach((sample) => {
    const data = sampleToUint8Array(sample);
    chunks.push(createAdtsHeader(data.byteLength, sampleRate, channelCount, objectType), data);
  });

  const blob = new Blob(chunks, { type: "audio/aac" });
  if (!blob.size) throw new Error("音频轨道为空");
  setProgress(0.22, `音频已提取 ${formatSize(blob.size)}`);
  return new File([blob], cleanAacName(selectedFile.name), { type: "audio/aac" });
}

async function extractAudioNative() {
  setProgress(0.08, "安卓兼容提取音频");

  const video = document.createElement("video");
  video.src = sourceUrl || URL.createObjectURL(selectedFile);
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.left = "-10px";
  video.style.top = "-10px";
  document.body.appendChild(video);

  let audioContext = null;
  let recorder = null;
  let hasAudioTrack = false;

  try {
    await waitForVideoEvent(video, "loadedmetadata");

    audioContext = new AudioContext();
    await audioContext.resume();
    const source = audioContext.createMediaElementSource(video);
    const destination = audioContext.createMediaStreamDestination();
    source.connect(destination);

    const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus") ? "audio/webm;codecs=opus" : "audio/webm";
    recorder = new MediaRecorder(destination.stream, {
      mimeType,
      audioBitsPerSecond: 48000,
    });

    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("安卓兼容音频提取失败")), { once: true });
    });

    recorder.start(1000);
    try {
      await video.play();
    } catch (error) {
      throw new Error("安卓浏览器需要一次真实点击才能提取音频。请重新点“生成中文字幕”。");
    }

    const start = Date.now();
    while (!video.ended) {
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      setProgress(Math.min(0.25, 0.08 + video.currentTime / duration * 0.17), "安卓兼容提取音频");
      if (Date.now() - start > 30 * 60 * 1000) throw new Error("音频提取超时");
      await new Promise((resolve) => setTimeout(resolve, 500));
    }

    recorder.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mimeType });
    if (!blob.size) throw new Error("没有提取到音频。请确认视频包含声音。");
    return new File([blob], cleanAudioName(selectedFile.name), { type: "audio/webm" });
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    await audioContext?.close().catch(() => {});
    video.remove();
  }
}

function normalizeSegments(items) {
  return (items || [])
    .map((item, index) => ({
      index: index + 1,
      start: Number(item.start ?? item.begin ?? item.beginTime ?? 0),
      end: Number(item.end ?? item.endTime ?? item.stop ?? 0),
      text: String(item.text || "").trim(),
      translation: String(item.translation || "").trim(),
    }))
    .filter((item) => item.text || item.translation)
    .map((item, index) => ({
      ...item,
      index: index + 1,
      end: item.end > item.start ? item.end : item.start + 2,
    }));
}

function srtTime(seconds) {
  const safe = Math.max(0, seconds || 0);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const secs = Math.floor(safe % 60);
  const millis = Math.round((safe - Math.floor(safe)) * 1000);
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},${String(millis).padStart(3, "0")}`;
}

function buildSrt(segments, mode) {
  return segments
    .map((item, index) => {
      const lines = mode === "bilingual" ? [item.text, item.translation].filter(Boolean) : [item.translation || item.text];
      return `${index + 1}\n${srtTime(item.start)} --> ${srtTime(item.end)}\n${lines.join("\n")}`;
    })
    .join("\n\n");
}

function downloadText(text, filename, link) {
  const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = filename;
  return url;
}

function showSubtitleResult(segments) {
  const normalized = normalizeSegments(segments);
  const zhSrt = buildSrt(normalized, "translated");
  const bilingualSrt = buildSrt(normalized, "bilingual");

  revokeUrl(zhSrtUrl);
  revokeUrl(bilingualSrtUrl);
  zhSrtUrl = downloadText(zhSrt, cleanSubtitleName(selectedFile.name, "zh"), els.downloadZhSrt);
  bilingualSrtUrl = downloadText(bilingualSrt, cleanSubtitleName(selectedFile.name, "bilingual"), els.downloadBilingualSrt);
  els.subtitlePreview.value = bilingualSrt;
  els.subtitleResult.classList.remove("is-hidden");
}

function showAudioExtractionResult(audioFile) {
  revokeUrl(audioUrl);
  audioUrl = URL.createObjectURL(audioFile);
  els.audioPreview.src = audioUrl;
  els.downloadAudio.href = audioUrl;
  els.downloadAudio.download = audioFile.name;
  els.audioResult.classList.remove("is-hidden");
}

async function translateSegments(segments) {
  const settings = collectApiSettings();
  validateTranslateSettings(settings);

  if (location.hostname.endsWith("github.io") || location.hostname === "127.0.0.1" || location.hostname === "localhost") {
    return translateSegmentsInBrowser(segments, settings.deepseekKey);
  }

  const response = await fetch("./api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      sourceLang: els.sourceLang.value,
      targetLang: els.targetLang.value,
      segments,
      apiSettings: settings,
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "字幕翻译失败");
  }
  return data.segments;
}

function buildTranslateMessages(segments) {
  const payload = segments.map((item, index) => ({
    id: item.id || item.index || index + 1,
    text: item.text || "",
  }));

  return [
    {
      role: "system",
      content: "你是专业字幕翻译。把字幕翻译成自然、准确、简洁的中文，保留人名、数字和语气。只返回 JSON。",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "translate_subtitle_segments",
        sourceLang: els.sourceLang.value,
        targetLang: els.targetLang.value,
        outputSchema: { items: [{ id: 1, translation: "中文字幕" }] },
        rules: ["返回一个 JSON 对象，只有 items 字段", "保持 id 不变", "不要合并或拆分字幕", "空文本返回空翻译"],
        segments: payload,
      }),
    },
  ];
}

function parseModelJson(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\{[\s\S]*\}/);
    if (!match) throw new Error("AI 没有返回可解析的 JSON");
    return JSON.parse(match[0]);
  }
}

async function translateSegmentsInBrowser(segments, apiKey) {
  const normalized = normalizeSegments(segments);
  const translated = [];
  const batchSize = 40;

  for (let i = 0; i < normalized.length; i += batchSize) {
    const batch = normalized.slice(i, i + batchSize);
    const ratio = 0.52 + Math.min(0.24, (i / Math.max(1, normalized.length)) * 0.24);
    setProgress(ratio, "AI 翻译中文字幕");
    updateTaskStep("translate", "active", progressDetail(ratio, `第 ${Math.floor(i / batchSize) + 1} 批`));
    const response = await fetch("https://api.deepseek.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "deepseek-chat",
        messages: buildTranslateMessages(batch),
        temperature: 0.2,
        response_format: { type: "json_object" },
      }),
    }).catch((error) => {
      throw new Error(`浏览器直连 DeepSeek 失败：${error.message || "可能被 CORS 拦截"}`);
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.error?.message || data.message || "DeepSeek 翻译失败");
    }

    const parsed = parseModelJson(data.choices?.[0]?.message?.content || "{}");
    const items = parsed.items || parsed.segments || [];
    const byId = new Map(items.map((item) => [String(item.id), item.translation || item.text || ""]));
    translated.push(
      ...batch.map((item, index) => ({
        ...item,
        translation: byId.get(String(item.id || item.index || index + 1)) || "",
      })),
    );
  }

  updateTaskStep("translate", "done", `已翻译 ${translated.length} 条字幕`);
  return translated;
}

async function loadSpeechPipeline() {
  if (speechPipeline) return speechPipeline;
  if (speechModelLoading) return speechModelLoading;

  speechModelLoading = (async () => {
    setProgress(0.25, "加载本地语音模型");
    updateTaskStep("speech", "active", "加载本地 Whisper 模型");
    const transformers = await withTimeout(
      import(TRANSFORMERS_JS_URL),
      120000,
      "本地语音模型加载超时。首次加载模型较慢，请保持网络连接后重试。",
    );
    transformers.env.allowLocalModels = false;

    speechPipeline = await transformers.pipeline("automatic-speech-recognition", SPEECH_MODEL, {
      dtype: "q8",
      progress_callback: (item) => {
        if (item.status === "progress" && Number.isFinite(item.progress)) {
          const ratio = 0.25 + Math.min(0.12, item.progress / 100 * 0.12);
          setProgress(ratio, "下载本地语音模型");
          updateTaskStep("speech", "active", progressDetail(ratio, "下载模型"));
        }
      },
    });
    return speechPipeline;
  })().finally(() => {
    speechModelLoading = null;
  });

  return speechModelLoading;
}

async function decodeAudioToMono(audioFile) {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  if (!AudioContextClass) throw new Error("当前浏览器不支持音频解码。");

  const context = new AudioContextClass({ sampleRate: 16000 });
  try {
    const buffer = await withTimeout(audioFile.arrayBuffer(), 30000, "读取音频文件超时");
    const decoded = await withTimeout(context.decodeAudioData(buffer), 30000, "解码音频失败");
    const length = decoded.length;
    const channels = decoded.numberOfChannels;
    const mono = new Float32Array(length);

    for (let channel = 0; channel < channels; channel += 1) {
      const data = decoded.getChannelData(channel);
      for (let i = 0; i < length; i += 1) mono[i] += data[i] / channels;
    }

    if (decoded.sampleRate === 16000) return mono;
    return resampleAudio(mono, decoded.sampleRate, 16000);
  } finally {
    await context.close().catch(() => {});
  }
}

function resampleAudio(input, sourceRate, targetRate) {
  if (sourceRate === targetRate) return input;
  const ratio = sourceRate / targetRate;
  const newLength = Math.max(1, Math.round(input.length / ratio));
  const output = new Float32Array(newLength);

  for (let i = 0; i < newLength; i += 1) {
    const sourceIndex = i * ratio;
    const left = Math.floor(sourceIndex);
    const right = Math.min(input.length - 1, left + 1);
    const weight = sourceIndex - left;
    output[i] = input[left] * (1 - weight) + input[right] * weight;
  }

  return output;
}

function normalizeSpeechSegments(result) {
  const chunks = Array.isArray(result?.chunks) ? result.chunks : [];
  if (chunks.length) {
    return chunks
      .map((chunk, index) => {
        const timestamp = chunk.timestamp || chunk.timestamps || [index * 3, index * 3 + 3];
        const start = Number(timestamp[0] ?? index * 3);
        const end = Number(timestamp[1] ?? start + 3);
        return {
          id: index + 1,
          index: index + 1,
          start,
          end: end > start ? end : start + 3,
          text: String(chunk.text || "").trim(),
          translation: "",
        };
      })
      .filter((item) => item.text);
  }

  const text = String(result?.text || "").trim();
  return text ? [{ id: 1, index: 1, start: 0, end: 3, text, translation: "" }] : [];
}

async function transcribeAudioLocally(audioFile) {
  const transcriber = await loadSpeechPipeline();
  setProgress(0.38, "本机语音转文字");
  updateTaskStep("speech", "active", "正在识别语音内容");
  const audio = await decodeAudioToMono(audioFile);
  const result = await transcriber(audio, {
    chunk_length_s: 30,
    stride_length_s: 5,
    return_timestamps: true,
    language: whisperLangMap[els.sourceLang.value] || "english",
    task: "transcribe",
  });
  const segments = normalizeSpeechSegments(result);
  if (!segments.length) throw new Error("本机语音模型没有识别到文字。请确认视频有人声，或换更清晰的音频。");
  updateTaskStep("speech", "done", `已识别 ${segments.length} 条字幕`);
  return segments;
}

function subtitleTextForTime(segments, time) {
  const current = segments.find((item) => time >= item.start && time <= item.end);
  return current ? current.translation || current.text : "";
}

function wrapSubtitleText(ctx, text, maxWidth) {
  const chars = Array.from(String(text || ""));
  const lines = [];
  let line = "";

  chars.forEach((char) => {
    const next = line + char;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line.trim());
      line = char;
    } else {
      line = next;
    }
  });

  if (line.trim()) lines.push(line.trim());
  return lines.slice(0, 3);
}

function drawSubtitleFrame(ctx, video, segments, width, height) {
  ctx.drawImage(video, 0, 0, width, height);
  const text = subtitleTextForTime(segments, video.currentTime);
  if (!text) return;

  const style = subtitleStyleSettings();
  const fontSize = Math.max(18, Math.round(width * 0.045 * style.fontScale));
  const lineHeight = Math.round(fontSize * 1.35);
  ctx.font = `700 ${fontSize}px system-ui, -apple-system, BlinkMacSystemFont, "Microsoft YaHei", sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const maxTextWidth = width * 0.86;
  const lines = wrapSubtitleText(ctx, text, maxTextWidth);
  const boxHeight = lines.length * lineHeight + Math.round(fontSize * 0.9);
  const marginY = Math.round(height * 0.08);
  const boxYMap = {
    top: marginY,
    middle: Math.round((height - boxHeight) / 2),
    bottom: height - boxHeight - marginY,
  };
  const boxY = boxYMap[style.position] ?? boxYMap.bottom;

  ctx.fillStyle = hexToRgba(style.background, style.backgroundOpacity);
  ctx.fillRect(Math.round(width * 0.06), boxY, Math.round(width * 0.88), boxHeight);
  ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
  ctx.lineWidth = Math.max(3, Math.round(fontSize * 0.12));
  ctx.fillStyle = style.color;

  const firstY = boxY + boxHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
  lines.forEach((line, index) => {
    const y = firstY + index * lineHeight;
    ctx.strokeText(line, width / 2, y);
    ctx.fillText(line, width / 2, y);
  });
}

function hexToRgba(hex, opacity) {
  const normalized = String(hex || "#000000").replace("#", "");
  const value = normalized.length === 3
    ? normalized.split("").map((char) => char + char).join("")
    : normalized.padEnd(6, "0").slice(0, 6);
  const r = parseInt(value.slice(0, 2), 16) || 0;
  const g = parseInt(value.slice(2, 4), 16) || 0;
  const b = parseInt(value.slice(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, opacity))})`;
}

async function burnSubtitlesToVideo(segments) {
  if (!canUseNativeCompressor()) {
    throw new Error("当前浏览器不支持本机字幕压制。请换 Chrome/Edge 或先下载 SRT。");
  }

  setProgress(0.78, "准备本机压制字幕");
  updateTaskStep("burn", "active", "准备画面和音轨");
  const video = document.createElement("video");
  video.src = sourceUrl || URL.createObjectURL(selectedFile);
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.setAttribute("playsinline", "");
  video.setAttribute("webkit-playsinline", "");
  video.style.position = "fixed";
  video.style.width = "1px";
  video.style.height = "1px";
  video.style.opacity = "0";
  video.style.pointerEvents = "none";
  video.style.left = "-10px";
  video.style.top = "-10px";
  document.body.appendChild(video);

  let audioContext = null;
  let recorder = null;

  try {
    await waitForVideoEvent(video, "loadedmetadata");
    const { width, height } = targetCanvasSize(video);
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    const canvasStream = canvas.captureStream(24);
    const tracks = [...canvasStream.getVideoTracks()];

    try {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      audioContext = new AudioContextClass();
      await audioContext.resume();
      const source = audioContext.createMediaElementSource(video);
      const destination = audioContext.createMediaStreamDestination();
      source.connect(destination);
      source.connect(audioContext.destination);
      const audioTracks = destination.stream.getAudioTracks();
      tracks.push(...audioTracks);
      hasAudioTrack = audioTracks.length > 0;
    } catch (error) {
      console.warn("Subtitle burn audio track unavailable", error);
    }
    updateTaskStep("burn", hasAudioTrack ? "active" : "warning", hasAudioTrack ? "原声音轨已接入" : "未能接入原声音轨");

    const mimeType = pickNativeMimeType();
    recorder = new MediaRecorder(new MediaStream(tracks), {
      mimeType,
      videoBitsPerSecond: nativeVideoBitsPerSecond(),
    });

    const chunks = [];
    recorder.addEventListener("dataavailable", (event) => {
      if (event.data.size) chunks.push(event.data);
    });
    const stopped = new Promise((resolve, reject) => {
      recorder.addEventListener("stop", resolve, { once: true });
      recorder.addEventListener("error", () => reject(new Error("字幕压制失败")), { once: true });
    });

    let drawing = true;
    const draw = () => {
      if (!drawing) return;
      drawSubtitleFrame(ctx, video, segments, width, height);
      const duration = Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 1;
      const ratio = 0.78 + Math.min(0.2, (video.currentTime / duration) * 0.2);
      setProgress(ratio, "本机压制中文字幕");
      updateTaskStep("burn", "active", progressDetail(ratio, `${Math.round(video.currentTime)} / ${Math.round(duration)} 秒`));
      requestAnimationFrame(draw);
    };

    recorder.start(1000);
    await video.play();
    draw();
    await new Promise((resolve) => video.addEventListener("ended", resolve, { once: true }));
    drawing = false;
    recorder.stop();
    await stopped;
    tracks.forEach((track) => track.stop());

    const blob = new Blob(chunks, { type: mimeType || "video/webm" });
    if (!blob.size) throw new Error("字幕视频生成失败。");
    revokeUrl(burnedVideoUrl);
    burnedVideoFile = new File([blob], cleanBurnedVideoName(selectedFile.name), { type: blob.type || "video/webm" });
    burnedVideoUrl = URL.createObjectURL(blob);
    els.burnedVideoPreview.src = burnedVideoUrl;
    els.downloadBurnedVideo.href = burnedVideoUrl;
    els.downloadBurnedVideo.download = burnedVideoFile.name;
    if (els.shareBurnedVideo) {
      const canShareFile = Boolean(navigator.canShare?.({ files: [burnedVideoFile] }));
      els.shareBurnedVideo.disabled = !canShareFile;
      els.shareBurnedVideo.title = canShareFile ? "调用手机系统分享" : "当前浏览器不支持直接分享文件，请先下载再分享";
    }
    if (els.burnMeta) els.burnMeta.textContent = burnedVideoFormatNote(hasAudioTrack);
    els.burnResult.classList.remove("is-hidden");
    updateTaskStep("burn", hasAudioTrack ? "done" : "warning", `${formatSize(blob.size)} · ${hasAudioTrack ? "原声已保留" : "原声未保留"}`);
  } finally {
    if (recorder?.state === "recording") recorder.stop();
    await audioContext?.close().catch(() => {});
    video.remove();
  }
}

async function generateSpeechSubtitles() {
  validateTranslateSettings(collectApiSettings());
  setTaskSteps(subtitleTaskSteps());
  updateTaskStep("awake", "active", "尝试保持手机屏幕常亮");
  await acquireScreenWakeLock();
  setProgress(0, "准备本地提取音频");
  updateTaskStep("audio", "active", "正在读取视频音轨");
  const audioFile = await extractAudio();
  showAudioExtractionResult(audioFile);
  updateTaskStep("audio", "done", `音频 ${formatSize(audioFile.size)}`);
  const sourceSegments = await transcribeAudioLocally(audioFile);
  updateTaskStep("translate", "active", "准备发送文字给 AI");
  const translated = await translateSegments(sourceSegments);
  showSubtitleResult(translated);
  updateTaskStep("srt", "done", `已生成 ${normalizeSegments(translated).length} 条字幕`);
  await burnSubtitlesToVideo(normalizeSegments(translated));
  setProgress(1, "字幕视频完成");
  updateTaskStep("awake", "done", "任务完成后会关闭常亮");
}

function waitForVideoSeek(video, time) {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error("视频定位失败"));
    };
    const cleanup = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    video.currentTime = Math.min(time, Math.max(0, video.duration - 0.1));
  });
}

function normalizeOcrText(text) {
  return text
    .replace(/\s+/g, " ")
    .replace(/[|_[\]{}~`]/g, "")
    .trim();
}

function mergeOcrSegments(rawItems, interval) {
  const segments = [];
  for (const item of rawItems) {
    if (!item.text) continue;
    const previous = segments[segments.length - 1];
    if (previous && previous.text === item.text) {
      previous.end = item.end;
    } else {
      segments.push({ start: item.start, end: item.end || item.start + interval, text: item.text });
    }
  }
  return segments.filter((item) => item.text.length > 1);
}

async function loadTesseract() {
  if (window.Tesseract) return window.Tesseract;
  await new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://unpkg.com/tesseract.js@5.1.1/dist/tesseract.min.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("OCR 引擎加载失败"));
    document.head.appendChild(script);
  });
  return window.Tesseract;
}

async function generateOcrSubtitles() {
  validateTranslateSettings(collectApiSettings());
  setTaskSteps(ocrTaskSteps());
  updateTaskStep("awake", "active", "尝试保持手机屏幕常亮");
  await acquireScreenWakeLock();
  updateTaskStep("ocr", "active", "准备截帧识别");
  const Tesseract = await loadTesseract();
  const video = document.createElement("video");
  video.src = sourceUrl;
  video.muted = true;
  video.playsInline = true;
  video.crossOrigin = "anonymous";

  await new Promise((resolve, reject) => {
    video.addEventListener("loadedmetadata", resolve, { once: true });
    video.addEventListener("error", () => reject(new Error("视频读取失败")), { once: true });
  });

  const interval = Number(els.ocrInterval.value);
  const cropRatio = Number(els.ocrCrop.value);
  const duration = Math.min(video.duration || 0, 1800);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  const rawItems = [];
  const lang = langMap[els.sourceLang.value] || "eng";

  for (let time = 0; time < duration; time += interval) {
    const ratio = duration ? time / duration : 0.1;
    setProgress(ratio, "识别画面字幕");
    updateTaskStep("ocr", "active", progressDetail(ratio, `${Math.round(time)} / ${Math.round(duration)} 秒`));
    await waitForVideoSeek(video, time);

    const sourceHeight = video.videoHeight * cropRatio;
    const sourceY = video.videoHeight - sourceHeight;
    canvas.width = Math.min(1280, video.videoWidth);
    canvas.height = Math.round(canvas.width * (sourceHeight / video.videoWidth));
    ctx.drawImage(video, 0, sourceY, video.videoWidth, sourceHeight, 0, 0, canvas.width, canvas.height);

    const { data } = await Tesseract.recognize(canvas, lang);
    const text = normalizeOcrText(data.text || "");
    rawItems.push({ start: time, end: time + interval, text });
  }

  const sourceSegments = mergeOcrSegments(rawItems, interval);
  if (!sourceSegments.length) {
    throw new Error("没有识别到画面字幕。可以调大字幕区域或缩短截帧间隔再试。");
  }

  updateTaskStep("ocr", "done", `已识别 ${sourceSegments.length} 条画面字幕`);
  setProgress(0.86, "翻译画面字幕");
  updateTaskStep("translate", "active", "准备发送文字给 AI");
  const translated = await translateSegments(sourceSegments);
  showSubtitleResult(translated);
  updateTaskStep("srt", "done", `已生成 ${normalizeSegments(translated).length} 条字幕`);
  setProgress(1, "字幕完成");
  updateTaskStep("awake", "done", "任务完成后会关闭常亮");
}

async function generateSubtitles() {
  if (!selectedFile) return;
  clearError();
  resetSubtitleResult();
  setSubtitleBusy(true);

  try {
    if (currentSubtitleMode() === "speech") {
      await generateSpeechSubtitles();
    } else {
      await generateOcrSubtitles();
    }
  } catch (error) {
    console.error(error);
    showError(error.message || "字幕生成失败。");
    setProgress(0, "失败");
  } finally {
    await releaseScreenWakeLock();
    setSubtitleBusy(false);
  }
}

async function shareBurnedVideo() {
  if (!burnedVideoFile) {
    showError("请先生成字幕视频。");
    return;
  }

  if (!navigator.share || !navigator.canShare?.({ files: [burnedVideoFile] })) {
    showError("当前浏览器不支持直接分享视频文件，请先下载后再转发。");
    return;
  }

  clearError();
  try {
    await navigator.share({
      files: [burnedVideoFile],
      title: "中文字幕视频",
      text: "已生成中文字幕视频",
    });
  } catch (error) {
    if (error.name !== "AbortError") {
      showError(error.message || "分享失败，请先下载后再转发。");
    }
  }
}

els.tabs.forEach((tab) => {
  tab.addEventListener("click", () => switchTab(tab.dataset.tab));
});

els.dropZone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (event) => setSelectedFile(event.target.files?.[0]));
els.clearFile.addEventListener("click", clearFile);
els.compressBtn.addEventListener("click", compressVideo);
els.subtitleBtn.addEventListener("click", generateSubtitles);
els.shareBurnedVideo?.addEventListener("click", shareBurnedVideo);
els.quality.addEventListener("input", updateQualityLabel);
els.subtitleFontSize?.addEventListener("input", updateSubtitleStyleLabels);
els.subtitleBgOpacity?.addEventListener("input", updateSubtitleStyleLabels);

document.querySelectorAll('input[name="preset"]').forEach((input) => {
  input.addEventListener("change", () => setPreset(input.value));
});

document.querySelectorAll('input[name="subtitleMode"]').forEach((input) => {
  input.addEventListener("change", () => {
    document.querySelectorAll('input[name="subtitleMode"]').forEach((mode) => {
      mode.closest(".preset").classList.toggle("is-active", mode.checked);
    });
    els.ocrOptions.classList.toggle("is-hidden", currentSubtitleMode() !== "ocr");
  });
});

["dragenter", "dragover"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("is-dragging");
  });
});

["dragleave", "drop"].forEach((eventName) => {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("is-dragging");
  });
});

els.dropZone.addEventListener("drop", (event) => {
  setSelectedFile(event.dataTransfer?.files?.[0]);
});

setPreset("small");
updateSubtitleStyleLabels();
