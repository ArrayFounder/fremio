const { app, BrowserWindow, ipcMain, shell, session, globalShortcut, systemPreferences, nativeImage, protocol, net: electronNet } = require("electron");
const { spawn } = require("child_process");
const fs = require("fs");
const http = require("http");
const https = require("https");
const net = require("net");
const path = require("path");
const { pathToFileURL } = require("url");

const DEFAULT_CONFIG = {
  studioBaseUrl: "https://studio.fremio.id",
  boothSlug: "",
  kiosk: true,
};

const BRIDGE_PORT = 7432;
const BRIDGE_STATUS_URL = `http://127.0.0.1:${BRIDGE_PORT}/status`;
const BRIDGE_HEALTH_URL = `http://127.0.0.1:${BRIDGE_PORT}/health`;
const MAX_LOG_CHARS = 4000;
const CAPTURE_MAX_EDGE = 2000;
const CAPTURE_JPEG_QUALITY = 86;

protocol.registerSchemesAsPrivileged([
  {
    scheme: "fremio-agent",
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      stream: true,
    },
  },
]);

function getAppIconPath() {
  return path.join(__dirname, "build", "icon.ico");
}

let boothWindow = null;
let setupWindow = null;
let authWindow = null;
let currentConfig = null;
let hardwareAgentProcess = null;
let hardwareAgentExit = null;
let hardwareAgentStdout = "";
let hardwareAgentStderr = "";
let bridgeWatchdogTimer = null;
let bridgeHealthFailCount = 0;

function normalizePositiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function escapeHtmlAttr(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function writeBase64ImageToTemp(input) {
  const tmpFile = path.join(app.getPath("temp"), `fremio-electron-print-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
  if (String(input || "").startsWith("data:")) {
    const base64 = String(input).split(",")[1] || "";
    fs.writeFileSync(tmpFile, Buffer.from(base64, "base64"));
    return tmpFile;
  }

  const text = String(input || "").trim();
  if (/^[A-Za-z0-9+/=\r\n]+$/.test(text)) {
    fs.writeFileSync(tmpFile, Buffer.from(text, "base64"));
    return tmpFile;
  }

  return null;
}

function downloadImageToTemp(input, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      reject(new Error("Terlalu banyak redirect saat mengambil gambar print"));
      return;
    }

    const tmpFile = path.join(app.getPath("temp"), `fremio-electron-print-${Date.now()}-${Math.random().toString(16).slice(2)}.jpg`);
    const client = String(input || "").startsWith("https://") ? https : http;
    const req = client.get(input, (res) => {
      if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        fs.unlink(tmpFile, () => {});
        downloadImageToTemp(new URL(res.headers.location, input).toString(), redirectCount + 1).then(resolve).catch(reject);
        return;
      }

      if (res.statusCode && res.statusCode >= 400) {
        fs.unlink(tmpFile, () => {});
        reject(new Error(`HTTP ${res.statusCode} saat mengambil gambar print`));
        return;
      }

      const contentType = String(res.headers["content-type"] || "").toLowerCase();
      if (contentType && !contentType.startsWith("image/")) {
        fs.unlink(tmpFile, () => {});
        reject(new Error(`URL print bukan gambar (${contentType})`));
        return;
      }

      const file = fs.createWriteStream(tmpFile);
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(tmpFile)));
      file.on("error", (err) => {
        fs.unlink(tmpFile, () => {});
        reject(err);
      });
    });
    req.setTimeout(20000, () => req.destroy(new Error("Timeout mengambil gambar print")));
    req.on("error", (err) => {
      fs.unlink(tmpFile, () => {});
      reject(err);
    });
  });
}

async function resolveElectronPrintImage(input) {
  const directFile = writeBase64ImageToTemp(input);
  if (directFile) return directFile;

  const text = String(input || "").trim();
  if (text.startsWith("http://") || text.startsWith("https://")) return downloadImageToTemp(text);

  throw new Error("Format gambar print tidak didukung");
}

async function printImageSilentlyWithElectron(job) {
  const input = typeof job?.image === "string" && job.image.trim()
    ? job.image.trim()
    : String(job?.imageUrl || "").trim();
  if (!input) throw new Error("image atau imageUrl wajib diisi");

  const imageFile = await resolveElectronPrintImage(input);
  const htmlFile = path.join(app.getPath("temp"), `fremio-electron-print-${Date.now()}-${Math.random().toString(16).slice(2)}.html`);
  const widthMm = normalizePositiveNumber(job?.paperWidthMm, 102);
  const heightMm = normalizePositiveNumber(job?.paperHeightMm, 152);
  const copies = Math.max(1, Math.min(99, Math.round(normalizePositiveNumber(job?.copies, 1))));
  const imageSrc = pathToFileURL(imageFile).toString();
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>@page{size:${widthMm}mm ${heightMm}mm;margin:0}html,body{margin:0;padding:0;width:${widthMm}mm;height:${heightMm}mm;background:#fff;overflow:hidden}img{display:block;width:100%;height:100%;object-fit:contain}</style></head><body><img id="photo" src="${escapeHtmlAttr(imageSrc)}"><script>const img=document.getElementById('photo');function done(){requestAnimationFrame(()=>requestAnimationFrame(()=>document.title='ready'))}if(img.complete&&img.naturalWidth>0){done()}else{img.onload=done;img.onerror=()=>{document.title='error'}}</script></body></html>`;
  fs.writeFileSync(htmlFile, html, "utf8");

  let printWindow = null;
  try {
    printWindow = new BrowserWindow({
      show: false,
      width: Math.max(300, Math.round(widthMm * 4)),
      height: Math.max(300, Math.round(heightMm * 4)),
      webPreferences: {
        sandbox: true,
        contextIsolation: true,
      },
    });

    await printWindow.loadFile(htmlFile);
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("Timeout memuat gambar untuk silent print")), 15000);
      const check = () => {
        if (!printWindow || printWindow.isDestroyed()) {
          clearTimeout(timer);
          reject(new Error("Print window tertutup sebelum siap"));
          return;
        }
        const title = printWindow.webContents.getTitle();
        if (title === "ready") {
          clearTimeout(timer);
          resolve();
          return;
        }
        if (title === "error") {
          clearTimeout(timer);
          reject(new Error("Gagal memuat gambar untuk silent print"));
          return;
        }
        setTimeout(check, 100);
      };
      check();
    });

    await new Promise((resolve, reject) => {
      printWindow.webContents.print({
        silent: true,
        printBackground: true,
        deviceName: String(job?.printerName || ""),
        copies,
        pageSize: { width: Math.round(widthMm * 1000), height: Math.round(heightMm * 1000) },
        margins: { marginType: "none" },
      }, (success, failureReason) => {
        if (success) resolve();
        else reject(new Error(failureReason || "Silent print gagal"));
      });
    });

    return { ok: true, method: "electron-silent" };
  } finally {
    if (printWindow && !printWindow.isDestroyed()) printWindow.close();
    fs.unlink(htmlFile, () => {});
    setTimeout(() => fs.unlink(imageFile, () => {}), 30000);
  }
}

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

function getAgentExecutablePath() {
  if (process.platform !== "win32") return null;
  return path.join(getAgentRootPath(), "fremio-agent-win.exe");
}

function getEmbeddedEdsdkBridgePath() {
  if (process.platform !== "win32") return null;
  const candidate = path.join(getAgentRootPath(), "bin", "edsdk-bridge-native.exe");
  return fs.existsSync(candidate) ? candidate : null;
}

