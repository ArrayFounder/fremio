let bridgePollTimer = null;
let bridgePollingEnabled = false;

const launcherSession = {
  operatorName: "",
  booths: [],
};

const DEFAULT_START_LABEL = "Masuk Booth";

function setText(id, text) {
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function setClass(id, className) {
  const el = document.getElementById(id);
  if (el) el.className = className;
}

function setPostLoginVisibility(isVisible) {
  const loginStep = document.getElementById("loginStep");
  const boothStep = document.getElementById("boothStep");
  if (loginStep) loginStep.hidden = isVisible;
  if (boothStep) boothStep.hidden = !isVisible;
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function parseBoothUrl(rawValue, fallbackBaseUrl) {
  const raw = String(rawValue || "").trim();
  if (!raw) return { ok: false, reason: "empty" };

  try {
    const parsed = new URL(raw);
    const match = (parsed.pathname || "").match(/\/b\/([^/?#]+)/i);
    if (!match || !match[1]) return { ok: false, reason: "missing-slug" };
    return {
      ok: true,
      baseUrl: normalizeBaseUrl(`${parsed.protocol}//${parsed.host}`),
      slug: decodeURIComponent(match[1]),
    };
  } catch {
    if (!fallbackBaseUrl) return { ok: false, reason: "invalid-url" };
    const candidate = raw.startsWith("/") ? raw : `/${raw}`;
    const match = candidate.match(/\/b\/([^/?#]+)/i);
    if (!match || !match[1]) return { ok: false, reason: "missing-slug" };
    return {
      ok: true,
      baseUrl: normalizeBaseUrl(fallbackBaseUrl),
      slug: decodeURIComponent(match[1]),
    };
  }
}

function stopBridgePolling() {
  bridgePollingEnabled = false;
  if (bridgePollTimer) {
    window.clearInterval(bridgePollTimer);
    bridgePollTimer = null;
  }
}

function startBridgePolling() {
  if (bridgePollingEnabled) return;
  bridgePollingEnabled = true;
  bridgePollTimer = window.setInterval(() => {
    void refreshBridgeStatus("get");
  }, 5000);
}

function normalizeDeviceNote(device) {
  if (!device) return "";
  if (typeof device === "string") return device;
  const model = String(device?.model || device?.name || "Canon Camera").trim();
  const port = String(device?.port || device?.path || "").trim();
  return port ? `${model} (${port})` : model;
}

function renderNotes(id, items) {
  const el = document.getElementById(id);
  if (!el) return;
  el.innerHTML = "";
  const list = Array.isArray(items) ? items.map((item) => normalizeDeviceNote(item)).filter(Boolean) : [];
  list.forEach((note) => {
    const li = document.createElement("li");
    li.textContent = note;
    el.appendChild(li);
  });
}

function renderBridgeStatus(bridgeStatus) {
  const raw = bridgeStatus?.raw || {};
  const camera = raw.camera || {};
  const printers = Array.isArray(raw.printers) ? raw.printers : Array.isArray(bridgeStatus?.printers) ? bridgeStatus.printers : [];

  const rawDevices = Array.isArray(camera.devices)
    ? camera.devices
    : Array.isArray(camera.cameras)
      ? camera.cameras
      : Array.isArray(bridgeStatus?.cameraDevices)
        ? bridgeStatus.cameraDevices
        : [];
  const cameraDevices = rawDevices.map((device) => normalizeDeviceNote(device)).filter(Boolean);

  const cameraCount = Number(camera.count || bridgeStatus?.cameraCount || cameraDevices.length || 0);
  const cameraAvailable = typeof camera.available === "boolean"
    ? camera.available
    : typeof bridgeStatus?.cameraAvailable === "boolean"
      ? bridgeStatus.cameraAvailable
      : cameraCount > 0;
  const cameraType = camera.type || bridgeStatus?.cameraType || (cameraAvailable ? "dslr" : "none");
  const cameraError = camera.error || bridgeStatus?.cameraError || "";

  const printerCount = printers.length;
  const allReady = cameraAvailable && printerCount > 0;
  const anyReady = cameraAvailable || printerCount > 0;

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

  try {
    const bridgeStatus = method === "restart"
      ? await window.fremioBooth.restartBridge()
      : await window.fremioBooth.getBridgeStatus();
    renderBridgeStatus(bridgeStatus);
  } catch (error) {
    renderBridgeStatus({
      running: false,
      raw: {},
      action: error instanceof Error ? error.message : "Gagal membaca status perangkat.",
    });
  }
}

function setStartButton(startBoothButton, label, enabled) {
  if (!startBoothButton) return;
  startBoothButton.textContent = label || DEFAULT_START_LABEL;
  startBoothButton.disabled = !enabled;
}

function fillBoothOptions(boothSelectEl, booths, preferredUrl) {
  if (!boothSelectEl) return;
  boothSelectEl.innerHTML = "";

  if (!Array.isArray(booths) || booths.length === 0) {
    const option = document.createElement("option");
    option.value = "";
    option.textContent = "Tidak ada booth aktif di akun ini";
    boothSelectEl.appendChild(option);
    boothSelectEl.disabled = true;
    return;
  }

  const placeholder = document.createElement("option");
  placeholder.value = "";
  placeholder.textContent = "Pilih booth...";
  boothSelectEl.appendChild(placeholder);

  booths.forEach((booth) => {
    const option = document.createElement("option");
    option.value = booth.boothUrl;
    option.textContent = `${booth.boothName} (/b/${booth.slug})`;
    option.dataset.boothName = booth.boothName;
    boothSelectEl.appendChild(option);
  });

  const preferred = String(preferredUrl || "").trim();
  if (preferred && booths.some((booth) => booth.boothUrl === preferred)) {
    boothSelectEl.value = preferred;
  }

  boothSelectEl.disabled = false;
}

async function boot() {
  const form = document.getElementById("setup-form");
  const statusEl = document.getElementById("status");
  const authStatusEl = document.getElementById("authStatus");
  const accountNameEl = document.getElementById("accountName");

  const emailInputEl = document.getElementById("emailInput");
  const passwordInputEl = document.getElementById("passwordInput");
  const loginButton = document.getElementById("loginButton");
  const googleLoginButton = document.getElementById("googleLoginButton");

  const boothSelectEl = document.getElementById("boothSelect");
  const startBoothButton = document.getElementById("startBoothButton");
  const backToLoginButton = document.getElementById("backToLoginButton");
  const logoutButton = document.getElementById("logoutButton");

  const refreshBridgeButton = document.getElementById("refreshBridgeButton");
  const restartBridgeButton = document.getElementById("restartBridgeButton");

  setPostLoginVisibility(false);
  stopBridgePolling();

  const existing = await window.fremioBooth.getConfig();
  const initialBase = normalizeBaseUrl(existing?.studioBaseUrl || "https://studio.fremio.id");
  const initialSlug = existing?.boothSlug || "";
  const initialBoothUrl = initialSlug ? `${initialBase}/b/${encodeURIComponent(initialSlug)}` : "";

  setStartButton(startBoothButton, DEFAULT_START_LABEL, false);

  fillBoothOptions(boothSelectEl, [], "");

  const refreshStartButtonLabel = () => {
    const parsed = parseBoothUrl(boothSelectEl.value, initialBase);
    if (!parsed.ok) {
      setStartButton(startBoothButton, DEFAULT_START_LABEL, false);
      return;
    }
    setStartButton(startBoothButton, DEFAULT_START_LABEL, true);
  };

  const applyLoginResult = (result, fallbackEmail) => {
    if (!result?.success || !result?.data) {
      throw new Error(result?.error || "Login launcher gagal.");
    }

    const operatorName = result.data?.operator?.businessName || result.data?.operator?.email || fallbackEmail;
    const booths = Array.isArray(result.data.booths) ? result.data.booths : [];
    launcherSession.operatorName = operatorName;
    launcherSession.booths = booths;

    accountNameEl.textContent = operatorName;
    authStatusEl.textContent = "";

    fillBoothOptions(boothSelectEl, booths, initialBoothUrl);
    refreshStartButtonLabel();
    setPostLoginVisibility(true);
  };

  const resetLoginResult = (message) => {
    authStatusEl.textContent = message;
    accountNameEl.textContent = "Belum login";
    launcherSession.operatorName = "";
    launcherSession.booths = [];
    fillBoothOptions(boothSelectEl, [], "");
    refreshStartButtonLabel();
    stopBridgePolling();
    setPostLoginVisibility(false);
  };

  try {
    const savedSession = await window.fremioBooth.launcherGetSession?.();
    if (savedSession?.success && savedSession?.data) {
      applyLoginResult(savedSession, "Fremio");
    }
  } catch {}

  const doLauncherLogin = async () => {
    const studioBaseUrl = initialBase || "https://studio.fremio.id";
    const email = String(emailInputEl.value || "").trim();
    const password = String(passwordInputEl.value || "");

    if (!email || !password) {
      authStatusEl.textContent = "Email dan password wajib diisi.";
      return;
    }

    authStatusEl.textContent = "Memverifikasi akun...";
    loginButton.disabled = true;
    if (googleLoginButton) googleLoginButton.disabled = true;

    try {
      const result = await window.fremioBooth.launcherLogin({
        studioBaseUrl,
        email,
        password,
      });
      applyLoginResult(result, email);
    } catch (error) {
      resetLoginResult(error instanceof Error ? error.message : "Login launcher gagal.");
    } finally {
      loginButton.disabled = false;
      if (googleLoginButton) googleLoginButton.disabled = false;
    }
  };

  const doGoogleLogin = async () => {
    const studioBaseUrl = initialBase || "https://studio.fremio.id";
    authStatusEl.textContent = "Membuka login Google...";
    loginButton.disabled = true;
    if (googleLoginButton) googleLoginButton.disabled = true;

    try {
      const result = await window.fremioBooth.launcherGoogleLogin({ studioBaseUrl });
      applyLoginResult(result, "Google");
    } catch (error) {
      resetLoginResult(error instanceof Error ? error.message : "Login Google gagal.");
    } finally {
      loginButton.disabled = false;
      if (googleLoginButton) googleLoginButton.disabled = false;
    }
  };

  loginButton?.addEventListener("click", () => {
    void doLauncherLogin();
  });

  googleLoginButton?.addEventListener("click", () => {
    void doGoogleLogin();
  });

  backToLoginButton?.addEventListener("click", () => {
    statusEl.textContent = "";
    setPostLoginVisibility(false);
  });

  logoutButton?.addEventListener("click", async () => {
    statusEl.textContent = "";
    await window.fremioBooth.launcherLogout?.();
    resetLoginResult("");
  });

  emailInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void doLauncherLogin();
    }
  });

  passwordInputEl?.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void doLauncherLogin();
    }
  });

  boothSelectEl?.addEventListener("change", () => {
    refreshStartButtonLabel();
  });

  refreshBridgeButton?.addEventListener("click", () => {
    void refreshBridgeStatus("get");
  });

  restartBridgeButton?.addEventListener("click", () => {
    void refreshBridgeStatus("restart");
  });

  authStatusEl.textContent = "";
  refreshStartButtonLabel();

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    statusEl.textContent = "Membuka booth...";

    try {
      const selectedBoothUrl = String(boothSelectEl.value || "").trim();
      const parsed = parseBoothUrl(selectedBoothUrl, initialBase);
      if (!parsed.ok) {
        statusEl.textContent = "Pilih booth dulu dari daftar login.";
        return;
      }

      await window.fremioBooth.saveConfig({
        studioBaseUrl: parsed.baseUrl,
        boothUrl: selectedBoothUrl,
      });
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
  stopBridgePolling();
});
