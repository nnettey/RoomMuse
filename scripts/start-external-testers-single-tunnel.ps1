[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runDir = Join-Path $root ".expo\external-testing"
$apiOut = Join-Path $runDir "api.log"
$apiErr = Join-Path $runDir "api-error.log"
$expoOut = Join-Path $runDir "expo.log"
$expoErr = Join-Path $runDir "expo-error.log"
$sessionFile = Join-Path $runDir "session.json"
$settingsFile = Join-Path $root ".expo\settings.json"
$metroPort = 8085

function Test-Url([string]$url, [hashtable]$headers = @{}) {
  try {
    $response = Invoke-WebRequest -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 15
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch { return $false }
}

function Wait-Url([string]$url, [int]$seconds, [hashtable]$headers = @{}) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    if (Test-Url $url $headers) { return }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for $url"
}

function Find-ExpoUrl([int]$seconds) {
  $deadline = (Get-Date).AddSeconds($seconds)
  do {
    foreach ($statusPort in 4040..4050) {
      try {
        $status = Invoke-RestMethod -Uri "http://127.0.0.1:$statusPort/api/tunnels" -TimeoutSec 1
        $tunnel = $status.tunnels | Where-Object {
          $_.proto -eq "https" -and $_.config.addr -match ":$metroPort$"
        } | Select-Object -First 1
        if ($tunnel) { return "exp://" + ([uri]$tunnel.public_url).Host }
      } catch {}
    }
    Start-Sleep -Seconds 1
  } while ((Get-Date) -lt $deadline)
  throw "Timed out waiting for the Expo Go URL. Review $expoErr."
}

function Start-Hidden([string]$file, [string[]]$arguments, [string]$stdout, [string]$stderr) {
  Start-Process -FilePath $file -ArgumentList $arguments -WorkingDirectory $root -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru
}

function Stop-ProcessTree($process) {
  if ($process -and -not $process.HasExited) {
    taskkill.exe /PID $process.Id /T /F 2>$null | Out-Null
  }
}

Set-Location $root
New-Item -ItemType Directory -Path $runDir -Force | Out-Null
@($apiOut, $apiErr, $expoOut, $expoErr) | ForEach-Object {
  Remove-Item -LiteralPath $_ -Force -ErrorAction SilentlyContinue
}

if (-not (Test-Path -LiteralPath (Join-Path $root "node_modules\@expo\ngrok"))) {
  throw "RoomMuse tunnel dependencies are missing. Run npm install first."
}

$nodeVersion = node -p "process.versions.node"
if ([version]$nodeVersion -lt [version]"20.19.4") {
  Write-Warning "RoomMuse expects Node 20.19.4 or newer; this computer currently has Node $nodeVersion."
}

New-Item -ItemType Directory -Path (Split-Path -Parent $settingsFile) -Force | Out-Null
if (Test-Path -LiteralPath $settingsFile) {
  $urlRandomness = (Get-Content -LiteralPath $settingsFile -Raw | ConvertFrom-Json).urlRandomness
} else {
  $urlRandomness = ([guid]::NewGuid().ToString("N")).Substring(0, 7)
  @{ urlRandomness = $urlRandomness } | ConvertTo-Json | Set-Content -LiteralPath $settingsFile -Encoding UTF8
}

$expectedExpoHost = "$($urlRandomness.ToLower())-anonymous-$metroPort.exp.direct"
$publicApiUrl = "https://$expectedExpoHost/roommuse-api"
$started = @()

try {
  if (Test-Url "http://127.0.0.1:8787/health") {
    Write-Host "RoomMuse API is already running on port 8787."
  } else {
    Write-Host "Starting the RoomMuse API..."
    $api = Start-Hidden "node.exe" @("server/server.mjs") $apiOut $apiErr
    $started += $api
    Wait-Url "http://127.0.0.1:8787/health" 30
  }

  $env:EXPO_PUBLIC_API_URL = $publicApiUrl
  $env:EXPO_NO_DOCTOR = "1"
  $env:CI = "1"
  Write-Host "Starting the Expo tunnel on RoomMuse port $metroPort..."
  $expo = Start-Hidden "node.exe" @("node_modules/expo/bin/cli", "start", "--tunnel", "--clear", "--port", "$metroPort") $expoOut $expoErr
  $started += $expo
  $expoUrl = Find-ExpoUrl 120
  if ($expo.HasExited) { throw "Expo stopped during startup. Review $expoErr." }

  $actualExpoHost = $expoUrl -replace "^exp://", ""
  if ($actualExpoHost -ne $expectedExpoHost) {
    throw "Expo assigned $actualExpoHost but RoomMuse expected $expectedExpoHost. Restart this script."
  }

  $manifestUrl = "https://$actualExpoHost"
  Wait-Url $manifestUrl 60 @{"expo-platform" = "ios"; "expo-protocol-version" = "0"}
  Wait-Url "$publicApiUrl/health" 30

  @{
    startedAt = (Get-Date).ToString("o")
    project = "RoomMuse"
    expoUrl = $expoUrl
    publicApiUrl = $publicApiUrl
    metroPort = $metroPort
    processIds = @($started | ForEach-Object { $_.Id })
  } | ConvertTo-Json | Set-Content -LiteralPath $sessionFile -Encoding UTF8

  Write-Host ""
  Write-Host "ROOMMUSE IS READY FOR EXTERNAL MOBILE TESTING" -ForegroundColor Green
  Write-Host "Expo Go URL: $expoUrl" -ForegroundColor Cyan
  Write-Host "API health:  $publicApiUrl/health"
  Write-Host ""
  Write-Host "Testers can enter the Expo Go URL manually or scan this QR code:"
  node (Join-Path $root "node_modules\qrcode-terminal\bin\qrcode-terminal.js") $expoUrl
  Write-Host ""
  Write-Host "Keep this computer awake and online while testers use RoomMuse."
  Write-Host "The Expo URL normally remains stable on this computer and port."
  Write-Host "Session details: $sessionFile"
} catch {
  foreach ($process in $started) { Stop-ProcessTree $process }
  throw
}
