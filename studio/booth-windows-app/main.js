const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, systemPreferences } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const path = require("path");

const DEFAULT_CONFIG = {
  studioBaseUrl: "https://studio.fremio.id",
  boothSlug: "",
  kiosk: true,
};

const BRIDGE_PORT = 7432;
const BRIDGE_STATUS_URL = `http://127.0.0.1:${BRIDGE_PORT}/status`;
const MAX_LOG_CHARS = 4000;

function getAppIconPath() {
  return path.join(__dirname, "build", "icon.ico");
}

let boothWindow = null;
let setupWindow = null;
let currentConfig = null;
let hardwareAgentProcess = null;
let hardwareAgentExit = null;
let hardwareAgentStdout = "";
let hardwareAgentStderr = "";
let bridgeWatchdogTimer = null;
let bridgeHealthFailCount = 0;

function trimLog(input) {
  return input.length > MAX_LOG_CHARS ? input.slice(-MAX_LOG_CHARS) : input;
}

function appendAgentLog(stream, chunk) {
  const text = String(chunk || "");
  if (!text) return;

  if (stream === "stderr") {
    hardwareAgentStderr = trimLog(`${hardwareAgentStderr}${text}`);
    return;
  }

  hardwareAgentStdout = trimLog(`${hardwareAgentStdout}${text}`);
}

function getAgentRootPath() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "embedded-agent", "agent");
  }

  return path.resolve(__dirname, "..", "..", "agent");
}

function getAgentEntryPath() {
  return path.join(getAgentRootPath(), "dist", "server.js");
}

function getBundledToolsPath(subPath) {
  if (!process.resourcesPath) return null;
  return path.join(process.resourcesPath, "tools", subPath);
}

function findWindowsGphoto2Path() {
  if (process.platform !== "win32") return null;

  const pathCandidates = String(process.env.PATH || "")
    .split(";")
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => path.join(entry, "gphoto2.exe"));

  const candidates = [
    process.env.GPHOTO2_PATH,
    getBundledToolsPath(path.join("gphoto2", "gphoto2.exe")),
    "C:\\msys64\\mingw64\\bin\\gphoto2.exe",
    "C:\\msys64\\ucrt64\\bin\\gphoto2.exe",
    "C:\\Program Files\\gPhoto2\\bin\\gphoto2.exe",
    "C:\\Program Files (x86)\\gPhoto2\\bin\\gphoto2.exe",
    ...pathCandidates,
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
}

function startHardwareAgent() {
  if (hardwareAgentProcess && !hardwareAgentProcess.killed) return;

  const agentEntryPath = getAgentEntryPath();
  if (!fs.existsSync(agentEntryPath)) {
    hardwareAgentStderr = trimLog(`${hardwareAgentStderr}\nFile bridge tidak ditemukan: ${agentEntryPath}`);
    return;
  }

  const agentRootPath = getAgentRootPath();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(BRIDGE_PORT),
  };

  const gphoto2Path = findWindowsGphoto2Path();
  if (gphoto2Path) env.GPHOTO2_PATH = gphoto2Path;
  appendAgentLog("stdout", `\n[launcher] start hardware bridge; gphoto2=${env.GPHOTO2_PATH || "PATH"}`);

  hardwareAgentExit = null;
  hardwareAgentProcess = spawn(process.execPath, [agentEntryPath], {
    cwd: agentRootPath,
    env,
    windowsHide: true,
    stdio: ["ignore", "pipe", "pipe"],
  });

  hardwareAgentProcess.stdout?.on("data", (chunk) => appendAgentLog("stdout", chunk));
  hardwareAgentProcess.stderr?.on("data", (chunk) => appendAgentLog("stderr", chunk));

  hardwareAgentProcess.on("error", (error) => {
    appendAgentLog("stderr", `\n[launcher] bridge process error: ${error.message}`);
    hardwareAgentStderr = trimLog(`${hardwareAgentStderr}\n${error.message}`);
    hardwareAgentExit = { code: null, signal: null, at: new Date().toISOString() };
    hardwareAgentProcess = null;
  });

  hardwareAgentProcess.on("exit", (code, signal) => {
    appendAgentLog("stderr", `\n[launcher] bridge process exit: code=${code} signal=${signal}`);
    hardwareAgentExit = { code, signal, at: new Date().toISOString() };
    hardwareAgentProcess = null;
  });
}

function stopHardwareAgent() {
  if (!hardwareAgentProcess || hardwareAgentProcess.killed) return;
  hardwareAgentProcess.kill();
}

