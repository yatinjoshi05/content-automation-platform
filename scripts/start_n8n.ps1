$ErrorActionPreference = "Continue"

# 1. Resolve Node 24 or system node
$nodeExe = $null
if ($env:NODE24_EXE -and (Test-Path $env:NODE24_EXE)) {
    $nodeExe = $env:NODE24_EXE
} elseif ($env:LOCALAPPDATA) {
    $nvmNode = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object { $_.DirectoryName } -Descending | Select-Object -First 1
    if ($nvmNode) { $nodeExe = $nvmNode.FullName }
}

if (-not $nodeExe) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) { $nodeExe = $cmd.Source }
}

# 2. Resolve n8n CLI
$n8nBin = $null
if ($env:APPDATA) {
    $npmN8n = "$env:APPDATA\npm\node_modules\n8n\bin\n8n"
    if (Test-Path $npmN8n) { $n8nBin = $npmN8n }
}

$env:N8N_USER_FOLDER = if ($env:N8N_USER_FOLDER) { $env:N8N_USER_FOLDER } else { "D:\n8n_data" }
$env:N8N_BLOCK_ENV_ACCESS_IN_NODE = "false"
$env:NODE_FUNCTION_ALLOW_BUILTIN = "crypto"
$env:GENERIC_TIMEZONE = "Asia/Kolkata"
$env:TZ = "Asia/Kolkata"
$env:EXECUTIONS_DATA_SAVE_ON_SUCCESS = "none"
$env:N8N_LISTEN_ADDRESS = "0.0.0.0"
$env:N8N_PORT = "5678"

Write-Host "Starting n8n..."
if ($nodeExe -and $n8nBin -and (Test-Path $n8nBin)) {
    & $nodeExe $n8nBin start
} else {
    n8n start
}

