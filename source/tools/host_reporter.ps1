# Reports Windows CPU/RAM/free-disk to n8n every minute so heavy video jobs pause when the PC is stressed.
# UNTESTED on Windows (authored on Linux). Run in a Scheduled Task (every 1 min). Requires env CA_INTERNAL_KEY (the Header Auth value).
param([string]$Base = "http://localhost:5678", [string]$Drive = "C")
$cpu = (Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average).Average
$os = Get-CimInstance Win32_OperatingSystem
$ram = [math]::Round((1 - $os.FreePhysicalMemory / $os.TotalVisibleMemorySize) * 100, 1)
$disk = [math]::Round((Get-PSDrive -Name $Drive).Free / 1GB, 2)
$body = @{ cpu_percent = [double]$cpu; ram_percent = [double]$ram; disk_free_gb = [double]$disk } | ConvertTo-Json
Invoke-RestMethod -Method Post -Uri "$Base/webhook/ca-w-resource" -Headers @{ "X-CA-Key" = $env:CA_INTERNAL_KEY } -ContentType "application/json" -Body $body | Out-Null
