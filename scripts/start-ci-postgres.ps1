$ErrorActionPreference = 'Stop'
# Use an isolated native cluster, not the runner's existing service or database.
$pgBin = 'C:\Program Files\PostgreSQL\17\bin'
if (!(Test-Path "$pgBin\initdb.exe")) { throw 'Native PostgreSQL 17 is required on this runner.' }
$pgData = Join-Path $env:RUNNER_TEMP 'stichbill-postgres'
$passwordFile = Join-Path $env:RUNNER_TEMP 'stichbill-postgres-password.txt'
[System.IO.File]::WriteAllText($passwordFile, 'ci-local-only')
try {
    & "$pgBin\initdb.exe" -D $pgData -U postgres --pwfile=$passwordFile --auth=scram-sha-256 --encoding=UTF8
    if ($LASTEXITCODE -ne 0) { throw 'Native PostgreSQL initialization failed.' }
} finally { Remove-Item $passwordFile -ErrorAction SilentlyContinue }
& "$pgBin\pg_ctl.exe" -D $pgData -l (Join-Path $env:RUNNER_TEMP 'stichbill-postgres.log') -o '-h 127.0.0.1 -p 55432' -w start
if ($LASTEXITCODE -ne 0) { throw 'Native PostgreSQL startup failed.' }
$env:PGPASSWORD = 'ci-local-only'
try {
    & "$pgBin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres stichbill_test
    if ($LASTEXITCODE -ne 0) { throw 'Test database creation failed.' }
} finally { Remove-Item Env:PGPASSWORD }
