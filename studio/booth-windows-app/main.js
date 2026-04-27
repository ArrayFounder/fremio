const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, systemPreferences } = require("electron");
const fs = require("fs");
const path = require("path");

const DEFAULT_CONFIG = {
  studioBaseUrl: "https://studio.fremio.id",
  boothSlug: "",
  kiosk: true,
};

function getAppIconPath() {
  return path.join(__dirname, "build", "icon.ico");
}

let boothWindow = null;
let setupWindow = null;
let currentConfig = null;

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
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+S", () => openSetupWindow());
  globalShortcut.register("CommandOrControl+R", () => reloadBoothWindow());
}

app.whenReady().then(async () => {
  currentConfig = loadConfig();
  applyPermissionRules();
  registerIpcHandlers();
  registerShortcuts();

  createBoothWindow();

  if (!currentConfig.boothSlug) openSetupWindow();
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (!boothWindow) createBoothWindow();
});

app.on("will-quit", () => {
  globalShortcut.unregisterAll();
});
