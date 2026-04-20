/**
 * Fremio Studio Local Agent
 *
 * Jalan di mesin booth (background process).
 * Browser booth UI berkomunikasi via HTTP ke localhost:3002.
 *
 * Fitur:
 *  - GET  /status      → health check + info printer tersedia
 *  - GET  /printers    → list semua printer di OS
 *  - POST /print       → cetak foto tanpa dialog
 *
 * Cross-platform: Windows ✓  macOS ✓
 * Tidak ada dependency native; hanya memanggil OS print command.
 */

import express, { Request, Response } from "express";
import cors   from "cors";
import https  from "https";
import http   from "http";
import fs     from "fs";
import path   from "path";
import os     from "os";
import { execFile, exec } from "child_process";
import { promisify } from "util";

const execAsync = promisify(exec);

const PORT    = Number(process.env.AGENT_PORT ?? 3002);
const VERSION = "1.0.0";

// ── App setup ────────────────────────────────────────────────────────────────

const app = express();

// Chrome Private Network Access — HARUS sebelum cors agar masuk ke preflight response
app.use((_req, res, next) => {
  res.setHeader("Access-Control-Allow-Private-Network", "true");
  next();
});

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
        /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
        /^https?:\/\/studio\.fremio\.id$/.test(origin)) {
      cb(null, true);
    } else {
      cb(new Error("Not allowed by CORS"));
    }
  },
}));

app.use(express.json({ limit: "50mb" }));

// ── Helpers ───────────────────────────────────────────────────────────────────

const isWin = process.platform === "win32";

/** Tulis dataURL atau ambil dari URL ke file temp, return path */
async function resolveToTempFile(input: string): Promise<string> {
  const tmpDir = os.tmpdir();
  const tmpFile = path.join(tmpDir, `fremio-print-${Date.now()}.jpg`);

  if (input.startsWith("data:")) {
    // base64 data URL
    const base64 = input.split(",")[1];
    fs.writeFileSync(tmpFile, Buffer.from(base64, "base64"));
    return tmpFile;
  }

  // HTTP/HTTPS URL — download dulu
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpFile);
    const get  = input.startsWith("https") ? https : http;
    get.get(input, (res) => {
      res.pipe(file);
      file.on("finish", () => { file.close(); resolve(tmpFile); });
    }).on("error", (err) => {
      fs.unlink(tmpFile, () => {});
      reject(err);
    });
  });
}

/** Daftar printer via OS command */
async function listPrinters(): Promise<string[]> {
  try {
    if (isWin) {
      const { stdout } = await execAsync(
        `powershell -Command "Get-Printer | Select-Object -ExpandProperty Name"`,
        { timeout: 5000 }
      );
      return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    } else {
      // macOS / Linux
      const { stdout } = await execAsync("lpstat -a 2>/dev/null | awk '{print $1}'", { timeout: 5000 });
      return stdout.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
    }
  } catch {
    return [];
  }
}

/** Print file ke printer */
async function printFile(filePath: string, printerName?: string, copies = 1): Promise<void> {
  if (isWin) {
    // Windows: pakai PowerShell + Windows Photo Viewer / built-in print
    const printer = printerName ? `-PrinterName "${printerName}"` : "";
    await execAsync(
      `powershell -Command "Start-Process -FilePath '${filePath}' -Verb Print -WindowStyle Hidden"`,
      { timeout: 15000 }
    );
  } else {
    // macOS / Linux: lp command
    const dest    = printerName ? `-d "${printerName}"` : "";
    const nCopies = copies > 1 ? `-n ${copies}` : "";
    await execAsync(`lp ${dest} ${nCopies} "${filePath}"`, { timeout: 15000 });
  }
}

// ── Routes ────────────────────────────────────────────────────────────────────

app.get("/status", async (_req: Request, res: Response) => {
  const printers = await listPrinters();
  res.json({
    ok:       true,
    version:  VERSION,
    platform: process.platform,
    printers,
  });
});

app.get("/printers", async (_req: Request, res: Response) => {
  const printers = await listPrinters();
  res.json({ ok: true, printers });
});

app.post("/print", async (req: Request, res: Response) => {
  const { imageUrl, printerName, copies } = req.body as {
    imageUrl:     string;
    printerName?: string;
    copies?:      number;
  };

  if (!imageUrl) {
    res.status(400).json({ ok: false, error: "imageUrl wajib diisi" });
    return;
  }

  let tmpFile: string | null = null;
  try {
    tmpFile = await resolveToTempFile(imageUrl);
    await printFile(tmpFile, printerName, copies ?? 1);
    res.json({ ok: true });
  } catch (err) {
    console.error("[agent] Print error:", err);
    res.status(500).json({ ok: false, error: String(err) });
  } finally {
    // Hapus file temp setelah 30 detik (beri waktu spooler baca)
    if (tmpFile) setTimeout(() => fs.unlink(tmpFile!, () => {}), 30_000);
  }
});

