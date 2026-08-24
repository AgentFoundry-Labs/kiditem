# Agent OS Clean Cutover (Office)

Use this runbook only for the approved unreleased Agent OS contraction. The
Office host is Windows; Docker Desktop runs Linux containers. This procedure
targets the named Office PostgreSQL container only. Never point these commands
at a developer database, a NAS, or an unverified Docker context.

## Preconditions

- The immutable `office-deployment.json` has been reviewed and its `appVersion`
  and full `gitSha` match the downloaded bundle.
- `C:\ProgramData\Kiditem\.env.office` and the protected API env file exist.
- `docker context show` identifies the intended Office Docker Desktop context.
- The approved backup directory is a protected local disk path, for example
  `C:\ProgramData\Kiditem\backups\agent-os-cutover`.
- The operator has accepted data loss of legacy Agent OS rows. This cutover has
  no backfill; unrelated business and Operation rows must remain unchanged.

Do not print `DATABASE_URL`, dump contents, CLI login material, prompts, or
canonical mutation input.

## Full-stop cutover

Run PowerShell 5.1+ from the downloaded immutable bundle directory. Replace
the two placeholder values after reading the manifest, not from memory.

```powershell
$officeRoot = 'C:\ProgramData\Kiditem'
$bundle = 'C:\ProgramData\Kiditem\incoming\<full-sha>'
$manifest = Get-Content "$bundle\office-deployment.json" -Raw | ConvertFrom-Json
$manifest.gitSha -match '^[0-9a-f]{40}$' -and $manifest.appVersion -match '^\d+\.\d+\.\d+$' |
  ForEach-Object { if (-not $_) { throw 'Invalid immutable Office manifest.' } }

# Docker Desktop commonly uses `desktop-linux`; set this to the exact Office
# context reported by `docker context ls`, then keep it in the cutover record.
$expectedDockerContext = 'desktop-linux'
if ((docker context show).Trim() -ne $expectedDockerContext) { throw "Refuse Docker context; expected $expectedDockerContext." }
$backupRoot = Join-Path $officeRoot 'backups\agent-os-cutover'
New-Item -ItemType Directory -Force -Path $backupRoot | Out-Null
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$dump = Join-Path $backupRoot "kiditem-agent-os-$stamp.dump"
$record = Join-Path $backupRoot "kiditem-agent-os-$stamp.json"

$compose = @('compose','--project-name','kiditem-office','--env-file',"$officeRoot\.env.office",'--file',"$bundle\compose.office.yml")
# Stop every application writer. Keep PostgreSQL and MinIO running.
& docker @compose stop api worker web nginx
if ($LASTEXITCODE -ne 0) { throw 'Could not stop Office writers.' }
# `docker compose stop` waits for worker shutdown. Confirm no writer remains
# running before inspecting durable work, then keep all writers stopped through
# backup and the destructive schema operation below.
$runningServices = @(& docker @compose ps --status running --services)
if ($LASTEXITCODE -ne 0 -or @($runningServices | Where-Object { $_ -in @('api','worker','web','nginx') }).Count -ne 0) {
  throw 'Office writers did not fully stop.'
}
$pendingMutations = (& docker @compose exec -T postgres psql -U kiditem -d kiditem -Atc "SELECT count(*) FROM agent_capability_invocations WHERE status IN ('ready','executing');").Trim()
if ($LASTEXITCODE -ne 0 -or $pendingMutations -ne '0') { throw 'Ready/executing Agent mutations exist after writer shutdown; cutover is blocked.' }

# Content-free unrelated counts are a guard, not a data export.
$counts = [ordered]@{}
foreach ($table in 'organizations','users','master_products','operation_runs','channel_listings') {
  $counts[$table] = (& docker @compose exec -T postgres psql -U kiditem -d kiditem -Atc "SELECT count(*) FROM $table;").Trim()
  if ($LASTEXITCODE -ne 0) { throw "Could not count $table." }
}

& docker @compose exec -T postgres pg_dump -U kiditem -d kiditem --format=custom --file=/tmp/kiditem-agent-os-cutover.dump
if ($LASTEXITCODE -ne 0) { throw 'pg_dump failed; writers stay stopped.' }
& docker @compose cp postgres:/tmp/kiditem-agent-os-cutover.dump $dump
if ($LASTEXITCODE -ne 0) { throw 'Could not copy the verified backup; writers stay stopped.' }
& docker @compose exec -T postgres pg_restore --list /tmp/kiditem-agent-os-cutover.dump | Out-Null
if ($LASTEXITCODE -ne 0) { throw 'pg_restore --list failed; writers stay stopped.' }

$sha256 = (Get-FileHash -Algorithm SHA256 -LiteralPath $dump).Hash.ToLowerInvariant()
[ordered]@{ database = 'kiditem'; appVersion = $manifest.appVersion; gitSha = $manifest.gitSha; dump = $dump; sha256 = $sha256; unrelatedCounts = $counts } |
  ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $record -Encoding UTF8

# Explicitly authorized destructive schema cutover, then generated client and six versions.
try {
  & docker @compose run --rm --no-deps api sh -lc 'cd /app && npx prisma db push --accept-data-loss && npx prisma generate && node apps/server/dist/agent-os/adapter/in/cli/seed-agent-versions.cli.js'
  if ($LASTEXITCODE -ne 0) { throw 'Schema/seed failed.' }

  & docker @compose up --detach --no-build api worker web nginx
  if ($LASTEXITCODE -ne 0) { throw 'Runtime start failed.' }
  & "$bundle\apply-deployment.ps1" -Operation Status
  if ($LASTEXITCODE -ne 0) { throw 'Office status check failed.' }
  Invoke-WebRequest -UseBasicParsing http://127.0.0.1/login | Out-Null
  try { Invoke-WebRequest -UseBasicParsing http://127.0.0.1/api/auth/me | Out-Null; throw 'Unauthenticated auth endpoint unexpectedly succeeded.' } catch { if ($_.Exception.Response.StatusCode.value__ -notin 401,403) { throw } }

  foreach ($table in $counts.Keys) {
    $after = (& docker @compose exec -T postgres psql -U kiditem -d kiditem -Atc "SELECT count(*) FROM $table;").Trim()
    if ($LASTEXITCODE -ne 0 -or $after -ne $counts[$table]) { throw "Unrelated count changed for $table." }
  }
}
catch {
  $cutoverError = $_.Exception.Message
  # `compose up` can fail after starting only some services, so always stop
  # every writer after the original full-stop boundary.
  & docker @compose stop api worker web nginx
  throw "Cutover verification failed: $cutoverError. Writers remain stopped; restore only with the recorded manual command."
}
```

If any command after the writer stop fails, leave API, worker, web, and nginx
stopped. Do not invoke normal runtime rollback against the contracted schema.
The manual restore command is recorded with the backup path in `$record`:

```powershell
docker cp $dump kiditem-postgres:/tmp/kiditem-agent-os-restore.dump
docker exec -it kiditem-postgres pg_restore --clean --if-exists -U kiditem -d kiditem /tmp/kiditem-agent-os-restore.dump
```

Start the matching previous runtime only after the restore succeeds.
