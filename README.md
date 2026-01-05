# Media Tools

使用 Next.js 搭建的多媒体处理工具：上传视频/图片/音频，用自然语言描述操作，由 AI 生成 FFmpeg / ImageMagick / SoX 命令并执行，结果保存为可继续处理的中间态。

## 功能亮点

- 自然语言生成命令：自动产出 FFmpeg / ImageMagick / SoX 流水线
- 多步骤处理：支持步骤间引用输出
- 会话式中间态：处理结果持久化，右侧可勾选继续加工
- 模板与快捷语：内置常用模板，支持自定义模板导入导出
- 本地预览：图片/音频/视频直接在页面预览

## 依赖

- FFmpeg
- ImageMagick（可执行文件为 `magick`）
- SoX

确保已安装并在 `PATH` 中。

### 安装依赖

macOS（Homebrew）：

```
brew install ffmpeg imagemagick sox
```

Ubuntu / Debian：

```
sudo apt update
sudo apt install -y ffmpeg imagemagick sox
```

Windows（Chocolatey）：

```
choco install ffmpeg imagemagick sox
```

可选增强（字体与渲染支持，推荐用于艺术字/中文字幕）：

macOS（Homebrew）：

```
brew install ghostscript
brew install --cask font-noto-sans-cjk
```

Ubuntu / Debian：

```
sudo apt install -y ghostscript fonts-noto-cjk
```

Windows（Chocolatey）：

```
choco install ghostscript
```

## 快速开始

```
pnpm install
pnpm dev
```

打开 `http://localhost:3000` 使用。

## 配置

启动前可通过环境变量配置（也可在页面“设置”中填写，会保存到浏览器本地存储）：

```
AI_API_KEY=your_key
AI_BASE_URL=https://api.openai.com/v1
AI_MODEL=gpt-4o-mini
```

如使用 OpenAI 兼容接口，替换 `AI_BASE_URL` 与 `AI_MODEL` 即可。

## 使用流程

1. 上传一个或多个媒体文件
   - 可在右侧为每个素材填写代号（如 main、clip2、cover），后续可用 `{input:代号}` 指定目标
2. 选择需要作为输入的中间态（可选）
3. 用自然语言描述处理需求并发送
4. 结果保存到右侧“处理中间态”，可再次勾选继续加工

### 多步骤处理

AI 可返回多步骤流水线，后续步骤可引用前一步输出：

- 输入占位符：`{input:file-1}`、`{input:file-2}`
- 上一步输出：`{input:step-1}`、`{input:step-2}`
- 输出占位符：`{output}`

## 数据与存储

- 会话与结果保存在 `data/state.json`
- 产出文件保存在 `data/artifacts/`
- 默认最多保留 10 个中间态，超过会自动清理

## API

- `POST /api/process` 提交处理请求（multipart/form-data）
- `GET /api/session` 获取当前会话与中间态列表
- `POST /api/session` `{ "action": "reset" }` 清空会话
- `GET /api/artifacts/:id` 读取产出文件

## 常用脚本

- `pnpm dev` 启动开发服务
- `pnpm build` 构建生产包
- `pnpm start` 启动生产服务
- `pnpm lint` 运行 lint

## Docker 一键启动

本地一键脚本（会自动构建镜像并启动）：

```
./scripts/docker-start.sh
```

手动使用 Docker Compose：

```
docker compose up -d --build
```

快速更新（拉取代码后重新构建并重启）：

```
docker compose up -d --build
```

默认使用 `3000` 端口，并将 `./data` 挂载到容器内的 `/app/data` 以持久化中间态。

Docker 镜像已包含 FFmpeg / ImageMagick / SoX，无需在宿主机单独安装。
容器内已安装中文字体（Noto Sans SC），用于 FFmpeg drawtext 免乱码。
