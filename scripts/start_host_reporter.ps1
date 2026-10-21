# Host Telemetry Reporter Daemon
# Collects CPU, RAM, and Disk space margins every 60s and posts to n8n webhook /ca-w-resource
# Prevents telemetry staleness and ensures heavy jobs are safely paused when resources are constrained.

$envFile = Join-Path $PSScriptRoot "..\config\.env"
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
            [System.Environment]::SetEnvironmentVariable($matches[1], $matches[2].Trim())
        }
    }
}

$workerScript = Join-Path $PSScriptRoot "..\workers\host_reporter.ps1"
Write-Host "Starting Host Telemetry Reporter Daemon (every 60s)..."

while ($true) {
    try {
        & powershell.exe -ExecutionPolicy Bypass -File $workerScript
    } catch {
        Write-Warning "Telemetry report failed: $_"
    }
    Start-Sleep -Seconds 60
}
