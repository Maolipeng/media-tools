import { NextResponse } from "next/server";
import { promises as fs } from "fs";
import path from "path";
import { getArtifactById, readState } from "@/lib/storage";

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

export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> }
) {
  const { id } = await context.params;
  const state = await readState();
  let artifact = getArtifactById(state, id);
  if (!artifact) {
    console.warn("[media-tools] artifact not found in state", id);
    const fallback = await findArtifactPath(id);
    if (fallback) {
      artifact = fallback;
    } else {
      return NextResponse.json({ error: "未找到该文件。" }, { status: 404 });
    }
  }

  const buffer = await fs.readFile(artifact.path);
  const ext = path.extname(artifact.path).slice(1).toLowerCase();
  const contentType = CONTENT_TYPES[ext] ?? artifact.contentType ?? "application/octet-stream";

  return new NextResponse(buffer, {
    headers: {
      "Content-Type": contentType,
      "Content-Disposition": `inline; filename=\"${artifact.name}\"`,
      "Cache-Control": "no-store"
    }
  });
}

async function findArtifactPath(id: string) {
  const artifactsDir = path.join(process.cwd(), "data", "artifacts");
  try {
    const entries = await fs.readdir(artifactsDir);
    const match = entries.find((name) => name.startsWith(`${id}.`));
    if (!match) return null;
    const filePath = path.join(artifactsDir, match);
    const ext = path.extname(match).slice(1).toLowerCase();
    return {
      id,
      name: match,
      ext,
      contentType: CONTENT_TYPES[ext] ?? "application/octet-stream",
      path: filePath,
      size: (await fs.stat(filePath)).size,
      createdAt: new Date().toISOString()
    };
  } catch {
    return null;
  }
}
