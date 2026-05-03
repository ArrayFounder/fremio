let bridgePollTimer = null;

<<<<<<< HEAD
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
=======
function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setClass(id, className) {
  const el = document.getElementById(id);
  if (el) el.className = className;
}

function renderNotes(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  const list = Array.isArray(items) ? items.filter(Boolean) : [];
  list.forEach((note) => {
    const li = document.createElement("li");
    li.textContent = note;
    el.appendChild(li);
  });
}

function renderBridgeStatus(bridgeStatus) {
  const raw = bridgeStatus?.raw || {};
  const camera = raw.camera || {};
  const printers = Array.isArray(raw.printers) ? raw.printers : [];

  const cameraAvailable = Boolean(camera.available);
  const cameraCount = Number(camera.count || 0);
  const cameraType = camera.type || "none";
  const cameraDevices = Array.isArray(camera.devices) ? camera.devices : [];
  const cameraError = camera.error || "";

  const printerCount = printers.length;

  const allReady = cameraAvailable && printerCount > 0;
  const anyReady = cameraAvailable || printerCount > 0;

  // Overall badge
  if (allReady) {
    setClass("bridgeBadge", "badge badge-ready");
    setText("bridgeBadge", "Siap pakai");
  } else if (anyReady) {
    setClass("bridgeBadge", "badge badge-waiting");
    setText("bridgeBadge", "Sebagian siap");
  } else if (bridgeStatus?.running) {
    setClass("bridgeBadge", "badge badge-waiting");
    setText("bridgeBadge", "Bridge aktif");
  } else {
    setClass("bridgeBadge", "badge badge-error");
    setText("bridgeBadge", "Belum siap");
  }

  // Camera panel
  if (cameraAvailable) {
    setClass("cameraBadge", "badge badge-ready");
    setText("cameraBadge", `${cameraCount} terdeteksi`);
    const typeLabel = cameraType === "dslr" ? "DSLR (Canon)" : "Webcam / USB Camera";
    setText("cameraStatus", `Kamera aktif (${typeLabel})`);
    renderNotes("cameraNotes", cameraDevices);
  } else {
    setClass("cameraBadge", "badge badge-error");
    setText("cameraBadge", "Tidak terdeteksi");
    setText("cameraStatus", "Kamera tidak terdeteksi");
    const camNotes = [];
    if (cameraError) camNotes.push(cameraError);
    if (cameraType === "none" && !cameraError) {
      camNotes.push("Pastikan kamera/webcam USB tersambung ke PC.");
      camNotes.push("Untuk DSLR Canon: nyalakan kamera, mode PC/PTP, kabel USB rapat.");
    }
    renderNotes("cameraNotes", camNotes);
  }

  // Printer panel
  if (printerCount > 0) {
    setClass("printerBadge", "badge badge-ready");
    setText("printerBadge", `${printerCount} terdeteksi`);
    setText("printerStatus", "Printer aktif");
    renderNotes("printerNotes", printers);
  } else {
    setClass("printerBadge", "badge badge-error");
    setText("printerBadge", "Tidak terdeteksi");
    setText("printerStatus", "Printer tidak terdeteksi");
    renderNotes("printerNotes", ["Pastikan printer USB tersambung dan menyala."]);
  }

  // Action text
  const actionEl = document.getElementById("bridgeAction");
  if (actionEl) {
    if (allReady) {
      actionEl.textContent = "Semua perangkat siap. Anda bisa langsung buka booth dan mulai sesi foto.";
    } else if (cameraAvailable && printerCount === 0) {
      actionEl.textContent = "Kamera siap, tetapi printer belum terdeteksi. Pastikan printer menyala dan tersambung.";
    } else if (!cameraAvailable && printerCount > 0) {
      actionEl.textContent = "Printer siap, tetapi kamera belum terdeteksi. Pastikan kamera/webcam tersambung.";
    } else if (bridgeStatus?.running) {
      actionEl.textContent = "Bridge aktif. Biarkan app terbuka 5-10 detik, lalu klik Cek lagi.";
    } else {
      actionEl.textContent = bridgeStatus?.action || "Bridge belum siap. Klik Nyalakan ulang bridge.";
    }
  }
}

async function refreshBridgeStatus(method = "get") {
  setText("cameraStatus", "Memeriksa...");
  setText("printerStatus", "Memeriksa...");
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d

  try {
    const bridgeStatus = method === "restart"
      ? await window.fremioBooth.restartBridge()
      : await window.fremioBooth.getBridgeStatus();
    renderBridgeStatus(bridgeStatus);
  } catch (error) {
    renderBridgeStatus({
      running: false,
<<<<<<< HEAD
      cameraAvailable: false,
      summary: "Gagal membaca status perangkat.",
      action: error instanceof Error ? error.message : "Unknown error",
      notes: [],
=======
      raw: {},
      action: error instanceof Error ? error.message : "Gagal membaca status perangkat.",
>>>>>>> 93a9667117c88f5d4cf4dc3546ef98bc4cda2d7d
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
