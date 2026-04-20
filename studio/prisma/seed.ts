import { PrismaClient, SubscriptionTier, FrameCategory, PaymentMethod, SessionStatus, TransactionStatus } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding Fremio Studio database...\n");

  // ── Hapus data lama (urutan penting: child dulu) ────────────────────────────
  await prisma.boothSession.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.boothConfig.deleteMany();
  await prisma.frame.deleteMany();
  await prisma.operator.deleteMany();
  console.log("🗑  Data lama dihapus.");

  // ─────────────────────────────────────────────────────────────────────────────
  // FRAMES — seed 9 frame untuk testing
  // ─────────────────────────────────────────────────────────────────────────────
  const frames = await prisma.frame.createManyAndReturn({
    data: [
      {
        id:           "frame-aesthetic-01",
        name:         "Aesthetic Pastel",
        category:     FrameCategory.AESTHETIC,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/aesthetic-pastel.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/aesthetic-pastel.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    1,
      },
      {
        id:           "frame-korean-01",
        name:         "Korean Film Strip",
        category:     FrameCategory.KOREAN,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/korean-filmstrip.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/korean-filmstrip.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    2,
      },
      {
        id:           "frame-vintage-01",
        name:         "Vintage 90s",
        category:     FrameCategory.VINTAGE,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/vintage-90s.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/vintage-90s.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    3,
      },
      {
        id:           "frame-minimalist-01",
        name:         "Minimalist White",
        category:     FrameCategory.MINIMALIST,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/minimalist-white.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/minimalist-white.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    4,
      },
      {
        id:           "frame-birthday-01",
        name:         "Happy Birthday Confetti",
        category:     FrameCategory.BIRTHDAY,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/birthday-confetti.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/birthday-confetti.png",
        isPremium:    true,
        designerId:   "designer-fremio-001",
        sortOrder:    5,
      },
      {
        id:           "frame-wedding-01",
        name:         "Elegant Wedding Gold",
        category:     FrameCategory.WEDDING,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/wedding-gold.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/wedding-gold.png",
        isPremium:    true,
        designerId:   "designer-fremio-001",
        sortOrder:    6,
      },
      {
        id:           "frame-graduation-01",
        name:         "Graduation Day",
        category:     FrameCategory.GRADUATION,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/graduation.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/graduation.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    7,
      },
      {
        id:           "frame-seasonal-01",
        name:         "Ramadan Kareem",
        category:     FrameCategory.SEASONAL,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/ramadan.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/ramadan.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    8,
      },
      {
        id:           "frame-custom-01",
        name:         "StarBooth Custom (Sample)",
        category:     FrameCategory.CUSTOM,
        thumbnailUrl: "https://cdn.fremio.id/frames/thumbs/starbooth-custom.jpg",
        assetUrl:     "https://cdn.fremio.id/frames/assets/starbooth-custom.png",
        isPremium:    false,
        designerId:   null,
        sortOrder:    9,
      },
    ],
  });
  console.log(`✅ ${frames.length} frames dibuat.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // OPERATORS — 2 operator testing
  // ─────────────────────────────────────────────────────────────────────────────
  const passwordHash = await bcrypt.hash("Testing1234!", 12);

  const operatorStarter = await prisma.operator.create({
    data: {
      id:                "op-starter-001",
      email:             "starter@fremio-test.id",
      password:          passwordHash,
      businessName:      "SnapNest Studio",
      subscriptionTier:  SubscriptionTier.STARTER,
      subscriptionExpiry: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000), // trial 14 hari
    },
  });

  const operatorPro = await prisma.operator.create({
    data: {
      id:                "op-pro-001",
      email:             "pro@fremio-test.id",
      password:          passwordHash,
      businessName:      "FotoBooth.id",
      subscriptionTier:  SubscriptionTier.PRO,
      subscriptionExpiry: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
  console.log(`✅ 2 operators dibuat.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // BOOTH CONFIGS
  // ─────────────────────────────────────────────────────────────────────────────
  const boothStarter = await prisma.boothConfig.create({
    data: {
      id:                     "booth-starter-01",
      operatorId:             operatorStarter.id,
      boothName:              "SnapNest · Mal Kelapa Gading",
      slug:                   "snapnest-kg",
      pricePerSession:        10_000,
      sessionDurationSeconds: 300,
      allowedFrameIds:        ["frame-aesthetic-01", "frame-korean-01", "frame-minimalist-01"],
      printEnabled:           false,
      primaryColor:           "#1a1a2e",
      accentColor:            "#e94560",
    },
  });

  const boothPro1 = await prisma.boothConfig.create({
    data: {
      id:                     "booth-pro-01",
      operatorId:             operatorPro.id,
      boothName:              "FotoBooth.id · Bandung",
      slug:                   "fotobooth-bdg",
      pricePerSession:        15_000,
      sessionDurationSeconds: 360,
      allowedFrameIds:        [], // semua frame publik tersedia
      printEnabled:           true,
      primaryColor:           "#0a1a4a",
      accentColor:            "#d4a017",
    },
  });

  const boothPro2 = await prisma.boothConfig.create({
    data: {
      id:                     "booth-pro-02",
      operatorId:             operatorPro.id,
      boothName:              "FotoBooth.id · Jakarta Selatan",
      slug:                   "fotobooth-jks",
      pricePerSession:        20_000,
      sessionDurationSeconds: 300,
      allowedFrameIds:        ["frame-birthday-01", "frame-wedding-01", "frame-graduation-01"],
      printEnabled:           true,
      primaryColor:           "#0a1a4a",
      accentColor:            "#d4a017",
    },
  });
  console.log(`✅ 3 booth configs dibuat.`);

  // ─────────────────────────────────────────────────────────────────────────────
  // TRANSACTIONS + BOOTH SESSIONS — berbagai status untuk testing
  // ─────────────────────────────────────────────────────────────────────────────

  // 1. Sesi COMPLETED — ada foto, transaksi sukses
  const txCompleted = await prisma.transaction.create({
    data: {
      id:              "tx-001",
      sessionId:       "session-001",
      operatorId:      operatorPro.id,
      amount:          15_000,
      method:          PaymentMethod.QRIS,
      midtransOrderId: "FREMIO-STUDIO-001-1712345600",
      midtransId:      "T-mid-abc123",
      status:          TransactionStatus.SUCCESS,
      paidAt:          new Date("2026-04-05T10:15:00Z"),
    },
  });
  await prisma.boothSession.create({
    data: {
      id:            "session-001",
      boothConfigId: boothPro1.id,
      status:        SessionStatus.COMPLETED,
      transactionId: txCompleted.id,
      frameId:       "frame-korean-01",
      photoUrl:      "https://photos.fremio.id/sessions/session-001/result.jpg",
      qrCode:        "QR-session-001-token",
      startedAt:     new Date("2026-04-05T10:14:00Z"),
      completedAt:   new Date("2026-04-05T10:22:00Z"),
      expiresAt:     new Date("2026-04-06T10:22:00Z"),
    },
  });

  // 2. Sesi ACTIVE — transaksi sukses, foto belum selesai
  const txActive = await prisma.transaction.create({
    data: {
      id:              "tx-002",
      sessionId:       "session-002",
      operatorId:      boothStarter.operatorId,
      amount:          10_000,
      method:          PaymentMethod.QRIS,
      midtransOrderId: "FREMIO-STUDIO-002-1712348000",
      midtransId:      "T-mid-def456",
      status:          TransactionStatus.SUCCESS,
      paidAt:          new Date("2026-04-06T08:00:00Z"),
    },
  });
  await prisma.boothSession.create({
    data: {
      id:            "session-002",
      boothConfigId: boothStarter.id,
      status:        SessionStatus.ACTIVE,
      transactionId: txActive.id,
      frameId:       "frame-aesthetic-01",
      startedAt:     new Date("2026-04-06T08:00:00Z"),
      expiresAt:     new Date("2026-04-06T08:05:00Z"),
    },
  });

  // 3. Sesi PENDING — belum bayar
  const txPending = await prisma.transaction.create({
    data: {
      id:              "tx-003",
      sessionId:       "session-003",
      operatorId:      boothPro2.operatorId,
      amount:          20_000,
      method:          PaymentMethod.GOPAY,
      midtransOrderId: "FREMIO-STUDIO-003-1712349000",
      snapToken:       "snap-token-preview-abc",
      status:          TransactionStatus.PENDING,
    },
  });
  await prisma.boothSession.create({
    data: {
      id:            "session-003",
      boothConfigId: boothPro2.id,
      status:        SessionStatus.PENDING,
      transactionId: txPending.id,
      frameId:       "frame-wedding-01",
      startedAt:     new Date(),
    },
  });

  // 4. Sesi COMPLETED dengan cetak (printEnabled booth)
  const txPrint = await prisma.transaction.create({
    data: {
      id:              "tx-004",
      sessionId:       "session-004",
      operatorId:      operatorPro.id,
      amount:          20_000,
      method:          PaymentMethod.CASH,
      status:          TransactionStatus.SUCCESS,
      paidAt:          new Date("2026-04-04T15:30:00Z"),
    },
  });
  await prisma.boothSession.create({
    data: {
      id:            "session-004",
      boothConfigId: boothPro2.id,
      status:        SessionStatus.COMPLETED,
      transactionId: txPrint.id,
      frameId:       "frame-birthday-01",
      photoUrl:      "https://photos.fremio.id/sessions/session-004/result.jpg",
      qrCode:        "QR-session-004-token",
      startedAt:     new Date("2026-04-04T15:28:00Z"),
      completedAt:   new Date("2026-04-04T15:36:00Z"),
      expiresAt:     new Date("2026-04-05T15:36:00Z"),
    },
  });

  console.log(`✅ 4 booth sessions + 4 transactions dibuat.\n`);

  // ─────────────────────────────────────────────────────────────────────────────
  // RINGKASAN
  // ─────────────────────────────────────────────────────────────────────────────
  console.log("─".repeat(52));
  console.log("📋 Seed selesai. Akun testing:");
  console.log("   Email    : starter@fremio-test.id");
  console.log("   Password : Testing1234!");
  console.log("   Tier     : STARTER (1 booth)\n");
  console.log("   Email    : pro@fremio-test.id");
  console.log("   Password : Testing1234!");
  console.log("   Tier     : PRO (3 booth)");
  console.log("─".repeat(52));
}

main()
  .catch((e) => {
    console.error("❌ Seed gagal:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
