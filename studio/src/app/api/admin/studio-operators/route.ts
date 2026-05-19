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

export async function PUT(req: Request) {
  const auth = req.headers.get("authorization");
  if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const { id, tier, months } = body;
    if (!id || !tier || !months) {
      return NextResponse.json({ success: false, error: "Missing id, tier, or months" }, { status: 400 });
    }

    const expiry = new Date();
    expiry.setDate(expiry.getDate() + Number(months));

    const tierValue = String(tier).toUpperCase() as "STARTER" | "PRO" | "ENTERPRISE";
    const updated = await prisma.operator.update({
      where: { id: String(id) },
      data: {
        subscriptionTier: tierValue,
        subscriptionExpiry: expiry,
        isActive: true,
      },
      select: {
        id: true,
        email: true,
        businessName: true,
        subscriptionTier: true,
        subscriptionExpiry: true,
        isActive: true,
      },
    });

    const origin = req.headers.get("origin") ?? "";
    const allowed = ["https://fremio.id", "https://www.fremio.id"];

    return NextResponse.json(
      { success: true, data: updated },
      {
        headers: {
          "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "https://fremio.id",
          "Access-Control-Allow-Methods": "GET, PUT, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      }
    );
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  const auth = req.headers.get("authorization");
  if (!ADMIN_SECRET || auth !== `Bearer ${ADMIN_SECRET}`) {
    return NextResponse.json({ success: false, error: "Forbidden" }, { status: 403 });
  }

  const url = new URL(req.url);
  const id = url.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ success: false, error: "Missing id parameter" }, { status: 400 });
  }

  try {
    await prisma.$transaction(async (tx) => {
      // Delete transactions first — their FK to Operator is onDelete: Cascade,
      // but deleting via tx.transaction.deleteMany first avoids any orphaned state.
      await tx.transaction.deleteMany({ where: { operatorId: id } });
      // Delete credit purchases
      await tx.creditPurchase.deleteMany({ where: { operatorId: id } });
      // Delete booth configs — this cascades to BoothSessions, Vouchers
      await tx.boothConfig.deleteMany({ where: { operatorId: id } });
      // Finally delete the operator
      await tx.operator.delete({ where: { id: String(id) } });
    });

    const origin = req.headers.get("origin") ?? "";
    const allowed = ["https://fremio.id", "https://www.fremio.id"];

    return NextResponse.json(
      { success: true, message: "Operator deleted successfully" },
      {
        headers: {
          "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "https://fremio.id",
          "Access-Control-Allow-Methods": "DELETE, OPTIONS",
          "Access-Control-Allow-Headers": "Authorization, Content-Type",
        },
      }
    );
  } catch (e: any) {
    console.error("[DELETE /api/admin/studio-operators]", e);
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

export async function OPTIONS(req: Request) {
  const origin  = req.headers.get("origin") ?? "";
  const allowed = ["https://fremio.id", "https://www.fremio.id"];
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin":  allowed.includes(origin) ? origin : "https://fremio.id",
      "Access-Control-Allow-Methods": "GET, PUT, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Authorization, Content-Type",
    },
  });
}
