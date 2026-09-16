import { promises as fs } from "fs";
import path from "path";
import { sampleVideos } from "@/lib/data";
import type { LibraryContent, VideoEstado } from "@/types";

type DemoVideoPatch = Partial<
  Pick<LibraryContent, "estado" | "notas_editor" | "aprobado_at"> & {
    caption: string;
    correcciones: string;
    frase_quemada: string;
    updated_at: string;
  }
>;

const DEMO_STATE_PATH = path.join(process.cwd(), ".halo-demo-approvals.json");

async function readDemoState(): Promise<Record<string, DemoVideoPatch>> {
  try {
    const raw = await fs.readFile(DEMO_STATE_PATH, "utf8");
    return JSON.parse(raw) as Record<string, DemoVideoPatch>;
  } catch {
    return {};
  }
}

async function writeDemoState(state: Record<string, DemoVideoPatch>) {
  await fs.writeFile(DEMO_STATE_PATH, JSON.stringify(state, null, 2), "utf8");
}

export async function getDemoVideos(): Promise<Array<LibraryContent & DemoVideoPatch>> {
  const state = await readDemoState();
  return sampleVideos.map((video) => ({ ...video, ...(state[video.id] ?? {}) }));
}

export async function getDemoApprovalCount() {
  const videos = await getDemoVideos();
  return videos.filter((video) => video.estado === "en_aprobacion").length;
}

export async function updateDemoVideo(
  id: string,
  patch: Omit<DemoVideoPatch, "estado"> & { estado: VideoEstado },
) {
  const exists = sampleVideos.some((video) => video.id === id);
  if (!exists) return false;

  const state = await readDemoState();
  state[id] = {
    ...(state[id] ?? {}),
    ...patch,
  };
  await writeDemoState(state);
  return true;
}
