#requires -Version 5.1

[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'Status', 'Rollback', 'CompleteRecovery')]
  [string]$Operation = 'Status',
  [string]$ManifestPath,
  [string]$RepoRoot = 'C:\workspace\kiditem',
  [string]$OfficeRoot = 'C:\ProgramData\Kiditem',
  [string]$DockerDataRoot = '',
  [string]$RecoveryCopyDirectory = '',
  [string]$RecoveryArtifactPath = '',
  [ValidatePattern('^[0-9a-fA-F]{64}$')]
  [string]$RecoveredDatabaseDumpSha256 = '',
  [string]$RecoveredPriorManifestPath = '',
  [ValidateRange(5, 500)]
  [int]$MinimumFreeGb = 10,
  [switch]$PruneBuildCache,
  [switch]$ApplySchema,
  [switch]$AcceptDataLoss,
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
$script:RecoveryRoot = Join-Path $OfficeRoot 'recovery'
$script:RecoveryStatePath = Join-Path $script:DeploymentsRoot 'recovery-required.json'
$script:RecoveryHistoryRoot = Join-Path $script:DeploymentsRoot 'recovery-history'
$script:RecoveryPolicyPath = Join-Path $PSScriptRoot 'recovery-operation-policy.json'
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

function Get-FileSha256 {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Cannot hash missing file: $Path"
  }
  return (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
}

function Get-TextSha256 {
  param([Parameter(Mandatory = $true)][string]$Text)

  $encoding = New-Object System.Text.UTF8Encoding($false)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $hashBytes = $sha256.ComputeHash($encoding.GetBytes($Text))
    return ([System.BitConverter]::ToString($hashBytes)).Replace('-', '').ToLowerInvariant()
  }
  finally {
    $sha256.Dispose()
  }
}

function Get-DeploymentManifestIdentitySha256 {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  $identityValues = @(
    [string]$Manifest.schemaVersion
    [string]$Manifest.environment
    [string]$Manifest.sourceRef
    [string]$Manifest.gitSha
    [string]$Manifest.appVersion
    [string]$Manifest.apiImage
    [string]$Manifest.apiDigest
    [string]$Manifest.webImage
    [string]$Manifest.webDigest
    [string]$Manifest.createdAt
    [string]$Manifest.workflowRunUrl
  )
  $canonicalIdentity = ($identityValues | ForEach-Object {
    '{0}:{1}' -f $_.Length, $_
  }) -join '|'
  return Get-TextSha256 $canonicalIdentity
}

function Read-RecoveryState {
  if (-not (Test-Path -LiteralPath $script:RecoveryStatePath -PathType Leaf)) {
    return $null
  }

  $state = Get-Content -LiteralPath $script:RecoveryStatePath -Raw | ConvertFrom-Json
  if (
    $state.schemaVersion -ne 2 -or
    $state.status -notin @('prepared', 'schema-push-completed', 'recovery-required', 'deployed') -or
    $state.candidateGitSha -notmatch '^[0-9a-f]{40}$' -or
    $state.candidateManifestSha256 -notmatch '^[0-9a-f]{64}$' -or
    $state.priorGitSha -notmatch '^[0-9a-f]{40}$' -or
    $state.priorManifestSha256 -notmatch '^[0-9a-f]{64}$' -or
    $state.dumpSha256 -notmatch '^[0-9a-f]{64}$'
  ) {
    throw "Office recovery state is invalid: $script:RecoveryStatePath"
  }
  return $state
}