function getEmbeddedEdsdkDllPath() {
  if (process.platform !== "win32") return null;
  const candidates = [
    path.join(getAgentRootPath(), "bin", "EDSDK.dll"),
    getBundledToolsPath(path.join("edsdk", "EDSDK.dll")),
    path.resolve(__dirname, "..", "EDSDK132010CD(13.20.10)", "Windows", "EDSDK_64", "Dll", "EDSDK.dll"),
    path.resolve(__dirname, "..", "EDSDK132010CD(13.20.10)", "Windows", "EDSDK", "Dll", "EDSDK.dll"),
  ].filter(Boolean);

  return candidates.find((candidate) => fs.existsSync(candidate)) || null;
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

async function isBridgeEndpointAlive(timeoutMs = 800) {
  try {
    await requestJson(BRIDGE_STATUS_URL, timeoutMs);
    return true;
  } catch {
    return false;
  }
}

function isBridgePortOpen(timeoutMs = 500) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(ok);
    };

    socket.setTimeout(timeoutMs);
    socket.once("connect", () => finish(true));
    socket.once("timeout", () => finish(false));
    socket.once("error", () => finish(false));
    socket.connect(BRIDGE_PORT, "127.0.0.1");
  });
}

async function isBridgeHealthy(timeoutMs = 1500) {
  try {
    await requestJson(BRIDGE_HEALTH_URL, timeoutMs);
    return true;
  } catch {
    return isBridgePortOpen(timeoutMs);
  }
}

async function startHardwareAgent() {
  if (hardwareAgentProcess && !hardwareAgentProcess.killed) return;

  if (await isBridgePortOpen()) {
    hardwareAgentExit = null;
    appendAgentLog("stdout", "\n[launcher] bridge already running on localhost; reuse existing endpoint");
    return;
  }

  const agentExePath = getAgentExecutablePath();
  const agentEntryPath = getAgentEntryPath();
  const hasAgentExe = Boolean(agentExePath && fs.existsSync(agentExePath));
  const hasAgentEntry = fs.existsSync(agentEntryPath);

  if (!hasAgentExe && !hasAgentEntry) {
    hardwareAgentStderr = trimLog(
      `${hardwareAgentStderr}\nFile bridge tidak ditemukan: ${agentExePath || ""} ${agentEntryPath}`
    );
    return;
  }

  const agentRootPath = getAgentRootPath();
  const env = {
    ...process.env,
    ELECTRON_RUN_AS_NODE: "1",
    PORT: String(BRIDGE_PORT),
    AGENT_PORT: String(BRIDGE_PORT),
    AGENT_CAMERA_BACKEND: process.env.AGENT_CAMERA_BACKEND || "auto",
  };

  const edsdkBridgePath = getEmbeddedEdsdkBridgePath();
  if (edsdkBridgePath) env.EDSDK_BRIDGE_PATH = edsdkBridgePath;

  const edsdkDllPath = getEmbeddedEdsdkDllPath();
  if (edsdkDllPath) env.EDSDK_DLL_PATH = edsdkDllPath;

  const gphoto2Path = findWindowsGphoto2Path();
  if (gphoto2Path) env.GPHOTO2_PATH = gphoto2Path;
  appendAgentLog("stdout", `\n[launcher] start hardware bridge; gphoto2=${env.GPHOTO2_PATH || "PATH"}`);

  const forceExe = process.env.FREMIO_AGENT_USE_EXE === "1";
  const useJsEntry = hasAgentEntry && (!hasAgentExe || !forceExe);
  const command = useJsEntry ? process.execPath : agentExePath;
  const args = useJsEntry ? [agentEntryPath] : [];

  appendAgentLog("stdout", `\n[launcher] agent command=${command} ${args.join(" ")}`);

  hardwareAgentExit = null;
  hardwareAgentProcess = spawn(command, args, {
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
  if (!hardwareAgentProcess || hardwareAgentProcess.killed) return Promise.resolve();

  const processToStop = hardwareAgentProcess;
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, 1500);
    processToStop.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
    processToStop.kill();
  });
}

