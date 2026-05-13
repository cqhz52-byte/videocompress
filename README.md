# 手机视频压缩与字幕翻译

一个面向手机使用的 PWA 工具，支持视频压缩、语音生成翻译字幕、硬字幕 OCR 翻译。

## 功能

- 视频压缩：浏览器本地处理，不上传完整视频。
- 语音转字幕：手机端提取压缩音频，上传音频到后端，阿里 Paraformer 识别语音，DeepSeek/通义翻译成中文字幕。
- 硬字幕识别：手机端从画面底部截帧，用 Tesseract.js OCR 识别字幕，再通过后端翻译。
- 导出字幕：生成中文字幕 `.srt` 和双语 `.srt`。

## 本地运行

静态预览：

```powershell
python -m http.server 5174
```

带后端 API 调试：

```powershell
npm install
npm run dev
```

## Vercel 环境变量

语音转字幕需要以下环境变量：

```text
DASHSCOPE_API_KEY=阿里百炼 API Key
ALIYUN_ACCESS_KEY_ID=阿里云 AccessKey ID
ALIYUN_ACCESS_KEY_SECRET=阿里云 AccessKey Secret
ALIYUN_OSS_REGION=oss-cn-hangzhou
ALIYUN_OSS_BUCKET=你的临时音频 bucket
ALIYUN_OSS_PREFIX=videocompress/audio
PARAFORMER_MODEL=paraformer-v2
```

翻译默认使用 DeepSeek：

```text
DEEPSEEK_API_KEY=DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

也可以改用通义千问翻译：

```text
TRANSLATE_PROVIDER=qwen
QWEN_TRANSLATE_MODEL=qwen-turbo
```

## 手机上安装

部署到 HTTPS 网站后，用手机浏览器打开网站：

- Android Chrome / Edge：菜单里选择“添加到主屏幕”或“安装应用”。
- iPhone Safari：分享按钮里选择“添加到主屏幕”。

## 隐私说明

- 视频压缩和硬字幕截帧在手机浏览器本地进行。
- 语音转字幕只上传从视频中提取出的压缩音频，不上传完整视频。
- 翻译会把识别出的字幕文本发送给配置的翻译模型。
- 临时上传到 OSS 的音频会在转写完成后由后端尝试删除。
