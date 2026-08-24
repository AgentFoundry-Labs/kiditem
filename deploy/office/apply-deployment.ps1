#requires -Version 5.1

[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'Status', 'Rollback', 'RotateRunnerToken')]
  [string]$Operation = 'Status',
  [string]$ManifestPath,
  [string]$RepoRoot = 'C:\workspace\kiditem',
  [string]$OfficeRoot = 'C:\ProgramData\KidItem',
  [string]$DockerDataRoot = '',
  [ValidateRange(5, 500)]
  [int]$MinimumFreeGb = 10,
  [switch]$PruneBuildCache,
  [switch]$ApplySchema,
  [switch]$AcceptDataLoss,
  [ValidateRange(30, 900)]
  [int]$HealthTimeoutSeconds = 300,
  # This local account is provisioned before any release. The deployment only
  # verifies/re-registers its constrained S4U task; it never creates an account
  # or reads provider login material.
  [string]$RunnerServiceAccount = 'KidItemAgentRunner'
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
$script:RunnerServiceAccount = if ($RunnerServiceAccount -match '[\\@]') { $RunnerServiceAccount } else { ".\\$RunnerServiceAccount" }
$script:RunnerTaskName = 'KidItem Agent Runner'
$script:RunnerRoot = Join-Path $OfficeRoot 'agent-runner'
$script:RunnerReleasesRoot = Join-Path $script:RunnerRoot 'releases'
$script:RunnerCurrentPointerPath = Join-Path $script:RunnerRoot 'current.json'
$script:RunnerAttemptRoot = Join-Path $script:RunnerRoot 'attempts'
$script:RunnerTokenPath = Join-Path $OfficeRoot 'secrets\agent-runner-token'
$script:RunnerConfigName = 'runner-config.json'

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
  Assert-ManifestShape -Value $manifest -Expected @(
    'schemaVersion', 'environment', 'sourceRef', 'gitSha', 'appVersion',
    'apiImage', 'apiDigest', 'webImage', 'webDigest', 'runnerArtifact',
    'runnerArtifactSha256', 'runnerRuntime', 'createdAt', 'workflowRunUrl'
  ) -Label 'deployment manifest'

  if ($manifest.schemaVersion -ne 2 -or $manifest.environment -ne 'office') {
    throw 'Deployment manifest must use schemaVersion 2 and environment office.'
  }
  if ($manifest.sourceRef -ne 'refs/heads/release/office') {
    throw "Deployment manifest sourceRef is not release/office: $($manifest.sourceRef)"
  }
  if ($manifest.gitSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Deployment manifest gitSha must be a full lowercase 40-hex SHA.'
  }
  if ($manifest.appVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'Deployment manifest appVersion must be a release version.'
  }
  if ($manifest.createdAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$' -or $manifest.workflowRunUrl -notmatch '^https://.+/actions/runs/\d+$') {
    throw 'Deployment manifest provenance is invalid.'
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
  Assert-RunnerManifest $manifest

  return [pscustomobject]@{ Manifest = $manifest; Raw = $raw }
}

function Assert-ManifestShape {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($null -eq $Value) {
    throw "$Label is missing."
  }
  $actual = @($Value.PSObject.Properties.Name)
  $differences = @(Compare-Object -ReferenceObject $Expected -DifferenceObject $actual)
  if ($differences.Count -ne 0) {
    throw "$Label contains unsupported or missing fields."
  }
}

function Assert-RunnerManifest {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  if ($Manifest.runnerArtifact -ne 'kiditem-agent-runner-windows-x64.zip') {
    throw 'Runner artifact filename is not the approved immutable Windows archive.'
  }
  if ($Manifest.runnerArtifactSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'Runner artifact SHA-256 must be lowercase 64-hex.'
  }
  if ($null -eq $Manifest.runnerRuntime) {
    throw 'Deployment manifest is missing the Runner runtime contract.'
  }
  Assert-RunnerRuntimeContract $Manifest.runnerRuntime
}

