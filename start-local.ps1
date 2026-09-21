param([int]$Port = 5173)
$ErrorActionPreference = 'Stop'
$localPython = Join-Path $PSScriptRoot '..\..\.venv\Scripts\python.exe'
if (-not (Test-Path -LiteralPath $localPython)) {
    $localPython = (Get-Command python -ErrorAction Stop).Source
}
Write-Host "Open http://127.0.0.1:$Port (Ctrl+C stops the frontend server)."
& $localPython -m http.server $Port --bind 127.0.0.1 --directory $PSScriptRoot
