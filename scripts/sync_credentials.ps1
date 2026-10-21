# Auto-sync credentials from n8n SQLite DB to n8n workflows
# Portable Node.js resolution (Node.js >= 22.5.0 required for node:sqlite)

$nodeCmd = $null

if ($env:NODE24_EXE -and (Test-Path $env:NODE24_EXE)) {
    $nodeCmd = $env:NODE24_EXE
} elseif ($env:NODE_EXE -and (Test-Path $env:NODE_EXE)) {
    $nodeCmd = $env:NODE_EXE
}

if (-not $nodeCmd -and $env:LOCALAPPDATA) {
    $nvmCandidates = Get-ChildItem -Path "$env:LOCALAPPDATA\nvm" -Filter "node.exe" -Recurse -ErrorAction SilentlyContinue |
        Sort-Object { $_.DirectoryName } -Descending
    if ($nvmCandidates) {
        $nodeCmd = $nvmCandidates[0].FullName
    }
}

if (-not $nodeCmd) {
    $cmd = Get-Command node -ErrorAction SilentlyContinue
    if ($cmd) {
        $nodeCmd = $cmd.Source
    }
}

if (-not $nodeCmd) {
    Write-Error "Node.js executable was not found. Please install Node.js (>= 22.5.0) and add it to PATH, or set NODE_EXE."
    exit 1
}

& $nodeCmd "$PSScriptRoot\sync_n8n_credentials.js" @args