function Assert-RunnerRuntimeContract {
  param([Parameter(Mandatory = $true)][object]$Runtime)

  Assert-ManifestShape -Value $Runtime -Expected @(
    'schemaVersion', 'platform', 'nodeMajor', 'controlRevision',
    'cliContractIdentity', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion'
  ) -Label 'Runner runtime contract'

  if (
    $Runtime.schemaVersion -ne 1 -or
    $Runtime.platform -ne 'windows' -or
    $Runtime.nodeMajor -ne 22 -or
    $Runtime.controlRevision -ne 'kiditem-runner-control-v1' -or
    $Runtime.cliContractIdentity -ne 'office-cli-contract-v2' -or
    $Runtime.mcpProtocolRevision -ne '2026-07-28' -or
    $Runtime.codexVersion -ne '0.149.1' -or
    $Runtime.claudeVersion -ne '2.1.241'
  ) {
    throw 'Runner runtime contract does not match the approved KID-25 Windows train.'
  }
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

  Assert-RunnerInstallationPrerequisites
}

function Get-OfficeEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $pattern = '^\s*{0}=(.+?)\s*$' -f [regex]::Escape($Name)
  foreach ($line in Get-Content -LiteralPath $script:OfficeEnvPath) {
    $match = [regex]::Match($line, $pattern)
    if ($match.Success) {
      return $match.Groups[1].Value.Trim().Trim('"')
    }
  }
  throw "Protected Office env file is missing $Name."
}

function Assert-RunnerInstallationPrerequisites {
  Assert-RunnerServiceAccount
  Initialize-RunnerStorage
  $configuredTokenPath = Get-OfficeEnvValue 'KIDITEM_AGENT_RUNNER_TOKEN_FILE'
  if ([System.IO.Path]::GetFullPath($configuredTokenPath) -ne [System.IO.Path]::GetFullPath($script:RunnerTokenPath)) {
    throw "KIDITEM_AGENT_RUNNER_TOKEN_FILE must be the protected Office Runner token path."
  }
  if (-not (Test-Path -LiteralPath $script:RunnerTokenPath -PathType Leaf)) {
    throw "Protected Host Runner token file is missing: $script:RunnerTokenPath"
  }
}

function Assert-RunnerServiceAccount {
  $localName = $script:RunnerServiceAccount.Split('\\')[-1]
  try {
    $account = Get-LocalUser -Name $localName -ErrorAction Stop
  }
  catch {
    throw "Pre-provisioned dedicated Host Runner account is missing: $script:RunnerServiceAccount"
  }
  if (-not $account.Enabled) {
    throw "Pre-provisioned dedicated Host Runner account is disabled: $script:RunnerServiceAccount"
  }
}

function Invoke-Icacls {
  param([Parameter(Mandatory = $true)][string[]]$Arguments)

  & icacls.exe @Arguments | Out-Null
  if ($LASTEXITCODE -ne 0) {
    throw "icacls.exe failed while protecting the Host Runner boundary."
  }
}

function Set-RunnerProtectedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet('Read', 'ReadExecute', 'Write')][string]$Mode = 'Read'
  )

  $directory = Test-Path -LiteralPath $Path -PathType Container
  $serviceRights = switch ($Mode) {
    'Read' { 'R' }
    'ReadExecute' { 'RX' }
    'Write' { 'F' }
  }
  $systemRights = $serviceRights
  if ($directory) {
    $serviceRights = "(OI)(CI)$serviceRights"
    $systemRights = "(OI)(CI)$systemRights"
    $administratorRights = '(OI)(CI)F'
  }
  else {
    $administratorRights = 'F'
  }
  Invoke-Icacls -Arguments @($Path, '/setowner', 'Administrators')
  Invoke-Icacls -Arguments @(
    $Path,
    '/inheritance:r',
    '/grant:r',
    "${script:RunnerServiceAccount}:$serviceRights",
    "SYSTEM:$systemRights",
    "Administrators:$administratorRights",
    '/remove:g', 'Users', 'Authenticated Users', 'Everyone'
  )
}

