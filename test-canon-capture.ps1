#!/usr/bin/env pwsh
# Canon DSLR Capture Stability Test
# Runs 10 capture cycles against local agent at 127.0.0.1:3002
# Measures timing and verifies JPEG responses

$ErrorActionPreference = "Continue"
$base = "http://127.0.0.1:3002"
$results = @()

# Warm up: verify agent is alive
try {
    $health = Invoke-RestMethod -Uri "$base/health" -TimeoutSec 5
    Write-Host "Agent: $($health.ok) v$($health.version) ($($health.platform))" -ForegroundColor Green
} catch {
    Write-Host "[FATAL] Agent not reachable at $base : $_" -ForegroundColor Red
    exit 1
}

Write-Host "`nStarting 10-shot capture stability test...`n" -ForegroundColor Cyan

for ($i = 1; $i -le 10; $i++) {
    $jpegOk = $false
    $ms = -1
    $errMsg = ""

    $t0 = Get-Date

    # Step 1: Prepare capture (pre-arm bridge)
    try {
        $prep = Invoke-RestMethod -Uri "$base/prepare-capture" -Method POST -TimeoutSec 30
        if (-not $prep.ok) { $errMsg = "prepare-capture failed: $($prep.error)" }
    } catch {
        $errMsg = "prepare-capture error: $_"
    }

    # Step 2: Capture (fires shutter + returns JPEG)
    if ($errMsg -eq "") {
        try {
            $res = Invoke-WebRequest -Uri "$base/capture" -Method POST `
                -Headers @{ "Accept" = "image/jpeg"; "Content-Type" = "application/json" } `
                -Body '{}' `
                -TimeoutSec 60 `
                -OutFile "$env:TEMP\fremio-shot-$i.jpg"
            $ms = [int]((Get-Date) - $t0).TotalMilliseconds

            if ($res.StatusCode -ne 200) {
                $errMsg = "HTTP $($res.StatusCode)"
            } else {
                $jpegOk = $true
            }
        } catch {
            $statusCode = $_.Exception.Response.StatusCode.value__
            $errMsg = "capture error: $statusCode - $_"
        }
    }

    $file = "$env:TEMP\fremio-shot-$i.jpg"
    if ($jpegOk -and (Test-Path $file)) {
        $size = (Get-Item $file).Length
        $status = "OK"
        $color = "Green"
        if ($size -lt 10000) {
            $status = "SMALL"
            $color = "Yellow"
        }
        Write-Host "[$i] ${ms}ms  JPEG=$($size)B  $status" -ForegroundColor $color
    } else {
        Write-Host "[$i] FAIL: $errMsg" -ForegroundColor Red
    }

    # Brief pause between shots so camera settles
    Start-Sleep -Milliseconds 800
}

Write-Host "`nTest complete. JPEG files saved to `$env:TEMP\fremio-shot-*.jpg" -ForegroundColor Cyan