# Media Tools

使用 Next.js 搭建的多媒体处理工具：上传视频/图片/音频，用自然语言描述操作，由 AI 生成 FFmpeg / ImageMagick / SoX 命令并执行。

## 多步骤处理

AI 可返回多步骤流水线，后续步骤可引用前一步输出：

- 输入占位符：`{input:file-1}`、`{input:file-2}`
- 上一步输出：`{input:step-1}`、`{input:step-2}`
- 输出占位符：`{output}`

## 会话式处理中间态

- 处理结果会持久化到磁盘，最多保留 10 个中间态
- 后续请求可在右侧勾选中间态继续处理
- 会话与结果列表通过 `/api/session` 读取

## 环境变量

在启动前配置（或在前端设置中填写，保存在浏览器本地）：

```
AI_API_KEY=your_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

如果使用 OpenAI 兼容接口，仅需更换 `AI_BASE_URL` 与 `AI_MODEL`。

## 依赖

- FFmpeg
- ImageMagick (可执行文件为 `magick`)
- SoX

确保它们已安装并在 `PATH` 中。

## 启动

```
npm install
npm run dev
```

打开 `http://localhost:3000` 使用。
