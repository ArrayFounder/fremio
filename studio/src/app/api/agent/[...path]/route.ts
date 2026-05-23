/**
 * Agent Proxy API — bypasses mixed content + CORS restrictions
 *
 * Browser (HTTPS) → studio.fremio.id/api/agent/* → local agent (HTTP:3002)
 *
 * Enables studio.fremio.id to communicate with the local agent running on
 * the operator's machine without triggering:
 * - Mixed content (HTTPS page cannot fetch HTTP://127.0.0.1)
 * - CORS block (cross-origin requests to loopback are blocked from HTTPS pages)
 */

import { NextRequest, NextResponse } from "next/server";

const AGENT_HOST = "127.0.0.1";
const AGENT_PORT = process.env.AGENT_PORT ?? "3002";
const AGENT_BASE = `http://${AGENT_HOST}:${AGENT_PORT}`;

const ALLOWED_PATHS = ["/status", "/health", "/preview", "/preview-stream", "/capture", "/printers", "/print"];

function isAllowedPath(path: string): boolean {
  return ALLOWED_PATHS.some((p) => path.startsWith(p));
}

async function proxyRequest(
  req: NextRequest,
  path: string
): Promise<NextResponse> {
  if (!isAllowedPath(path)) {
    return NextResponse.json(
      { ok: false, error: "Proxy path not allowed" },
      { status: 403 }
    );
  }

  const url = `${AGENT_BASE}${path}${req.nextUrl.search}`;
  const method = req.method;
  const headers: Record<string, string> = {};

  // Forward relevant headers
  const forwardedHeaders = ["content-type", "accept", "cache-control"];
  for (const h of forwardedHeaders) {
    const val = req.headers.get(h);
    if (val) headers[h] = val;
  }

  let body: string | undefined;
  if (method !== "GET" && method !== "HEAD") {
    try {
      body = await req.text();
    } catch {
      body = undefined;
    }
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  // 30s timeout — capture can take up to 25s

  try {
    const agentRes = await fetch(url, {
      method,
      headers,
      body,
      signal: controller.signal,
      duplex: "half",
    } as RequestInit);

    clearTimeout(timeout);

    const contentType = agentRes.headers.get("content-type") ?? "";

    // Stream multipart/x-mixed-replace (MJPEG preview-stream) directly
    if (contentType.includes("multipart/x-mixed-replace")) {
      const readable = agentRes.body;
      if (!readable) {
        return new NextResponse(null, { status: 502 });
      }
      return new NextResponse(readable, {
        status: agentRes.status,
        headers: {
          "Content-Type": contentType,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          Connection: "close",
          "Pragma": "no-cache",
        },
      });
    }

    // For JSON responses, forward as-is
    if (contentType.includes("application/json")) {
      const text = await agentRes.text();
      return new NextResponse(text, {
        status: agentRes.status,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // For binary responses (JPEG images)
    if (contentType.includes("image/jpeg")) {
      const buffer = await agentRes.arrayBuffer();
      return new NextResponse(buffer, {
        status: agentRes.status,
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "no-cache, no-store, must-revalidate",
        },
      });
    }

    // Fallback: forward raw text
    const text = await agentRes.text();
    return new NextResponse(text, { status: agentRes.status });
  } catch (err) {
    clearTimeout(timeout);
    const msg = err instanceof Error ? err.message : "Agent proxy error";
    console.error(`[agent-proxy] Error for ${path}: ${msg}`);
    return NextResponse.json(
      { ok: false, error: `Agent tidak dapat dijangkau: ${msg}` },
      { status: 502 }
    );
  }
}

export async function GET(req: NextRequest) {
  const path = req.nextUrl.pathname.replace("/api/agent", "");
  return proxyRequest(req, path);
}

export async function POST(req: NextRequest) {
  const path = req.nextUrl.pathname.replace("/api/agent", "");
  return proxyRequest(req, path);
}

export async function HEAD(req: NextRequest) {
  const path = req.nextUrl.pathname.replace("/api/agent", "");
  return proxyRequest(req, path);
}