# Keeps the Hermes gateway (the Telegram bots) running. Its own login item points at a versioned
# install folder that disappears when Hermes auto-updates, so start it through the hermes alias,
# which always resolves the current version. Run by the "Hermes Gateway Watchdog" scheduled task.
$ErrorActionPreference = 'Continue'
$LogDir = Join-Path $PSScriptRoot '..\logs'
New-Item -ItemType Directory -Force $LogDir | Out-Null
$Log = Join-Path $LogDir ("hermes-watchdog-{0:yyyy-MM}.log" -f (Get-Date))
function Log($message) { Add-Content -Path $Log -Value ("{0:yyyy-MM-dd HH:mm:ss} {1}" -f (Get-Date), $message) -Encoding utf8 }
$mutex = New-Object System.Threading.Mutex($false, 'Global\HermesGatewayWatchdog')
if (-not $mutex.WaitOne(0)) { exit 0 }
try {
  $Hermes = Join-Path $env:LOCALAPPDATA 'Microsoft\WindowsApps\hermes.exe'
  if (-not (Test-Path $Hermes)) { Log 'hermes.exe not found'; exit 1 }
  $status = & $Hermes gateway status 2>&1 | Out-String
  if ($status -match 'No gateway process detected') {
    Log 'Hermes gateway not running; starting it'
    $started = & $Hermes gateway start 2>&1 | Out-String
    Log ('hermes: ' + (($started -split "`n" | Where-Object { $_ -match 'Gateway|rror' }) -join ' ').Trim())
  }
} finally {
  $mutex.ReleaseMutex()
}
