import { promises as fs } from "fs";
import path from "path";

export type Artifact = {
  id: string;
  name: string;
  ext: string;
  contentType: string;
  path: string;
  size: number;
  createdAt: string;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  createdAt: string;
  artifactIds?: string[];
};

export type SessionState = {
  artifacts: Artifact[];
  messages: ChatMessage[];
};

const MAX_ARTIFACTS = 10;
const DATA_DIR = path.join(process.cwd(), "data");
const ARTIFACTS_DIR = path.join(DATA_DIR, "artifacts");
const STATE_PATH = path.join(DATA_DIR, "state.json");

export async function readState(): Promise<SessionState> {
  await ensureDir(ARTIFACTS_DIR);
  try {
    const raw = await fs.readFile(STATE_PATH, "utf-8");
    const parsed = JSON.parse(raw) as SessionState;
    return {
      artifacts: parsed.artifacts ?? [],
      messages: parsed.messages ?? []
    };
  } catch {
    return { artifacts: [], messages: [] };
  }
}

export async function writeState(state: SessionState) {
  await ensureDir(DATA_DIR);
  await fs.writeFile(STATE_PATH, JSON.stringify(state, null, 2));
}

export async function resetState() {
  await ensureDir(DATA_DIR);
  try {
    await fs.rm(ARTIFACTS_DIR, { recursive: true, force: true });
  } catch {
    // ignore cleanup failure
  }
  await fs.writeFile(STATE_PATH, JSON.stringify({ artifacts: [], messages: [] }, null, 2));
}

export async function saveArtifact(options: {
  buffer: Buffer;
  ext: string;
  contentType: string;
  name: string;
}) {
  await ensureDir(ARTIFACTS_DIR);
  const id = createId();
  const safeExt = options.ext.toLowerCase();
  const filename = `${id}.${safeExt}`;
  const filePath = path.join(ARTIFACTS_DIR, filename);
  await fs.writeFile(filePath, options.buffer);

  const artifact: Artifact = {
    id,
    name: options.name,
    ext: safeExt,
    contentType: options.contentType,
    path: filePath,
    size: options.buffer.length,
    createdAt: new Date().toISOString()
  };

  return artifact;
}

export async function appendArtifact(state: SessionState, artifact: Artifact) {
  const next = [...state.artifacts, artifact];
  const pruned = await pruneArtifacts(next);
  return { ...state, artifacts: pruned };
}

export function addMessage(state: SessionState, message: ChatMessage) {
  return { ...state, messages: [...state.messages, message] };
}

export function getArtifactById(state: SessionState, id: string) {
  return state.artifacts.find((artifact) => artifact.id === id) ?? null;
}

async function pruneArtifacts(artifacts: Artifact[]) {
  if (artifacts.length <= MAX_ARTIFACTS) return artifacts;
  const toRemove = artifacts.slice(0, artifacts.length - MAX_ARTIFACTS);
  const keep = artifacts.slice(artifacts.length - MAX_ARTIFACTS);

  for (const artifact of toRemove) {
    try {
      await fs.rm(artifact.path, { force: true });
    } catch {
      // ignore cleanup failure
    }
  }

  return keep;
}

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function ensureDir(dir: string) {
  await fs.mkdir(dir, { recursive: true });
}