// ── TLS Certificate (self-signed, valid 10 years, embedded) ──────────────────
// Generated: openssl req -x509 -newkey rsa:2048 -days 3650 -nodes
//            -subj "/CN=127.0.0.1" -addext "subjectAltName=IP:127.0.0.1,IP:::1"

const TLS_CERT = `-----BEGIN CERTIFICATE-----
MIIDLDCCAhSgAwIBAgIUfQOYyhZBu1QF+kU2Rha6/aPAE+QwDQYJKoZIhvcNAQEL
BQAwFDESMBAGA1UEAwwJMTI3LjAuMC4xMB4XDTI2MDQyMDA3MTUzOFoXDTM2MDQx
NzA3MTUzOFowFDESMBAGA1UEAwwJMTI3LjAuMC4xMIIBIjANBgkqhkiG9w0BAQEF
AAOCAQ8AMIIBCgKCAQEArube46BY83o0ehaN3BTDtrqELWa0VGwi9EPpzHpszAGa
f5rWsbpPYd62lIEMILEJR9F3z8kRcTINKK5L0xtvSNFtkWsfTQW61E3tgO4ym+gz
2ITchGJpu4QQR1RvrFF7i5mCiyfCWMjEi1sABQ/9t7s9w/A0jVO3DUIsQ33mnQtv
KLoKb3WWEuNiOO1YCU1P0czuWFIzxj/xkPlYbn2KzFhEaQ2xzBTLSNvTRm19QZpO
028d6L3H9L1O+Hqv0ZjBLuIFoWXu3xBpUp01sf3sirOn0Voc29UJgeaOeUp2omd2
JOfMSzNUeE1+2vrqyZN4ECYQkj+h7focekyEA2VU7wIDAQABo3YwdDAdBgNVHQ4E
FgQUh5J92MOVE4Ym4BE5II71xpk7/6swHwYDVR0jBBgwFoAUh5J92MOVE4Ym4BE5
II71xpk7/6swDwYDVR0TAQH/BAUwAwEB/zAhBgNVHREEGjAYhwR/AAABhxAAAAAA
AAAAAAAAAAAAAAABMA0GCSqGSIb3DQEBCwUAA4IBAQAwoNkumu0U18HB0Mb8uKks
Iu0CitBPYn1aUPssaHLjggVmQ6A0zLy4aAC4AqGjj4mqyVaF6DBdNPvtkRIrIfY6
d8jR1GoAJ0/zmOZikMwLtss9uZaljKm+S2AjCHYKJAkPmPAKW9oY9OUeA+cxxh30
apU/YBToF5mofNxVdjVIjISmDXyNgU/a9LRbMyIUp5goFtnFnG/RbVKbtBlA7D3m
Ef2EyqQDotYICYuqwjPdKUz6bNS+Uh3KwoxOOKpb73d73l40E5IXZnkXpMFpoHIp
xK6sK/ZaxZKL7VN655dC91Ji//dsimwpPg+kNhXSHmsyYINlCTIGLmQXZWlsEVxf
-----END CERTIFICATE-----`;

