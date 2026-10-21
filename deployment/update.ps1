# Re-deploy after changing workflows/database/config (idempotent: updates workflows in place, never duplicates). powershell -ExecutionPolicy Bypass -File deployment\update.ps1
$ErrorActionPreference = "Stop"
$nodeCmd = "node"
$curVer = (& node -v 2>$null)
if (-not $curVer -or [int]($curVer -replace '^v(\d+)\..*','$1') -lt 24) {
    $nvm24 = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm\v24*", "$env:ProgramFiles\nodejs" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($nvm24 -and (Test-Path $nvm24)) {
        $nodeCmd = $nvm24
        $env:PATH = "$((Split-Path $nodeCmd));$env:PATH"
    }
}
& $nodeCmd "$PSScriptRoot\deploy.js" update --start-n8n
exit $LASTEXITCODE