function Read-RecoveryOperationPolicy {
  if (-not (Test-Path -LiteralPath $script:RecoveryPolicyPath -PathType Leaf)) {
    throw "Office recovery policy is missing: $script:RecoveryPolicyPath"
  }

  $policy = Get-Content -LiteralPath $script:RecoveryPolicyPath -Raw | ConvertFrom-Json
  if (
    $policy.schemaVersion -ne 1 -or
    @($policy.operationRules).Count -eq 0 -or
    @($policy.deploymentTransitions).Count -eq 0
  ) {
    throw "Office recovery policy is invalid: $script:RecoveryPolicyPath"
  }

  foreach ($rule in @($policy.operationRules)) {
    if (
      $rule.markerStatus -notin @('prepared', 'schema-push-completed', 'recovery-required', 'deployed', 'any') -or
      $rule.operation -notin @('Deploy', 'Status', 'Rollback', 'CompleteRecovery', 'any') -or
      $rule.currentManifestIdentity -notin @('candidate', 'not-candidate', 'none', 'any') -or
      $rule.decision -ne 'allow' -or
      ($rule.applySchema -ne 'any' -and $rule.applySchema -isnot [bool])
    ) {
      throw "Office recovery operation rule is invalid: $($rule | ConvertTo-Json -Compress)"
    }
  }

  foreach ($transition in @($policy.deploymentTransitions)) {
    if (
      $transition.markerStatusAtStart -notin @('none', 'prepared', 'schema-push-completed', 'recovery-required', 'deployed', 'any') -or
      $transition.deploymentKind -notin @('application-only', 'schema', 'any') -or
      $transition.currentManifestIdentity -notin @('candidate', 'not-candidate', 'none', 'any') -or
      ($transition.destructiveBoundaryEntered -ne 'any' -and $transition.destructiveBoundaryEntered -isnot [bool]) -or
      $transition.outcome -notin @('failure', 'full-success') -or
      $transition.runtimeAction -notin @('restore-transaction', 'stop-writers', 'keep-runtime') -or
      $transition.markerAction -notin @('preserve', 'require-recovery', 'archive-remove')
    ) {
      throw "Office recovery transition is invalid: $($transition | ConvertTo-Json -Compress)"
    }
  }

  return $policy
}

function Test-RecoveryPolicyValueMatch {
  param(
    [Parameter(Mandatory = $true)][object]$Expected,
    [Parameter(Mandatory = $true)][object]$Actual
  )

  return ($Expected -eq 'any' -or $Expected -eq $Actual)
}

function Test-RecoveryOperationAllowed {
  param(
    [Parameter(Mandatory = $true)][object]$Policy,
    [Parameter(Mandatory = $true)][string]$MarkerStatus,
    [Parameter(Mandatory = $true)][string]$RequestedOperation,
    [Parameter(Mandatory = $true)][bool]$ApplySchema,
    [Parameter(Mandatory = $true)][string]$CurrentManifestIdentity
  )

  foreach ($rule in @($Policy.operationRules)) {
    if (
      (Test-RecoveryPolicyValueMatch $rule.markerStatus $MarkerStatus) -and
      (Test-RecoveryPolicyValueMatch $rule.operation $RequestedOperation) -and
      (Test-RecoveryPolicyValueMatch $rule.applySchema $ApplySchema) -and
      (Test-RecoveryPolicyValueMatch $rule.currentManifestIdentity $CurrentManifestIdentity)
    ) {
      return $rule.decision -eq 'allow'
    }
  }
  return $false
}

function Get-RecoveryDeploymentTransition {
  param(
    [Parameter(Mandatory = $true)][object]$Policy,
    [Parameter(Mandatory = $true)][string]$MarkerStatusAtStart,
    [Parameter(Mandatory = $true)][string]$DeploymentKind,
    [Parameter(Mandatory = $true)][string]$CurrentManifestIdentity,
    [Parameter(Mandatory = $true)][bool]$DestructiveBoundaryEntered,
    [Parameter(Mandatory = $true)][string]$Outcome
  )

  foreach ($transition in @($Policy.deploymentTransitions)) {
    if (
      (Test-RecoveryPolicyValueMatch $transition.markerStatusAtStart $MarkerStatusAtStart) -and
      (Test-RecoveryPolicyValueMatch $transition.deploymentKind $DeploymentKind) -and
      (Test-RecoveryPolicyValueMatch $transition.currentManifestIdentity $CurrentManifestIdentity) -and
      (Test-RecoveryPolicyValueMatch $transition.destructiveBoundaryEntered $DestructiveBoundaryEntered) -and
      (Test-RecoveryPolicyValueMatch $transition.outcome $Outcome)
    ) {
      return $transition
    }
  }

  throw "Office recovery policy has no deployment transition for marker=$MarkerStatusAtStart kind=$DeploymentKind identity=$CurrentManifestIdentity boundary=$DestructiveBoundaryEntered outcome=$Outcome."
}

