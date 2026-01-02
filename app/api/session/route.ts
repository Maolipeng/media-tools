import { NextResponse } from "next/server";
import { readState, resetState } from "@/lib/storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const state = await readState();
  return NextResponse.json({
    artifacts: state.artifacts.map((artifact) => ({
      id: artifact.id,
      name: artifact.name,
      contentType: artifact.contentType,
      size: artifact.size,
      createdAt: artifact.createdAt,
      url: `/api/artifacts/${artifact.id}`
    })),
    messages: state.messages
  });
}

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}));
  if (body?.action === "reset") {
    await resetState();
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "不支持的操作。" }, { status: 400 });
}
