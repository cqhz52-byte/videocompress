const fs = require("node:fs/promises");
const path = require("node:path");
const OSS = require("ali-oss");
const formidableModule = require("formidable");

const parseForm = (req) =>
  new Promise((resolve, reject) => {
    const formidable = formidableModule.formidable || formidableModule;
    const form = formidable({
      maxFileSize: 80 * 1024 * 1024,
      multiples: false,
    });
    form.parse(req, (error, fields, files) => {
      if (error) reject(error);
      else resolve({ fields, files });
    });
  });

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function fieldValue(value, fallback = "") {
  if (Array.isArray(value)) return value[0] || fallback;
  return value || fallback;
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing environment variable: ${name}`);
  return value;
}

function createOssClient() {
  return new OSS({
    region: requireEnv("ALIYUN_OSS_REGION"),
    bucket: requireEnv("ALIYUN_OSS_BUCKET"),
    accessKeyId: requireEnv("ALIYUN_ACCESS_KEY_ID"),
    accessKeySecret: requireEnv("ALIYUN_ACCESS_KEY_SECRET"),
    secure: true,
  });
}

async function uploadToOss(file) {
  const client = createOssClient();
  const prefix = process.env.ALIYUN_OSS_PREFIX || "videocompress/audio";
  const ext = path.extname(file.originalFilename || "") || ".m4a";
  const objectName = `${prefix}/${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
  await client.put(objectName, file.filepath);
  return {
    objectName,
    url: client.signatureUrl(objectName, { expires: 3600 }),
  };
}

async function submitParaformerTask(audioUrl, sourceLang) {
  const response = await fetch("https://dashscope.aliyuncs.com/api/v1/services/audio/asr/transcription", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${requireEnv("DASHSCOPE_API_KEY")}`,
      "Content-Type": "application/json",
      "X-DashScope-Async": "enable",
    },
    body: JSON.stringify({
      model: process.env.PARAFORMER_MODEL || "paraformer-v2",
      input: {
        file_urls: [audioUrl],
        source_language: sourceLang || "en",
      },
      parameters: {
        channel_id: [0],
        disfluency_removal_enabled: true,
        timestamp_alignment_enabled: true,
      },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.message || data.error?.message || "Paraformer submit failed.");
  }
  const taskId = data.output?.task_id || data.task_id;
  if (!taskId) throw new Error("Paraformer did not return task_id.");
  return taskId;
}

async function pollParaformerTask(taskId) {
  const deadline = Date.now() + 280000;
  while (Date.now() < deadline) {
    const response = await fetch(`https://dashscope.aliyuncs.com/api/v1/tasks/${taskId}`, {
      headers: {
        Authorization: `Bearer ${requireEnv("DASHSCOPE_API_KEY")}`,
      },
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data.message || data.error?.message || "Paraformer polling failed.");
    }

    const status = data.output?.task_status || data.task_status;
    if (status === "SUCCEEDED") return data;
    if (status === "FAILED" || status === "CANCELED") {
      throw new Error(data.output?.message || `Paraformer task ${status}.`);
    }
    await new Promise((resolve) => setTimeout(resolve, 3000));
  }
  throw new Error("Paraformer task timed out.");
}

async function fetchTranscriptionResult(taskData) {
  const results = taskData.output?.results || taskData.results || [];
  const first = results[0] || {};
  const transcriptionUrl = first.transcription_url || first.url || first.result_url;
  if (!transcriptionUrl) return taskData;

  const response = await fetch(transcriptionUrl);
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error("Failed to fetch transcription result.");
  return data;
}

function msToSeconds(value) {
  const number = Number(value || 0);
  return number > 1000 ? number / 1000 : number;
}

function extractSegments(result) {
  const transcripts = result.transcripts || result.results || result.output?.results || [];
  const sentences = [];

  for (const transcript of transcripts) {
    if (Array.isArray(transcript.sentences)) {
      sentences.push(...transcript.sentences);
    }
    if (Array.isArray(transcript.transcription?.sentences)) {
      sentences.push(...transcript.transcription.sentences);
    }
  }

  if (Array.isArray(result.sentences)) {
    sentences.push(...result.sentences);
  }

  return sentences
    .map((item, index) => ({
      id: index + 1,
      start: msToSeconds(item.begin_time ?? item.start_time ?? item.start ?? item.begin),
      end: msToSeconds(item.end_time ?? item.end ?? item.stop),
      text: String(item.text || item.sentence || "").trim(),
    }))
    .filter((item) => item.text);
}

async function translateSegments(sourceLang, targetLang, segments, req) {
  const protocol = req.headers["x-forwarded-proto"] || "http";
  const host = req.headers["x-forwarded-host"] || req.headers.host;
  const response = await fetch(`${protocol}://${host}/api/translate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceLang, targetLang, segments }),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Translation failed.");
  return data.segments;
}

async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  let uploaded;
  try {
    const { fields, files } = await parseForm(req);
    const audio = Array.isArray(files.audio) ? files.audio[0] : files.audio;
    if (!audio) throw new Error("Missing audio file.");

    const sourceLang = fieldValue(fields.sourceLang, "en");
    const targetLang = fieldValue(fields.targetLang, "zh-CN");
    uploaded = await uploadToOss(audio);
    const taskId = await submitParaformerTask(uploaded.url, sourceLang);
    const taskData = await pollParaformerTask(taskId);
    const result = await fetchTranscriptionResult(taskData);
    const sourceSegments = extractSegments(result);
    if (!sourceSegments.length) throw new Error("No speech subtitles were detected.");

    const translated = await translateSegments(sourceLang, targetLang, sourceSegments, req);
    json(res, 200, { taskId, segments: translated });
  } catch (error) {
    json(res, 500, { error: error.message || "Transcription failed" });
  } finally {
    if (uploaded?.objectName) {
      createOssClient().delete(uploaded.objectName).catch(() => {});
    }
  }
}

module.exports = handler;
module.exports.config = {
  api: {
    bodyParser: false,
  },
};
