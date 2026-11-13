$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'apps/api/.env is required. Test runner will not use another DATABASE_URL source.' }
$line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'DATABASE_URL is missing from apps/api/.env.' }
$rawUrl = $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"')
$uri = [System.UriBuilder]$rawUrl
if ($uri.Path.Trim('/') -ne 'juris_connect') { throw 'Refusing to derive a test URL because the configured source database is not juris_connect.' }
if (@('localhost', '127.0.0.1') -notcontains $uri.Host) { throw 'Refusing test connection to a non-local PostgreSQL host.' }
$uri.Path = '/juris_connect_test'
$testUrl = $uri.Uri.AbsoluteUri
if (([uri]$testUrl).AbsolutePath.Trim('/') -ne 'juris_connect_test') { throw 'Test database URL validation failed.' }
$env:DATABASE_URL = $testUrl
$testStorage = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\test-documents'))
$primaryStorage = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\documents'))
if ($testStorage -eq $primaryStorage -or $testStorage.StartsWith($primaryStorage + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Refusing to use the primary document storage directory.' }
$env:DOCUMENT_STORAGE_PATH = $testStorage
$env:DOCUMENT_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:APP_ENV = 'test'
$env:CORS_ORIGINS = 'http://localhost:5173'
$env:AUTH_RATE_LIMIT_SECRET = 'test-only-secret-for-isolated-auth-rate-limits-0001'

pnpm --filter @juris-connect/api db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @juris-connect/api test
exit $LASTEXITCODE