function Initialize-RunnerStorage {
  New-Item -ItemType Directory -Path $script:RunnerRoot -Force | Out-Null
  Set-RunnerProtectedAcl -Path $script:RunnerRoot -Mode ReadExecute
  foreach ($path in @($script:RunnerReleasesRoot, $script:RunnerAttemptRoot, (Split-Path -Parent $script:RunnerTokenPath))) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
  Set-RunnerProtectedAcl -Path $script:RunnerReleasesRoot -Mode ReadExecute
  Set-RunnerProtectedAcl -Path $script:RunnerAttemptRoot -Mode Write
  Set-RunnerProtectedAcl -Path (Split-Path -Parent $script:RunnerTokenPath) -Mode Read
  if (-not (Test-Path -LiteralPath $script:RunnerTokenPath -PathType Leaf)) {
    Replace-RunnerInstallationToken
  }
  else {
    Set-RunnerProtectedAcl -Path $script:RunnerTokenPath -Mode Read
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
    "KIDITEM_APPLICATION_VERSION=$($Manifest.appVersion)"
    "KIDITEM_GIT_SHA=$($Manifest.gitSha)"
  ) | Set-Content -LiteralPath $Path -Encoding Ascii
}

function Assert-RenderedManifestDeployment {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  # Compose interpolation is itself an admission boundary. Render the exact
  # candidate env before any writer is stopped so a missing/stale deploy file
  # cannot turn a destructive maintenance action into a mixed-SHA restart.
  $renderedJson = Get-CheckedOutput docker @script:ComposeArgs config --format json
  $rendered = $renderedJson | ConvertFrom-Json
  foreach ($name in @('api', 'worker')) {
    $service = $rendered.services.$name
    if ($null -eq $service) { throw "Rendered Compose is missing required $name service." }
    if ($service.image -ne $Manifest.apiImage) {
      throw "Rendered $name image does not match manifest API image."
    }
    if ($service.environment.KIDITEM_APPLICATION_VERSION -ne $Manifest.appVersion) {
      throw "Rendered $name KIDITEM_APPLICATION_VERSION does not match manifest app version."
    }
    if ($service.environment.KIDITEM_GIT_SHA -ne $Manifest.gitSha) {
      throw "Rendered $name KIDITEM_GIT_SHA does not match manifest git SHA."
    }
  }
  if ($rendered.services.web.image -ne $Manifest.webImage) {
    throw 'Rendered web image does not match manifest web image.'
  }
}

function Assert-RunnerArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Runner artifact is missing: $Path"
  }
  $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $Manifest.runnerArtifactSha256) {
    throw 'Runner artifact SHA-256 does not match the immutable deployment manifest.'
  }
}

function Assert-RunnerPackageContents {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  $runtimePath = Join-Path $ReleaseRoot 'runner-runtime-contract.json'
  $runtime = (Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json)
  Assert-RunnerRuntimeContract $runtime
  foreach ($name in @('schemaVersion', 'platform', 'nodeMajor', 'controlRevision', 'cliContractIdentity', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    if ($runtime.$name -ne $Manifest.runnerRuntime.$name) {
      throw "Runner runtime contract field $name does not match the deployment manifest."
    }
  }
  foreach ($path in @(
    (Join-Path $ReleaseRoot 'agent-runner.tgz'),
    (Join-Path $ReleaseRoot 'KidItem.JobRunner.exe'),
    (Join-Path $ReleaseRoot 'package\\dist\\main.cjs'),
    (Join-Path $ReleaseRoot 'package\\node_modules\\@openai\\codex\\package.json'),
    (Join-Path $ReleaseRoot 'package\\node_modules\\@anthropic-ai\\claude-code\\package.json')
  )) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Runner package is incomplete: $path"
    }
  }
  $codexPackage = Get-Content -LiteralPath (Join-Path $ReleaseRoot 'package\\node_modules\\@openai\\codex\\package.json') -Raw | ConvertFrom-Json
  $claudePackage = Get-Content -LiteralPath (Join-Path $ReleaseRoot 'package\\node_modules\\@anthropic-ai\\claude-code\\package.json') -Raw | ConvertFrom-Json
  if ($codexPackage.version -ne $Manifest.runnerRuntime.codexVersion -or $claudePackage.version -ne $Manifest.runnerRuntime.claudeVersion) {
    throw 'Bundled provider versions do not match the immutable Runner runtime contract.'
  }
}

