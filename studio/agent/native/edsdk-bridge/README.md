# Canon EDSDK Native Bridge (Windows)

Bridge ini adalah executable native untuk command berikut:

- `status --json`
- `preview --stdout`
- `capture --output <path>`

## Build di Windows

Jalankan dari folder `studio/agent`:

```powershell
npm run bridge:build:win-native
```

Script akan:

1. `dotnet publish` project `native/edsdk-bridge`
2. menyalin hasil `edsdk-bridge-native.exe` ke `bin/edsdk-bridge-native.exe`

## Prasyarat runtime

- Canon EDSDK DLL harus tersedia untuk bridge (`EDSDK.dll`).
- Paling aman, letakkan `EDSDK.dll` di folder yang sama dengan `edsdk-bridge-native.exe` (`studio/agent/bin`).

Alternatif, set environment variable:

```powershell
setx EDSDK_DLL_PATH "C:\path\to\EDSDK.dll"
```

## Integrasi dengan agent

Wrapper `studio/agent/bin/edsdk-bridge` akan otomatis meneruskan command ke `edsdk-bridge-native.exe` jika file sudah ada di `bin`.