function Save-RecoveryState {
  param([Parameter(Mandatory = $true)][object]$State)

  New-Item -ItemType Directory -Path $script:DeploymentsRoot -Force | Out-Null
  $candidatePath = "$($script:RecoveryStatePath).candidate"
  $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $candidatePath -Encoding UTF8
  Move-Item -LiteralPath $candidatePath -Destination $script:RecoveryStatePath -Force
}

function Save-NewRecoveryState {
  param([Parameter(Mandatory = $true)][object]$State)

  New-Item -ItemType Directory -Path $script:DeploymentsRoot -Force | Out-Null
  $candidatePath = '{0}.{1}.candidate' -f $script:RecoveryStatePath, ([guid]::NewGuid().ToString('N'))
  try {
    $State | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $candidatePath -Encoding UTF8
    [System.IO.File]::Move($candidatePath, $script:RecoveryStatePath)
  }
  finally {
    if (Test-Path -LiteralPath $candidatePath -PathType Leaf) {
      Remove-Item -LiteralPath $candidatePath
    }
  }
}

function Archive-RecoveryState {
  param([Parameter(Mandatory = $true)][string]$Reason)

  if (-not (Test-Path -LiteralPath $script:RecoveryStatePath -PathType Leaf)) {
    return
  }

  New-Item -ItemType Directory -Path $script:RecoveryHistoryRoot -Force | Out-Null
  $safeReason = $Reason -replace '[^a-zA-Z0-9-]', '-'
  $historyName = '{0}-{1}-{2}.json' -f (
    Get-Date -Format 'yyyyMMdd-HHmmss'
  ), $safeReason, ([guid]::NewGuid().ToString('N').Substring(0, 8))
  Copy-Item -LiteralPath $script:RecoveryStatePath -Destination (Join-Path $script:RecoveryHistoryRoot $historyName) -Force
}

