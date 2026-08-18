param(
  [switch]$Tunnel,
  [switch]$NoServer,
  [switch]$NoExpo,
  # Public HTTPS origin for the API, e.g. https://something.trycloudflare.com. Required with
  # -Tunnel: without it a remote tester loads the app and then fails every request, because
  # EXPO_PUBLIC_API_URL would still point at a private LAN address.
  [string]$ApiPublicUrl
)

$ErrorActionPreference = 'Stop'

function Get-PrimaryWifiIPv4 {
  $adapter = Get-NetIPConfiguration |
    Where-Object { $_.IPv4DefaultGateway -and $_.NetAdapter.Status -eq 'Up' } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1

  if ($adapter -and $adapter.IPv4Address) {
    return $adapter.IPv4Address.IPAddress
  }

  $candidate = Get-NetIPAddress -AddressFamily IPv4 |
    Where-Object { $_.IPAddress -notlike '127.*' -and $_.InterfaceAlias -notlike 'vEthernet*' -and $_.InterfaceAlias -notlike 'Loopback*' } |
    Sort-Object InterfaceMetric |
    Select-Object -First 1

  if ($candidate) {
    return $candidate.IPAddress
  }

  throw 'Could not determine the current Wi-Fi IPv4 address.'
}

function Test-PortListening {
  param([int]$Port)

  $pattern = ":$Port\b"
  $matches = netstat -ano -p tcp 2>$null | Select-String -Pattern $pattern
  return [bool]($matches | Where-Object { $_.Line -match 'LISTENING' })
}

function Wait-ForHealth {
  param(
    [string]$Url,
    [int]$TimeoutSeconds = 120,
    [string]$Name = 'service'
  )

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    try {
      $response = Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5
      if ($response.StatusCode -ge 200 -and $response.StatusCode -lt 500) {
        return $true
      }
    } catch {
      Start-Sleep -Seconds 2
    }
  }

  throw "$Name did not become ready at $Url within $TimeoutSeconds seconds."
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Get-DotEnvValue {
  param([string]$Path, [string]$Name)

  if (-not (Test-Path $Path)) { return $null }
  $line = Get-Content $Path | Where-Object { $_ -match "^\s*$Name\s*=" } | Select-Object -Last 1
  if (-not $line) { return $null }
  return ($line -replace "^\s*$Name\s*=\s*", '').Trim().Trim('"').Trim("'")
}

$wifiIp = Get-PrimaryWifiIPv4
$expoPort = 8081
$envFile = Join-Path $repoRoot '.env'

$apiPort = [int]$env:ROOMMUSE_API_PORT
if (-not $apiPort) { $apiPort = [int](Get-DotEnvValue -Path $envFile -Name 'PORT') }
if (-not $apiPort) { $apiPort = 3201 }

# The app reaches the API through EXPO_PUBLIC_API_URL. Honour an explicit .env value, otherwise
# derive it from the detected Wi-Fi address so a device works without hand-editing .env.
$configuredApiBaseUrl = Get-DotEnvValue -Path $envFile -Name 'EXPO_PUBLIC_API_URL'
if ($configuredApiBaseUrl -and $configuredApiBaseUrl -notmatch 'YOUR_COMPUTER_LAN_IP') {
  $apiBaseUrl = $configuredApiBaseUrl.TrimEnd('/')
  $apiBaseUrlSource = '.env'
} else {
  $apiBaseUrl = "http://$wifiIp`:$apiPort"
  $apiBaseUrlSource = 'detected Wi-Fi address'
}
if ($Tunnel) {
  if (-not $ApiPublicUrl) {
    Write-Host ''
    Write-Host 'Tunnel mode needs a public HTTPS address for the API.' -ForegroundColor Yellow
    Write-Host 'In a second terminal, expose the API and pass the URL back in:' -ForegroundColor Yellow
    Write-Host "  cloudflared tunnel --url http://localhost:$apiPort" -ForegroundColor Yellow
    Write-Host '  # then re-run this script with the https URL it prints:' -ForegroundColor Yellow
    Write-Host '  ... -Tunnel -ApiPublicUrl https://<name>.trycloudflare.com' -ForegroundColor Yellow
    throw 'ApiPublicUrl is required with -Tunnel.'
  }
  $apiBaseUrl = $ApiPublicUrl.TrimEnd('/')
  $apiBaseUrlSource = '-ApiPublicUrl (tunnel)'
  if ($apiBaseUrl -notmatch '^https://') {
    Write-Host 'WARNING: the API address is not https. Camera capture and sharing do not work in a phone browser without it, and the app will be served mixed content.' -ForegroundColor Yellow
  }
}

