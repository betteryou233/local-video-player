$ErrorActionPreference = 'Stop'
$runtime = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'runtime\pythonw.exe'))
$launcher = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'launch.py'))
Get-CimInstance Win32_Process -Filter "Name='pythonw.exe'" | Where-Object {
    $_.ExecutablePath -eq $runtime -and $_.CommandLine -and $_.CommandLine.Contains('"' + $launcher + '"')
} | ForEach-Object { Stop-Process -Id $_.ProcessId -ErrorAction SilentlyContinue }
