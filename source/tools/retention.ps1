# Deletes old files from allow-listed folders only. UNTESTED on Windows. Dry-run by default: add -Apply to delete.
param([string[]]$Dirs = @("C:\openshorts\output"), [int]$SourceDays = 2, [int]$ClipDays = 30, [switch]$Apply)
$allow = @("C:\openshorts\", "C:\ContentAutomation\")   # edit: only paths under these prefixes may ever be touched
foreach ($d in $Dirs) {
  $full = [System.IO.Path]::GetFullPath($d)
  if (-not ($allow | Where-Object { $full.StartsWith($_, [StringComparison]::OrdinalIgnoreCase) })) { Write-Warning "Refusing $full (not allow-listed)"; continue }
  Get-ChildItem -Path $full -Recurse -File | Where-Object { $_.LastWriteTime -lt (Get-Date).AddDays(-$ClipDays) } | ForEach-Object {
    if ($Apply) { Remove-Item -LiteralPath $_.FullName -Force; "deleted $($_.FullName)" } else { "would delete $($_.FullName)" } }
}