$env:EXPO_PUBLIC_API_URL = $apiBaseUrl

# The shared secret this build presents to the studio. Read from .env so it is never on a command
# line or in shell history, and never printed.
$apiToken = Get-DotEnvValue -Path $envFile -Name 'ROOMMUSE_API_TOKEN'
if ($apiToken) {
  $env:EXPO_PUBLIC_API_TOKEN = $apiToken
  Write-Host 'Access token: loaded from .env and baked into this build'
} elseif ($Tunnel) {
  Write-Host ''
  Write-Host 'REFUSING to tunnel an unauthenticated studio.' -ForegroundColor Red
  Write-Host 'This server holds your OpenAI key and has no authentication of its own, so a public URL is an open proxy that anyone who finds it can spend against.' -ForegroundColor Red
  Write-Host 'Add a long random value to .env, then run this again:' -ForegroundColor Red
  Write-Host '  ROOMMUSE_API_TOKEN=<a long random string>' -ForegroundColor Red
  throw 'ROOMMUSE_API_TOKEN must be set before exposing the studio.'
} else {
  Write-Host 'Access token: none set - fine on your own network, required before tunnelling'
}

$expoUrl = if ($Tunnel) { 'Expo tunnel mode - use the Expo CLI output QR/link' } else { "exp://$wifiIp`:$expoPort" }
$apiUrl = "$apiBaseUrl/health"
$webUrl = "http://$wifiIp`:$expoPort"

$startedServer = $false
$startedExpo = $false

if (-not $NoServer) {
  if (Test-PortListening -Port $apiPort) {
    Write-Host "RoomMuse API already listening on $apiPort"
  } else {
    Start-Process -FilePath 'npm.cmd' -ArgumentList @('run','server') -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null
    $startedServer = $true
  }
  Wait-ForHealth -Url $apiUrl -TimeoutSeconds 120 -Name 'RoomMuse API'
}

if (-not $NoExpo) {
  if (Test-PortListening -Port $expoPort) {
    Write-Host "Expo/Metro already listening on $expoPort"
  } else {
    $expoArgs = @('start')
    if ($Tunnel) { $expoArgs += '--tunnel' } else { $expoArgs += '--lan' }
    Start-Process -FilePath 'npm.cmd' -ArgumentList $expoArgs -WorkingDirectory $repoRoot -WindowStyle Hidden | Out-Null
    $startedExpo = $true
  }
  Wait-ForHealth -Url $webUrl -TimeoutSeconds 180 -Name 'Expo/Metro'
}

Write-Host ''
Write-Host 'RoomMuse startup complete' -ForegroundColor Green
Write-Host "Repo: $repoRoot"
Write-Host "Wi-Fi IP: $wifiIp"
Write-Host "App API base URL: $apiBaseUrl (from $apiBaseUrlSource)"
if (-not $NoServer) {
  Write-Host "API health URL: $apiUrl"
  Write-Host ("API server: " + $(if ($startedServer) { 'started' } else { 'reused existing listener' }))
}
if ($NoExpo) {
  Write-Host 'Expo/Metro: not started by request'
} else {
  Write-Host ("Expo/Metro: " + $(if ($startedExpo) { 'started' } else { 'reused existing listener' }))
  if ($Tunnel) {
    Write-Host 'Expo URL: Expo tunnel mode - use the QR/link printed by Expo'
    Write-Host "Web URL: $webUrl"
  } else {
    Write-Host "Expo URL: $expoUrl"
    Write-Host "Web URL: $webUrl"
  }
}
Write-Host ''
Write-Host 'Future start command:'
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$repoRoot\scripts\start-roommuse.ps1`""
