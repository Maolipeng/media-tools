"use client";

import { useEffect, useMemo, useRef, useState } from "react";

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

type PipelineNode = {
  id: string;
  label: string;
  meta: string;
  status: "idle" | "ready" | "active" | "done";
};

type PipelineRow = {
  id: string;
  nodes: PipelineNode[];
  variant?: "branch";
};

const recipeFallback = [
  "识别输入素材类型与目标格式",
  "解析语言指令生成操作序列",
  "匹配工具链并确定参数",
  "输出可复用的中间态结果"
];

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
  const [activeMediaType, setActiveMediaType] = useState<"video" | "audio" | "image">(
    "video"
  );
  const [focusedArtifactId, setFocusedArtifactId] = useState<string | null>(null);
  const [compareSplit, setCompareSplit] = useState(52);
  const [showCommandLens, setShowCommandLens] = useState(false);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(null);
  const [hoverNodeId, setHoverNodeId] = useState<string | null>(null);
  const [sproutSeed, setSproutSeed] = useState(0);

  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [model, setModel] = useState("gpt-4o-mini");
  const [customModel, setCustomModel] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [appendMode, setAppendMode] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<
    Array<{ title: string; text: string }>
  >([]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);

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

  const promptTemplates = [
    {
      title: "电影感字幕",
      text: "给视频添加中文字幕“在路上”，使用电影感大字，白字黑描边，底部居中，轻微淡入淡出。"
    },
    {
      title: "霓虹弹跳字幕",
      text: "给视频添加字幕“哈哈哈哈哈”，霓虹发光效果，弹跳入场，停留 2 秒后淡出。"
    },
    {
      title: "卡拉OK高亮",
      text: "为视频添加逐字高亮字幕，使用 PingFang SC 字体，黄色高亮，底部居中。"
    },
    {
      title: "压缩到 20MB",
      text: "将视频压缩到 720p，码率控制在 2Mbps 左右，文件尽量控制在 20MB 以内。"
    },
    {
      title: "裁切竖屏",
      text: "将视频裁切为 9:16 竖屏，主体居中，导出为 mp4。"
    },
    {
      title: "视频合并",
      text: "把两个视频按顺序合并成一个，保证分辨率一致，并保留音频。"
    }
  ];

  const resolvedModel = model === "custom" ? customModel.trim() : model;

  const artifactMap = useMemo(() => {
    const map = new Map<string, Artifact>();
    artifacts.forEach((artifact) => map.set(artifact.id, artifact));
    return map;
  }, [artifacts]);

  const artifactsByType = useMemo(
    () => ({
      video: artifacts.filter((artifact) => artifact.contentType.startsWith("video/")),
      audio: artifacts.filter((artifact) => artifact.contentType.startsWith("audio/")),
      image: artifacts.filter((artifact) => artifact.contentType.startsWith("image/"))
    }),
    [artifacts]
  );

  const activeArtifacts = artifactsByType[activeMediaType];
  const referenceArtifact =
    selectedArtifactIds
      .map((id) => artifactMap.get(id))
      .find((artifact) => artifact) ?? null;

  const referenceMedia = referenceArtifact
    ? {
        name: referenceArtifact.name,
        type: referenceArtifact.contentType,
        url: referenceArtifact.url
      }
    : previews[0]
      ? {
          name: previews[0].name,
          type: previews[0].type,
          url: previews[0].url
        }
      : null;

  const recipeSteps = useMemo(() => {
    const cleaned = prompt
      .split(/\n|[，,。;；]/)
      .map((text) => text.trim())
      .filter(Boolean);

    if (cleaned.length === 0) {
      return recipeFallback.map((text, index) => ({
        id: `fallback-${index}`,
        text
      }));
    }

    return cleaned.slice(0, 6).map((text, index) => ({
      id: `${index}-${text.slice(0, 8)}`,
      text
    }));
  }, [prompt]);

  const pipelineRows = useMemo(() => {
    const hasInput = files.length > 0 || selectedArtifactIds.length > 0;
    const hasOutput = artifacts.length > 0;
    const latestArtifact = artifacts[artifacts.length - 1];

    const rows: PipelineRow[] = [
      {
        id: "input",
        nodes: [
          {
            id: "input",
            label: hasInput ? "Input" : "Input (Idle)",
            meta:
              files.length > 0
                ? `本地素材 ${files.length} 项`
                : selectedArtifactIds.length > 0
                  ? `中间态 ${selectedArtifactIds.length} 项`
                  : "等待素材",
            status: hasInput ? "ready" : "idle"
          }
        ]
      },
      {
        id: "recipe",
        nodes: [
          {
            id: "recipe",
            label: "Recipe",
            meta: "指令解析与编排",
            status: prompt.trim() ? "ready" : "idle"
          }
        ]
      },
      {
        id: "branch",
        variant: "branch",
        nodes: [
          {
            id: "ffmpeg-grayscale",
            label: "FFmpeg (Grayscale)",
            meta: "黑白处理",
            status: isLoading ? "active" : hasInput ? "ready" : "idle"
          },
          {
            id: "ffmpeg-audio",
            label: "FFmpeg (Extract Audio)",
            meta: "抽离音轨",
            status: isLoading ? "active" : hasInput ? "ready" : "idle"
          }
        ]
      },
      {
        id: "sox",
        nodes: [
          {
            id: "sox",
            label: "SoX",
            meta: "降噪 / 动态处理",
            status: isLoading ? "active" : hasInput ? "ready" : "idle"
          }
        ]
      },
      {
        id: "mix",
        nodes: [
          {
            id: "mix",
            label: "Mix",
            meta: "多通道合成",
            status: isLoading ? "active" : hasInput ? "ready" : "idle"
          }
        ]
      },
      {
        id: "output",
        nodes: [
          {
            id: "output",
            label: "Output",
            meta: hasOutput && latestArtifact ? latestArtifact.name : "待生成",
            status: hasOutput ? "done" : "idle"
          }
        ]
      }
    ];

    return rows;
  }, [artifacts, files.length, isLoading, prompt, selectedArtifactIds.length]);

  useEffect(() => {
    if (isLoading) {
      setSproutSeed((prev) => prev + 1);
    }
  }, [isLoading]);

  useEffect(() => {
    if (activeArtifacts.length === 0) {
      setFocusedArtifactId(null);
      return;
    }

    if (!focusedArtifactId || !activeArtifacts.some((item) => item.id === focusedArtifactId)) {
      setFocusedArtifactId(activeArtifacts[activeArtifacts.length - 1].id);
    }
  }, [activeArtifacts, focusedArtifactId]);

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

  const loadTemplates = () => {
    if (typeof window === "undefined") return;
    const raw = window.localStorage.getItem("media-tools-templates");
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw) as Array<{ title: string; text: string }>;
      if (Array.isArray(parsed)) {
        setCustomTemplates(parsed);
      }
    } catch {
      // ignore invalid templates
    }
  };

  const saveTemplates = (next: Array<{ title: string; text: string }>) => {
    if (typeof window === "undefined") return;
    window.localStorage.setItem("media-tools-templates", JSON.stringify(next));
  };

  const handleTemplateClick = (text: string) => {
    if (appendMode && prompt.trim()) {
      setPrompt((prev) => `${prev}\n${text}`);
    } else {
      setPrompt(text);
    }
  };

  const handleSaveTemplate = () => {
    const trimmed = prompt.trim();
    if (!trimmed) {
      setStatus("请输入内容后再保存模板。");
      return;
    }
    const title = trimmed.length > 12 ? `${trimmed.slice(0, 12)}...` : trimmed;
    const next = [{ title, text: trimmed }, ...customTemplates].slice(0, 8);
    setCustomTemplates(next);
    saveTemplates(next);
    setStatus("已保存为模板。");
  };

  const handleExportTemplates = () => {
    const payload = JSON.stringify(customTemplates, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "media-tools-templates.json";
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleImportTemplates = async (file: File | null) => {
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text) as Array<{ title: string; text: string }>;
      if (!Array.isArray(parsed)) {
        setStatus("模板文件格式不正确。");
        return;
      }
      const sanitized = parsed
        .filter((item) => item && typeof item.title === "string" && typeof item.text === "string")
        .slice(0, 20);
      setCustomTemplates(sanitized);
      saveTemplates(sanitized);
      setStatus("已导入模板。");
    } catch {
      setStatus("模板导入失败，请检查文件内容。");
    }
  };

  const moveTemplate = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex) return;
    setCustomTemplates((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      saveTemplates(next);
      return next;
    });
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
    setStatus("已新建实验。");
    setSelectionTouched(false);
  };

  useEffect(() => {
    loadSettings();
    loadTemplates();
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
      setStatus("处理完成，结果已进入舞台与结果区。");
      setPrompt("");
      setFiles([]);
      await loadSession();
      if (data?.artifact?.id) {
        setSelectedArtifactIds([data.artifact.id]);
        setActiveMediaType(
          data.artifact.contentType.startsWith("image/")
            ? "image"
            : data.artifact.contentType.startsWith("audio/")
              ? "audio"
              : "video"
        );
        setFocusedArtifactId(data.artifact.id);
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

  const stageArtifact =
    activeArtifacts.find((artifact) => artifact.id === focusedArtifactId) ??
    activeArtifacts[activeArtifacts.length - 1];
  const stageMedia = stageArtifact
    ? { name: stageArtifact.name, type: stageArtifact.contentType, url: stageArtifact.url }
    : null;

  const referenceKind = referenceMedia
    ? referenceMedia.type.startsWith("video/")
      ? "video"
      : referenceMedia.type.startsWith("image/")
        ? "image"
        : null
    : null;
  const stageKind = stageArtifact
    ? stageArtifact.contentType.startsWith("video/")
      ? "video"
      : stageArtifact.contentType.startsWith("image/")
        ? "image"
        : null
    : null;
  const supportsComparison = Boolean(referenceKind && stageKind && referenceKind === stageKind);

  const lensNodeId = activeNodeId ?? hoverNodeId;

  const commandLensLines = useMemo(() => {
    if (!stageArtifact) return [];
    if (lensNodeId === "sox") {
      return ["sox input.wav cleaned.wav noisered noise.prof 0.21"];
    }
    if (lensNodeId === "mix") {
      return ["ffmpeg -i video.mp4 -i cleaned.wav -filter_complex amix=inputs=2 output.mp4"];
    }
    if (lensNodeId === "ffmpeg-audio") {
      return ["ffmpeg -i input.mp4 -vn -acodec pcm_s16le audio.wav"];
    }
    if (lensNodeId === "ffmpeg-grayscale") {
      return ["ffmpeg -i input.mp4 -vf format=gray grayscale.mp4"];
    }
    if (stageArtifact.contentType.startsWith("video/")) {
      return ["ffmpeg -i input.mp4 -vf scale=1280:-2 -c:v libx264 output.mp4"];
    }
    if (stageArtifact.contentType.startsWith("audio/")) {
      return ["sox input.wav output.wav norm -3"];
    }
    return ["convert input.png -brightness-contrast 5x10 output.png"];
  }, [lensNodeId, stageArtifact]);

  const mediaTabs = [
    { id: "video" as const, label: "视频", count: artifactsByType.video.length },
    { id: "audio" as const, label: "音频", count: artifactsByType.audio.length },
    { id: "image" as const, label: "图片", count: artifactsByType.image.length }
  ];

  const commandLensVisible = showCommandLens || Boolean(lensNodeId);
  const activeNodeLabel = useMemo(() => {
    if (!activeNodeId) return null;
    for (const row of pipelineRows) {
      const match = row.nodes.find((node) => node.id === activeNodeId);
      if (match) return match.label;
    }
    return activeNodeId;
  }, [activeNodeId, pipelineRows]);

  const renderMedia = (
    media: { type: string; url: string; name: string },
    className?: string
  ) => (
    <>
      {media.type.startsWith("image/") && (
        <img src={media.url} alt={media.name} className={className} />
      )}
      {media.type.startsWith("video/") && (
        <video src={media.url} muted playsInline className={className} />
      )}
      {media.type.startsWith("audio/") && (
        <div className={className ? `${className} stage-audio` : "stage-audio"}>
          <div className="audio-ring" />
          <span>Audio Output</span>
        </div>
      )}
    </>
  );

  return (
    <main className="lab">
      <header className="lab-header">
        <div>
          <span className="eyebrow">Multimodal Lab</span>
          <h1>多模态实验室</h1>
          <p>指令即配方，结果上舞台，链路清晰可追踪。</p>
        </div>
        <div className="lab-actions">
          <button type="button" className="secondary" onClick={resetSession}>
            新建实验
          </button>
          <button
            type="button"
            className="secondary"
            onClick={() => {
              setShowSettings(true);
              loadSettings();
            }}
          >
            设置参数
          </button>
        </div>
      </header>

      <div className="lab-grid">
        <section className="lab-panel input-panel">
          <div className="panel-intro">
            <span className="panel-tag">Input & Control</span>
            <h2>指令台</h2>
            <p>极简输入 + Recipe 解析，把自然语言拆成可执行动作链。</p>
          </div>

          <div className="input-block">
            <label htmlFor="files" className="file-label">
              导入素材
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
            <div className="upload-list">
              {previews.length === 0 && (
                <span className="muted">拖入或选择媒体文件，作为输入起点。</span>
              )}
              {previews.map((preview) => (
                <div key={preview.url} className="upload-chip">
                  <span>{preview.name}</span>
                  <button
                    type="button"
                    className="chip-remove"
                    onClick={() => {
                      setFiles((prev) => prev.filter((_, idx) => idx !== preview.index));
                    }}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div className="mini-log">
            <div className="mini-log-header">
              <span>对话</span>
              <span className="muted">最近 4 条指令</span>
            </div>
            <div className="mini-log-body">
              {messages.length === 0 && <div className="muted">暂无记录，先来一句。</div>}
              {messages.slice(-4).map((message) => (
                <div key={message.id} className={`mini-log-item ${message.role}`}>
                  <span className="log-role">{message.role}</span>
                  <p>{message.content}</p>
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
          </div>

          <form className="command-form" onSubmit={handleSubmit}>
            <div className="template-bar">
              <div className="template-title-row">
                <div className="template-title">常用模板</div>
                <label className="template-toggle">
                  <input
                    type="checkbox"
                    checked={appendMode}
                    onChange={(event) => setAppendMode(event.target.checked)}
                  />
                  追加
                </label>
              </div>
              <div className="template-list">
                {promptTemplates.map((item) => (
                  <button
                    key={item.title}
                    type="button"
                    className="template-chip"
                    onClick={() => handleTemplateClick(item.text)}
                  >
                    {item.title}
                  </button>
                ))}
              </div>
              {customTemplates.length > 0 && (
                <>
                  <div className="template-title-row">
                    <div className="template-title">我的模板</div>
                    <div className="template-actions">
                      <button
                        type="button"
                        className="template-action"
                        onClick={handleExportTemplates}
                      >
                        导出
                      </button>
                      <button
                        type="button"
                        className="template-action"
                        onClick={() => importInputRef.current?.click()}
                      >
                        导入
                      </button>
                      <input
                        ref={importInputRef}
                        type="file"
                        accept="application/json"
                        className="template-import"
                        onChange={(event) => {
                          const file = event.target.files?.[0] ?? null;
                          void handleImportTemplates(file);
                          event.target.value = "";
                        }}
                      />
                    </div>
                  </div>
                  <div className="template-list">
                    {customTemplates.map((item, index) => (
                      <div
                        key={`${item.title}-${index}`}
                        className="template-item"
                        draggable
                        onDragStart={() => setDragIndex(index)}
                        onDragOver={(event) => {
                          event.preventDefault();
                        }}
                        onDrop={() => {
                          if (dragIndex === null) return;
                          moveTemplate(dragIndex, index);
                          setDragIndex(null);
                        }}
                        onDragEnd={() => setDragIndex(null)}
                      >
                        <button
                          type="button"
                          className="template-chip"
                          onClick={() => handleTemplateClick(item.text)}
                        >
                          {item.title}
                        </button>
                        <button
                          type="button"
                          className="template-remove"
                          onClick={() => {
                            const next = customTemplates.filter((_, i) => i !== index);
                            setCustomTemplates(next);
                            saveTemplates(next);
                          }}
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>

            <div className="command-input">
              <textarea
                placeholder="描述下一步处理，例如：把视频转黑白并提取背景音乐"
                value={prompt}
                onChange={(event) => setPrompt(event.target.value)}
              />
              <button type="submit" disabled={isLoading}>
                {isLoading ? "处理中..." : "运行"}
              </button>
            </div>

            <div className="command-footer">
              {status && <span className="muted">{status}</span>}
              <button type="button" className="secondary" onClick={handleSaveTemplate}>
                保存模板
              </button>
            </div>
          </form>

          <div className="recipe-panel">
            <div className="recipe-header">
              <h3>Recipe</h3>
              <span className="muted">即时拆解</span>
            </div>
            <ol className="recipe-list">
              {recipeSteps.map((step, index) => (
                <li
                  key={step.id}
                  className="recipe-step"
                  style={{ animationDelay: `${index * 0.06}s` }}
                >
                  <span className="step-index">{String(index + 1).padStart(2, "0")}</span>
                  <span>{step.text}</span>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="lab-panel theater-panel">
          <header className="panel-header theater-header">
            <div>
              <h2>Theater View</h2>
              <span className="panel-hint">在舞台上切换多模态结果。</span>
            </div>
            <div className="theater-controls">
              <div className="theater-tabs">
                {mediaTabs.map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    className={`tab-button ${activeMediaType === tab.id ? "active" : ""}`}
                    onClick={() => setActiveMediaType(tab.id)}
                  >
                    {tab.label}
                    <span className="tab-count">{tab.count}</span>
                  </button>
                ))}
              </div>
              <label className="lens-toggle">
                <input
                  type="checkbox"
                  checked={showCommandLens}
                  onChange={(event) => setShowCommandLens(event.target.checked)}
                />
                Command Lens
              </label>
            </div>
          </header>

          <div className="theater-stage">
            {stageMedia ? (
              <div
                className={`compare-stage ${supportsComparison ? "active" : ""}`}
                style={{ "--split": `${compareSplit}%` } as React.CSSProperties}
              >
                {supportsComparison && referenceMedia ? (
                  <>
                    <div className="compare-base">{renderMedia(referenceMedia, "compare-media")}</div>
                    <div className="compare-top">
                      {renderMedia(stageMedia, "compare-media")}
                    </div>
                    <div className="compare-line" />
                    <input
                      type="range"
                      min={10}
                      max={90}
                      value={compareSplit}
                      onChange={(event) => setCompareSplit(Number(event.target.value))}
                      className="compare-slider"
                      aria-label="时间穿梭对比滑块"
                    />
                  </>
                ) : (
                  <button
                    type="button"
                    className="stage-media"
                    onClick={() =>
                      setActivePreview({
                        name: stageArtifact?.name ?? "",
                        type: stageArtifact?.contentType ?? "",
                        url: stageArtifact?.url ?? "",
                        artifactId: stageArtifact?.id
                      })
                    }
                  >
                    {renderMedia(stageMedia)}
                  </button>
                )}

                {commandLensVisible && commandLensLines.length > 0 && (
                  <div className="command-lens">
                    <div className="lens-title">The Command Lens</div>
                    <pre>{commandLensLines.join("\n")}</pre>
                  </div>
                )}
              </div>
            ) : (
              <div className="stage-empty">
                <div>暂无输出</div>
                <p>运行一次指令，结果会出现在这里。</p>
              </div>
            )}
          </div>
          <div className="stage-meta">
            <div>
              <span className="muted">当前焦点</span>
              <div className="stage-title">{stageArtifact ? stageArtifact.name : "--"}</div>
            </div>
            <button
              type="button"
              className="secondary"
              disabled={!stageArtifact}
              onClick={() => {
                if (!stageArtifact) return;
                setActivePreview({
                  name: stageArtifact.name,
                  type: stageArtifact.contentType,
                  url: stageArtifact.url,
                  artifactId: stageArtifact.id
                });
              }}
            >
              放大预览
            </button>
          </div>

          <div className="theater-shelf">
            {activeArtifacts.length === 0 && (
              <div className="panel-empty">当前类型暂无结果。</div>
            )}
            <div className="shelf-grid">
              {activeArtifacts.map((artifact) => (
                <div
                  key={artifact.id}
                  className={`artifact-card ${
                    focusedArtifactId === artifact.id ? "focused" : ""
                  }`}
                >
                  <button
                    type="button"
                    className="artifact-thumb"
                    onClick={() => setFocusedArtifactId(artifact.id)}
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
                  </button>
                  <div className="artifact-caption">{artifact.name}</div>
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

        <aside className="lab-panel pipeline-panel">
          <header className="panel-header">
            <div>
              <h2>Pipeline Inspector</h2>
              <span className="panel-hint">从 Input 到 Output 的链路拓扑。</span>
            </div>
          </header>
          <div className="pipeline-graph" key={sproutSeed}>
            {(() => {
              let sproutIndex = 0;
              return pipelineRows.map((row, rowIndex) => (
                <div
                  key={row.id}
                  className={`pipeline-row ${row.variant === "branch" ? "branch" : ""}`}
                >
                  <div className="pipeline-branch">
                    {row.nodes.map((node) => {
                      const delay = `${sproutIndex * 0.08}s`;
                      sproutIndex += 1;
                      return (
                        <button
                          key={node.id}
                          type="button"
                          className={`pipeline-node ${node.status} ${
                            activeNodeId === node.id ? "selected" : ""
                          }`}
                          onClick={() =>
                            setActiveNodeId((prev) => (prev === node.id ? null : node.id))
                          }
                          onMouseEnter={() => setHoverNodeId(node.id)}
                          onMouseLeave={() =>
                            setHoverNodeId((prev) => (prev === node.id ? null : prev))
                          }
                          style={{ animationDelay: delay }}
                        >
                          <div className="node-title">{node.label}</div>
                          <div className="node-meta">{node.meta}</div>
                        </button>
                      );
                    })}
                  </div>
                  {rowIndex < pipelineRows.length - 1 && (
                    <div className={`pipeline-link ${row.variant === "branch" ? "split" : ""}`} />
                  )}
                </div>
              ));
            })()}
          </div>
          <div className="pipeline-note">
            <span className="muted">
              {activeNodeLabel
                ? `已选中「${activeNodeLabel}」，将进行局部重算。`
                : "链路层仅展示，不影响实际执行。"}
            </span>
          </div>
        </aside>
      </div>

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