function Assert-RunnerArchiveEntries {
  param([Parameter(Mandatory = $true)][string]$TarPath)

  $entries = & tar.exe -tf $TarPath
  if ($LASTEXITCODE -ne 0) {
    throw 'Runner package archive cannot be listed.'
  }
  foreach ($entry in $entries) {
    if (
      [System.IO.Path]::IsPathRooted($entry) -or
      $entry -match '(^|[\\/])\.\.([\\/]|$)' -or
      -not $entry.StartsWith('package/')
    ) {
      throw 'Runner package archive contains an unsafe path.'
    }
  }
}

function Assert-RunnerOuterArchiveEntries {
  param([Parameter(Mandatory = $true)][string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $expected = @('agent-runner.tgz', 'KidItem.JobRunner.exe', 'runner-runtime-contract.json')
    $entries = @($archive.Entries | ForEach-Object { $_.FullName })
    foreach ($entry in $entries) {
      if (
        [System.IO.Path]::IsPathRooted($entry.Replace('/', '\')) -or
        $entry -match '(^|[\\/])\.\.([\\/]|$)'
      ) {
        throw 'Runner archive contains an unsafe path.'
      }
    }
    if ($entries.Count -ne $expected.Count -or @(Compare-Object -ReferenceObject $expected -DifferenceObject $entries).Count -ne 0) {
      throw 'Runner archive does not have the approved closed file set.'
    }
  }
  finally {
    $archive.Dispose()
  }
}

function New-RunnerRelease {
  param(
    [Parameter(Mandatory = $true)][string]$ArtifactPath,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  Initialize-RunnerStorage
  Assert-RunnerArtifact $ArtifactPath $Manifest
  $releaseRoot = Join-Path $script:RunnerReleasesRoot $Manifest.gitSha
  if (Test-Path -LiteralPath $releaseRoot -PathType Container) {
    Assert-RunnerArtifact (Join-Path $releaseRoot $Manifest.runnerArtifact) $Manifest
    Assert-RunnerPackageContents $releaseRoot $Manifest
    return $releaseRoot
  }

  $candidateRoot = "$releaseRoot.candidate-$([guid]::NewGuid().ToString('N'))"
  try {
    New-Item -ItemType Directory -Path $candidateRoot -Force | Out-Null
    Copy-Item -LiteralPath $ArtifactPath -Destination (Join-Path $candidateRoot $Manifest.runnerArtifact) -Force
    Assert-RunnerArtifact (Join-Path $candidateRoot $Manifest.runnerArtifact) $Manifest
    Assert-RunnerOuterArchiveEntries (Join-Path $candidateRoot $Manifest.runnerArtifact)
    Expand-Archive -LiteralPath (Join-Path $candidateRoot $Manifest.runnerArtifact) -DestinationPath $candidateRoot
    $expectedOuterFiles = @('agent-runner.tgz', 'KidItem.JobRunner.exe', 'runner-runtime-contract.json')
    foreach ($name in $expectedOuterFiles) {
      if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot $name) -PathType Leaf)) {
        throw "Runner archive is missing required file: $name"
      }
    }
    Assert-RunnerArchiveEntries (Join-Path $candidateRoot 'agent-runner.tgz')
    Invoke-Checked tar.exe -xf (Join-Path $candidateRoot 'agent-runner.tgz') -C $candidateRoot
    New-Item -ItemType Directory -Path (Join-Path $candidateRoot 'package\\windows') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $candidateRoot 'KidItem.JobRunner.exe') -Destination (Join-Path $candidateRoot 'package\\windows\\KidItem.JobRunner.exe') -Force
    Assert-RunnerPackageContents $candidateRoot $Manifest

    # The config survives promotion from the private extraction directory to
    # releases/<gitSha>, so bind it to the final immutable root up front.
    $runtimeRoot = Join-Path $releaseRoot 'package'
    $runnerConfigPath = Join-Path $candidateRoot $script:RunnerConfigName
    $runnerConfig = [ordered]@{
      controlOrigin = 'http://127.0.0.1:4000'
      tokenFile = $script:RunnerTokenPath
      attemptRoot = $script:RunnerAttemptRoot
      runtimeRoot = $runtimeRoot
    }
    # Windows PowerShell 5.1's Set-Content -Encoding UTF8 adds a BOM, while
    # the Node strict JSON parser deliberately rejects that control byte.
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($runnerConfigPath, ($runnerConfig | ConvertTo-Json), $utf8NoBom)
    Set-RunnerProtectedAcl -Path $candidateRoot -Mode ReadExecute
    Set-RunnerProtectedAcl -Path (Join-Path $candidateRoot 'package') -Mode ReadExecute
    Set-RunnerProtectedAcl -Path $runnerConfigPath -Mode Read
    Move-Item -LiteralPath $candidateRoot -Destination $releaseRoot
  }
  catch {
    Remove-Item -LiteralPath $candidateRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw
  }
  return $releaseRoot
}

