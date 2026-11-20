# One-command local start: database + migrations + backend + frontend.   Usage:  .\start.ps1
$ErrorActionPreference = "Stop"
$root = $PSScriptRoot

Write-Host "1/4 Starting PostgreSQL (Docker)..." -ForegroundColor Cyan
docker info *> $null
if ($LASTEXITCODE -ne 0) {
  $dd = "$env:LOCALAPPDATA\Programs\DockerDesktop\Docker Desktop.exe"
  if (Test-Path $dd) { Start-Process $dd } else { throw "Docker Desktop is not installed or not running." }
  Write-Host "    waiting for Docker Desktop..."
  do { Start-Sleep 4; docker info *> $null } until ($LASTEXITCODE -eq 0)
}
docker compose -f "$root\docker-compose.yml" up -d | Out-Null
do { Start-Sleep 2; $h = docker inspect -f '{{.State.Health.Status}}' mockinterview-db 2>$null } until ($h -eq "healthy")

Write-Host "2/4 Applying migrations..." -ForegroundColor Cyan
$py = "$root\backend\.venv\Scripts\python.exe"
if (-not (Test-Path $py)) { throw "Backend venv missing. See README (python -m venv .venv; pip install -r requirements-dev.txt)." }
Push-Location "$root\backend"; & $py -m alembic upgrade head; Pop-Location

Write-Host "3/4 Starting backend on http://127.0.0.1:8000 ..." -ForegroundColor Cyan
Get-NetTCPConnection -LocalPort 8000 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Process powershell -WorkingDirectory "$root\backend" -ArgumentList "-NoExit", "-Command", "& '$py' -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000"

Write-Host "4/4 Starting frontend on http://127.0.0.1:5173 ..." -ForegroundColor Cyan
if (-not (Test-Path "$root\frontend\node_modules")) { Push-Location "$root\frontend"; npm install; Pop-Location }
Get-NetTCPConnection -LocalPort 5173 -State Listen -ErrorAction SilentlyContinue |
  ForEach-Object { Stop-Process -Id $_.OwningProcess -Force -ErrorAction SilentlyContinue }
Start-Process powershell -WorkingDirectory "$root\frontend" -ArgumentList "-NoExit", "-Command", "npm run dev -- --host 127.0.0.1 --port 5173"

Start-Sleep 5
Start-Process "http://127.0.0.1:5173"
Write-Host "Done. Two windows are running the backend and frontend; close them to stop." -ForegroundColor Green
