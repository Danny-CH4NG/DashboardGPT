<#
.SYNOPSIS
  Installs, builds and starts both services on Windows (PowerShell 5.1 or 7+).

.EXAMPLE
  .\start.ps1                # first run: install + build + start
  .\start.ps1 -SkipInstall   # later runs: build + start
  .\start.ps1 -SkipInstall -SkipBuild

  If the script is blocked by the execution policy, run it once with:
  powershell -ExecutionPolicy Bypass -File .\start.ps1
#>
param(
  [switch]$SkipInstall,
  [switch]$SkipBuild
)
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot
$dashboard = Join-Path $root "dashboard-service"
$chat = Join-Path $root "chat-service"

function Step($msg) { Write-Host "`n== $msg" -ForegroundColor Cyan }

# ---- Node.js ----
$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) { throw "Node.js is not installed. Install Node 22 LTS from https://nodejs.org and run this script again." }
$ver = [version]((node --version).TrimStart("v"))
if ($ver -lt [version]"20.12.0") { throw "Node $ver is too old; Node 22 LTS is recommended (20.12 is the minimum)." }

# ---- chat-service\.env : the Claude API key ----
$chatEnv = Join-Path $chat ".env"
$hasKey = $env:ANTHROPIC_API_KEY -or ((Test-Path $chatEnv) -and (Select-String -Path $chatEnv -Pattern '^\s*ANTHROPIC_API_KEY\s*=\s*\S' -Quiet))
if (-not $hasKey) {
  Step "Claude API key"
  $secure = Read-Host "Paste your Anthropic API key (input is hidden)" -AsSecureString
  $bstr = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
  try { $key = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($bstr) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr) }
  if (-not $key) { throw "No API key entered." }
  # UTF-8 without BOM so Node reads the variable name correctly. .env is git-ignored.
  $lines = @()
  if (Test-Path $chatEnv) { $lines = @(Get-Content $chatEnv | Where-Object { $_ -notmatch '^\s*ANTHROPIC_API_KEY\s*=' }) }
  $lines += "ANTHROPIC_API_KEY=$key"
  [IO.File]::WriteAllText($chatEnv, ($lines -join "`n") + "`n")
  Write-Host "Saved to chat-service\.env (not committed to git)."
}

# ---- dashboard-service\.env : load the chat widget ----
$dashEnv = Join-Path $dashboard ".env"
if (-not (Test-Path $dashEnv)) { Copy-Item (Join-Path $dashboard ".env.example") $dashEnv }

# ---- install + build ----
foreach ($dir in @($dashboard, $chat)) {
  Push-Location $dir
  try {
    $name = Split-Path $dir -Leaf
    if (-not $SkipInstall) {
      Step "npm install ($name)"
      npm install
      if ($LASTEXITCODE -ne 0) { throw "npm install failed in $name" }
    }
    if (-not $SkipBuild) {
      Step "npm run build ($name)"
      npm run build
      if ($LASTEXITCODE -ne 0) { throw "npm run build failed in $name" }
    }
  } finally { Pop-Location }
}

# ---- start each service in its own window ----
$shell = (Get-Process -Id $PID).Path
foreach ($dir in @($dashboard, $chat)) {
  $name = Split-Path $dir -Leaf
  Step "starting $name"
  Start-Process -FilePath $shell -WorkingDirectory $dir -ArgumentList @(
    "-NoExit", "-Command", "`$Host.UI.RawUI.WindowTitle = '$name'; npm start"
  )
}

# ---- wait until both answer, then open the dashboard ----
Step "waiting for http://localhost:4100 and http://localhost:4200"
$deadline = (Get-Date).AddSeconds(90)
$ready = $false
while ((Get-Date) -lt $deadline -and -not $ready) {
  try {
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:4100/healthz" | Out-Null
    Invoke-WebRequest -UseBasicParsing -TimeoutSec 2 "http://localhost:4200/api/health" | Out-Null
    $ready = $true
  } catch { Start-Sleep -Seconds 1 }
}
if ($ready) {
  Write-Host "Ready. Opening http://localhost:4100" -ForegroundColor Green
  Start-Process "http://localhost:4100"
} else {
  Write-Warning "Services did not answer within 90s. Check the two service windows for errors."
}