function startBridgeWatchdog() {
  if (bridgeWatchdogTimer) return;

  bridgeWatchdogTimer = setInterval(async () => {
    if (!hardwareAgentProcess || hardwareAgentProcess.killed) {
      startHardwareAgent();
      return;
    }

    try {
      await requestJson(BRIDGE_STATUS_URL, 1200);
      bridgeHealthFailCount = 0;
    } catch {
      bridgeHealthFailCount += 1;
      if (bridgeHealthFailCount >= 3) {
        appendAgentLog("stderr", "\n[launcher] bridge health-check failed 3x, restarting...");
        stopHardwareAgent();
        startHardwareAgent();
        bridgeHealthFailCount = 0;
      }
    }
  }, 5000);
}

function stopBridgeWatchdog() {
  if (!bridgeWatchdogTimer) return;
  clearInterval(bridgeWatchdogTimer);
  bridgeWatchdogTimer = null;
  bridgeHealthFailCount = 0;
}

function requestJson(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      let body = "";

      res.setEncoding("utf8");
      res.on("data", (chunk) => {
        body += chunk;
      });
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        try {
          resolve(JSON.parse(body));
        } catch (error) {
          reject(error);
        }
      });
    });

    req.on("error", reject);
    req.on("timeout", () => {
      req.destroy(new Error("timeout"));
    });
  });
}

function simplifyBridgeError(errorText) {
  const normalized = String(errorText || "").replace(/\s+/g, " ").trim();

  if (!normalized) return "";
  if (/gphoto2 tidak ditemukan/i.test(normalized)) {
    return "Komponen kamera Canon belum terpasang di Windows. Jalankan instalasi kamera sekali saja.";
  }
  if (/No camera found|Could not detect any camera/i.test(normalized)) {
    return "Bridge aktif, tetapi kamera belum terbaca. Pastikan kamera menyala dan kabel USB terpasang rapat.";
  }
  if (/Could not claim the USB device/i.test(normalized)) {
    return "Kamera sedang dipakai aplikasi lain. Tutup aplikasi kamera lain lalu cabut-colok USB kamera.";
  }

  return normalized;
}

async function getBridgeStatus() {
  try {
    const payload = await requestJson(BRIDGE_STATUS_URL);
    const camera = payload?.camera || {};
    const printers = Array.isArray(payload?.printers) ? payload.printers : [];
    const cameraAvailable = Boolean(camera.available);
    const cameraCount = Number(camera.count || 0);
    const cameraType = camera.type || "none";
    const cameraDevices = Array.isArray(camera.devices) ? camera.devices : [];
    const cameraError = camera.error || "";
    const printerCount = printers.length;

    return {
      ok: true,
      running: true,
      endpoint: BRIDGE_STATUS_URL,
      summary: cameraAvailable ? "Kamera siap dipakai." : "Bridge aktif.",
      action: cameraAvailable
        ? "Anda bisa langsung buka booth dan mulai sesi foto."
        : "Kalau kamera belum muncul, nyalakan kamera lalu cabut-colok kabel USB sekali.",
      cameraAvailable,
      cameraCount,
      cameraType,
      cameraDevices,
      cameraError,
      printerCount,
      printers,
      raw: payload,
      agentPid: hardwareAgentProcess?.pid || null,
    };
  } catch (_error) {
    const notes = [];

    if (hardwareAgentProcess?.pid) {
      notes.push("Launcher sedang menyalakan bridge lokal di background.");
    }

    if (hardwareAgentExit) {
      notes.push("Bridge sempat berjalan lalu berhenti. Tutup app lalu buka lagi.");
    }

    if (hardwareAgentStderr) {
      notes.push(simplifyBridgeError(hardwareAgentStderr));
    }

    return {
      ok: false,
      running: false,
      endpoint: BRIDGE_STATUS_URL,
      summary: "Bridge kamera belum siap.",
      action: "Biarkan app tetap terbuka 5-10 detik, lalu klik cek lagi.",
      cameraAvailable: false,
      cameraCount: 0,
      cameraType: "none",
      cameraDevices: [],
      cameraError: "",
      printerCount: 0,
      printers: [],
      raw: {},
      agentPid: hardwareAgentProcess?.pid || null,
    };
  }
}

function getConfigPath() {
  return path.join(app.getPath("userData"), "booth-config.json");
}

function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG, ...(input || {}) };
  cfg.studioBaseUrl = String(cfg.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl).trim().replace(/\/+$/, "");
  cfg.boothSlug = String(cfg.boothSlug || "").trim();
  cfg.kiosk = Boolean(cfg.kiosk);
  return cfg;
}

function loadConfig() {
  const configPath = getConfigPath();
  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return sanitizeConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function saveConfig(nextConfig) {
  const configPath = getConfigPath();
  const clean = sanitizeConfig(nextConfig);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(clean, null, 2), "utf8");
  currentConfig = clean;
  return clean;
}

