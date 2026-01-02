import type { PipelineCommand, PipelineStep } from "./ai";

const ALLOWED_TOOLS = new Set(["ffmpeg", "magick", "sox"]);
const FORBIDDEN_TOKENS = /[\n\r]/;
const INPUT_PLACEHOLDER = /\{input:([a-z0-9-]+)\}/gi;
const INPUT_PLACEHOLDER_EXACT = /^\{input:([a-z0-9-]+)\}$/i;

export function validatePipeline(
  command: PipelineCommand,
  fileIds: Set<string>
): { ok: true } | { ok: false; error: string } {
  if (!command.steps || !Array.isArray(command.steps) || command.steps.length === 0) {
    return { ok: false, error: "未生成处理步骤。" };
  }

  for (let index = 0; index < command.steps.length; index += 1) {
    const step = command.steps[index];
    const stepId = `step-${index + 1}`;
    const availableIds = new Set([...fileIds, ...buildStepIds(index)]);

    const validation = validateStep(step, availableIds);
    if (!validation.ok) {
      return { ok: false, error: `第 ${index + 1} 步：${validation.error}` };
    }

    fileIds.add(stepId);
  }

  return { ok: true };
}

export function buildArgs(
  command: PipelineStep,
  inputPaths: Record<string, string>,
  outputPath: string
) {
  return command.args.map((arg) => {
    if (arg === "{output}") return outputPath;
    if (arg === "{input}") {
      if (command.inputFileId && inputPaths[command.inputFileId]) {
        return inputPaths[command.inputFileId];
      }
      return arg;
    }

    const match = arg.match(INPUT_PLACEHOLDER_EXACT);
    if (match) {
      const fileId = match[1];
      return inputPaths[fileId] ?? arg;
    }

    return arg;
  });
}

function collectInputPlaceholders(args: string[]) {
  const ids: string[] = [];
  for (const arg of args) {
    const matches = arg.matchAll(INPUT_PLACEHOLDER);
    for (const match of matches) {
      if (match[1]) ids.push(match[1]);
    }
  }
  return ids;
}

function isForbiddenPathLike(arg: string) {
  if (arg.startsWith("/") || arg.startsWith("\\") || arg.startsWith("~")) {
    return true;
  }
  if (arg.includes("../") || arg.includes("..\\")) {
    return true;
  }
  if (/^[a-zA-Z]:\\/.test(arg)) {
    return true;
  }
  return false;
}

function validateStep(
  step: PipelineStep,
  availableIds: Set<string>
): { ok: true } | { ok: false; error: string } {
  if (!ALLOWED_TOOLS.has(step.tool)) {
    return { ok: false, error: "不支持的工具类型。" };
  }

  if (!Array.isArray(step.args) || step.args.length === 0) {
    return { ok: false, error: "命令参数为空。" };
  }

  if (!/^[a-z0-9]{2,6}$/i.test(step.outputExt)) {
    return { ok: false, error: "输出扩展名不合法。" };
  }

  const argsJoined = step.args.join(" ");
  if (!argsJoined.includes("{output}")) {
    return { ok: false, error: "命令参数必须包含 {output} 占位符。" };
  }

  const placeholderIds = collectInputPlaceholders(step.args);
  const hasLegacyInput = argsJoined.includes("{input}");
  if (!placeholderIds.length && !hasLegacyInput) {
    return { ok: false, error: "命令参数必须包含 {input:file-id} 占位符。" };
  }

  if (hasLegacyInput) {
    if (!step.inputFileId || !availableIds.has(step.inputFileId)) {
      return { ok: false, error: "缺少有效的 inputFileId。" };
    }
  }

  const declaredIds = step.inputFileIds ?? [];
  for (const id of declaredIds) {
    if (!availableIds.has(id)) {
      return { ok: false, error: "AI 选择的文件不存在。" };
    }
  }

  for (const id of placeholderIds) {
    if (!availableIds.has(id)) {
      return { ok: false, error: "命令参数包含不存在的文件 id。" };
    }
  }

  for (const arg of step.args) {
    if (FORBIDDEN_TOKENS.test(arg)) {
      return { ok: false, error: "命令参数包含不允许的换行字符。" };
    }

    if (arg === "{input}" || arg === "{output}") continue;
    if (INPUT_PLACEHOLDER_EXACT.test(arg)) continue;

    if (isForbiddenPathLike(arg)) {
      return { ok: false, error: "命令参数包含未授权的路径。" };
    }
  }

  return { ok: true };
}

function buildStepIds(count: number) {
  const ids: string[] = [];
  for (let i = 1; i <= count; i += 1) {
    ids.push(`step-${i}`);
  }
  return ids;
}
