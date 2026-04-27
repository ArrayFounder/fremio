import { NextResponse } from "next/server";
import { getStudioManagedFramesConfig, saveStudioManagedFramesConfig } from "@/lib/studioManagedFrames";
import fs from "node:fs";
import path from "node:path";

const readSecretFromEnvFile = (): string => {
  const candidates = [
    path.join(process.cwd(), ".env.production"),
    path.join(process.cwd(), ".env.local"),
    path.join(process.cwd(), ".env"),
  ];

  for (const filePath of candidates) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const raw = fs.readFileSync(filePath, "utf8");
      const line = raw
        .split(/\r?\n/)
        .find((l) => l.trim().startsWith("STUDIO_ADMIN_SECRET="));
      if (!line) continue;
      const value = line.split("=").slice(1).join("=").trim();
      if (value) return value;
    } catch {
      // Try next candidate
    }
  }

  return "";
};

const getAdminSecret = () => readSecretFromEnvFile() || process.env.STUDIO_ADMIN_SECRET || "";

const allowedOrigins = ["https://fremio.id", "https://www.fremio.id"];

const corsHeaders = (origin: string) => ({
  "Access-Control-Allow-Origin": allowedOrigins.includes(origin) ? origin : "https://fremio.id",
  "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type",
});

const isAuthorized = (authHeader: string | null) =>
  !!getAdminSecret() && authHeader === `Bearer ${getAdminSecret()}`;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const origin = req.headers.get("origin") ?? "";

  if (!isAuthorized(auth)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  const config = await getStudioManagedFramesConfig();
  return NextResponse.json(
    { success: true, data: config },
    { headers: corsHeaders(origin) }
  );
}

export async function PUT(req: Request) {
  const auth = req.headers.get("authorization");
  const origin = req.headers.get("origin") ?? "";

  if (!isAuthorized(auth)) {
    return NextResponse.json(
      { success: false, error: "Forbidden" },
      { status: 403, headers: corsHeaders(origin) }
    );
  }

  try {
    const body = (await req.json()) as {
      enforceWhitelist?: unknown;
      allowedFrameIds?: unknown;
    };

    const allowedFrameIds = Array.isArray(body?.allowedFrameIds)
      ? body.allowedFrameIds.map((v) => String(v))
      : [];

    const config = await saveStudioManagedFramesConfig({
      enforceWhitelist: !!body?.enforceWhitelist,
      allowedFrameIds,
    });

    return NextResponse.json(
      { success: true, data: config },
      { headers: corsHeaders(origin) }
    );
  } catch {
    return NextResponse.json(
      { success: false, error: "Payload tidak valid" },
      { status: 400, headers: corsHeaders(origin) }
    );
  }
}

export async function OPTIONS(req: Request) {
  const origin = req.headers.get("origin") ?? "";
  return new Response(null, {
    status: 204,
    headers: corsHeaders(origin),
  });
}