const TLS_KEY = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQCu5t7joFjzejR6
Fo3cFMO2uoQtZrRUbCL0Q+nMemzMAZp/mtaxuk9h3raUgQwgsQlH0XfPyRFxMg0o
rkvTG29I0W2Rax9NBbrUTe2A7jKb6DPYhNyEYmm7hBBHVG+sUXuLmYKLJ8JYyMSL
WwAFD/23uz3D8DSNU7cNQixDfeadC28ougpvdZYS42I47VgJTU/RzO5YUjPGP/GQ
+VhufYrMWERpDbHMFMtI29NGbX1Bmk7Tbx3ovcf0vU74eq/RmMEu4gWhZe7fEGlS
nTWx/eyKs6fRWhzb1QmB5o55SnaiZ3Yk58xLM1R4TX7a+urJk3gQJhCSP6Ht+hx6
TIQDZVTvAgMBAAECggEAJp6V4r86RPDb+4VVZ54yJPwESZ4e/XEvOq5wRpVVxqon
+jsvYukXtC2gNSRVkDZnLTOEeB4Wut7pZu0tkvzA0txjjDOSIsi8Gzrl0Y1HIYPh
RtL3ekfcvuoHSijLy8nmNMn9uEpcMIyMUZUTaQrB5Dr1BXnZsMcmaUgOTAzVyiEp
sZmVBKaEB9GqKyqMzGOc4DU5rMocWnf3iFMECRhp0rfVQea+AZ9SvIM+icayHkK1
ptqSz/FyOrGbcNQa7igpd/OXhdjGyVDCxtgzNI6dh2cIGR/dkJeAUXi1MYe9TfPz
CDffedH6uxscAUdlsNJpdtl/C466eqyooKJYH8OIwQKBgQDcRntx07oIbRBFiIgA
ZcfoCqfY4aWTh1sfTEqKnuwCinyy1EvJP9QJ1KQHY3JOacAQjgI8pJ4yDzOPlx3a
ygJ8ScbXJVFWMUtBVSOEjLrmlEVzuwm08FS35LZ5jXtsXwX4dTDRh+rLeYjPV7TJ
h4shjIOaUIKTGx2h1oxZllwVTwKBgQDLRIvJaZaRaPBs77cgW1qkg0OwyU+JJjW4
YcGjVXXZFUQRNJdz49C7lWfg4o1uwonXWvNjGwqVc68/ydDQ0IzPsWnOxWKDGD1q
OwVtxDt3yIgBUADtgsopJ/zI+KvEnvXYHhZ6gwFoy//OMvOjr79ghb2Q07mXBCCC
93sEg14eYQKBgGW5It7RERM9EouZ3nyYhDXzXcn5gpZbpsgQWkgj1gfiXm3TPmBk
2o3jphBHa40spua+Peg1eVzSylPgTIgyS+2LwIiwkhxEzWURZUKcHt/Gzz//ux7U
8bquo1oE7V+BjmdL70yEAPkQWg6uiS2cK7NFiazkyzgWCJwpUU0587JfAoGAOYsh
K5a5qlaT4bMHG6DhCzuh2RVUb9YiVR1PjSavYxIzH8/MpGE1ATWtn6tjMJzgGthD
mKXaHC8QyLUgaUzw4AcwlfmpBsXA9SbaRZXM4/8gCYcVjCd/haEtXdOQBOyfWlxC
LtKRfpJpy3z/HjKtseyKmspleswPTCQ1bjSmW2ECgYEAw7g7tl2xfJobc7F7t9OK
gDxl4HUJEpuUljf8THfOdltpLelIgQrv0nm+rH7VwkDTnLy+WR3ys5fc2O/L5FNt
PA7TQZ7B4ommAanLgrdZ0EFx7/+ViOL5xvi0Kazo2vIGefAQfb8OlAxaj4c8MQXz
TqbbwuTRFiZzBCbQKR34tPM=
-----END PRIVATE KEY-----`;

// ── Start ────────────────────────────────────────────────────────────────────
// Windows  → HTTP  (Chrome/Edge treat http://127.0.0.1 as secure context)
// macOS    → HTTPS (Safari requires HTTPS even for loopback; cert must be trusted once)

const isMac = process.platform === "darwin";
const proto = isMac ? "https" : "http";

const server = isMac
  ? https.createServer({ cert: TLS_CERT, key: TLS_KEY }, app)
  : http.createServer(app);

server.listen(PORT, "127.0.0.1", () => {
  console.log(`╔══════════════════════════════════════╗`);
  console.log(`║  Fremio Studio Agent v${VERSION}       ║`);
  console.log(`║  ${proto}://127.0.0.1:${PORT}             ║`);
  console.log(`║  Platform: ${process.platform.padEnd(26)}║`);
  console.log(`╚══════════════════════════════════════╝`);

  // macOS: write cert and show one-time install command
  if (isMac) {
    const certPath = path.join(os.homedir(), "Downloads", "fremio-cert.pem");
    try {
      fs.writeFileSync(certPath, TLS_CERT, { mode: 0o644 });
      console.log(``);
      console.log(`╔══════════════════════════════════════════════════════════════╗`);
      console.log(`║  PERLU DILAKUKAN SEKALI: install sertifikat HTTPS agent      ║`);
      console.log(`║  Salin dan jalankan perintah di bawah di Terminal:           ║`);
      console.log(`║                                                              ║`);
      console.log(`║  sudo security add-trusted-cert -d -r trustRoot \\           ║`);
      console.log(`║    -k /Library/Keychains/System.keychain \\                  ║`);
      console.log(`║    ~/Downloads/fremio-cert.pem                               ║`);
      console.log(`║                                                              ║`);
      console.log(`║  Lalu restart browser, dan buka booth kembali.              ║`);
      console.log(`╚══════════════════════════════════════════════════════════════╝`);
      console.log(``);
    } catch { /* ignore */ }
  }

  listPrinters().then((p) => {
    if (p.length)  console.log(`[agent] Printer ditemukan: ${p.join(", ")}`);
    else           console.log(`[agent] Tidak ada printer ditemukan.`);
  });
});
