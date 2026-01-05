export type PipelineStep = {
  tool: "ffmpeg" | "magick" | "sox";
  args: string[];
  inputFileId?: string;
  inputFileIds?: string[];
  outputExt: string;
  reasoning?: string;
};

export type PipelineCommand = {
  steps: PipelineStep[];
};

const DEFAULT_MODEL = "gpt-4o-mini";

export async function callAiForCommand(options: {
  prompt: string;
  files: Array<{ id: string; name: string; type: string; alias?: string }>;
  apiKey?: string | null;
  baseUrl?: string | null;
  model?: string | null;
}) {
  const apiKey = options.apiKey?.trim() || process.env.AI_API_KEY;
  if (!apiKey) {
    throw new Error("缺少 AI_API_KEY 环境变量。");
  }

  const baseUrl =
    options.baseUrl?.trim() || process.env.AI_BASE_URL || "https://api.openai.com/v1";
  const model = options.model?.trim() || process.env.AI_MODEL || DEFAULT_MODEL;

  const fileIds = options.files.map((file) => file.id);
  const aliasIds = options.files
    .map((file) => file.alias?.trim())
    .filter((alias): alias is string => Boolean(alias));
  const availableIds = [...new Set([...fileIds, ...aliasIds])].join(", ");
  const system = `你是多媒体命令生成器。仅输出 JSON，遵循以下 schema：\n` +
    `{"steps":[{"tool":"ffmpeg|magick|sox","args":["..."],"inputFileIds":["file-1"],"outputExt":"..."}]}\n` +
    `要求：\n` +
    `1) 每一步 args 必须包含 {output} 占位符。\n` +
    `2) args 中必须包含一个或多个 {input:...} 占位符（文件 id 或素材代号）。\n` +
    `3) 可以引用上一步输出，使用 {input:step-1}、{input:step-2}，但第 1 步不能引用 step-1。\n` +
    `4) 不要输出任何解释文字。\n` +
    `5) outputExt 必须是合理的扩展名，如 mp4, mp3, wav, png, jpg 等。\n` +
    `6) 只能使用提供的文件 id 或已生成的 step id。\n` +
    `7) 如果需要拼接/合并视频（concat），必须先统一分辨率、像素比例、帧率与音频采样率（例如 scale+pad+fps+setsar+aresample），否则会报错。\n` +
    `8) 如果需要添加字幕/文字（含中文），优先使用 FFmpeg drawtext 并指定 UTF-8 与字体名称（如 font='PingFang SC' 或 font='Noto Sans CJK SC'），确保不乱码；若使用字幕文件，请加 -sub_charenc UTF-8。\n` +
    `9) 若需要音视频拼接或复杂滤镜，请明确分离视频链与音频链（视频链仅含 scale/pad/fps/setsar，音频链仅含 aresample），concat 使用 [v0][a0][v1][a1] 这类映射，避免将视频滤镜输出接到音频滤镜输入。\n` +
    `10) 若需要设置封面图（attached_pic），请使用额外输入并在输出时 map，不要将封面图加入 filter_complex。\n` +
    `11) 拼接前请统一 SAR（像素比例），视频链中添加 setsar=1，避免 concat 报错。\n` +
    `12) 输出视频请设置像素格式 yuv420p，输出音频优先 AAC 48kHz 立体声。\n` +
    `13) ImageMagick/SoX 命令也必须使用 {input:...} 与 {output}，不要使用绝对路径或相对路径跳转（如 ../）。\n` +
    `14) 若用户为素材设置了代号，可用 {input:alias} 引用该素材。\n` +
    `15) 可用文件 id 列表：${availableIds}`;

  const user = {
    prompt: options.prompt,
    files: options.files,
    availableIds: [...new Set([...fileIds, ...aliasIds])]
  };

  const content = await requestCompletion({
    apiKey,
    baseUrl,
    model,
    system,
    user
  });

  let parsed = safeJsonParse<PipelineCommand | PipelineStep>(content);
  if (!parsed) {
    const retryContent = await requestCompletion({
      apiKey,
      baseUrl,
      model,
      system: `${system}\n你上次输出无效。只输出符合 schema 的 JSON，不要解释。`,
      user
    });
    parsed = safeJsonParse<PipelineCommand | PipelineStep>(retryContent);
  }

  if (!parsed) {
    throw new Error("无法解析 AI 返回的 JSON。");
  }

  if (isPipelineCommand(parsed)) {
    return parsed;
  }

  if (isPipelineStep(parsed)) {
    return { steps: [parsed] };
  }

  throw new Error("AI 返回格式不符合要求。");
}

async function requestCompletion(options: {
  apiKey: string;
  baseUrl: string;
  model: string;
  system: string;
  user: { prompt: string; files: Array<{ id: string; name: string; type: string; alias?: string }>; availableIds: string[] };
}) {
  const response = await fetch(`${options.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${options.apiKey}`
    },
    body: JSON.stringify({
      model: options.model,
      messages: [
        { role: "system", content: options.system },
        { role: "user", content: JSON.stringify(options.user) }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`AI 请求失败: ${detail}`);
  }

  const data = await response.json();
  const content = data?.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error("AI 返回内容为空。");
  }

  return content;
}

function safeJsonParse<T>(input: string): T | null {
  try {
    return JSON.parse(input) as T;
  } catch {
    const match = input.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      return JSON.parse(match[0]) as T;
    } catch {
      return null;
    }
  }
}

function isPipelineCommand(value: unknown): value is PipelineCommand {
  if (!value || typeof value !== "object") return false;
  const maybe = value as PipelineCommand;
  return Array.isArray(maybe.steps);
}

function isPipelineStep(value: unknown): value is PipelineStep {
  if (!value || typeof value !== "object") return false;
  const maybe = value as PipelineStep;
  return typeof maybe.tool === "string" && Array.isArray(maybe.args);
}
