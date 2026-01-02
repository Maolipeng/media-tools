"use client";

import { useEffect, useMemo, useState } from "react";

type Artifact = {
  id: string;
  name: string;
  contentType: string;
  size: number;
  createdAt: string;
  url: string;
};

type Message = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  artifactIds?: string[];
};

type PreviewItem = {
  name: string;
  type: string;
  url: string;
  index?: number;
  artifactId?: string;
};

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<
    Array<{ name: string; type: string; url: string; index: number }>
  >([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [artifacts, setArtifacts] = useState<Artifact[]>([]);
  const [selectedArtifactIds, setSelectedArtifactIds] = useState<string[]>([]);
  const [selectionTouched, setSelectionTouched] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [activePreview, setActivePreview] = useState<PreviewItem | null>(null);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [customModel, setCustomModel] = useState("");
  const [showSettings, setShowSettings] = useState(false);

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

  const artifactMap = useMemo(() => {
    const map = new Map<string, Artifact>();
    artifacts.forEach((artifact) => map.set(artifact.id, artifact));
    return map;
  }, [artifacts]);

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

  const loadSession = async () => {
    const response = await fetch("/api/session");
    const data = await response.json();
    const nextArtifacts = data.artifacts ?? [];
    setArtifacts(nextArtifacts);
    setMessages(data.messages ?? []);
    setSelectedArtifactIds((prev) => {
      const filtered = prev.filter((id) =>
        nextArtifacts.some((artifact: Artifact) => artifact.id === id)
      );
      if (!selectionTouched && filtered.length === 0 && nextArtifacts.length > 0) {
        return [nextArtifacts[nextArtifacts.length - 1].id];
      }
      return filtered;
    });
  };

  const resetSession = async () => {
    await fetch("/api/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset" })
    });
    setMessages([]);
    setArtifacts([]);
    setSelectedArtifactIds([]);
    setFiles([]);
    setPrompt("");
    setStatus("已新建对话。");
    setSelectionTouched(false);
  };

  useEffect(() => {
    loadSettings();
    loadSession();
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

    if (files.length === 0 && selectedArtifactIds.length === 0) {
      setStatus("请上传文件或选择一个中间态结果。");
      return;
    }

    if (!prompt.trim()) {
      setStatus("请用自然语言描述你的处理需求。");
      return;
    }

    const formData = new FormData();
    files.forEach((file) => formData.append("files", file));
    formData.append("prompt", prompt);
    formData.append("artifactIds", JSON.stringify(selectedArtifactIds));
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
        artifactIds: selectedArtifactIds,
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

      const data = await response.json();
      console.log("[media-tools] response json", data);
      setStatus("处理完成，结果已保存到右侧列表。");
      setPrompt("");
      setFiles([]);
      await loadSession();
      if (data?.artifact?.id) {
        setSelectedArtifactIds([data.artifact.id]);
      }
    } catch (error) {
      console.error("[media-tools] request error", error);
      setStatus("请求失败，请稍后再试。");
    } finally {
      setIsLoading(false);
    }
  };

  const toggleArtifactSelection = (id: string) => {
    setSelectionTouched(true);
    setSelectedArtifactIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <main className="workspace">
      <section className="chat-panel">
        <header className="chat-header">
          <div>
            <h1>多媒体处理工作台</h1>
            <p>像聊天一样描述处理需求，结果会保存为可继续处理的中间态。</p>
          </div>
          <div className="chat-header-actions">
            <button type="button" className="secondary" onClick={resetSession}>
              新建对话
            </button>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setShowSettings(true);
                loadSettings();
              }}
            >
              设置
            </button>
          </div>
        </header>

        <div className="chat-messages">
          {messages.length === 0 && (
            <div className="chat-empty">还没有记录，先发送一条处理指令吧。</div>
          )}
          {messages.map((message) => (
            <div key={message.id} className={`chat-bubble ${message.role}`}>
              <div className="chat-content">{message.content}</div>
              {message.artifactIds && message.artifactIds.length > 0 && (
                <div className="chat-attachments">
                  {message.artifactIds
                    .map((artifactId) => artifactMap.get(artifactId))
                    .filter(Boolean)
                    .map((artifact) => (
                      <button
                        key={artifact!.id}
                        type="button"
                        className="chat-chip"
                        onClick={() =>
                          setActivePreview({
                            name: artifact!.name,
                            type: artifact!.contentType,
                            url: artifact!.url,
                            artifactId: artifact!.id
                          })
                        }
                      >
                        {artifact!.name}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <form className="chat-input" onSubmit={handleSubmit}>
          <div className="chat-input-row">
            <textarea
              placeholder="描述下一步处理，例如：把上一步的结果裁成 720p，再压缩到 20MB"
              value={prompt}
              onChange={(event) => setPrompt(event.target.value)}
            />
            <button type="submit" disabled={isLoading}>
              {isLoading ? "处理中..." : "发送"}
            </button>
          </div>
          <div className="chat-actions">{status && <span className="chat-status">{status}</span>}</div>
        </form>
      </section>

      <aside className="side-panel">
        <section className="panel-block">
          <header className="panel-header">
            <h2>上传与预览</h2>
            <span className="panel-hint">支持多次选择追加</span>
          </header>
          <div className="panel-body">
            <label htmlFor="files" className="file-label">
              选择媒体文件
            </label>
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

            {previews.length > 0 && (
              <div className="preview-grid">
                {previews.map((preview) => (
                  <div key={preview.url} className="preview-card">
                    <button
                      type="button"
                      className="preview-thumb"
                      onClick={() => setActivePreview(preview)}
                    >
                      {preview.type.startsWith("image/") && (
                        <img src={preview.url} alt={preview.name} />
                      )}
                      {preview.type.startsWith("video/") && (
                        <video src={preview.url} muted playsInline />
                      )}
                      {preview.type.startsWith("audio/") && (
                        <div className="preview-audio-icon">音频</div>
                      )}
                      {!preview.type.startsWith("image/") &&
                        !preview.type.startsWith("video/") &&
                        !preview.type.startsWith("audio/") && (
                          <div className="preview-file">文件</div>
                        )}
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
                ))}
              </div>
            )}
          </div>
        </section>

        <section className="panel-block">
          <header className="panel-header">
            <h2>处理中间态</h2>
            <span className="panel-hint">最多保留 10 个结果</span>
          </header>
          <div className="panel-body">
            {artifacts.length === 0 && (
              <div className="panel-empty">暂无结果，先完成一次处理。</div>
            )}
            <div className="preview-grid">
              {artifacts.map((artifact) => (
                <div key={artifact.id} className="preview-card">
                  <button
                    type="button"
                    className="preview-thumb"
                    onClick={() =>
                      setActivePreview({
                        name: artifact.name,
                        type: artifact.contentType,
                        url: artifact.url,
                        artifactId: artifact.id
                      })
                    }
                  >
                    {artifact.contentType.startsWith("image/") && (
                      <img src={artifact.url} alt={artifact.name} />
                    )}
                    {artifact.contentType.startsWith("video/") && (
                      <video src={artifact.url} muted playsInline />
                    )}
                    {artifact.contentType.startsWith("audio/") && (
                      <div className="preview-audio-icon">音频</div>
                    )}
                    {!artifact.contentType.startsWith("image/") &&
                      !artifact.contentType.startsWith("video/") &&
                      !artifact.contentType.startsWith("audio/") && (
                        <div className="preview-file">文件</div>
                      )}
                  </button>
                  <div className="preview-caption">{artifact.name}</div>
                  <label className="preview-select">
                    <input
                      type="checkbox"
                      checked={selectedArtifactIds.includes(artifact.id)}
                      onChange={() => toggleArtifactSelection(artifact.id)}
                    />
                    用于下一步
                  </label>
                </div>
              ))}
            </div>
          </div>
        </section>
      </aside>

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
