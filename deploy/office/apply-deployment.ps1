#requires -Version 5.1

[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'Status', 'Rollback')]
  [string]$Operation = 'Status',
  [string]$ManifestPath,
  [string]$RepoRoot = 'C:\workspace\kiditem',
  [string]$OfficeRoot = 'C:\ProgramData\Kiditem',
  [string]$DockerDataRoot = '',
  [ValidateRange(5, 500)]
  [int]$MinimumFreeGb = 10,
  [switch]$PruneBuildCache,
  [switch]$ApplySchema,
  [ValidateRange(30, 900)]
  [int]$HealthTimeoutSeconds = 300
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$script:ComposePath = Join-Path $OfficeRoot 'compose.office.yml'
$script:OfficeEnvPath = Join-Path $OfficeRoot '.env.office'
$script:DeployEnvPath = Join-Path $OfficeRoot '.env.office.deploy'
$script:DeploymentsRoot = Join-Path $OfficeRoot 'deployments'
$script:CurrentManifestPath = Join-Path $script:DeploymentsRoot 'current.json'
$script:PreviousManifestPath = Join-Path $script:DeploymentsRoot 'previous.json'
$script:ComposeArgs = @()

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Program,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Program failed with exit code $LASTEXITCODE"
  }
}

function Get-CheckedOutput {
  param(
    [Parameter(Mandatory = $true)][string]$Program,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  $output = & $Program @Arguments
  if ($LASTEXITCODE -ne 0) {
    throw "$Program failed with exit code $LASTEXITCODE"
  }
  return (($output | Out-String).Trim())
}

function Assert-LiveCheckout {
  if (-not (Test-Path -LiteralPath $RepoRoot -PathType Container)) {
    throw "Office checkout does not exist: $RepoRoot"
  }

  $branch = Get-CheckedOutput git -C $RepoRoot branch --show-current
  if ($branch -ne 'release/office') {
    throw "Office checkout branch must be release/office; found: $branch"
  }

  $upstream = Get-CheckedOutput git -C $RepoRoot rev-parse --abbrev-ref --symbolic-full-name '@{upstream}'
  if ($upstream -ne 'origin/release/office') {
    throw "Office checkout upstream must be origin/release/office; found: $upstream"
  }

  $trackedChanges = Get-CheckedOutput git -C $RepoRoot status --porcelain --untracked-files=no
  if ($trackedChanges) {
    throw 'Office checkout has tracked changes; deployment is blocked.'
  }

  $head = Get-CheckedOutput git -C $RepoRoot rev-parse HEAD
  $remoteLine = Get-CheckedOutput git -C $RepoRoot ls-remote --heads origin refs/heads/release/office
  $remoteParts = $remoteLine -split '\s+'
  if ($remoteParts.Count -lt 2 -or $remoteParts[1] -ne 'refs/heads/release/office') {
    throw 'Remote release/office does not exist; deployment is blocked.'
  }
  if ($head -ne $remoteParts[0]) {
    throw "Office checkout HEAD $head does not match remote release/office $($remoteParts[0])."
  }

  return $head
}

function Get-FreeSpaceGb {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Disk guard path does not exist: $Path"
  }
  $driveName = ([System.IO.Path]::GetPathRoot($Path)).TrimEnd('\').TrimEnd(':')
  $drive = Get-PSDrive -Name $driveName
  return [math]::Round($drive.Free / 1GB, 2)
}

function Get-DockerDataGuardPath {
  if ($DockerDataRoot) {
    return $DockerDataRoot
  }

  $standardVhdx = Join-Path $env:LOCALAPPDATA 'Docker\wsl\disk\docker_data.vhdx'
  if (Test-Path -LiteralPath $standardVhdx -PathType Leaf) {
    return $standardVhdx
  }
  return $OfficeRoot
}

function Assert-DiskCapacity {
  if ($PruneBuildCache) {
    Write-Host 'Pruning BuildKit cache to a 5 GB ceiling before the image pull.'
    Invoke-Checked docker buildx prune --max-used-space 5gb --force
  }

  $guardPaths = @($OfficeRoot, (Get-DockerDataGuardPath))
  $checkedRoots = @{}
  foreach ($path in $guardPaths) {
    $root = [System.IO.Path]::GetPathRoot($path)
    if ($checkedRoots.ContainsKey($root)) {
      continue
    }
    $freeGb = Get-FreeSpaceGb $path
    Write-Host "Disk $root free: $freeGb GB"
    if ($freeGb -lt $MinimumFreeGb) {
      throw "Disk $root has $freeGb GB free; at least $MinimumFreeGb GB is required. Volumes are never pruned automatically."
    }
    $checkedRoots[$root] = $true
  }
}

function Read-DeploymentManifest {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Deployment manifest does not exist: $Path"
  }
  $raw = Get-Content -LiteralPath $Path -Raw
  $manifest = $raw | ConvertFrom-Json

  if ($manifest.schemaVersion -ne 1 -or $manifest.environment -ne 'office') {
    throw 'Deployment manifest must use schemaVersion 1 and environment office.'
  }
  if ($manifest.sourceRef -ne 'refs/heads/release/office') {
    throw "Deployment manifest sourceRef is not release/office: $($manifest.sourceRef)"
  }
  if ($manifest.gitSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Deployment manifest gitSha must be a full lowercase 40-hex SHA.'
  }

  $apiPattern = '^ghcr\.io/agentfoundry-labs/kiditem-api@sha256:[0-9a-f]{64}$'
  $webPattern = '^ghcr\.io/agentfoundry-labs/kiditem-web@sha256:[0-9a-f]{64}$'
  if ($manifest.apiImage -notmatch $apiPattern) {
    throw "API image is not an approved immutable GHCR digest ref: $($manifest.apiImage)"
  }
  if ($manifest.webImage -notmatch $webPattern) {
    throw "Web image is not an approved immutable GHCR digest ref: $($manifest.webImage)"
  }
  if ($manifest.apiImage.Split('@')[1] -ne $manifest.apiDigest) {
    throw 'API image digest does not match apiDigest.'
  }
  if ($manifest.webImage.Split('@')[1] -ne $manifest.webDigest) {
    throw 'Web image digest does not match webDigest.'
  }

  return [pscustomobject]@{ Manifest = $manifest; Raw = $raw }
}

