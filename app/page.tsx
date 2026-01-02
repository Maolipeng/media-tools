"use client";

import { useEffect, useState } from "react";

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
  const [filename, setFilename] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [customModel, setCustomModel] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [previews, setPreviews] = useState<
    Array<{ name: string; type: string; url: string; index: number }>
  >([]);
  const [activePreview, setActivePreview] = useState<{
    name: string;
    type: string;
    url: string;
    index: number;
  } | null>(null);

  const modelOptions = [
    "gpt-4o-mini",
    "gpt-4o",
    "o3-mini",
    "o1-mini",
    "claude-3-5-sonnet",
    "deepseek-chat",
    "deepseek-reasoner",
    "qwen2.5-72b",
    "custom"
  ];

  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const persistSettings = (next: {
    apiKey: string;
    baseUrl: string;
    model: string;
    customModel: string;
  }) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("media-tools-settings", JSON.stringify(next));
  };

  const loadSettings = () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("media-tools-settings");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as {
        apiKey?: string;
        baseUrl?: string;
        model?: string;
        customModel?: string;
      };
      if (parsed.apiKey) setApiKey(parsed.apiKey);
      if (parsed.baseUrl) setBaseUrl(parsed.baseUrl);
      if (parsed.model) setModel(parsed.model);
      if (parsed.customModel) setCustomModel(parsed.customModel);
    } catch {
      // ignore invalid settings
    }
  };

  useEffect(() => {
    loadSettings();
  }, []);

  useEffect(() => {
    if (files.length === 0) {
      setPreviews([]);
      return;
    }

    const next = files.map((file, index) => ({
      name: file.name,
      type: file.type,
      url: URL.createObjectURL(file),
      index
    }));
    setPreviews(next);

    return () => {
      next.forEach((item) => URL.revokeObjectURL(item.url));
    };
  }, [files]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setStatus(null);
    setDownloadUrl(null);
    setFilename(null);

    if (files.length === 0) {
      setStatus("请先选择一个或多个媒体文件。");
      return;
    }

    if (!prompt.trim()) {
      setStatus("请用自然语言描述你的处理需求。");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("prompt", prompt);
    if (apiKey.trim()) formData.append("apiKey", apiKey.trim());
    if (baseUrl.trim()) formData.append("baseUrl", baseUrl.trim());
    if (resolvedModel) formData.append("model", resolvedModel);

    setIsLoading(true);
    try {
      console.log("[media-tools] submit", {
        prompt,
        files: files.map((file) => ({
          name: file.name,
          type: file.type,
          size: file.size
        })),
        baseUrl: baseUrl.trim() || "(env)",
        model: resolvedModel || "(env)"
      });
      const response = await fetch("/api/process", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const error = await response.json();
        console.error("[media-tools] request failed", error);
        setStatus(error?.error ?? "处理失败，请检查后台日志。");
        return;
      }

      const contentType = response.headers.get("content-type") ?? "";
      if (contentType.includes("application/json")) {
        const data = await response.json();
        console.log("[media-tools] response json", data);
        setStatus(data?.message ?? "处理成功。");
        return;
      }

      const blob = await response.blob();
      console.log("[media-tools] response blob", {
        size: blob.size,
        type: blob.type
      });
      const download = URL.createObjectURL(blob);
      const suggestedName = response.headers.get("x-output-filename");
      setDownloadUrl(download);
      setFilename(suggestedName || "output.bin");
      setStatus("处理完成，点击下载结果。");
    } catch (error) {
      console.error("[media-tools] request error", error);
      setStatus("请求失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <section className="hero">
        <h1>多媒体处理工作台</h1>
        <p>
          上传视频、图片或音频，用自然语言描述你的需求。系统会调用 AI
          生成 FFmpeg、ImageMagick 或 SoX 命令并执行，将处理结果返回给你。
        </p>
      </section>

      <section className="panel">
        <form className="form-grid" onSubmit={handleSubmit}>
          <button
            type="button"
            onClick={() => {
              setShowSettings(true);
              loadSettings();
            }}
          >
            打开设置
          </button>
          <div>
            <label htmlFor="files">上传媒体文件（支持多选）</label>
            <input
              id="files"
              type="file"
              multiple
              accept="video/*,image/*,audio/*"
              onChange={(event) => {
                const nextFiles = Array.from(event.target.files ?? []);
                if (nextFiles.length > 0) {
                  setFiles((prev) => [...prev, ...nextFiles]);
                }
                event.target.value = "";
              }}
            />
          </div>

          {previews.length > 0 && (
            <div className="preview-grid">
              {previews.map((preview) => {
                if (preview.type.startsWith("image/")) {
                  return (
                    <div key={preview.url} className="preview-card">
                      <button
                        type="button"
                        className="preview-thumb"
                        onClick={() => setActivePreview(preview)}
                      >
                        <img src={preview.url} alt={preview.name} />
                      </button>
                      <div className="preview-caption">{preview.name}</div>
                      <button
                        type="button"
                        className="preview-remove"
                        onClick={() => {
                          setFiles((prev) => prev.filter((_, idx) => idx !== preview.index));
                          setActivePreview(null);
                        }}
                      >
                        移除
                      </button>
                    </div>
                  );
                }

                if (preview.type.startsWith("video/")) {
                  return (
                    <div key={preview.url} className="preview-card">
                      <button
                        type="button"
                        className="preview-thumb"
                        onClick={() => setActivePreview(preview)}
                      >
                        <video src={preview.url} muted playsInline />
                      </button>
                      <div className="preview-caption">{preview.name}</div>
                      <button
                        type="button"
                        className="preview-remove"
                        onClick={() => {
                          setFiles((prev) => prev.filter((_, idx) => idx !== preview.index));
                          setActivePreview(null);
                        }}
                      >
                        移除
                      </button>
                    </div>
                  );
                }

                if (preview.type.startsWith("audio/")) {
                  return (
                    <div key={preview.url} className="preview-card preview-audio">
                      <button
                        type="button"
                        className="preview-thumb"
                        onClick={() => setActivePreview(preview)}
                      >
                        <div className="preview-audio-icon">音频</div>
                      </button>
                      <div className="preview-caption">{preview.name}</div>
                      <button
                        type="button"
                        className="preview-remove"
                        onClick={() => {
                          setFiles((prev) => prev.filter((_, idx) => idx !== preview.index));
                          setActivePreview(null);
                        }}
                      >
                        移除
                      </button>
                    </div>
                  );
                }

                return (
                  <div key={preview.url} className="preview-card">
                    <button
                      type="button"
                      className="preview-thumb"
                      onClick={() => setActivePreview(preview)}
                    >
                      <div className="preview-file">文件</div>
                    </button>
                    <div className="preview-caption">{preview.name}</div>
                    <button
                      type="button"
                      className="preview-remove"
                      onClick={() => {
                        setFiles((prev) => prev.filter((_, idx) => idx !== preview.index));
                        setActivePreview(null);
                      }}
                    >
                      移除
                    </button>
                  </div>
                );
              })}
            </div>
          )}

          <div>
            <label htmlFor="prompt">操作描述</label>
            <textarea
              id="prompt"
              placeholder="例如：把视频剪成 15 秒、压缩为 720p，并提取音频。"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
          </div>


          <button type="submit" disabled={isLoading}>
            {isLoading ? "处理中..." : "开始处理"}
          </button>

          <p className="notice">
            提示：请确保服务器已安装 FFmpeg、ImageMagick、SoX。设置会保存在浏览器本地。
          </p>
        </form>

        {(status || downloadUrl) && (
          <div className="output">
            {status && <div>{status}</div>}
            {downloadUrl && (
              <a href={downloadUrl} download={filename ?? undefined}>
                下载结果：{filename}
              </a>
            )}
          </div>
        )}
      </section>

      {showSettings && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setShowSettings(false)}
        >
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>设置</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowSettings(false)}
              >
                关闭
              </button>
            </div>

            <div className="form-grid">
              <div>
                <label htmlFor="apiKey">AI API Key（可选，留空使用服务器环境变量）</label>
                <input
                  id="apiKey"
                  type="password"
                  placeholder="sk-..."
                  value={apiKey}
                  onChange={(event) => {
                    const next = event.target.value;
                    setApiKey(next);
                    persistSettings({
                      apiKey: next,
                      baseUrl,
                      model,
                      customModel
                    });
                  }}
                />
              </div>

              <div>
                <label htmlFor="baseUrl">AI Base URL（可选）</label>
                <input
                  id="baseUrl"
                  type="text"
                  placeholder="https://api.openai.com/v1"
                  value={baseUrl}
                  onChange={(event) => {
                    const next = event.target.value;
                    setBaseUrl(next);
                    persistSettings({
                      apiKey,
                      baseUrl: next,
                      model,
                      customModel
                    });
                  }}
                />
              </div>

              <div>
                <label htmlFor="model">AI Model（可选）</label>
                <select
                  id="model"
                  value={model}
                  onChange={(event) => {
                    const next = event.target.value;
                    setModel(next);
                    persistSettings({
                      apiKey,
                      baseUrl,
                      model: next,
                      customModel
                    });
                  }}
                >
                  {modelOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </div>

              {model === "custom" && (
                <div>
                  <label htmlFor="customModel">自定义模型名称</label>
                  <input
                    id="customModel"
                    type="text"
                    placeholder="my-model-name"
                    value={customModel}
                    onChange={(event) => {
                      const next = event.target.value;
                      setCustomModel(next);
                      persistSettings({
                        apiKey,
                        baseUrl,
                        model,
                        customModel: next
                      });
                    }}
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {activePreview && (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          onClick={() => setActivePreview(null)}
        >
          <div className="modal preview-modal" onClick={(event) => event.stopPropagation()}>
            <div className="modal-header">
              <h2>预览</h2>
              <button
                type="button"
                className="modal-close"
                onClick={() => setActivePreview(null)}
              >
                关闭
              </button>
            </div>
            <div className="preview-modal-body">
              {activePreview.type.startsWith("image/") && (
                <img src={activePreview.url} alt={activePreview.name} />
              )}
              {activePreview.type.startsWith("video/") && (
                <video src={activePreview.url} controls />
              )}
              {activePreview.type.startsWith("audio/") && (
                <audio src={activePreview.url} controls />
              )}
              {!activePreview.type.startsWith("image/") &&
                !activePreview.type.startsWith("video/") &&
                !activePreview.type.startsWith("audio/") && (
                  <div className="preview-file">{activePreview.name}</div>
                )}
            </div>
            <div className="preview-modal-name">{activePreview.name}</div>
          </div>
        </div>
      )}
    </main>
  );
}
