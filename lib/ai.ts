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
  files: Array<{ id: string; name: string; type: string }>;
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

  const availableIds = options.files.map((file) => file.id).join(", ");
  const system = `你是多媒体命令生成器。仅输出 JSON，遵循以下 schema：\n` +
    `{"steps":[{"tool":"ffmpeg|magick|sox","args":["..."],"inputFileIds":["file-1"],"outputExt":"..."}]}\n` +
    `要求：\n` +
    `1) 每一步 args 必须包含 {output} 占位符。\n` +
    `2) args 中必须包含一个或多个 {input:file-id} 占位符。\n` +
    `3) 可以引用上一步输出，使用 {input:step-1}、{input:step-2}，但第 1 步不能引用 step-1。\n` +
    `4) 不要输出任何解释文字。\n` +
    `5) outputExt 必须是合理的扩展名，如 mp4, mp3, wav, png, jpg 等。\n` +
    `6) 只能使用提供的文件 id 或已生成的 step id。\n` +
    `7) 如果需要拼接/合并视频（concat），必须先统一分辨率、像素比例、帧率与音频采样率（例如 scale+pad+fps+aresample），否则会报错。\n` +
    `8) 如果需要添加字幕/文字（含中文），优先使用 FFmpeg drawtext 并指定 UTF-8 与字体名称（如 font='PingFang SC' 或 font='Noto Sans CJK SC'），确保不乱码；若使用字幕文件，请加 -sub_charenc UTF-8。\n` +
    `9) 可用文件 id 列表：${availableIds}`;

  const user = {
    prompt: options.prompt,
    files: options.files,
    availableIds: options.files.map((file) => file.id)
  };

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: "system", content: system },
        { role: "user", content: JSON.stringify(user) }
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

  const parsed = safeJsonParse<PipelineCommand | PipelineStep>(content);
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
