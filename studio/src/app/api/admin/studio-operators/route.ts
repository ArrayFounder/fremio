import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const ADMIN_SECRET = process.env.STUDIO_ADMIN_SECRET;

export async function GET(req: Request) {
  // Verify admin secret
  const auth = req.headers.get("authorization");
  if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const operators = await prisma.operator.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id:                 true,
      email:              true,
      businessName:       true,
      subscriptionTier:   true,
      subscriptionExpiry: true,
      isActive:           true,
      createdAt:          true,
      boothConfigs: {
        where:   { isActive: true },
        select:  { id: true, boothName: true, slug: true, createdAt: true },
        orderBy: { createdAt: "asc" },
      },
    },
  });

  const origin = req.headers.get("origin") ?? "";
  const allowed = ["https://fremio.id", "https://www.fremio.id"];

  return NextResponse.json(
    { success: true, data: operators },
    {
      headers: {
        "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "https://fremio.id",
        "Access-Control-Allow-Methods": "GET, OPTIONS",
        "Access-Control-Allow-Headers": "Authorization, Content-Type",
      },
    }
  );
}

export async function OPTIONS(req: Request) {
  const origin  = req.headers.get("origin") ?? "";
  const allowed = ["https://fremio.id", "https://www.fremio.id"];
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "https://fremio.id",
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
