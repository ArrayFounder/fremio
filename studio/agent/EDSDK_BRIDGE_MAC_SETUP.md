# EDSDK Bridge Setup (Mac Source of Truth)

Dokumen ini untuk workflow lokal di Mac ini saja.

## Ringkasan

`studio/agent/src/server.ts` sekarang berjalan **EDSDK-only**.

Bridge default lokal berada di:

- `studio/agent/bin/edsdk-bridge`

Bridge wrapper ini akan meneruskan command ke native binary EDSDK.

## 1) Siapkan native bridge EDSDK

Wajib sediakan executable native bridge Canon EDSDK, lalu set:

```bash
export EDSDK_NATIVE_BRIDGE_PATH="/absolute/path/to/edsdk-bridge-native"
```

Source native bridge sekarang ada di:

- `studio/agent/native/edsdk-bridge`

Build di Windows (dari folder `studio/agent`):

```powershell
npm run bridge:build:win-native
```

Hasil build akan disalin ke:

- `studio/agent/bin/edsdk-bridge-native.exe`

Letakkan juga `EDSDK.dll` Canon di folder yang sama (`studio/agent/bin`) atau set:

```powershell
setx EDSDK_DLL_PATH "C:\path\to\EDSDK.dll"
```

## 2) Verifikasi bridge lokal

Jalankan dari `studio/agent`:

```bash
npm run bridge:status
npm run bridge:preview
npm run bridge:capture
```

Output file test:

- `/tmp/fremio-bridge-preview.jpg`
- `/tmp/fremio-bridge-capture.jpg`

## 3) Jalankan agent (EDSDK-only)

```bash
AGENT_CAMERA_BACKEND=edsdk npm run dev
```

## 4) Override bridge command (opsional)

Set path bridge yang dipanggil agent:

```bash
export EDSDK_BRIDGE_PATH="/absolute/path/to/edsdk-bridge"
```

Opsional override argumen per command:

```bash
export EDSDK_BRIDGE_STATUS_ARGS="status --json"
export EDSDK_BRIDGE_CAPTURE_ARGS="capture --output {output}"
export EDSDK_BRIDGE_PREVIEW_ARGS="preview --stdout"
```

## 5) Catatan source of truth

Karena development dipusatkan di Mac ini:

- lakukan commit + push dari workspace ini saja
- jangan sinkron balik dari laptop lain
