import { NextResponse } from "next/server";

// Allowlist: only proxy images from these hosts
const ALLOWED_HOSTS = ["fremio.id", "api.fremio.id"];

/**
 * GET /api/proxy-image?url=<encoded-url>
 * Server-side image proxy to bypass CORS restrictions when loading
 * fremio.id overlay PNGs into a <canvas> on studio.fremio.id.
 */
export async function GET(req: Request): Promise<Response> {
  const { searchParams } = new URL(req.url);
  const rawUrl = searchParams.get("url");

  if (!rawUrl) {
    return new Response("Missing url param", { status: 400 });
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return new Response("Invalid URL", { status: 400 });
  }

  if (!ALLOWED_HOSTS.includes(parsed.hostname)) {
    return new Response("Forbidden: host not allowed", { status: 403 });
  }

  // Only allow image paths
  const ext = parsed.pathname.split(".").pop()?.toLowerCase() ?? "";
  if (!["png", "jpg", "jpeg", "webp", "gif"].includes(ext)) {
    return new Response("Forbidden: not an image path", { status: 403 });
  }

  try {
    const upstream = await fetch(rawUrl, {
      headers: { "User-Agent": "Fremio-Studio-Proxy/1.0" },
      // Cache upstream for 1 hour — overlay PNGs rarely change
      next: { revalidate: 3600 },
    });

    if (!upstream.ok) {
      return new Response(`Upstream error: ${upstream.status}`, { status: 502 });
    }

    const contentType = upstream.headers.get("content-type") ?? "image/png";
    const buffer = await upstream.arrayBuffer();

    return new Response(buffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
        "Content-Length": String(buffer.byteLength),
      },
    });
  } catch (err) {
    console.error("[proxy-image]", err);
    return new Response("Failed to fetch upstream", { status: 502 });
  }
}