function startBridgeWatchdog() {
  if (bridgeWatchdogTimer) return;

  bridgeWatchdogTimer = setInterval(async () => {
    if (!hardwareAgentProcess || hardwareAgentProcess.killed) {
      await startHardwareAgent();
      return;
    }

    try {
      if (!(await isBridgeHealthy())) {
        throw new Error("bridge health-check failed");
      }
      bridgeHealthFailCount = 0;
    } catch {
      bridgeHealthFailCount += 1;
      if (bridgeHealthFailCount >= 3) {
        appendAgentLog("stderr", "\n[launcher] bridge health-check failed 3x, restarting...");
        await stopHardwareAgent();
        await startHardwareAgent();
        bridgeHealthFailCount = 0;
      }
    }
  }, 5000);
}

function stopBridgeWatchdog() {
  if (bridgeWatchdogTimer) clearInterval(bridgeWatchdogTimer);
  bridgeWatchdogTimer = null;
}

function registerAgentProtocol() {
  protocol.handle("fremio-agent", async (request) => {
    const parsed = new URL(request.url);
    const endpoint = parsed.pathname && parsed.pathname !== "/" ? parsed.pathname : `/${parsed.hostname}`;
    if (!["/preview-stream", "/preview", "/status", "/health"].includes(endpoint)) {
      return new Response("Not found", { status: 404 });
    }
    return electronNet.fetch(`http://127.0.0.1:${BRIDGE_PORT}${endpoint}${parsed.search}`);
  });
}

function requestJson(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const req = transport.get(parsedUrl, { timeout: timeoutMs }, (res) => {
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

function requestJsonPost(url, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload || {});

    const req = transport.request(
      parsedUrl,
      {
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        let responseBody = "";
        res.setEncoding("utf8");
        res.on("data", (chunk) => {
          responseBody += chunk;
        });
        res.on("end", () => {
          try {
            const parsed = responseBody ? JSON.parse(responseBody) : {};
            if (res.statusCode && res.statusCode >= 400) {
              reject(new Error(parsed?.error || `HTTP ${res.statusCode}`));
              return;
            }
            resolve(parsed);
          } catch {
            reject(new Error("Respon server tidak valid."));
          }
        });
      }
    );

    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

function requestBuffer(url, timeoutMs = 1500) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, { timeout: timeoutMs }, (res) => {
      const chunks = [];
      res.on("data", (chunk) => chunks.push(chunk));
      res.on("end", () => {
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }
        resolve(Buffer.concat(chunks));
      });
    });
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
  });
}

function requestBufferPost(url, payload, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const transport = parsedUrl.protocol === "https:" ? https : http;
    const body = JSON.stringify(payload || {});
    const req = transport.request(
      parsedUrl,
      {
        method: "POST",
        timeout: timeoutMs,
        headers: {
          "Accept": "image/jpeg, application/json",
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (chunk) => chunks.push(chunk));
        res.on("end", () => {
          const buffer = Buffer.concat(chunks);
          if (res.statusCode && res.statusCode >= 400) {
            let message = `HTTP ${res.statusCode}`;
            try {
              const parsed = JSON.parse(buffer.toString("utf8"));
              if (parsed?.error) message = parsed.error;
            } catch {}
            reject(new Error(message));
            return;
          }
          resolve({ buffer, contentType: String(res.headers["content-type"] || "") });
        });
      }
    );
    req.on("error", reject);
    req.on("timeout", () => req.destroy(new Error("timeout")));
    req.write(body);
    req.end();
  });
}

function prepareCaptureImagePayload(buffer) {
  try {
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) {
      return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
    }

    const size = image.getSize();
    const longest = Math.max(size.width, size.height);
    const scale = longest > CAPTURE_MAX_EDGE ? CAPTURE_MAX_EDGE / longest : 1;
    const resized = scale < 1
      ? image.resize({
          width: Math.max(1, Math.round(size.width * scale)),
          height: Math.max(1, Math.round(size.height * scale)),
          quality: "best",
        })
      : image;
    const jpeg = resized.toJPEG(CAPTURE_JPEG_QUALITY);
    return { base64: (jpeg.length ? jpeg : buffer).toString("base64"), mimeType: "image/jpeg" };
  } catch {
    return { base64: buffer.toString("base64"), mimeType: "image/jpeg" };
  }
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