function Get-RunnerCurrentRelease {
  if (-not (Test-Path -LiteralPath $script:RunnerCurrentPointerPath -PathType Leaf)) {
    return $null
  }
  $pointer = Get-Content -LiteralPath $script:RunnerCurrentPointerPath -Raw | ConvertFrom-Json
  if ($pointer.gitSha -notmatch '^[0-9a-f]{40}$' -or -not $pointer.releaseRoot) {
    throw 'Current Runner release pointer is invalid.'
  }
  $releaseRoot = [System.IO.Path]::GetFullPath([string]$pointer.releaseRoot)
  $allowed = [System.IO.Path]::GetFullPath((Join-Path $script:RunnerReleasesRoot $pointer.gitSha))
  if ($releaseRoot -ne $allowed -or -not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
    throw 'Current Runner release pointer escapes the protected releases root.'
  }
  return [pscustomobject]@{ GitSha = $pointer.gitSha; ReleaseRoot = $releaseRoot }
}

function Move-RunnerProtectedFile {
  param(
    [Parameter(Mandatory = $true)][string]$Candidate,
    [Parameter(Mandatory = $true)][string]$Target
  )

  if (Test-Path -LiteralPath $Target -PathType Leaf) {
    $backup = "$Target.rollback-$([guid]::NewGuid().ToString('N'))"
    try {
      [System.IO.File]::Replace($Candidate, $Target, $backup, $true)
    }
    finally {
      Remove-Item -LiteralPath $backup -Force -ErrorAction SilentlyContinue
    }
    return
  }
  Move-Item -LiteralPath $Candidate -Destination $Target
}

function Switch-RunnerCurrentRelease {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  Assert-RunnerArtifact (Join-Path $ReleaseRoot $Manifest.runnerArtifact) $Manifest
  Assert-RunnerPackageContents $ReleaseRoot $Manifest
  $candidate = "$script:RunnerCurrentPointerPath.candidate-$([guid]::NewGuid().ToString('N'))"
  [ordered]@{
    gitSha = $Manifest.gitSha
    releaseRoot = [System.IO.Path]::GetFullPath($ReleaseRoot)
    runnerArtifactSha256 = $Manifest.runnerArtifactSha256
  } | ConvertTo-Json | Set-Content -LiteralPath $candidate -Encoding UTF8
  Set-RunnerProtectedAcl -Path $candidate -Mode Read
  Move-RunnerProtectedFile -Candidate $candidate -Target $script:RunnerCurrentPointerPath
}

function Register-RunnerScheduledTask {
  param([Parameter(Mandatory = $true)][string]$ReleaseRoot)

  Assert-RunnerServiceAccount
  $entryPoint = Join-Path $ReleaseRoot 'package\\dist\\main.cjs'
  $configPath = Join-Path $ReleaseRoot $script:RunnerConfigName
  if (-not (Test-Path -LiteralPath $entryPoint -PathType Leaf) -or -not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
    throw 'Runner scheduled task cannot be registered from an incomplete release.'
  }
  $nodeExecutable = Join-Path $env:ProgramFiles 'nodejs\\node.exe'
  if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw "Host Node 22 executable is missing: $nodeExecutable"
  }
  $action = New-ScheduledTaskAction -Execute $nodeExecutable -Argument ('"{0}" --config "{1}"' -f $entryPoint, $configPath)
  $principal = New-ScheduledTaskPrincipal -UserId $script:RunnerServiceAccount -LogonType S4U -RunLevel Limited
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  Register-ScheduledTask -TaskName $script:RunnerTaskName -Action $action -Principal $principal -Trigger $trigger -Settings $settings -Force | Out-Null
  $registered = Get-ScheduledTask -TaskName $script:RunnerTaskName
  if ($registered.Principal.LogonType.ToString() -ne 'S4U') {
    throw 'Host Runner task must use S4U logon.'
  }
}

