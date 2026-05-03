import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  // Ambil semua frame aktif
  const activeFrames = await prisma.frame.findMany({
    where: { isActive: true },
    select: { id: true },
    orderBy: { sortOrder: "asc" },
  });
  const frameIds = activeFrames.map((f) => f.id);

  if (frameIds.length === 0) {
    console.log("⚠️ Tidak ada frame aktif ditemukan.");
    return;
  }

  console.log(`📦 ${frameIds.length} frame aktif ditemukan.`);

  // Ambil semua booth dengan allowedFrameIds kosong
  const emptyBooths = await prisma.boothConfig.findMany({
    where: { allowedFrameIds: { isEmpty: true } },
    select: { id: true, boothName: true, operatorId: true },
  });

  console.log(`🏪 ${emptyBooths.length} booth dengan allowedFrameIds kosong ditemukan.`);

  if (emptyBooths.length === 0) {
    console.log("✅ Semua booth sudah memiliki frame yang di-assign.");
    return;
  }

  // Update setiap booth
  let updated = 0;
  for (const booth of emptyBooths) {
    try {
      await prisma.boothConfig.update({
        where: { id: booth.id },
        data: { allowedFrameIds: frameIds },
      });
      updated++;
      console.log(`  ✅ ${booth.boothName} (${booth.id}) — diisi ${frameIds.length} frame`);
    } catch (err) {
      console.error(`  ❌ Gagal update ${booth.boothName}:`, err);
    }
  }

  console.log(`\n🎉 Selesai! ${updated}/${emptyBooths.length} booth berhasil di-update.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