function getElectronPrinterNames(printerCandidates) {
  if (!Array.isArray(printerCandidates)) return [];
  return Array.from(new Set(
    printerCandidates
      .map((printer) => {
        if (typeof printer === "string") return printer.trim();
        return String(printer?.name || "").trim();
      })
      .filter(Boolean)
  ));
}

async function getSystemPrintersFallback() {
  const wc = setupWindow?.webContents || boothWindow?.webContents;
  if (!wc || wc.isDestroyed()) return [];
  try {
    const printers = await wc.getPrintersAsync();
    return getElectronPrinterNames(printers);
  } catch {
    return [];
  }
}

async function getBridgeStatus() {
  try {
    const payload = await requestJson(BRIDGE_STATUS_URL, 20000);
    const camera = payload?.camera || {};
    const nestedPrinters = Array.isArray(payload?.printer?.printers)
      ? payload.printer.printers.map((printer) => String(printer?.name || "").trim()).filter(Boolean)
      : [];
    let printers = Array.isArray(payload?.printers) ? payload.printers : [];
    if (printers.length === 0 && nestedPrinters.length > 0) {
      printers = nestedPrinters;
    }
    if (printers.length === 0) {
      printers = await getSystemPrintersFallback();
    }
    const rawDevices = Array.isArray(camera.devices)
      ? camera.devices
      : Array.isArray(camera.cameras)
        ? camera.cameras
        : [];
    const cameraDevices = rawDevices
      .map((device) => {
        if (typeof device === "string") return { model: device, port: "" };
        const model = String(device?.model || device?.name || "Canon Camera");
        const port = String(device?.port || device?.path || "");
        return { model, port };
      })
      .filter((device) => device.model);
    const cameraCount = Number(camera.count || cameraDevices.length || 0);
    const cameraAvailable = typeof camera.available === "boolean" ? camera.available : cameraCount > 0;
    const cameraType = camera.type || (cameraAvailable ? "dslr" : "none");
    const cameraError = simplifyBridgeError(camera.error || "");
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
    const fallbackPrinters = await getSystemPrintersFallback();
    const printerCount = fallbackPrinters.length;
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

    const diagnostics = notes.filter(Boolean).join(" ");

    return {
      ok: false,
      running: false,
      endpoint: BRIDGE_STATUS_URL,
      summary: "Bridge kamera belum siap.",
      action: diagnostics || (printerCount > 0
        ? "Bridge kamera belum siap, tetapi printer Windows sudah terdeteksi."
        : "Biarkan app tetap terbuka 5-10 detik, lalu klik cek lagi."),
      cameraAvailable: false,
      cameraCount: 0,
      cameraType: "none",
      cameraDevices: [],
      cameraError: diagnostics,
      printerCount,
      printers: fallbackPrinters,
      raw: diagnostics ? { camera: { error: diagnostics } } : {},
      agentPid: hardwareAgentProcess?.pid || null,
    };
  }
}

function getConfigPath() {
  return path.join(app.getPath("userData"), "booth-config.json");
}

function getLauncherSessionPath() {
  return path.join(app.getPath("userData"), "launcher-session.json");
}

function sanitizeConfig(input) {
  const cfg = { ...DEFAULT_CONFIG, ...(input || {}) };

  if (input?.boothUrl) {
    const parsed = parseBoothUrl(input.boothUrl);
    if (parsed) {
      cfg.studioBaseUrl = parsed.studioBaseUrl;
      cfg.boothSlug = parsed.boothSlug;
    }
  }

  cfg.studioBaseUrl = String(cfg.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl).trim().replace(/\/+$/, "");
  cfg.boothSlug = String(cfg.boothSlug || "").trim();
  cfg.kiosk = true;
  return cfg;
}