function Stop-RunnerScheduledTask {
  $task = Get-ScheduledTask -TaskName $script:RunnerTaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) { return }
  try { Stop-ScheduledTask -TaskName $script:RunnerTaskName -ErrorAction Stop }
  catch { }
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $task = Get-ScheduledTask -TaskName $script:RunnerTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task -or $task.State.ToString() -ne 'Running') { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw 'Host Runner task did not stop within 30 seconds.'
}

function Start-RunnerScheduledTask {
  Start-ScheduledTask -TaskName $script:RunnerTaskName
}

function Wait-ForAgentRuntimeReadiness {
  $deadline = (Get-Date).AddSeconds($HealthTimeoutSeconds)
  do {
    $token = (Get-Content -LiteralPath $script:RunnerTokenPath -Raw).Trim()
    if ($token -notmatch '^[A-Za-z0-9_-]{43}$') {
      throw 'Protected Host Runner token has an invalid format.'
    }
    try {
      $response = Invoke-RestMethod -Method Get -Uri 'http://127.0.0.1:4000/internal/agent-runtime/runner/readiness' -Headers @{ Authorization = "Bearer $token" } -TimeoutSec 15
      $allAgentsReady = @($response.agents).Count -gt 0 -and @($response.agents | Where-Object { $_.status -ne 'ready' }).Count -eq 0
      if (
        $response.status -eq 'ready' -and
        $allAgentsReady -and
        $null -ne $response.runner -and
        $response.runner.platform -eq 'windows' -and
        $response.runner.nodeMajor -eq 22 -and
        $response.runner.controlRevision -eq 'kiditem-runner-control-v1' -and
        $response.runner.cliContractIdentity -eq 'office-cli-contract-v2' -and
        $response.runner.mcpProtocolRevision -eq '2026-07-28' -and
        $response.runner.runtimes.codex_cli.version -eq '0.149.1' -and
        $response.runner.runtimes.claude_cli.version -eq '2.1.241'
      ) {
        return
      }
    }
    catch {
      # The native process and its canaries can take several polls to promote.
      # Do not log the HTTP headers or error payload because they may contain a bearer.
    }
    Start-Sleep -Seconds 3
  } while ((Get-Date) -lt $deadline)
  throw "Host Runner did not reach full KID-25 readiness within $HealthTimeoutSeconds seconds."
}

function New-RunnerInstallationToken {
  $bytes = New-Object byte[] 32
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  try {
    $rng.GetBytes($bytes)
  }
  finally {
    $rng.Dispose()
  }
  return [Convert]::ToBase64String($bytes).TrimEnd('=').Replace('+', '-').Replace('/', '_')
}

function Replace-RunnerInstallationToken {
  $token = New-RunnerInstallationToken
  if ($token -notmatch '^[A-Za-z0-9_-]{43}$') {
    throw 'Generated Host Runner token has an invalid format.'
  }
  $candidate = "$script:RunnerTokenPath.candidate-$([guid]::NewGuid().ToString('N'))"
  try {
    Set-Content -LiteralPath $candidate -Value $token -NoNewline -Encoding Ascii
    Set-RunnerProtectedAcl -Path $candidate -Mode Read
    Move-RunnerProtectedFile -Candidate $candidate -Target $script:RunnerTokenPath
  }
  finally {
    Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
  }
}

