const MAX_SEGMENTS_PER_BATCH = 60;

function json(res, status, payload) {
  res.status(status).setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getTranslateConfig() {
  const provider = process.env.TRANSLATE_PROVIDER || "deepseek";

  if (provider === "qwen") {
    return {
      apiKey: process.env.DASHSCOPE_API_KEY,
      baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions",
      model: process.env.QWEN_TRANSLATE_MODEL || "qwen-turbo",
    };
  }

  return {
    apiKey: process.env.DEEPSEEK_API_KEY,
    baseUrl: process.env.DEEPSEEK_BASE_URL || "https://api.deepseek.com/chat/completions",
    model: process.env.DEEPSEEK_MODEL || "deepseek-chat",
  };
}

function buildPrompt(sourceLang, targetLang, segments) {
  const payload = segments.map((item, index) => ({
    id: item.id || index + 1,
    text: item.text || "",
  }));

  return [
    {
      role: "system",
      content:
        "You are a professional subtitle translator. Translate subtitles accurately and naturally. Preserve meaning, names, numbers, tone, and line timing. Return strict JSON only.",
    },
    {
      role: "user",
      content: JSON.stringify({
        task: "translate_subtitle_segments",
        sourceLang,
        targetLang,
        outputSchema: { items: [{ id: 1, translation: "translated subtitle text" }] },
        rules: [
          "Return a JSON object with one key named items.",
          "Keep the same ids.",
          "Do not merge or split items.",
          "Use concise subtitle style.",
          "If source text is empty, return an empty translation.",
        ],
        segments: payload,
      }),
    },
  ];
}

function parseJsonArray(text) {
  const trimmed = String(text || "").trim();
  try {
    return JSON.parse(trimmed);
  } catch {
    const match = trimmed.match(/\[[\s\S]*\]/);
    if (!match) throw new Error("Translation model did not return JSON.");
    return JSON.parse(match[0]);
  }
}

async function translateBatch(config, sourceLang, targetLang, segments) {
  const response = await fetch(config.baseUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: buildPrompt(sourceLang, targetLang, segments),
      temperature: 0.2,
      response_format: { type: "json_object" },
    }),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error?.message || data.message || "Translation request failed.");
  }

  const content = data.choices?.[0]?.message?.content || "[]";
  const parsed = parseJsonArray(content);
  const translations = Array.isArray(parsed) ? parsed : parsed.items || parsed.segments || [];
  const byId = new Map(translations.map((item) => [String(item.id), item.translation || item.text || ""]));

  return segments.map((segment, index) => ({
    ...segment,
    translation: byId.get(String(segment.id || index + 1)) || "",
  }));
}

async function translateSegments(sourceLang, targetLang, segments) {
  const config = getTranslateConfig();
  if (!config.apiKey) {
    throw new Error("Missing translation API key. Set DEEPSEEK_API_KEY or DASHSCOPE_API_KEY.");
  }

  const normalized = segments.map((item, index) => ({
    id: item.id || index + 1,
    start: Number(item.start || 0),
    end: Number(item.end || 0),
    text: String(item.text || "").trim(),
  }));

  const translated = [];
  for (let i = 0; i < normalized.length; i += MAX_SEGMENTS_PER_BATCH) {
    const batch = normalized.slice(i, i + MAX_SEGMENTS_PER_BATCH);
    translated.push(...(await translateBatch(config, sourceLang, targetLang, batch)));
  }
  return translated;
}

async function handler(req, res) {
  if (req.method !== "POST") {
    json(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = typeof req.body === "string" ? JSON.parse(req.body) : req.body || {};
    const segments = await translateSegments(body.sourceLang || "en", body.targetLang || "zh-CN", body.segments || []);
    json(res, 200, { segments });
  } catch (error) {
    json(res, 500, { error: error.message || "Translation failed" });
  }
}

module.exports = handler;
