import { NextResponse } from "next/server";
import { z } from "zod";
import {
  acquireBoothDeviceLock,
  heartbeatBoothDeviceLock,
  releaseBoothDeviceLock,
} from "@/lib/boothDeviceLock";

const bodySchema = z.object({
  deviceId: z.string().trim().min(8).max(128),
  action: z.enum(["acquire", "release"]).optional(),
});

export async function POST(
  req: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload tidak valid" }, { status: 400 });
  }

  if (parsed.data.action === "release") {
    releaseBoothDeviceLock(params.slug, parsed.data.deviceId);
    return NextResponse.json({ success: true, released: true });
  }

  const result = acquireBoothDeviceLock(params.slug, parsed.data.deviceId);
  if (!result.granted) {
    return NextResponse.json(
      { success: false, error: "Perangkat sudah maksimal untuk booth ini.", code: "DEVICE_LIMIT_REACHED" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function PATCH(
  req: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload tidak valid" }, { status: 400 });
  }

  const result = heartbeatBoothDeviceLock(params.slug, parsed.data.deviceId);
  if (!result.granted) {
    return NextResponse.json(
      { success: false, error: "Perangkat sudah maksimal untuk booth ini.", code: "DEVICE_LIMIT_REACHED" },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true });
}

export async function DELETE(
  req: Request,
  { params }: { params: { slug: string } }
): Promise<Response> {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ success: false, error: "Payload tidak valid" }, { status: 400 });
  }

  releaseBoothDeviceLock(params.slug, parsed.data.deviceId);
  return NextResponse.json({ success: true });
}