function Rotate-RunnerToken {
  param([Parameter(Mandatory = $true)][string]$ExpectedHead)

  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw "No current Office deployment manifest exists at $script:CurrentManifestPath"
  }
  $bundle = Read-DeploymentManifest $script:CurrentManifestPath
  $manifest = $bundle.Manifest
  if ($manifest.gitSha -ne $ExpectedHead) {
    throw 'Runner token rotation is blocked because the current runtime does not match release/office HEAD.'
  }
  Assert-RuntimePrerequisites
  $currentRunner = Get-RunnerCurrentRelease
  if ($null -eq $currentRunner -or $currentRunner.GitSha -ne $manifest.gitSha) {
    throw 'Runner token rotation requires a current Runner release matching the deployed API/Web identity.'
  }
  $tokenBackup = "$script:RunnerTokenPath.rollback-$([guid]::NewGuid().ToString('N'))"
  Copy-Item -LiteralPath $script:RunnerTokenPath -Destination $tokenBackup -Force
  Set-RunnerProtectedAcl -Path $tokenBackup -Mode Read
  try {
    Set-ComposeArguments
    Stop-RunnerScheduledTask
    Invoke-Checked docker @script:ComposeArgs stop api worker
    Replace-RunnerInstallationToken
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api worker web nginx
    Wait-ForRuntime
    Register-RunnerScheduledTask $currentRunner.ReleaseRoot
    Start-RunnerScheduledTask
    Wait-ForAgentRuntimeReadiness
    Assert-SmokeTests
  }
  catch {
    $rotationError = $_
    try {
      Stop-RunnerScheduledTask
      $restoreCandidate = "$script:RunnerTokenPath.restore-$([guid]::NewGuid().ToString('N'))"
      Copy-Item -LiteralPath $tokenBackup -Destination $restoreCandidate -Force
      Set-RunnerProtectedAcl -Path $restoreCandidate -Mode Read
      Move-RunnerProtectedFile -Candidate $restoreCandidate -Target $script:RunnerTokenPath
      Set-ComposeArguments
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api worker web nginx
      Wait-ForRuntime
      Register-RunnerScheduledTask $currentRunner.ReleaseRoot
      Start-RunnerScheduledTask
      Wait-ForAgentRuntimeReadiness
    }
    catch {
      Write-Warning 'Runner token rotation rollback also failed; keep the Office runtime blocked for operator recovery.'
    }
    throw $rotationError
  }
  finally {
    Remove-Item -LiteralPath $tokenBackup -Force -ErrorAction SilentlyContinue
  }
}

function Restore-Transaction {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)

  Stop-RunnerScheduledTask
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
  $runnerPointerBackup = Join-Path $BackupRoot 'runner-current.json'
  if (Test-Path -LiteralPath $runnerPointerBackup -PathType Leaf) {
    $restorePointer = "$script:RunnerCurrentPointerPath.restore-$([guid]::NewGuid().ToString('N'))"
    try {
      Copy-Item -LiteralPath $runnerPointerBackup -Destination $restorePointer -Force
      Set-RunnerProtectedAcl -Path $restorePointer -Mode Read
      Move-RunnerProtectedFile -Candidate $restorePointer -Target $script:RunnerCurrentPointerPath
    }
    finally {
      Remove-Item -LiteralPath $restorePointer -Force -ErrorAction SilentlyContinue
    }
  }
  elseif (Test-Path -LiteralPath $script:RunnerCurrentPointerPath -PathType Leaf) {
    Remove-Item -LiteralPath $script:RunnerCurrentPointerPath -Force
  }
  if ($restored) {
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    $previousRunner = Get-RunnerCurrentRelease
    if ($null -ne $previousRunner) {
      Register-RunnerScheduledTask $previousRunner.ReleaseRoot
      Start-RunnerScheduledTask
      Wait-ForAgentRuntimeReadiness
    }
    Assert-SmokeTests
    Write-Warning 'Previous office runtime files were restored after deployment failure.'
  }
}

