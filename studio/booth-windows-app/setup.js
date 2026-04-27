async function boot() {
  const form = document.getElementById("setup-form");
  const statusEl = document.getElementById("status");
  const baseUrlEl = document.getElementById("studioBaseUrl");
  const slugEl = document.getElementById("boothSlug");
  const kioskEl = document.getElementById("kiosk");

  const existing = await window.fremioBooth.getConfig();
  baseUrlEl.value = existing?.studioBaseUrl || "https://studio.fremio.id";
  slugEl.value = existing?.boothSlug || "";
  kioskEl.checked = existing?.kiosk !== false;

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Menyimpan...";

    try {
      const payload = {
        studioBaseUrl: baseUrlEl.value.trim(),
        boothSlug: slugEl.value.trim(),
        kiosk: kioskEl.checked,
      };

      await window.fremioBooth.saveConfig(payload);
      statusEl.textContent = "Tersimpan. Booth sedang dibuka...";
    } catch (error) {
      statusEl.textContent = `Gagal menyimpan: ${error instanceof Error ? error.message : "Unknown error"}`;
    }
  });
}

boot().catch((error) => {
  const statusEl = document.getElementById("status");
  if (statusEl) statusEl.textContent = `Inisialisasi gagal: ${error instanceof Error ? error.message : "Unknown error"}`;
});
