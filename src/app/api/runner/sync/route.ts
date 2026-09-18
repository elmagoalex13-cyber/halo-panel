import { NextResponse } from "next/server";
import { syncRunnerResultados } from "@/lib/runnerSync";

export const dynamic = "force-dynamic";

export async function POST() {
  const movidas = await syncRunnerResultados();
  return NextResponse.json({ ok: true, movidas });
}

export const GET = POST;
