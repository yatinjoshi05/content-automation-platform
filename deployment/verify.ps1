# Health/smoke verification of an existing install. powershell -ExecutionPolicy Bypass -File deployment\verify.ps1
$nodeCmd = "node"
$curVer = (& node -v 2>$null)
if (-not $curVer -or [int]($curVer -replace '^v(\d+)\..*','$1') -lt 24) {
    $nvm24 = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm\v24*", "$env:ProgramFiles\nodejs" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty FullName
    if ($nvm24 -and (Test-Path $nvm24)) {
        $nodeCmd = $nvm24
        $env:PATH = "$((Split-Path $nodeCmd));$env:PATH"
    }
}
& $nodeCmd "$PSScriptRoot\deploy.js" verify
exit $LASTEXITCODE