function parseBoothUrl(boothUrl) {
  const raw = String(boothUrl || "").trim();
  if (!raw) return null;

  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }

  const match = parsed.pathname.match(/^\/b\/([^/?#]+)/);
  if (!match?.[1]) return null;

  return {
    studioBaseUrl: `${parsed.protocol}//${parsed.host}`,
    boothSlug: decodeURIComponent(match[1]),
  };
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

function loadLauncherSession() {
  const sessionPath = getLauncherSessionPath();
  try {
    const raw = fs.readFileSync(sessionPath, "utf8");
    const parsed = JSON.parse(raw);
    if (!parsed?.success || !parsed?.data || !Array.isArray(parsed.data.booths)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveLauncherSession(result, studioBaseUrl) {
  if (!result?.success || !result?.data) return null;
  const clean = {
    success: true,
    data: {
      operator: result.data.operator || null,
      booths: Array.isArray(result.data.booths) ? result.data.booths : [],
      studioBaseUrl,
      savedAt: new Date().toISOString(),
    },
  };
  const sessionPath = getLauncherSessionPath();
  fs.mkdirSync(path.dirname(sessionPath), { recursive: true });
  fs.writeFileSync(sessionPath, JSON.stringify(clean, null, 2), "utf8");
  return clean;
}

async function clearLauncherSession() {
  try {
    fs.rmSync(getLauncherSessionPath(), { force: true });
  } catch {}
  try {
    await session.defaultSession.clearStorageData({ storages: ["cookies"] });
  } catch {}
  if (authWindow && !authWindow.isDestroyed()) authWindow.close();
  return true;
}

function buildBoothUrl(config) {
  return `${config.studioBaseUrl}/b/${encodeURIComponent(config.boothSlug)}`;
}

function getAllowedBoothPrefix(config) {
  if (!config?.boothSlug) return null;
  return `${config.studioBaseUrl}/b/${encodeURIComponent(config.boothSlug)}`;
}

function isAllowedBoothUrl(url, config) {
  const allowedBoothPrefix = getAllowedBoothPrefix(config);
  if (!allowedBoothPrefix) return false;

  return (
    url === allowedBoothPrefix ||
    url.startsWith(`${allowedBoothPrefix}/`) ||
    url.startsWith(`${allowedBoothPrefix}?`) ||
    url.startsWith(`${allowedBoothPrefix}#`)
  );
}

function buildLoginUrl(config) {
  return `${config.studioBaseUrl}/login`;
}

function normalizeBaseUrl(url) {
  return String(url || "").trim().replace(/\/+$/, "");
}

function loadIdleScreen() {
  if (!boothWindow || boothWindow.isDestroyed()) return;
  const html = `<!doctype html><html><head><meta charset="utf-8" /><title>Fremio Studio</title><style>body{margin:0;background:#0b0b0b;color:#d1d5db;font-family:Segoe UI,Tahoma,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh}main{text-align:center;max-width:420px;padding:24px}h1{font-size:24px;margin:0 0 10px}p{margin:0;color:#9ca3af;line-height:1.5}</style></head><body><main><h1>Fremio Studio</h1><p>Silakan login, pilih link booth, lalu mulai sesi dari jendela setup.</p></main></body></html>`;
  boothWindow.loadURL(`data:text/html;charset=UTF-8,${encodeURIComponent(html)}`);
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
    fullscreen: false,
    kiosk: false,
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
    if (String(url || "").startsWith("data:text/html")) return;
    if (!isAllowedBoothUrl(url, currentConfig)) event.preventDefault();
  });

  boothWindow.webContents.on("did-navigate-in-page", (_event, url) => {
    const hasBoothSlug = Boolean(currentConfig?.boothSlug);
    if (!hasBoothSlug) return;
    if (isAllowedBoothUrl(url, currentConfig)) return;

    boothWindow.loadURL(buildBoothUrl(currentConfig));
  });

  // Debug logging untuk mendiagnosis layar hitam
  boothWindow.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL) => {
    console.error("[main] did-fail-load:", { errorCode, errorDescription, validatedURL });
  });

  boothWindow.webContents.on("render-process-gone", (_event, details) => {
    console.error("[main] render-process-gone:", details);
  });

  boothWindow.webContents.on("console-message", (_event, level, message) => {
    const label = ["verbose", "info", "warning", "error"][level] || String(level);
    console.log(`[renderer ${label}]`, message);
  });

  boothWindow.on("unresponsive", () => {
    console.error("[main] boothWindow became unresponsive");
  });

  boothWindow.on("closed", () => {
    boothWindow = null;
  });

  loadIdleScreen();
  openSetupWindow();
}

function openSetupWindow() {
  if (setupWindow && !setupWindow.isDestroyed()) {
    setupWindow.focus();
    return;
  }

  setupWindow = new BrowserWindow({
    width: 480,
    height: 720,
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

  setupWindow.once("ready-to-show", () => {
    if (setupWindow && !setupWindow.isDestroyed()) {
      setupWindow.show();
      setupWindow.focus();
    }
  });

  setupWindow.on("closed", () => {
    setupWindow = null;
  });
}

function reloadBoothWindow() {
  if (!boothWindow || boothWindow.isDestroyed()) {
    createBoothWindow();
    return;
  }

  const hasBoothSlug = Boolean(currentConfig.boothSlug);
  boothWindow.setKiosk(hasBoothSlug);
  boothWindow.setFullScreen(hasBoothSlug);

  if (!hasBoothSlug) {
    loadIdleScreen();
    openSetupWindow();
    return;
  }

  boothWindow.loadURL(buildBoothUrl(currentConfig));
}

function normalizeLauncherPayload(payload, studioBaseUrl) {
  if (!payload?.success || !payload?.data) {
    return { success: false, error: payload?.error || "Login launcher gagal." };
  }

  const booths = Array.isArray(payload.data.booths)
    ? payload.data.booths.map((booth) => ({
        id: String(booth.id || ""),
        boothName: String(booth.boothName || booth.slug || "Booth"),
        slug: String(booth.slug || ""),
        boothUrl: booth?.boothUrl
          ? String(booth.boothUrl)
          : `${studioBaseUrl}/b/${encodeURIComponent(String(booth.slug || ""))}`,
      }))
    : [];

  return {
    success: true,
    data: {
      operator: payload.data.operator,
      booths,
    },
  };
}

function openGoogleLoginWindow(studioBaseUrl) {
  return new Promise((resolve) => {
    if (authWindow && !authWindow.isDestroyed()) authWindow.close();

    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      const win = authWindow;
      authWindow = null;
      if (win && !win.isDestroyed()) win.close();
      resolve(result);
    };

    authWindow = new BrowserWindow({
      width: 520,
      height: 720,
      resizable: true,
      autoHideMenuBar: true,
      title: "Login Google Fremio Studio",
      parent: setupWindow && !setupWindow.isDestroyed() ? setupWindow : undefined,
      modal: Boolean(setupWindow && !setupWindow.isDestroyed()),
      icon: getAppIconPath(),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    const checkSession = async () => {
      if (!authWindow || authWindow.isDestroyed()) return;
      try {
        const payload = await authWindow.webContents.executeJavaScript(
          "fetch('/api/launcher/session', { credentials: 'include' }).then(function(response) { return response.json(); })",
          true
        );
        if (payload?.success) finish(normalizeLauncherPayload(payload, studioBaseUrl));
      } catch {}
    };

    authWindow.webContents.setWindowOpenHandler(({ url }) => {
      if (authWindow && !authWindow.isDestroyed()) authWindow.loadURL(url);
      return { action: "deny" };
    });

    authWindow.webContents.on("did-navigate", (_event, url) => {
      if (String(url || "").startsWith(studioBaseUrl)) void checkSession();
    });

    authWindow.webContents.on("did-navigate-in-page", (_event, url) => {
      if (String(url || "").startsWith(studioBaseUrl)) void checkSession();
    });

    authWindow.on("closed", () => {
      authWindow = null;
      finish({ success: false, error: "Login Google dibatalkan." });
    });

    const callbackUrl = `${studioBaseUrl}/dashboard`;
    authWindow.loadURL(`${studioBaseUrl}/api/auth/signin/google?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  });
}

function registerIpcHandlers() {
  ipcMain.handle("booth:get-config", () => currentConfig);

  ipcMain.handle("launcher:get-session", () => loadLauncherSession() || { success: false, error: "Belum login." });

  ipcMain.handle("launcher:logout", () => clearLauncherSession());

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

  ipcMain.handle("booth:open-login", () => {
    shell.openExternal(buildLoginUrl(currentConfig));
    return true;
  });

  ipcMain.handle("launcher:login", async (_event, input) => {
    const studioBaseUrl = normalizeBaseUrl(input?.studioBaseUrl || currentConfig?.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl);
    const email = String(input?.email || "").trim();
    const password = String(input?.password || "");

    if (!studioBaseUrl || !email || !password) {
      return { success: false, error: "Email, password, dan base URL wajib diisi." };
    }

    try {
      const endpoint = `${studioBaseUrl}/api/launcher/login`;
      const payload = await requestJsonPost(endpoint, { email, password }, 15000);
      if (!payload?.success || !payload?.data) {
        return { success: false, error: payload?.error || "Login launcher gagal." };
      }

      const normalized = normalizeLauncherPayload(payload, studioBaseUrl);
      if (normalized.success) saveLauncherSession(normalized, studioBaseUrl);
      return normalized;
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Gagal terhubung ke server launcher.",
      };
    }
  });

  ipcMain.handle("launcher:google-login", async (_event, input) => {
    const studioBaseUrl = normalizeBaseUrl(input?.studioBaseUrl || currentConfig?.studioBaseUrl || DEFAULT_CONFIG.studioBaseUrl);
    if (!studioBaseUrl) return { success: false, error: "Base URL tidak valid." };
    const result = await openGoogleLoginWindow(studioBaseUrl);
    if (result?.success) saveLauncherSession(result, studioBaseUrl);
    return result;
  });

  ipcMain.handle("booth:reload", () => {
    reloadBoothWindow();
    return true;
  });

  ipcMain.handle("bridge:get-status", () => getBridgeStatus());
  ipcMain.handle("bridge:restart", async () => {
    await stopHardwareAgent();
    await startHardwareAgent();
    return getBridgeStatus();
  });

  // ── Agent proxy (bypass mixed-content restriction from HTTPS page) ──
  ipcMain.handle("agent:status", async () => {
    try {
      const payload = await requestJson(BRIDGE_STATUS_URL, 3000);
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("agent:capture", async () => {
    try {
      const url = `http://127.0.0.1:${BRIDGE_PORT}/capture?format=binary`;
      const response = await requestBufferPost(url, {}, 65000);
      if (response.contentType.includes("application/json")) {
        const payload = JSON.parse(response.buffer.toString("utf8"));
        return { ok: true, payload };
      }
      const image = prepareCaptureImagePayload(response.buffer);
      const payload = { ok: true, image };
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("agent:preview", async () => {
    try {
      const url = `http://127.0.0.1:${BRIDGE_PORT}/preview`;
      const buf = await requestBuffer(url, 8000);
      return { ok: true, base64: buf.toString("base64"), mimeType: "image/jpeg" };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });

  ipcMain.handle("agent:print", async (_event, job) => {
    try {
      const payload = await printImageSilentlyWithElectron(job);
      return { ok: true, payload };
    } catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) };
    }
  });
}

function registerShortcuts() {
  globalShortcut.register("CommandOrControl+Shift+S", () => openSetupWindow());
  globalShortcut.register("CommandOrControl+R", () => reloadBoothWindow());
}

app.whenReady().then(async () => {
  currentConfig = loadConfig();
  await startHardwareAgent();
  startBridgeWatchdog();
  registerAgentProtocol();
  applyPermissionRules();
  registerIpcHandlers();
  registerShortcuts();

  createBoothWindow();
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