function Assert-ImageRevision {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedRevision
  )

  Invoke-Checked docker pull $Image
  $imageJson = Get-CheckedOutput docker image inspect $Image
  $imageMetadata = @(ConvertFrom-Json -InputObject $imageJson)
  if ($imageMetadata.Count -ne 1) {
    throw "Expected one image inspection result for $Image; found $($imageMetadata.Count)."
  }
  $revision = $imageMetadata[0].Config.Labels.'org.opencontainers.image.revision'
  if ($revision -ne $ExpectedRevision) {
    throw "Image revision mismatch for $Image. Expected $ExpectedRevision, found $revision."
  }
}

function Assert-RuntimePrerequisites {
  if (-not (Test-Path -LiteralPath $script:OfficeEnvPath -PathType Leaf)) {
    throw "Protected office env file is missing: $script:OfficeEnvPath"
  }

  $requiredVolumes = @('kiditem_pgdata', 'kiditem_minio-data')
  foreach ($volume in $requiredVolumes) {
    Invoke-Checked docker volume inspect $volume *> $null
  }
}

function Set-ComposeArguments {
  $script:ComposeArgs = @(
    'compose',
    '--project-name', 'kiditem-office',
    '--env-file', $script:OfficeEnvPath
  )
  if (Test-Path -LiteralPath $script:DeployEnvPath -PathType Leaf) {
    $script:ComposeArgs += @('--env-file', $script:DeployEnvPath)
  }
  $script:ComposeArgs += @('--file', $script:ComposePath)
}

function Get-ContainerState {
  param([Parameter(Mandatory = $true)][string]$Name)

  $state = & docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' $Name 2>$null
  if ($LASTEXITCODE -ne 0) {
    return 'missing'
  }
  return (($state | Out-String).Trim())
}