function Set-RecoveryStateStatus {
  param([Parameter(Mandatory = $true)][string]$Status)

  $state = Read-RecoveryState
  if ($null -eq $state) {
    throw 'Cannot update missing Office recovery state.'
  }
  $state.status = $Status
  if ($Status -eq 'schema-push-completed') {
    $state.schemaPushCompletedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  elseif ($Status -eq 'deployed') {
    $state.deploymentCompletedAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  elseif ($Status -eq 'recovery-required') {
    $state.recoveryRequiredAtUtc = (Get-Date).ToUniversalTime().ToString('o')
  }
  Save-RecoveryState $state
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

function Get-CurrentManifestIdentityForRecoveryState {
  param([Parameter(Mandatory = $true)][object]$RecoveryState)

  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    return 'not-candidate'
  }

  $currentBundle = Read-DeploymentManifest $script:CurrentManifestPath
  $currentManifestHash = Get-DeploymentManifestIdentitySha256 $currentBundle.Manifest
  if (
    $currentBundle.Manifest.gitSha -eq $RecoveryState.candidateGitSha -and
    $currentManifestHash -eq $RecoveryState.candidateManifestSha256
  ) {
    return 'candidate'
  }
  return 'not-candidate'
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

function Stop-ApplicationWriters {
  Invoke-Checked docker @script:ComposeArgs stop api worker web nginx
}

function Assert-OperationAllowedByRecoveryState {
  param(
    [Parameter(Mandatory = $true)][string]$RequestedOperation,
    [switch]$ApplySchema
  )

  $state = Read-RecoveryState
  if ($null -eq $state) {
    return
  }

  $currentManifestIdentity = 'none'
  if ($state.status -eq 'deployed' -and $RequestedOperation -eq 'Deploy') {
    $currentManifestIdentity = Get-CurrentManifestIdentityForRecoveryState $state
  }
  $policy = Read-RecoveryOperationPolicy
  $operationAllowed = Test-RecoveryOperationAllowed `
    -Policy $policy `
    -MarkerStatus $state.status `
    -RequestedOperation $RequestedOperation `
    -ApplySchema ([bool]$ApplySchema) `
    -CurrentManifestIdentity $currentManifestIdentity
  if ($operationAllowed) {
    return
  }

  if ($state.status -eq 'deployed' -and $RequestedOperation -eq 'Deploy' -and $ApplySchema) {
    throw "Schema deployment is blocked by destructive schema boundary $($state.candidateGitSha). Only an application-only Deploy from the exact recorded candidate manifest is allowed until CompleteRecovery."
  }
  if ($state.status -eq 'deployed' -and $RequestedOperation -eq 'Deploy') {
    throw "Application-only Deploy is blocked because current.json does not match destructive candidate Git SHA $($state.candidateGitSha) and manifest SHA256 $($state.candidateManifestSha256). Complete identity-bound recovery before any deployment."
  }
  if ($state.status -eq 'deployed') {
    throw "Runtime-only Rollback is blocked by destructive schema boundary $($state.candidateGitSha). Restore dump SHA256 $($state.dumpSha256) and complete identity-bound recovery instead."
  }

  throw "Office recovery is required for destructive schema boundary $($state.candidateGitSha) (state=$($state.status)). Deploy, Rollback, and application start are blocked. Restore dump SHA256 $($state.dumpSha256), then use -Operation CompleteRecovery with the matching artifact and prior manifest."
}

function New-DestructiveRecoveryArtifact {
  param(
    [Parameter(Mandatory = $true)][object]$CandidateManifest,
    [Parameter(Mandatory = $true)][string]$RecoveryCopyDirectory
  )

  if (Test-Path -LiteralPath $script:RecoveryStatePath -PathType Leaf) {
    throw 'A destructive schema recovery marker already exists; complete the recorded recovery boundary before another destructive deployment.'
  }
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw 'A destructive schema deploy requires a recorded current manifest for coupled database/runtime recovery.'
  }
  if (-not (Test-Path -LiteralPath $RecoveryCopyDirectory -PathType Container)) {
    throw "Recovery copy directory does not exist: $RecoveryCopyDirectory"
  }

  $priorBundle = Read-DeploymentManifest $script:CurrentManifestPath
  $priorManifestSha256 = Get-FileSha256 $script:CurrentManifestPath
  $priorGitSha = $priorBundle.Manifest.gitSha
  $candidateManifestSha256 = Get-DeploymentManifestIdentitySha256 $CandidateManifest
  $resolvedCopyDirectory = (Resolve-Path -LiteralPath $RecoveryCopyDirectory).Path

  New-Item -ItemType Directory -Path $script:RecoveryRoot -Force | Out-Null
  $dumpName = '{0}-{1}-{2}.dump' -f (
    Get-Date -Format 'yyyyMMdd-HHmmss'
  ), $CandidateManifest.gitSha.Substring(0, 12), ([guid]::NewGuid().ToString('N').Substring(0, 8))
  $containerDumpPath = "/tmp/$dumpName"
  $localDumpPath = Join-Path $script:RecoveryRoot $dumpName
  $copyDumpPath = Join-Path $resolvedCopyDirectory $dumpName
  if ([System.IO.Path]::GetFullPath($copyDumpPath) -eq [System.IO.Path]::GetFullPath($localDumpPath)) {
    throw 'RecoveryCopyDirectory must be separate from the local Office recovery directory.'
  }
  if ((Test-Path -LiteralPath $localDumpPath) -or (Test-Path -LiteralPath $copyDumpPath)) {
    throw "Refusing to overwrite an existing recovery artifact named $dumpName."
  }

  try {
    Invoke-Checked docker exec kiditem-postgres pg_dump --format=custom "--file=$containerDumpPath" --username=kiditem --dbname=kiditem
    $catalog = Get-CheckedOutput docker exec kiditem-postgres pg_restore --list $containerDumpPath
    if (-not $catalog) {
      throw 'pg_restore --list returned an empty catalog for the quiesced database dump.'
    }
    Invoke-Checked docker cp "kiditem-postgres:$containerDumpPath" $localDumpPath
  }
  finally {
    & docker exec kiditem-postgres rm -f $containerDumpPath *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not remove temporary PostgreSQL dump $containerDumpPath from the container."
    }
  }

  if (-not (Test-Path -LiteralPath $localDumpPath -PathType Leaf) -or (Get-Item -LiteralPath $localDumpPath).Length -le 0) {
    throw 'The quiesced database dump is missing or empty.'
  }
  $localHash = (Get-FileHash -LiteralPath $localDumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  Copy-Item -LiteralPath $localDumpPath -Destination $copyDumpPath
  $copyHash = (Get-FileHash -LiteralPath $copyDumpPath -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($copyHash -ne $localHash) {
    throw "Recovery copy SHA256 mismatch for $copyDumpPath."
  }

  $state = [ordered]@{
    schemaVersion = 2
    status = 'prepared'
    candidateGitSha = $CandidateManifest.gitSha
    candidateManifestSha256 = $candidateManifestSha256
    priorGitSha = $priorGitSha
    priorManifestSha256 = $priorManifestSha256
    dumpSha256 = $localHash
    localArtifactPath = $localDumpPath
    recoveryCopyPath = $copyDumpPath
    createdAtUtc = (Get-Date).ToUniversalTime().ToString('o')
    schemaPushCompletedAtUtc = $null
    deploymentCompletedAtUtc = $null
    recoveryRequiredAtUtc = $null
  }

  Save-NewRecoveryState $state
  Write-Host "Quiesced recovery dump verified: SHA256 $localHash"
  Write-Host "Recovery copy verified: $copyDumpPath"
  return $state
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

function Complete-DatabaseRecovery {
  param(
    [Parameter(Mandatory = $true)][string]$RecoveryArtifactPath,
    [Parameter(Mandatory = $true)][string]$RecoveredDatabaseDumpSha256,
    [Parameter(Mandatory = $true)][string]$RecoveredPriorManifestPath
  )

  $state = Read-RecoveryState
  if ($null -eq $state) {
    throw 'No destructive schema recovery state exists to complete.'
  }

  Set-ComposeArguments
  Stop-ApplicationWriters
  Invoke-Checked docker @script:ComposeArgs up --detach --no-build postgres minio
  Wait-ForContainerHealthy 'kiditem-postgres'
  Wait-ForContainerHealthy 'kiditem-minio'

  if (-not (Test-Path -LiteralPath $RecoveryArtifactPath -PathType Leaf)) {
    throw "Recovery artifact does not exist: $RecoveryArtifactPath"
  }
  $expectedArtifactHash = $RecoveredDatabaseDumpSha256.ToLowerInvariant()
  $actualArtifactHash = Get-FileSha256 $RecoveryArtifactPath
  if ($expectedArtifactHash -ne $state.dumpSha256 -or $actualArtifactHash -ne $state.dumpSha256) {
    throw "Recovery artifact SHA256 does not match recorded dump SHA256 $($state.dumpSha256)."
  }

  $verifyContainerPath = "/tmp/kiditem-recovery-verify-$([guid]::NewGuid().ToString('N')).dump"
  try {
    Invoke-Checked docker cp $RecoveryArtifactPath "kiditem-postgres:$verifyContainerPath"
    $catalog = Get-CheckedOutput docker exec kiditem-postgres pg_restore --list $verifyContainerPath
    if (-not $catalog) {
      throw 'pg_restore --list returned an empty catalog for the supplied recovery artifact.'
    }
  }
  finally {
    & docker exec kiditem-postgres rm -f $verifyContainerPath *> $null
    if ($LASTEXITCODE -ne 0) {
      Write-Warning "Could not remove temporary recovery verification file $verifyContainerPath from the container."
    }
  }

  $priorManifestHash = Get-FileSha256 $RecoveredPriorManifestPath
  $priorBundle = Read-DeploymentManifest $RecoveredPriorManifestPath
  if (
    $priorManifestHash -ne $state.priorManifestSha256 -or
    $priorBundle.Manifest.gitSha -ne $state.priorGitSha
  ) {
    throw 'Recovered prior manifest identity does not match the destructive schema recovery state.'
  }

  Assert-DiskCapacity
  Assert-RuntimePrerequisites
  Assert-ImageRevision $priorBundle.Manifest.apiImage $priorBundle.Manifest.gitSha
  Assert-ImageRevision $priorBundle.Manifest.webImage $priorBundle.Manifest.gitSha

  $priorSourceRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $state.priorGitSha)
  $priorCompose = Join-Path $priorSourceRoot 'compose.office.yml'
  $priorNginx = Join-Path $priorSourceRoot 'nginx.conf'
  if (-not (Test-Path -LiteralPath $priorCompose -PathType Leaf) -or -not (Test-Path -LiteralPath $priorNginx -PathType Leaf)) {
    throw "No archived prior runtime bundle exists for recovered manifest SHA $($state.priorGitSha)."
  }

  $recoveredDeployEnv = Join-Path $OfficeRoot '.env.office.deploy.recovered'
  try {
    Write-DeployEnv $recoveredDeployEnv $priorBundle.Manifest
    Copy-Item -LiteralPath $priorCompose -Destination $script:ComposePath -Force
    Copy-Item -LiteralPath $priorNginx -Destination (Join-Path $OfficeRoot 'nginx.conf') -Force
    Move-Item -LiteralPath $recoveredDeployEnv -Destination $script:DeployEnvPath -Force
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs config --quiet
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    Assert-SmokeTests

    $priorBundle.Raw | Set-Content -LiteralPath $script:CurrentManifestPath -Encoding UTF8
    if (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf) {
      Remove-Item -LiteralPath $script:PreviousManifestPath -Force
    }
    Archive-RecoveryState 'recovered'
    Remove-Item -LiteralPath $script:RecoveryStatePath -Force
  }
  catch {
    $recoveryError = $_
    try {
      Stop-ApplicationWriters
    }
    catch {
      Write-Warning "Could not confirm application writers are stopped after recovery completion failure: $($_.Exception.Message)"
    }
    throw $recoveryError
  }

  Write-Host "Office database/runtime recovery completed for prior manifest $($state.priorGitSha)."
  Write-Host "Verified recovery dump SHA256: $($state.dumpSha256)"
}

function Install-Deployment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetManifestPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHead,
    [switch]$AllowAncestor,
    [switch]$ApplySchema,
    [switch]$AcceptDataLoss,
    [string]$RecoveryCopyDirectory = ''
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

  $requestedOperation = if ($AllowAncestor) { 'Rollback' } else { 'Deploy' }
  Assert-OperationAllowedByRecoveryState $requestedOperation -ApplySchema:$ApplySchema
  $recoveryPolicy = Read-RecoveryOperationPolicy
  $recoveryStateAtStart = Read-RecoveryState
  $markerStatusAtStart = 'none'
  $currentManifestIdentityAtStart = 'none'
  if ($null -ne $recoveryStateAtStart) {
    $markerStatusAtStart = $recoveryStateAtStart.status
    $currentManifestIdentityAtStart = Get-CurrentManifestIdentityForRecoveryState $recoveryStateAtStart
  }
  $deploymentKind = if ($ApplySchema) { 'schema' } else { 'application-only' }
  $preBoundaryFailureTransition = Get-RecoveryDeploymentTransition `
    -Policy $recoveryPolicy `
    -MarkerStatusAtStart $markerStatusAtStart `
    -DeploymentKind $deploymentKind `
    -CurrentManifestIdentity $currentManifestIdentityAtStart `
    -DestructiveBoundaryEntered $false `
    -Outcome 'failure'
  $postBoundaryFailureTransition = Get-RecoveryDeploymentTransition `
    -Policy $recoveryPolicy `
    -MarkerStatusAtStart $markerStatusAtStart `
    -DeploymentKind $deploymentKind `
    -CurrentManifestIdentity $currentManifestIdentityAtStart `
    -DestructiveBoundaryEntered $true `
    -Outcome 'failure'
  $preBoundaryFullSuccessTransition = Get-RecoveryDeploymentTransition `
    -Policy $recoveryPolicy `
    -MarkerStatusAtStart $markerStatusAtStart `
    -DeploymentKind $deploymentKind `
    -CurrentManifestIdentity $currentManifestIdentityAtStart `
    -DestructiveBoundaryEntered $false `
    -Outcome 'full-success'
  $postBoundaryFullSuccessTransition = Get-RecoveryDeploymentTransition `
    -Policy $recoveryPolicy `
    -MarkerStatusAtStart $markerStatusAtStart `
    -DeploymentKind $deploymentKind `
    -CurrentManifestIdentity $currentManifestIdentityAtStart `
    -DestructiveBoundaryEntered $true `
    -Outcome 'full-success'

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
  $destructiveBoundaryEntered = $false
  try {
    Write-DeployEnv $candidateDeployEnv $manifest
    Copy-Item -LiteralPath $sourceCompose -Destination $script:ComposePath -Force
    Copy-Item -LiteralPath $sourceNginx -Destination (Join-Path $OfficeRoot 'nginx.conf') -Force
    Move-Item -LiteralPath $candidateDeployEnv -Destination $script:DeployEnvPath -Force
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs config --quiet
    if ($ApplySchema) {
      Write-Warning 'Stopping application writers before the approved Prisma schema push.'
      Stop-ApplicationWriters
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build postgres minio
      Wait-ForContainerHealthy 'kiditem-postgres'
      Wait-ForContainerHealthy 'kiditem-minio'
      if ($AcceptDataLoss) {
        New-DestructiveRecoveryArtifact $manifest $RecoveryCopyDirectory | Out-Null
        $destructiveBoundaryEntered = $true
      }
      $schemaCommand = 'cd /app && npx prisma db push'
      if ($AcceptDataLoss) {
        $schemaCommand = "$schemaCommand --accept-data-loss"
      }
      Invoke-Checked docker @script:ComposeArgs run --rm --no-deps api sh -lc $schemaCommand
      if ($destructiveBoundaryEntered) {
        Set-RecoveryStateStatus 'schema-push-completed'
      }
    }
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
    Wait-ForRuntime
    Assert-SmokeTests
    if ($destructiveBoundaryEntered) {
      Set-RecoveryStateStatus 'deployed'
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

    $fullSuccessTransition = if ($destructiveBoundaryEntered) {
      $postBoundaryFullSuccessTransition
    }
    else {
      $preBoundaryFullSuccessTransition
    }
    if ($fullSuccessTransition.markerAction -eq 'archive-remove') {
      Archive-RecoveryState 'superseded-by-compatible-forward-deploy'
      Remove-Item -LiteralPath $script:RecoveryStatePath -Force
    }
    elseif ($fullSuccessTransition.markerAction -ne 'preserve') {
      throw "Unsupported successful deployment marker action: $($fullSuccessTransition.markerAction)"
    }

    Write-Host "Office deployment complete: $($manifest.gitSha) ($($manifest.appVersion))"
    Write-Host "API image: $($manifest.apiImage)"
    Write-Host "Web image: $($manifest.webImage)"
  }
  catch {
    $deploymentError = $_
    $failureTransition = if ($destructiveBoundaryEntered) {
      $postBoundaryFailureTransition
    }
    else {
      $preBoundaryFailureTransition
    }
    if ($failureTransition.runtimeAction -eq 'stop-writers') {
      try {
        Stop-ApplicationWriters
      }
      catch {
        Write-Warning "Could not confirm application writers are stopped after destructive schema deployment failure: $($_.Exception.Message)"
      }
    }
    elseif ($failureTransition.runtimeAction -eq 'restore-transaction') {
      try {
        Restore-Transaction $backupRoot
      }
      catch {
        Write-Warning "Automatic runtime restore also failed: $($_.Exception.Message)"
      }
    }
    else {
      try {
        Stop-ApplicationWriters
      }
      catch {
        Write-Warning "Unsupported recovery runtime action also failed to stop writers: $($_.Exception.Message)"
      }
      Write-Warning "Unsupported recovery runtime action was rejected: $($failureTransition.runtimeAction)"
    }

    if ($failureTransition.markerAction -eq 'require-recovery') {
      try {
        Set-RecoveryStateStatus 'recovery-required'
      }
      catch {
        Write-Warning "Could not update destructive schema recovery state: $($_.Exception.Message)"
      }
      Write-Warning "Destructive schema recovery is required. Application writers remain stopped; do not start prior or candidate runtime. Recovery state: $script:RecoveryStatePath"
    }
    elseif ($failureTransition.markerAction -ne 'preserve') {
      Write-Warning "Unsupported recovery marker action was rejected: $($failureTransition.markerAction)"
    }
    throw $deploymentError
  }
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
  $recoveryState = Read-RecoveryState
  if ($null -ne $recoveryState) {
    Write-Warning "Destructive schema boundary state: $($recoveryState.status); candidate=$($recoveryState.candidateGitSha); prior=$($recoveryState.priorGitSha); dumpSha256=$($recoveryState.dumpSha256)"
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
if ($ApplySchema -and $Operation -eq 'Deploy' -and -not $AcceptDataLoss -and $RecoveryCopyDirectory) {
  throw '-RecoveryCopyDirectory is valid only with -Operation Deploy -ApplySchema -AcceptDataLoss.'
}
if ($AcceptDataLoss -and -not $RecoveryCopyDirectory) {
  throw '-RecoveryCopyDirectory is required with -Operation Deploy -ApplySchema -AcceptDataLoss.'
}
if ($Operation -ne 'CompleteRecovery' -and ($RecoveryArtifactPath -or $RecoveredDatabaseDumpSha256 -or $RecoveredPriorManifestPath)) {
  throw 'Recovery identity parameters are valid only with -Operation CompleteRecovery.'
}
if ($Operation -eq 'CompleteRecovery' -and (-not $RecoveryArtifactPath -or -not $RecoveredDatabaseDumpSha256 -or -not $RecoveredPriorManifestPath)) {
  throw '-RecoveryArtifactPath, -RecoveredDatabaseDumpSha256, and -RecoveredPriorManifestPath are required with -Operation CompleteRecovery.'
}

$head = Assert-LiveCheckout
Assert-OperationAllowedByRecoveryState $Operation -ApplySchema:$ApplySchema

switch ($Operation) {
  'Status' {
    Show-OfficeStatus $head
  }
  'Deploy' {
    if (-not $ManifestPath) {
      throw '-ManifestPath is required for Deploy.'
    }
    Install-Deployment $ManifestPath $head -ApplySchema:$ApplySchema -AcceptDataLoss:$AcceptDataLoss -RecoveryCopyDirectory $RecoveryCopyDirectory
  }
  'Rollback' {
    if (-not (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf)) {
      throw "No previous deployment manifest exists at $script:PreviousManifestPath"
    }
    Install-Deployment $script:PreviousManifestPath $head -AllowAncestor
  }
  'CompleteRecovery' {
    Complete-DatabaseRecovery $RecoveryArtifactPath $RecoveredDatabaseDumpSha256 $RecoveredPriorManifestPath
  }
}
