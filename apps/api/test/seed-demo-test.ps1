$ErrorActionPreference = 'Stop'
$envFile = Join-Path $PSScriptRoot '..\.env'
if (-not (Test-Path -LiteralPath $envFile)) { throw 'apps/api/.env é necessário; seed interrompido.' }
$line = Get-Content -LiteralPath $envFile | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1
if (-not $line) { throw 'DATABASE_URL ausente em apps/api/.env; seed interrompido.' }
$sourceUrl = $line.Substring($line.IndexOf('=') + 1).Trim().Trim('"')
$uri = [System.UriBuilder]$sourceUrl
if ($uri.Path.Trim('/') -ne 'juris_connect' -or @('localhost', '127.0.0.1') -notcontains $uri.Host) { throw 'Seed recusado: a origem deve ser localhost/juris_connect para derivar o banco de testes.' }
$uri.Path = '/juris_connect_test'
$env:DATABASE_URL = $uri.Uri.AbsoluteUri
if (([uri]$env:DATABASE_URL).AbsolutePath.Trim('/') -ne 'juris_connect_test' -or @('localhost', '127.0.0.1') -notcontains ([uri]$env:DATABASE_URL).Host) { throw 'Seed recusado: banco alvo não passou na validação.' }
$env:DOCUMENT_STORAGE_PATH = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\test-documents\demo'))
$primaryStorage = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\.data\documents'))
if ($env:DOCUMENT_STORAGE_PATH -eq $primaryStorage -or $env:DOCUMENT_STORAGE_PATH.StartsWith($primaryStorage + [System.IO.Path]::DirectorySeparatorChar, [System.StringComparison]::OrdinalIgnoreCase)) { throw 'Seed recusado: armazenamento principal detectado.' }
$env:APP_ENV = 'test'
$env:DOCUMENT_ENCRYPTION_KEY = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA='
$env:PORT = '3335'
pnpm --filter @juris-connect/api db:migrate
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
pnpm --filter @juris-connect/api exec tsx src/db/seed-demo-test.ts
exit $LASTEXITCODE
