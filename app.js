import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js";

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
  compressBtn: document.querySelector("#compressBtn"),
  subtitleBtn: document.querySelector("#subtitleBtn"),
  ocrOptions: document.querySelector("#ocrOptions"),
  sourceLang: document.querySelector("#sourceLang"),
  targetLang: document.querySelector("#targetLang"),
  ocrInterval: document.querySelector("#ocrInterval"),
  ocrCrop: document.querySelector("#ocrCrop"),
  dashscopeKey: document.querySelector("#dashscopeKey"),
  deepseekKey: document.querySelector("#deepseekKey"),
  ossAccessKeyId: document.querySelector("#ossAccessKeyId"),
  ossAccessKeySecret: document.querySelector("#ossAccessKeySecret"),
  ossRegion: document.querySelector("#ossRegion"),
  ossBucket: document.querySelector("#ossBucket"),
  ossPrefix: document.querySelector("#ossPrefix"),
  saveApiSettings: document.querySelector("#saveApiSettings"),
  progressPanel: document.querySelector("#progressPanel"),
  statusText: document.querySelector("#statusText"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  resultPanel: document.querySelector("#resultPanel"),
  beforeSize: document.querySelector("#beforeSize"),
  afterSize: document.querySelector("#afterSize"),
  savedSize: document.querySelector("#savedSize"),
  downloadLink: document.querySelector("#downloadLink"),
  subtitleResult: document.querySelector("#subtitleResult"),
  subtitlePreview: document.querySelector("#subtitlePreview"),
  downloadZhSrt: document.querySelector("#downloadZhSrt"),
  downloadBilingualSrt: document.querySelector("#downloadBilingualSrt"),
  errorBox: document.querySelector("#errorBox"),
};

let selectedFile = null;
let sourceUrl = null;
let outputUrl = null;
let zhSrtUrl = null;
let bilingualSrtUrl = null;
let ffmpeg = null;
let ffmpegReady = false;

window.lucide?.createIcons();

loadApiSettings();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
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

function cleanVideoName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-compressed.mp4`;
}

function cleanSubtitleName(name, suffix) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "video"}-${suffix}.srt`;
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove("is-hidden");
}

function apiSettingFields() {
  return [
    "dashscopeKey",
    "deepseekKey",
    "ossAccessKeyId",
    "ossAccessKeySecret",
    "ossRegion",
    "ossBucket",
    "ossPrefix",
  ];
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

  if (els.saveApiSettings.checked) {
    localStorage.setItem("videoSubtitleApiSettings", JSON.stringify(settings));
  } else {
    localStorage.removeItem("videoSubtitleApiSettings");
  }

  return settings;
}

function validateSpeechSettings(settings) {
  const missing = [];
  if (!settings.dashscopeKey) missing.push("阿里百炼 Key");
  if (!settings.deepseekKey) missing.push("DeepSeek Key");
  if (!settings.ossAccessKeyId) missing.push("OSS AccessKey ID");
  if (!settings.ossAccessKeySecret) missing.push("OSS AccessKey Secret");
  if (!settings.ossRegion) missing.push("OSS Region");
  if (!settings.ossBucket) missing.push("OSS Bucket");
  if (missing.length) {
    throw new Error(`请先填写 API 设置：${missing.join("、")}`);
  }
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

function setCompressBusy(isBusy) {
  els.compressBtn.disabled = isBusy || !selectedFile;
  els.compressBtn.querySelector("span").textContent = isBusy ? "压缩中" : "开始压缩";
}

function setSubtitleBusy(isBusy) {
  els.subtitleBtn.disabled = isBusy || !selectedFile;
  els.subtitleBtn.querySelector("span").textContent = isBusy ? "生成中" : "生成中文字幕";
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
  zhSrtUrl = null;
  bilingualSrtUrl = null;
  els.subtitleResult.classList.add("is-hidden");
  els.subtitlePreview.value = "";
  els.downloadZhSrt.removeAttribute("href");
  els.downloadBilingualSrt.removeAttribute("href");
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
  const ffmpegBaseURL = "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm";
  const coreBaseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  await ffmpeg.load({
    classWorkerURL: await toBlobURL(`${ffmpegBaseURL}/worker.js`, "text/javascript"),
    coreURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${coreBaseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
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

async function compressVideo() {
  if (!selectedFile) return;

  clearError();
  resetResult();
  setCompressBusy(true);
  setProgress(0, "准备压缩");

  const inputName = `input-${Date.now()}.${selectedFile.name.split(".").pop() || "mp4"}`;
  const outputName = `output-${Date.now()}.mp4`;

  try {
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
    showError("压缩失败。请换一个视频试试，或降低分辨率后重试。");
    setProgress(0, "失败");
  } finally {
    setCompressBusy(false);
  }
}

async function extractAudio() {
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

async function postAudioForTranscription(audioFile) {
  const settings = collectApiSettings();
  validateSpeechSettings(settings);

  const form = new FormData();
  form.append("audio", audioFile);
  form.append("sourceLang", els.sourceLang.value);
  form.append("targetLang", els.targetLang.value);
  Object.entries(settings).forEach(([key, value]) => form.append(key, value));

  const response = await fetch("./api/transcribe", {
    method: "POST",
    body: form,
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "语音识别失败");
  }
  return data.segments;
}

async function translateSegments(segments) {
  const settings = collectApiSettings();
  validateTranslateSettings(settings);

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

async function generateSpeechSubtitles() {
  setProgress(0, "准备生成字幕");
  const audioFile = await extractAudio();
  setProgress(0.28, `上传音频 ${formatSize(audioFile.size)}`);
  const segments = await postAudioForTranscription(audioFile);
  setProgress(0.82, "翻译字幕");
  showSubtitleResult(segments);
  setProgress(1, "字幕完成");
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
    setProgress(duration ? time / duration : 0.1, "识别画面字幕");
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

  setProgress(0.86, "翻译画面字幕");
  const translated = await translateSegments(sourceSegments);
  showSubtitleResult(translated);
  setProgress(1, "字幕完成");
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
    setSubtitleBusy(false);
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
els.quality.addEventListener("input", updateQualityLabel);

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
