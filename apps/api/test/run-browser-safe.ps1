$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'apps/api/.env is required. Browser tests will not use another DATABASE_URL source.' }
$line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'DATABASE_URL is missing from apps/api/.env.' }
$rawUrl = $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"')
$uri = [System.UriBuilder]$rawUrl
if ($uri.Path.Trim('/') -ne 'juris_connect') { throw 'Refusing to derive a test URL because the configured source database is not juris_connect.' }
if (@('localhost', '127.0.0.1') -notcontains $uri.Host) { throw 'Refusing test connection to a non-local PostgreSQL host.' }
$uri.Path = '/juris_connect_test'
$env:DATABASE_URL = $uri.Uri.AbsoluteUri
if (([uri]$env:DATABASE_URL).AbsolutePath.Trim('/') -ne 'juris_connect_test') { throw 'Test database URL validation failed.' }
$testStorage = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\test-documents\demo'))
$primaryStorage = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\documents'))
if ($testStorage -eq $primaryStorage -or $testStorage.StartsWith($primaryStorage + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to use the primary document storage directory.' }
$env:DOCUMENT_STORAGE_PATH = $testStorage
$env:DOCUMENT_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:APP_ENV = 'test'
$env:PORT = '3334'
$env:VITE_API_PROXY_TARGET = 'http://127.0.0.1:3334'
$env:VITE_API_BASE_URL = '/api'
$env:VITE_SOCKET_URL = 'http://127.0.0.1:3334'
$env:SOCKET_CORS_ORIGIN = 'http://127.0.0.1:5174'
$env:CORS_ORIGINS = 'http://localhost:5173,http://127.0.0.1:5174'
$env:AUTH_RATE_LIMIT_SECRET = 'test-only-secret-for-isolated-auth-rate-limits-0001'
$env:DEMO_TEST_PASSWORD = 'TestPasswordOnlyForJurisConnect2026!'
$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
if ([string]::IsNullOrWhiteSpace($env:JURIS_UI_CAPTURE_DIR)) {
  $env:JURIS_UI_CAPTURE_DIR = Join-Path $repoRoot '.data\playwright-captures'
} else {
  $env:JURIS_UI_CAPTURE_DIR = [System.IO.Path]::GetFullPath($env:JURIS_UI_CAPTURE_DIR)
}
New-Item -ItemType Directory -Force -Path $env:JURIS_UI_CAPTURE_DIR | Out-Null
pnpm --filter @juris-connect/api db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
$seedOutput = pnpm --filter @juris-connect/api exec tsx src/db/seed-demo-test.ts
if ($LASTEXITCODE -ne 0) { $seedOutput | ForEach-Object { Write-Host $_ }; exit $LASTEXITCODE }
$seedText = $seedOutput -join "`n"
if ($seedText -notmatch 'DEMO_SESSION_TOKEN=([A-Za-z0-9_-]{43})') { throw 'Seed não retornou sessão de demonstração sintética.' }
$env:DEMO_SESSION_TOKEN = $Matches[1]
pnpm --filter @juris-connect/web test:e2e
exit $LASTEXITCODE
