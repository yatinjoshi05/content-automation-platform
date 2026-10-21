# One-command FRESH INSTALL (Windows 11, PowerShell). Run from the project folder:   powershell -ExecutionPolicy Bypass -File deployment\setup.ps1
# Prerequisites it checks (it does not silently install system software): Node.js 24+, PostgreSQL client (psql), ffmpeg/ffprobe, n8n (npm i -g n8n).
# NOTE: authored on Linux; the PowerShell wrapper itself is UNVERIFIED on Windows. All real logic lives in deploy.js (tested).
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path "$root\config\.env")) { Copy-Item "$root\config\.env.example" "$root\config\.env"; Write-Host "Created config\.env - open it, fill in the passwords/keys, then run setup.ps1 again."; notepad "$root\config\.env"; exit 1 }
$nodeCmd = "node"
$curVer = (& node -v 2>$null)
if (-not $curVer -or [int]($curVer -replace '^v(\d+)\..*','$1') -lt 24) {
    $nvm24 = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm\v24*", "$env:ProgramFiles\nodejs" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($nvm24 -and (Test-Path $nvm24)) {
        $nodeCmd = $nvm24
        $env:PATH = "$((Split-Path $nodeCmd));$env:PATH"
        Write-Host "Found Node 24+ binary at $nodeCmd"
    }
}
& $nodeCmd "$PSScriptRoot\deploy.js" setup --start-n8n
exit $LASTEXITCODE
