import { FFmpeg } from "https://unpkg.com/@ffmpeg/ffmpeg@0.12.15/dist/esm/index.js";
import { fetchFile, toBlobURL } from "https://unpkg.com/@ffmpeg/util@0.12.2/dist/esm/index.js";

const presets = {
  small: { resolution: "720", crf: 33, label: "压缩优先" },
  balanced: { resolution: "1080", crf: 30, label: "普通" },
  clear: { resolution: "1080", crf: 26, label: "清晰" },
};

const els = {
  fileInput: document.querySelector("#fileInput"),
  dropZone: document.querySelector("#dropZone"),
  fileSummary: document.querySelector("#fileSummary"),
  fileName: document.querySelector("#fileName"),
  fileMeta: document.querySelector("#fileMeta"),
  clearFile: document.querySelector("#clearFile"),
  preview: document.querySelector("#preview"),
  resolution: document.querySelector("#resolution"),
  quality: document.querySelector("#quality"),
  qualityLabel: document.querySelector("#qualityLabel"),
  stripAudio: document.querySelector("#stripAudio"),
  compressBtn: document.querySelector("#compressBtn"),
  progressPanel: document.querySelector("#progressPanel"),
  statusText: document.querySelector("#statusText"),
  progressText: document.querySelector("#progressText"),
  progressBar: document.querySelector("#progressBar"),
  resultPanel: document.querySelector("#resultPanel"),
  beforeSize: document.querySelector("#beforeSize"),
  afterSize: document.querySelector("#afterSize"),
  savedSize: document.querySelector("#savedSize"),
  downloadLink: document.querySelector("#downloadLink"),
  errorBox: document.querySelector("#errorBox"),
};

let selectedFile = null;
let sourceUrl = null;
let outputUrl = null;
let ffmpeg = null;
let ffmpegReady = false;

window.lucide?.createIcons();

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.warn("Service worker registration failed", error);
    });
  });
}