function buildBoothUrl(config) {
  return `${config.studioBaseUrl}/b/${encodeURIComponent(config.boothSlug)}`;
}

function applyPermissionRules() {
  // macOS needs explicit camera/mic entitlement request at runtime.
  if (process.platform === "darwin") {
    try {
      if (systemPreferences.getMediaAccessStatus("camera") !== "granted") {
        systemPreferences.askForMediaAccess("camera").catch(() => {});
      }
      if (systemPreferences.getMediaAccessStatus("microphone") !== "granted") {
        systemPreferences.askForMediaAccess("microphone").catch(() => {});
      }
    } catch {
      // Best effort only.
    }
  }

  session.defaultSession.setPermissionCheckHandler((_webContents, permission, requestingOrigin) => {
    const allowedOrigin = currentConfig?.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl;
    const sameOrigin = requestingOrigin?.startsWith(allowedOrigin);
    if (!sameOrigin) return false;
    return ["media", "camera", "microphone", "fullscreen"].includes(permission);
  });

  session.defaultSession.setPermissionRequestHandler((webContents, permission, callback) => {
    const url = webContents.getURL();
    const allowedOrigin = currentConfig?.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl;
    const sameOrigin = url.startsWith(allowedOrigin);

    if (sameOrigin && ["media", "camera", "microphone", "fullscreen"].includes(permission)) {
      callback(true);
      return;
    }

    callback(false);
  });
}

function createBoothWindow() {
  boothWindow = new BrowserWindow({
    width: 1366,
    height: 768,
    backgroundColor: "#0b0b0b",
    autoHideMenuBar: true,
    fullscreen: Boolean(currentConfig.kiosk),
    kiosk: Boolean(currentConfig.kiosk),
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  boothWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  boothWindow.webContents.on("will-navigate", (event, url) => {
    const allowedPrefix = currentConfig.studioBaseUrl;
    if (!url.startsWith(allowedPrefix)) event.preventDefault();
  });

  boothWindow.on("closed", () => {
    boothWindow = null;
  });

  if (!currentConfig.boothSlug) {
    openSetupWindow();
    return;
  }

  const targetUrl = buildBoothUrl(currentConfig);
  boothWindow.loadURL(targetUrl);
}

function openSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 480,
    height: 560,
    resizable: false,
    autoHideMenuBar: true,
    alwaysOnTop: true,
    title: "Fremio Studio Setup",
    icon: getAppIconPath(),
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: true,
    },
  });

  setupWindow.loadFile(path.join(__dirname, "setup.html"));

  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

function reloadBoothWindow() {
  if (!boothWindow || boothWindow.isDestroyed()) {
    createBoothWindow();
    return;
  }

  boothWindow.setKiosk(Boolean(currentConfig.kiosk));
  boothWindow.setFullScreen(Boolean(currentConfig.kiosk));

  if (!currentConfig.boothSlug) {
    openSetupWindow();
    return;
  }

  boothWindow.loadURL(buildBoothUrl(currentConfig));
}

function registerIpcHandlers() {
  ipcMain.handle("booth:get-config", () => currentConfig);

  ipcMain.handle("booth:save-config", (_event, nextConfig) => {
    const saved = saveConfig(nextConfig);
    reloadBoothWindow();
    if (setupWindow && !setupWindow.isDestroyed()) setupWindow.close();
    return saved;
  });

  ipcMain.handle("booth:open-setup", () => {
    openSetupWindow();
    return true;
  });

  ipcMain.handle("booth:reload", () => {
    reloadBoothWindow();
    return true;
  });

  ipcMain.handle("bridge:get-status", () => getBridgeStatus());
  ipcMain.handle("bridge:restart", async () => {
    stopHardwareAgent();
    startHardwareAgent();
    return getBridgeStatus();
  });
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+S", () => openSetupWindow());
  globalShortcut.register("CommandOrControl+R", () => reloadBoothWindow());
}

app.whenReady().then(async () => {
  currentConfig = loadConfig();
  startHardwareAgent();
  startBridgeWatchdog();
  applyPermissionRules();
  registerIpcHandlers();
  registerShortcuts();

  createBoothWindow();

  if (!currentConfig.boothSlug) openSetupWindow();
});

app.on("window-all-closed", () => {
  stopBridgeWatchdog();
  stopHardwareAgent();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!boothWindow) createBoothWindow();
});

app.on("will-quit", () => {
  stopBridgeWatchdog();
  stopHardwareAgent();
  globalShortcut.unregisterAll();
});
