# 手机视频压缩与字幕翻译

一个面向手机使用的 PWA 工具，支持视频压缩、语音生成翻译字幕、硬字幕 OCR 翻译。

## 功能

- 视频压缩：浏览器本地处理，不上传完整视频。
- 语音转字幕：手机端本地快速提取音频，准备接入本地语音转文字模型。
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

## API 环境变量

翻译默认使用 DeepSeek：

```text
DEEPSEEK_API_KEY=DeepSeek API Key
DEEPSEEK_MODEL=deepseek-chat
```

GitHub Pages 只有静态页面，不能隐藏服务端 Key。当前页面只做本地视频处理和本地音频提取；AI 翻译需要后续接入后端或明确接受前端输入 Key 的风险。


## 手机上安装

部署到 HTTPS 网站后，用手机浏览器打开网站：

- Android Chrome / Edge：菜单里选择“添加到主屏幕”或“安装应用”。
- iPhone Safari：分享按钮里选择“添加到主屏幕”。

## 隐私说明

- 视频压缩和硬字幕截帧在手机浏览器本地进行。
- 语音流程当前只在手机本地提取音频，不上传到阿里云。
- 翻译会把识别出的字幕文本发送给配置的翻译模型。