function Install-Deployment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetManifestPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHead,
    [switch]$AllowAncestor,
    [switch]$ApplySchema,
    [switch]$AcceptDataLoss
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
  $sourceRunnerArtifact = Join-Path $sourceRoot $manifest.runnerArtifact
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceRunnerArtifact -PathType Leaf)
  ) {
    $sourceRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
    $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
    $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
    $sourceRunnerArtifact = Join-Path $sourceRoot $manifest.runnerArtifact
  }
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceRunnerArtifact -PathType Leaf)
  ) {
    throw "No archived Compose/nginx/Runner bundle exists for manifest SHA $($manifest.gitSha)."
  }
  if (Select-String -LiteralPath $sourceCompose -Pattern '^\s*build\s*:' -Quiet) {
    throw 'Office Compose contains a local build section; only immutable pulled images are allowed.'
  }
  Assert-RunnerArtifact $sourceRunnerArtifact $manifest
  $runnerReleaseRoot = New-RunnerRelease $sourceRunnerArtifact $manifest

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
  $runnerPointerBackup = Join-Path $backupRoot 'runner-current.json'
  Remove-Item -LiteralPath $runnerPointerBackup -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $script:RunnerCurrentPointerPath -PathType Leaf) {
    Copy-Item -LiteralPath $script:RunnerCurrentPointerPath -Destination $runnerPointerBackup -Force
  }

  $candidateDeployEnv = Join-Path $OfficeRoot '.env.office.deploy.candidate'
  try {
    Write-DeployEnv $candidateDeployEnv $manifest
    Copy-Item -LiteralPath $sourceCompose -Destination $script:ComposePath -Force
    Copy-Item -LiteralPath $sourceNginx -Destination (Join-Path $OfficeRoot 'nginx.conf') -Force
    Move-Item -LiteralPath $candidateDeployEnv -Destination $script:DeployEnvPath -Force
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs config --quiet
    Assert-RenderedManifestDeployment $manifest
    Stop-RunnerScheduledTask
    if ($ApplySchema) {
      Write-Warning 'Stopping application containers before the approved Prisma schema push. Runtime rollback cannot undo schema changes.'
      Invoke-Checked docker @script:ComposeArgs stop api worker web nginx
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build postgres
      Wait-ForContainerHealthy 'kiditem-postgres'
      $schemaCommand = 'cd /app && npx prisma db push'
      if ($AcceptDataLoss) {
        $schemaCommand = "$schemaCommand --accept-data-loss"
      }
      Invoke-Checked docker @script:ComposeArgs run --rm --no-deps api sh -lc $schemaCommand
    }
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    Switch-RunnerCurrentRelease $runnerReleaseRoot $manifest
    Register-RunnerScheduledTask $runnerReleaseRoot
    Start-RunnerScheduledTask
    Wait-ForAgentRuntimeReadiness
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
  $archivedRunnerArtifact = Join-Path $archiveRoot $manifest.runnerArtifact
  if (([System.IO.Path]::GetFullPath($sourceCompose)) -ne ([System.IO.Path]::GetFullPath($archivedCompose))) {
    Copy-Item -LiteralPath $sourceCompose -Destination $archivedCompose -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceNginx)) -ne ([System.IO.Path]::GetFullPath($archivedNginx))) {
    Copy-Item -LiteralPath $sourceNginx -Destination $archivedNginx -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceRunnerArtifact)) -ne ([System.IO.Path]::GetFullPath($archivedRunnerArtifact))) {
    Copy-Item -LiteralPath $sourceRunnerArtifact -Destination $archivedRunnerArtifact -Force
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
  $runner = Get-RunnerCurrentRelease
  if ($null -ne $runner) {
    Write-Host "Current Host Runner SHA: $($runner.GitSha)"
  }
  Invoke-Checked docker system df
}

if ($MyInvocation.InvocationName -eq '.') {
  return
}

if ($ApplySchema -and $Operation -ne 'Deploy') {
  throw '-ApplySchema is valid only with -Operation Deploy.'
}
if ($AcceptDataLoss -and (-not $ApplySchema -or $Operation -ne 'Deploy')) {
  throw '-AcceptDataLoss is valid only with -Operation Deploy -ApplySchema.'
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
    Install-Deployment $ManifestPath $head -ApplySchema:$ApplySchema -AcceptDataLoss:$AcceptDataLoss
  }
  'Rollback' {
    if (-not (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf)) {
      throw "No previous deployment manifest exists at $script:PreviousManifestPath"
    }
    Install-Deployment $script:PreviousManifestPath $head -AllowAncestor
  }
  'RotateRunnerToken' {
    Rotate-RunnerToken $head
    Write-Host 'Host Runner installation bearer rotated and full readiness reverified.'
  }
}
