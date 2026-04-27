# ============================================================
#  Fremio Studio — Windows Code Signing Script
#  Jalankan di Windows PowerShell (as Administrator)
# ============================================================
#
#  MODE 1 — Self-signed (GRATIS, untuk internal/testing)
#    Fixes: integrity check, AV quarantine pada mesin sendiri
#    Tidak fixes: SmartScreen warning untuk user lain
#
#  MODE 2 — Azure Trusted Signing (~$10/bulan)
#    Fixes: SmartScreen + integrity check untuk semua user
#    Lihat bagian AZURE di bawah
# ============================================================

param(
    [Parameter(Mandatory=$false)]
    [ValidateSet("self-signed","azure")]
    [string]$Mode = "self-signed",

    [string]$CertPassword = "FremioStudio!",
    [string]$DistFolder = ".\dist",
    [string]$CertFile = ".\fremio-signing.pfx"
)

$ErrorActionPreference = "Stop"
$exePath = Get-ChildItem -Path $DistFolder -Filter "Fremio Studio-Setup-*.exe" |
    Sort-Object LastWriteTime -Descending |
    Select-Object -First 1 -ExpandProperty FullName

# ─── MODE 1: Self-signed Certificate ────────────────────────────────────────
if ($Mode -eq "self-signed") {
    Write-Host "`n[1/3] Membuat self-signed certificate..." -ForegroundColor Cyan

    if (-not (Test-Path $CertFile)) {
        $cert = New-SelfSignedCertificate `
            -Subject "CN=Fremio, O=Fremio, C=ID" `
            -Type CodeSigningCert `
            -KeyAlgorithm RSA `
            -KeyLength 2048 `
            -HashAlgorithm SHA256 `
            -CertStoreLocation "Cert:\CurrentUser\My" `
            -NotAfter (Get-Date).AddYears(3)

        # Export ke PFX
        $secPw = ConvertTo-SecureString $CertPassword -AsPlainText -Force
        Export-PfxCertificate -Cert $cert -FilePath $CertFile -Password $secPw | Out-Null

        # Install ke Trusted Root agar Windows percaya di mesin ini
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store("Root","LocalMachine")
        $store.Open("ReadWrite")
        $store.Add($cert)
        $store.Close()

        Write-Host "   Certificate dibuat: $CertFile" -ForegroundColor Green
        Write-Host "   Thumbprint: $($cert.Thumbprint)" -ForegroundColor Gray
    } else {
        Write-Host "   Menggunakan certificate yang ada: $CertFile" -ForegroundColor Yellow
    }

    Write-Host "`n[2/3] Menandatangani installer..." -ForegroundColor Cyan

    # Cari signtool.exe dari Windows SDK
    $signtool = Get-ChildItem "C:\Program Files (x86)\Windows Kits\10\bin" -Recurse -Filter "signtool.exe" `
                | Where-Object { $_.FullName -match "x64" } | Select-Object -First 1 -ExpandProperty FullName

    if (-not $signtool) {
        Write-Warning "signtool.exe tidak ditemukan. Install Windows SDK dari:"
        Write-Warning "https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/"
        Write-Warning "Atau install via: winget install Microsoft.WindowsSDK.10.0.22621"
        exit 1
    }

    if (-not $exePath) {
        Write-Error "Installer Fremio Studio tidak ditemukan di: $DistFolder"
        Write-Host "Jalankan dulu: npm run build" -ForegroundColor Yellow
        exit 1
    }

    & $signtool sign `
        /fd sha256 `
        /td sha256 `
        /tr http://timestamp.digicert.com `
        /f $CertFile `
        /p $CertPassword `
        /d "Fremio Studio" `
        /du "https://studio.fremio.id" `
        $exePath

    Write-Host "`n[3/3] Verifikasi tanda tangan..." -ForegroundColor Cyan
    & $signtool verify /pa $exePath

    Write-Host "`n✅ Done! Installer telah ditandatangani." -ForegroundColor Green
    Write-Host "   File: $exePath" -ForegroundColor Gray
    Write-Host "`n⚠️  Self-signed hanya trusted di mesin ini." -ForegroundColor Yellow
    Write-Host "   Untuk SmartScreen bypass semua user, upgrade ke Azure Trusted Signing." -ForegroundColor Yellow
}

# ─── MODE 2: Azure Trusted Signing ──────────────────────────────────────────
if ($Mode -eq "azure") {
    Write-Host "`n[Azure Trusted Signing Mode]" -ForegroundColor Cyan
    Write-Host "Pastikan sudah setup:"
    Write-Host "  1. Azure Subscription aktif"
    Write-Host "  2. Trusted Signing account + Certificate Profile di Azure Portal"
    Write-Host "  3. azure-sign-tool terinstall: dotnet tool install -g AzureSignTool"
    Write-Host ""

    # Variabel ini harus diisi dari environment / Azure Key Vault
    $endpoint  = $env:AZURE_SIGN_ENDPOINT      # contoh: https://eus.codesigning.azure.net
    $account   = $env:AZURE_SIGN_ACCOUNT        # nama Trusted Signing account
    $profile   = $env:AZURE_SIGN_CERT_PROFILE   # nama Certificate Profile
    $clientId  = $env:AZURE_CLIENT_ID
    $tenantId  = $env:AZURE_TENANT_ID
    $clientSec = $env:AZURE_CLIENT_SECRET

    if (-not ($endpoint -and $account -and $profile -and $clientId -and $tenantId -and $clientSec)) {
        Write-Error @"
Environment variables berikut harus diset sebelum jalankan mode azure:
  AZURE_SIGN_ENDPOINT       — endpoint Azure Trusted Signing
  AZURE_SIGN_ACCOUNT        — nama account di Azure Portal
  AZURE_SIGN_CERT_PROFILE   — nama Certificate Profile
  AZURE_CLIENT_ID           — App Registration client ID
  AZURE_TENANT_ID           — Azure Tenant ID
  AZURE_CLIENT_SECRET       — App Registration client secret

Gunakan env var di atas sebelum menjalankan mode azure.
"@
        exit 1
    }

    if (-not $exePath) {
        Write-Error "Installer Fremio Studio tidak ditemukan di: $DistFolder"
        exit 1
    }

    azuresigntool sign `
        --azure-key-vault-url $endpoint `
        --azure-key-vault-managed-identity false `
        --azure-key-vault-client-id $clientId `
        --azure-key-vault-tenant-id $tenantId `
        --azure-key-vault-client-secret $clientSec `
        --azure-key-vault-certificate $profile `
        --timestamp-rfc3161 http://timestamp.acs.microsoft.com `
        --timestamp-digest sha256 `
        --file-digest sha256 `
        --description "Fremio Studio" `
        --description-url "https://studio.fremio.id" `
        $exePath

    Write-Host "`n✅ Installer ditandatangani dengan Azure Trusted Signing." -ForegroundColor Green
    Write-Host "   SmartScreen warning akan hilang setelah reputasi terbangun." -ForegroundColor Gray
}