function Wait-ForRuntime {
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  do {
    $states = [ordered]@{
      'kiditem-postgres' = Get-ContainerState 'kiditem-postgres'
      'kiditem-minio' = Get-ContainerState 'kiditem-minio'
      'kiditem-api' = Get-ContainerState 'kiditem-api'
      'kiditem-worker' = Get-ContainerState 'kiditem-worker'
      'kiditem-web' = Get-ContainerState 'kiditem-web'
      'kiditem-nginx' = Get-ContainerState 'kiditem-nginx'
    }
    if (
      $states['kiditem-postgres'] -eq 'healthy' -and
      $states['kiditem-minio'] -eq 'healthy' -and
      $states['kiditem-api'] -eq 'healthy' -and
      $states['kiditem-worker'] -eq 'running' -and
      $states['kiditem-web'] -eq 'healthy' -and
      $states['kiditem-nginx'] -eq 'healthy'
    ) {
      return
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  $stateSummary = ($states.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" }) -join ', '
  throw "Office runtime did not become healthy within $HealthTimeoutSeconds seconds: $stateSummary"
}

function Wait-ForContainerHealthy {
  param([Parameter(Mandatory = $true)][string]$Name)

  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  do {
    $state = Get-ContainerState $Name
    if ($state -eq 'healthy') {
      return
    }
    Start-Sleep -Seconds 5
  } while ((Get-Date) -lt $deadline)

  throw "$Name did not become healthy within $HealthTimeoutSeconds seconds; state=$state"
}

function Get-HttpStatus {
  param([Parameter(Mandatory = $true)][string]$Uri)

  try {
    $response = Invoke-WebRequest -Uri $Uri -UseBasicParsing -TimeoutSec 15
    return [int]$response.StatusCode
  }
  catch {
    if ($null -ne $_.Exception.Response) {
      return [int]$_.Exception.Response.StatusCode
    }
    throw
  }
}

function Assert-SmokeTests {
  $loginStatus = Get-HttpStatus 'http://127.0.0.1/login'
  $authStatus = Get-HttpStatus 'http://127.0.0.1/api/auth/me'
  if ($loginStatus -ne 200) {
    throw "Office /login returned HTTP $loginStatus instead of 200."
  }
  if ($authStatus -ne 401) {
    throw "Office /api/auth/me returned HTTP $authStatus instead of 401."
  }
  Write-Host 'Office smoke checks passed: /login=200, /api/auth/me=401'
}

function Write-DeployEnv {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  @(
    "KIDITEM_API_IMAGE=$($Manifest.apiImage)"
    "KIDITEM_WEB_IMAGE=$($Manifest.webImage)"
  ) | Set-Content -LiteralPath $Path -Encoding Ascii
}

function Restore-Transaction {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)

  $restored = $false
  foreach ($name in @('compose.office.yml', 'nginx.conf', '.env.office.deploy')) {
    $backup = Join-Path $BackupRoot $name
    $target = Join-Path $OfficeRoot $name
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Copy-Item -LiteralPath $backup -Destination $target -Force
      $restored = $true
    }
    elseif ($name -eq '.env.office.deploy' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
      Remove-Item -LiteralPath $target -Force
    }
  }
  if ($restored) {
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    Assert-SmokeTests
    Write-Warning 'Previous office runtime files were restored after deployment failure.'
  }
}

function Install-Deployment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetManifestPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHead,
    [switch]$AllowAncestor,
    [switch]$ApplySchema
  )

  $bundle = Read-DeploymentManifest $TargetManifestPath
  $manifest = $bundle.Manifest
  if ($manifest.gitSha -ne $ExpectedHead) {
    if (-not $AllowAncestor) {
      throw "Manifest SHA $($manifest.gitSha) does not match checked-out release/office HEAD $ExpectedHead."
    }
    & git -C $RepoRoot merge-base --is-ancestor $manifest.gitSha $ExpectedHead
    if ($LASTEXITCODE -ne 0) {
      throw "Rollback manifest SHA $($manifest.gitSha) is not an ancestor of release/office HEAD $ExpectedHead."
    }
  }

  Assert-DiskCapacity
  Assert-RuntimePrerequisites
  Assert-ImageRevision $manifest.apiImage $manifest.gitSha
  Assert-ImageRevision $manifest.webImage $manifest.gitSha

  $sourceRoot = Split-Path -Parent (Resolve-Path -LiteralPath $TargetManifestPath)
  $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
  $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
  if (-not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf)) {
    $sourceRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
    $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
    $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
  }
  if (-not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf)) {
    throw "No archived Compose/nginx bundle exists for manifest SHA $($manifest.gitSha)."
  }
  if (Select-String -LiteralPath $sourceCompose -Pattern '^\s*build\s*:' -Quiet) {
    throw 'Office Compose contains a local build section; only immutable pulled images are allowed.'
  }

  New-Item -ItemType Directory -Path $OfficeRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $script:DeploymentsRoot -Force | Out-Null
  $backupRoot = Join-Path $script:DeploymentsRoot 'transaction-backup'
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  foreach ($name in @('compose.office.yml', 'nginx.conf', '.env.office.deploy')) {
    $backup = Join-Path $backupRoot $name
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Remove-Item -LiteralPath $backup -Force
    }
    $existing = Join-Path $OfficeRoot $name
    if (Test-Path -LiteralPath $existing -PathType Leaf) {
      Copy-Item -LiteralPath $existing -Destination $backup -Force
    }
  }

  $candidateDeployEnv = Join-Path $OfficeRoot '.env.office.deploy.candidate'
  try {
    Write-DeployEnv $candidateDeployEnv $manifest
    Copy-Item -LiteralPath $sourceCompose -Destination $script:ComposePath -Force
    Copy-Item -LiteralPath $sourceNginx -Destination (Join-Path $OfficeRoot 'nginx.conf') -Force
    Move-Item -LiteralPath $candidateDeployEnv -Destination $script:DeployEnvPath -Force
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs config --quiet
    if ($ApplySchema) {
      Write-Warning 'Stopping application containers before the approved Prisma schema push. Runtime rollback cannot undo schema changes.'
      Invoke-Checked docker @script:ComposeArgs stop api worker web nginx
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build postgres
      Wait-ForContainerHealthy 'kiditem-postgres'
      Invoke-Checked docker @script:ComposeArgs run --rm --no-deps api sh -lc 'cd /app && npx prisma db push'
    }
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    Assert-SmokeTests
  }
  catch {
    $deploymentError = $_
    try {
      Restore-Transaction $backupRoot
    }
    catch {
      Write-Warning "Automatic runtime restore also failed: $($_.Exception.Message)"
    }
    throw $deploymentError
  }

  if (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf) {
    Copy-Item -LiteralPath $script:CurrentManifestPath -Destination $script:PreviousManifestPath -Force
  }
  $bundle.Raw | Set-Content -LiteralPath $script:CurrentManifestPath -Encoding UTF8
  $historyName = '{0}-{1}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $manifest.gitSha.Substring(0, 12)
  $bundle.Raw | Set-Content -LiteralPath (Join-Path $script:DeploymentsRoot $historyName) -Encoding UTF8
  $archiveRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
  New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
  $bundle.Raw | Set-Content -LiteralPath (Join-Path $archiveRoot 'office-deployment.json') -Encoding UTF8
  $archivedCompose = Join-Path $archiveRoot 'compose.office.yml'
  $archivedNginx = Join-Path $archiveRoot 'nginx.conf'
  if (([System.IO.Path]::GetFullPath($sourceCompose)) -ne ([System.IO.Path]::GetFullPath($archivedCompose))) {
    Copy-Item -LiteralPath $sourceCompose -Destination $archivedCompose -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceNginx)) -ne ([System.IO.Path]::GetFullPath($archivedNginx))) {
    Copy-Item -LiteralPath $sourceNginx -Destination $archivedNginx -Force
  }

  Write-Host "Office deployment complete: $($manifest.gitSha) ($($manifest.appVersion))"
  Write-Host "API image: $($manifest.apiImage)"
  Write-Host "Web image: $($manifest.webImage)"
}