function setPreset(value) {
  const preset = presets[value];
  if (!preset) return;

  els.resolution.value = preset.resolution;
  els.quality.value = String(preset.crf);
  updateQualityLabel();

  document.querySelectorAll(".preset").forEach((label) => {
    label.classList.toggle("is-active", label.querySelector("input").value === value);
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

function cleanName(name) {
  const base = name.replace(/\.[^.]+$/, "");
  return `${base || "compressed"}-compressed.mp4`;
}

function showError(message) {
  els.errorBox.textContent = message;
  els.errorBox.classList.remove("is-hidden");
}

function clearError() {
  els.errorBox.textContent = "";
  els.errorBox.classList.add("is-hidden");
}

function setProgress(ratio, status) {
  const safeRatio = Math.max(0, Math.min(1, ratio || 0));
  const percent = Math.round(safeRatio * 100);
  els.statusText.textContent = status;
  els.progressText.textContent = `${percent}%`;
  els.progressBar.style.width = `${percent}%`;
}

function setBusy(isBusy) {
  els.compressBtn.disabled = isBusy || !selectedFile;
  els.compressBtn.querySelector("span").textContent = isBusy ? "压缩中" : "开始压缩";
}

function resetResult() {
  if (outputUrl) URL.revokeObjectURL(outputUrl);
  outputUrl = null;
  els.resultPanel.classList.add("is-hidden");
  els.downloadLink.removeAttribute("href");
}

function setSelectedFile(file) {
  clearError();
  resetResult();

  if (!file) return;
  const videoExt = /\.(mp4|mov|m4v|webm|avi|mkv)$/i.test(file.name);
  if (!file.type.startsWith("video/") && !videoExt) {
    showError("请选择视频文件。");
    return;
  }

  selectedFile = file;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = URL.createObjectURL(file);

  els.fileName.textContent = file.name;
  els.fileMeta.textContent = `${formatSize(file.size)} · ${file.type || "video"}`;
  els.fileSummary.classList.remove("is-hidden");
  els.preview.src = sourceUrl;
  els.preview.classList.remove("is-hidden");
  els.compressBtn.disabled = false;
}

function clearFile() {
  selectedFile = null;
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = null;
  resetResult();
  els.fileInput.value = "";
  els.preview.removeAttribute("src");
  els.preview.classList.add("is-hidden");
  els.fileSummary.classList.add("is-hidden");
  els.progressPanel.classList.add("is-hidden");
  els.compressBtn.disabled = true;
  clearError();
}

async function getFFmpeg() {
  if (ffmpegReady) return ffmpeg;

  if (!ffmpeg) {
    ffmpeg = new FFmpeg();
    ffmpeg.on("progress", ({ progress }) => {
      setProgress(progress, "正在压缩");
    });
    ffmpeg.on("log", ({ message }) => {
      if (message.includes("time=")) setProgress(0.5, "正在编码");
    });
  }

  setProgress(0.04, "加载压缩引擎");
  const baseURL = "https://unpkg.com/@ffmpeg/core@0.12.10/dist/esm";
  await ffmpeg.load({
    coreURL: await toBlobURL(`${baseURL}/ffmpeg-core.js`, "text/javascript"),
    wasmURL: await toBlobURL(`${baseURL}/ffmpeg-core.wasm`, "application/wasm"),
  });
  ffmpegReady = true;
  return ffmpeg;
}

function buildArgs(inputName, outputName) {
  const args = ["-i", inputName];
  const maxSide = els.resolution.value;

  if (maxSide !== "source") {
    args.push(
      "-vf",
      `scale='if(gt(iw,ih),min(${maxSide},iw),-2)':'if(gt(iw,ih),-2,min(${maxSide},ih))'`,
    );
  }

  args.push(
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    els.quality.value,
    "-movflags",
    "+faststart",
  );

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
  els.progressPanel.classList.remove("is-hidden");
  setBusy(true);
  setProgress(0, "准备中");

  const inputName = `input-${Date.now()}.${selectedFile.name.split(".").pop() || "mp4"}`;
  const outputName = `output-${Date.now()}.mp4`;

  try {
    const engine = await getFFmpeg();
    setProgress(0.08, "读取视频");
    await engine.writeFile(inputName, await fetchFile(selectedFile));

    await engine.exec(buildArgs(inputName, outputName));
    setProgress(0.96, "生成文件");

    const data = await engine.readFile(outputName);
    const blob = new Blob([data.buffer], { type: "video/mp4" });
    outputUrl = URL.createObjectURL(blob);

    els.beforeSize.textContent = formatSize(selectedFile.size);
    els.afterSize.textContent = formatSize(blob.size);
    const savedRatio = Math.max(0, 1 - blob.size / selectedFile.size);
    els.savedSize.textContent = `${Math.round(savedRatio * 100)}%`;
    els.downloadLink.href = outputUrl;
    els.downloadLink.download = cleanName(selectedFile.name);
    els.resultPanel.classList.remove("is-hidden");
    setProgress(1, "完成");

    await engine.deleteFile(inputName).catch(() => {});
    await engine.deleteFile(outputName).catch(() => {});
  } catch (error) {
    console.error(error);
    showError("压缩失败。请换一个视频试试，或降低分辨率后重试。");
    setProgress(0, "失败");
  } finally {
    setBusy(false);
  }
}

els.dropZone.addEventListener("click", () => els.fileInput.click());
els.fileInput.addEventListener("change", (event) => {
  setSelectedFile(event.target.files?.[0]);
});
els.clearFile.addEventListener("click", clearFile);
els.compressBtn.addEventListener("click", compressVideo);
els.quality.addEventListener("input", updateQualityLabel);

document.querySelectorAll('input[name="preset"]').forEach((input) => {
  input.addEventListener("change", () => setPreset(input.value));
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
