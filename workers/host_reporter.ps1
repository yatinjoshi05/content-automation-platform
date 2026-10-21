# Reports Windows CPU/RAM/free-disk to n8n every minute so heavy video jobs pause when the PC is stressed.
# Runs in a Scheduled Task (every 1 min). Requires env CA_INTERNAL_KEY (the Header Auth value).
param(
    [string]$Base = "http://localhost:5678",
    [string]$Drive = "C",
    [string]$MediaDrive = "D",
    [double]$MinSystemFreeGB = 4.0,
    [double]$MinMediaFreeGB = 5.0
)

if ([string]::IsNullOrEmpty($env:CA_INTERNAL_KEY)) {
    $envFile = Join-Path $PSScriptRoot "..\config\.env"
    if (Test-Path $envFile) {
        Get-Content $envFile | ForEach-Object {
            if ($_ -match '^\s*([A-Za-z_][A-Za-z0-9_]*)=(.*)$') {
                $varName = $matches[1]
                $varVal = $matches[2].Trim()
                Set-Item "env:$varName" $varVal
            }
        }
    }
}

$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ram = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)

$sysDriveObj = Get-PSDrive -Name $Drive -ErrorAction SilentlyContinue
$sysFree = if ($sysDriveObj) { [math]::Round($sysDriveObj.Free / 1GB, 2) } else { 0 }

$mediaDriveObj = Get-PSDrive -Name $MediaDrive -ErrorAction SilentlyContinue
$mediaFree = if ($mediaDriveObj) { [math]::Round($mediaDriveObj.Free / 1GB, 2) } else { $sysFree }

# Report the constrained margin so low space on EITHER OS drive or media work drive pauses heavy jobs.
$effectiveDisk = [math]::Min($sysFree, $mediaFree)

$body = @{
    cpu_percent = [double]$cpu
    ram_percent = [double]$ram
    disk_free_gb = [double]$effectiveDisk
    details = @{
        system_drive = $Drive
        system_free_gb = [double]$sysFree
        media_drive = $MediaDrive
        media_free_gb = [double]$mediaFree
    }
} | ConvertTo-Json

Invoke-RestMethod -Method Post -Uri "$Base/webhook/ca-w-resource" -Headers @{ "X-CA-Key" = $env:CA_INTERNAL_KEY } -ContentType "application/json" -Body $body | Out-Null
