let bridgePollTimer = null;

function renderBridgeStatus(bridgeStatus) {
  const badgeEl = document.getElementById("bridgeBadge");
  const summaryEl = document.getElementById("bridgeSummary");
  const actionEl = document.getElementById("bridgeAction");
  const notesEl = document.getElementById("bridgeNotes");

  if (!badgeEl || !summaryEl || !actionEl || !notesEl) return;

  badgeEl.className = `badge ${bridgeStatus?.cameraAvailable ? "badge-ready" : bridgeStatus?.running ? "badge-waiting" : "badge-error"}`;
  badgeEl.textContent = bridgeStatus?.cameraAvailable
    ? "Kamera siap"
    : bridgeStatus?.running
      ? "Bridge aktif"
      : "Belum siap";

  summaryEl.textContent = bridgeStatus?.summary || "Bridge kamera belum siap.";
  actionEl.textContent = bridgeStatus?.action || "";

  notesEl.innerHTML = "";
  const notes = Array.isArray(bridgeStatus?.notes) ? bridgeStatus.notes.filter(Boolean) : [];

  notes.forEach((note) => {
    const item = document.createElement("li");
    item.textContent = note;
    notesEl.appendChild(item);
  });
}

async function refreshBridgeStatus(method = "get") {
  const summaryEl = document.getElementById("bridgeSummary");
  if (summaryEl) summaryEl.textContent = "Memeriksa perangkat lokal...";

  try {
    const bridgeStatus = method === "restart"
      ? await window.fremioBooth.restartBridge()
      : await window.fremioBooth.getBridgeStatus();
    renderBridgeStatus(bridgeStatus);
  } catch (error) {
    renderBridgeStatus({
      running: false,
      cameraAvailable: false,
      summary: "Gagal membaca status perangkat.",
      action: error instanceof Error ? error.message : "Unknown error",
      notes: [],
    });
  }
}

async function boot() {
  const form = document.getElementById("setup-form");
  const statusEl = document.getElementById("status");
  const baseUrlEl = document.getElementById("studioBaseUrl");
  const slugEl = document.getElementById("boothSlug");
  const kioskEl = document.getElementById("kiosk");
  const refreshBridgeButton = document.getElementById("refreshBridgeButton");
  const restartBridgeButton = document.getElementById("restartBridgeButton");

  const existing = await window.fremioBooth.getConfig();
  baseUrlEl.value = existing?.studioBaseUrl || "https://studio.fremio.id";
  slugEl.value = existing?.boothSlug || "";
  kioskEl.checked = existing?.kiosk !== false;

  refreshBridgeButton?.addEventListener("click", () => {
    refreshBridgeStatus("get");
  });

  restartBridgeButton?.addEventListener("click", () => {
    refreshBridgeStatus("restart");
  });

  await refreshBridgeStatus("get");
  bridgePollTimer = window.setInterval(() => {
    refreshBridgeStatus("get");
  }, 5000);

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

window.addEventListener("beforeunload", () => {
  if (bridgePollTimer) window.clearInterval(bridgePollTimer);
});
