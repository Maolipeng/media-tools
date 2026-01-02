import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import os from "os";
import { callAiForCommand } from "@/lib/ai";
import { buildArgs, validatePipeline } from "@/lib/validation";
import { runCommand } from "@/lib/exec";
import {
  addMessage,
  appendArtifact,
  getArtifactById,
  readState,
  saveArtifact,
  writeState
} from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const CONTENT_TYPES: Record<string, string> = {
  mp4: "video/mp4",
  mov: "video/quicktime",
  mp3: "audio/mpeg",
  wav: "audio/wav",
  flac: "audio/flac",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  gif: "image/gif"
};

export async function POST(request: Request) {
  try {
    console.log("[media-tools] request received");
    const formData = await request.formData();
    const prompt = formData.get("prompt");
    const apiKey = formData.get("apiKey");
    const baseUrl = formData.get("baseUrl");
    const model = formData.get("model");
    const files = formData.getAll("files");
    const artifactIdsRaw = formData.get("artifactIds");

    if (typeof prompt !== "string" || !prompt.trim()) {
      return NextResponse.json({ error: "缺少处理描述。" }, { status: 400 });
    }

    let artifactIds = parseArtifactIds(artifactIdsRaw);

    const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "media-tools-"));
    const savedFiles: Array<{ id: string; name: string; type: string; path: string }> = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!(file instanceof File)) continue;

      const fileId = `file-${index + 1}`;
      const originalName = file.name || `${fileId}`;
      const ext = path.extname(originalName) || "";
      const filename = `${fileId}${ext}`;
      const filePath = path.join(workDir, filename);

      const buffer = Buffer.from(await file.arrayBuffer());
      await fs.writeFile(filePath, buffer);

      savedFiles.push({
        id: fileId,
        name: originalName,
        type: file.type || "application/octet-stream",
        path: filePath
      });
    }

    if (!savedFiles.length) {
      if (!artifactIds.length) {
        return NextResponse.json({ error: "未上传文件。" }, { status: 400 });
      }
    }

    const state = await readState();
    if (artifactIds.length === 0 && state.artifacts.length > 0) {
      artifactIds = [state.artifacts[state.artifacts.length - 1].id];
    }
    const artifactFiles = artifactIds
      .map((id) => getArtifactById(state, id))
      .filter((artifact) => artifact !== null);

    if (!savedFiles.length && artifactFiles.length === 0) {
      return NextResponse.json({ error: "未找到可用的中间态文件。" }, { status: 400 });
    }

    console.log("[media-tools] saved files", savedFiles.map((file) => ({
      id: file.id,
      name: file.name,
      type: file.type
    })));

    const command = await callAiForCommand({
      prompt,
      files: [
        ...savedFiles.map(({ id, name, type }) => ({ id, name, type })),
        ...artifactFiles.map((artifact) => ({
          id: artifact.id,
          name: artifact.name,
          type: artifact.contentType
        }))
      ],
      apiKey: typeof apiKey === "string" ? apiKey : undefined,
      baseUrl: typeof baseUrl === "string" ? baseUrl : undefined,
      model: typeof model === "string" ? model : undefined
    });

    console.log("[media-tools] ai command", command);

    const validation = validatePipeline(
      command,
      new Set([
        ...savedFiles.map((f) => f.id),
        ...artifactFiles.flatMap((artifact) => [artifact.id, `artifact-${artifact.id}`])
      ])
    );
    if (!validation.ok) {
      return NextResponse.json({ error: validation.error }, { status: 400 });
    }

    const inputPaths = savedFiles.reduce<Record<string, string>>((acc, file) => {
      acc[file.id] = file.path;
      return acc;
    }, {});
    for (const artifact of artifactFiles) {
      inputPaths[artifact.id] = artifact.path;
      inputPaths[`artifact-${artifact.id}`] = artifact.path;
    }

    let finalOutputPath = "";
    let finalOutputName = "";

    for (let index = 0; index < command.steps.length; index += 1) {
      const step = command.steps[index];
      const stepId = `step-${index + 1}`;
      const outputName =
        index === command.steps.length - 1
          ? `output.${step.outputExt.toLowerCase()}`
          : `${stepId}.${step.outputExt.toLowerCase()}`;
      const outputPath = path.join(workDir, outputName);
      const args = buildArgs(step, inputPaths, outputPath);

      console.log("[media-tools] run step", {
        step: stepId,
        tool: step.tool,
        args
      });
      await runCommand(step.tool, args);

      inputPaths[stepId] = outputPath;
      if (index === command.steps.length - 1) {
        finalOutputPath = outputPath;
        finalOutputName = outputName;
      }
    }

    if (!finalOutputPath) {
      return NextResponse.json({ error: "未生成输出文件。" }, { status: 500 });
    }

    console.log("[media-tools] output ready", finalOutputName);
    const outputBuffer = await fs.readFile(finalOutputPath);
    const outputExt = path.extname(finalOutputName).slice(1).toLowerCase();
    const contentType = CONTENT_TYPES[outputExt] ?? "application/octet-stream";

    const artifact = await saveArtifact({
      buffer: outputBuffer,
      ext: outputExt,
      contentType,
      name: finalOutputName
    });

    const userMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "user" as const,
      content: prompt,
      createdAt: new Date().toISOString(),
      artifactIds
    };

    const assistantMessage = {
      id: `msg-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      role: "assistant" as const,
      content: `已生成：${artifact.name}`,
      createdAt: new Date().toISOString(),
      artifactIds: [artifact.id]
    };

    let nextState = await appendArtifact(state, artifact);
    nextState = addMessage(nextState, userMessage);
    nextState = addMessage(nextState, assistantMessage);
    await writeState(nextState);

    return NextResponse.json({
      artifact: {
        id: artifact.id,
        name: artifact.name,
        contentType: artifact.contentType,
        size: artifact.size,
        createdAt: artifact.createdAt
      },
      messages: nextState.messages
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "处理失败。";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

function parseArtifactIds(value: FormDataEntryValue | null) {
  if (!value || typeof value !== "string") return [];
  try {
    const parsed = JSON.parse(value) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((id) => typeof id === "string");
  } catch {
    return [];
  }
}