function Show-OfficeStatus {
  param([Parameter(Mandatory = $true)][string]$Head)

  Write-Host "release/office HEAD: $Head"
  Write-Host "Office root disk free: $(Get-FreeSpaceGb $OfficeRoot) GB"
  $dockerDataGuardPath = Get-DockerDataGuardPath
  Write-Host "Docker data disk free: $(Get-FreeSpaceGb $dockerDataGuardPath) GB ($dockerDataGuardPath)"
  foreach ($name in @('kiditem-postgres', 'kiditem-minio', 'kiditem-api', 'kiditem-worker', 'kiditem-web', 'kiditem-nginx')) {
    Write-Host "${name}: $(Get-ContainerState $name)"
  }
  if (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf) {
    $current = Read-DeploymentManifest $script:CurrentManifestPath
    Write-Host "Current manifest SHA: $($current.Manifest.gitSha)"
    Write-Host "Current API image: $($current.Manifest.apiImage)"
    Write-Host "Current web image: $($current.Manifest.webImage)"
  }
  Invoke-Checked docker system df
}

if ($MyInvocation.InvocationName -eq '.') {
  return
}

if ($ApplySchema -and $Operation -ne 'Deploy') {
  throw '-ApplySchema is valid only with -Operation Deploy.'
}

$head = Assert-LiveCheckout

switch ($Operation) {
  'Status' {
    Show-OfficeStatus $head
  }
  'Deploy' {
    if (-not $ManifestPath) {
      throw '-ManifestPath is required for Deploy.'
    }
    Install-Deployment $ManifestPath $head -ApplySchema:$ApplySchema
  }
  'Rollback' {
    if (-not (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf)) {
      throw "No previous deployment manifest exists at $script:PreviousManifestPath"
    }
    Install-Deployment $script:PreviousManifestPath $head -AllowAncestor
  }
}
