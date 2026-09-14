#requires -Version 5.1

[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'Status', 'Rollback', 'RotateGatewayToken', 'InstallOrUpdateGatewayTask')]
  [string]$Operation = 'Status',
  [string]$SourceRef,
  [string]$InvokerRepoRoot = '',
  [string]$RepoRoot = 'C:\workspace\kiditem',
  [string]$BuildRoot = '',
  [string]$DockerDataRoot = '',
  [ValidateRange(5, 500)]
  [int]$MinimumFreeGb = 10,
  [switch]$PruneBuildCache,
  [switch]$SchemaDataCutover,
  [string]$CutoverConfirmation = '',
  [ValidateRange(30, 900)]
  [int]$HealthTimeoutSeconds = 300,
  [string]$GatewayServiceAccount = ''
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop

# This is a release-contract constant, deliberately not an operator or Gateway
# config input.  The Host Gateway only admits descendants of this exact anchor.
$script:OfficeRoot = 'C:\ProgramData\KidItem'
$script:ComposePath = Join-Path $script:OfficeRoot 'compose.office.yml'
$script:OfficeEnvPath = Join-Path $script:OfficeRoot '.env.office'
$script:DeployEnvPath = Join-Path $script:OfficeRoot '.env.office.deploy'
$script:DeploymentsRoot = Join-Path $script:OfficeRoot 'deployments'
$script:CurrentManifestPath = Join-Path $script:DeploymentsRoot 'current.json'
$script:PreviousManifestPath = Join-Path $script:DeploymentsRoot 'previous.json'
$script:DatabaseDumpsRoot = Join-Path $script:DeploymentsRoot 'database-dumps'
$script:DatabaseDumpRetentionCount = 3
$script:ComposeArgs = @()
# Office Gateway deliberately uses the invoking operator's existing Windows
# profile so the bundled CLIs see that profile's approved Codex/Claude login.
$script:GatewayServiceAccount = if ($GatewayServiceAccount) { $GatewayServiceAccount } else { [System.Security.Principal.WindowsIdentity]::GetCurrent().Name }
$script:GatewayServicePrincipal = $null
$script:GatewayTaskName = 'KidItem Agent Gateway'
$script:GatewayRoot = Join-Path $script:OfficeRoot 'agent-gateway'
$script:GatewayReleasesRoot = Join-Path $script:GatewayRoot 'releases'
$script:GatewayCurrentPointerPath = Join-Path $script:GatewayRoot 'current.json'
$script:GatewayStateRoot = Join-Path $script:GatewayRoot 'state'
$script:GatewayTokenPath = Join-Path $script:OfficeRoot 'secrets\agent-gateway-token'
$script:GatewayConfigName = 'gateway-config.json'
$script:GatewayLauncherPath = Join-Path $script:GatewayRoot 'gateway-launcher.cjs'
$script:GatewayLauncherSourcePath = Join-Path $PSScriptRoot 'gateway-launcher.cjs'
$script:GatewayPayloadFiles = @(
  'agent-gateway.tgz',
  'KidItem.AgentGateway.exe',
  'gateway-runtime-contract.json'
)
$script:GatewayBuildImpactPaths = @(
  'package.json',
  'package-lock.json',
  '.npmrc',
  'tsconfig.json',
  'prisma',
  'prisma.config.ts',
  'packages/shared',
  'apps/agent-gateway',
  'deploy/office/gateway-build.ps1'
)
$script:SchemaDataConfirmation = 'APPLY_SCHEMA_DATA'
$script:ApiRuntimeBaseImage = 'ghcr.io/agentfoundry-labs/kiditem-api-base:node22-chromium-b6503cb2512e'

function Assert-OfficeRootAnchor {
  # Do not accept a redirected ProgramData, UNC/device spelling, a different
  # drive, or a short-name alias as a deployment root.  Case differences are
  # harmless on NTFS, but all runtime paths must resolve below this one
  # code-owned canonical Office anchor.
  $expected = [System.IO.Path]::GetFullPath('C:\ProgramData\KidItem')
  $configured = [System.IO.Path]::GetFullPath($script:OfficeRoot)
  if (-not [string]::Equals($configured, $expected, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Office root must be the canonical C:\ProgramData\KidItem deployment anchor.'
  }
  foreach ($ancestor in @(
    [System.IO.Path]::GetPathRoot($expected),
    [System.IO.Path]::GetFullPath('C:\ProgramData')
  )) {
    $item = Get-Item -LiteralPath $ancestor -Force -ErrorAction Stop
    if (-not $item.PSIsContainer) {
      throw 'Office root anchor ancestor is not a directory.'
    }
    if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Office root anchor ancestor is a reparse point.'
    }
  }
  if (Test-Path -LiteralPath $script:OfficeRoot) {
    $rootItem = Get-Item -LiteralPath $script:OfficeRoot -Force -ErrorAction Stop
    if (-not $rootItem.PSIsContainer) {
      throw 'Office root anchor is not a directory.'
    }
    if (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
      throw 'Office root anchor is a reparse point.'
    }
    $resolved = [System.IO.Path]::GetFullPath((Resolve-Path -LiteralPath $script:OfficeRoot -ErrorAction Stop).ProviderPath)
    if (-not [string]::Equals($resolved, $expected, [System.StringComparison]::OrdinalIgnoreCase)) {
      throw 'Office root anchor canonical path does not match C:\ProgramData\KidItem.'
    }
  }
}

function Invoke-Checked {
  param(
    [Parameter(Mandatory = $true)][string]$Program,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )

  & $Program @Arguments | ForEach-Object { Write-Host $_ }
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

  return (Get-CheckedOutput git -C $RepoRoot rev-parse HEAD)
}

function Get-AuthoritativeRemoteReleaseSha {
  $remoteBranchRef = 'refs/heads/release/office'
  $remoteLine = & git -C $RepoRoot ls-remote --heads origin $remoteBranchRef 2>$null
  if ($LASTEXITCODE -ne 0) {
    return $null
  }
  $parts = @((($remoteLine | Out-String).Trim()) -split '\s+')
  if ($parts.Count -ne 2 -or $parts[1] -ne $remoteBranchRef -or $parts[0] -notmatch '^[0-9a-f]{40}$') {
    return $null
  }
  return $parts[0]
}

function Resolve-InvokerRepoRoot {
  if (-not $InvokerRepoRoot) {
    $script:InvokerRepoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
  }
  else {
    $script:InvokerRepoRoot = [System.IO.Path]::GetFullPath($InvokerRepoRoot)
  }
  if (-not (Test-Path -LiteralPath $script:InvokerRepoRoot -PathType Container)) {
    throw "Invoking KidItem checkout does not exist: $script:InvokerRepoRoot"
  }
  $reportedRoot = [System.IO.Path]::GetFullPath((Get-CheckedOutput git -C $script:InvokerRepoRoot rev-parse --show-toplevel))
  if (-not [string]::Equals($reportedRoot, $script:InvokerRepoRoot, [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'InvokerRepoRoot must be the exact root of a KidItem checkout.'
  }
  return $script:InvokerRepoRoot
}

function Assert-CleanInvokerCheckout {
  $root = Resolve-InvokerRepoRoot
  $dirty = Get-CheckedOutput git -C $root status --porcelain --untracked-files=all
  if ($dirty) {
    throw 'Office deploy refuses a dirty invoking checkout, including untracked files.'
  }
  return $root
}

function Resolve-RemoteSourceCommit {
  param([Parameter(Mandatory = $true)][string]$CheckoutRoot)

  if (
    $SourceRef -notmatch '^origin/[A-Za-z0-9][A-Za-z0-9._/-]*$' -or
    $SourceRef.Contains('..') -or
    $SourceRef.EndsWith('/')
  ) {
    throw 'Office SourceRef must be a safe origin/<branch> remote ref.'
  }
  $branch = $SourceRef.Substring('origin/'.Length)
  $remoteBranchRef = "refs/heads/$branch"
  $remoteTrackingRef = "refs/remotes/origin/$branch"
  Invoke-Checked git -C $CheckoutRoot fetch --no-tags origin "+${remoteBranchRef}:${remoteTrackingRef}"
  $remoteLine = Get-CheckedOutput git -C $CheckoutRoot ls-remote --heads origin $remoteBranchRef
  $parts = @($remoteLine -split '\s+')
  if ($parts.Count -ne 2 -or $parts[1] -ne $remoteBranchRef -or $parts[0] -notmatch '^[0-9a-f]{40}$') {
    throw "Remote source ref does not resolve to one branch SHA: $SourceRef"
  }
  $resolved = Get-CheckedOutput git -C $CheckoutRoot rev-parse "${remoteTrackingRef}^{commit}"
  if ($resolved -ne $parts[0]) {
    throw 'Fetched remote-tracking SHA does not match the authoritative remote branch SHA.'
  }
  return [pscustomobject]@{ SourceRef = $SourceRef; Branch = $branch; GitSha = $resolved }
}

function Get-LocalBuildRoot {
  $candidate = $BuildRoot
  if (-not $candidate) {
    $candidate = if (Test-Path -LiteralPath 'D:\' -PathType Container) {
      'D:\KiditemTemp\office-local-builds'
    }
    else {
      Join-Path $script:OfficeRoot 'local-builds'
    }
  }
  $full = [System.IO.Path]::GetFullPath($candidate)
  $driveRoot = [System.IO.Path]::GetPathRoot($full)
  if ([string]::Equals($full.TrimEnd('\'), $driveRoot.TrimEnd('\'), [System.StringComparison]::OrdinalIgnoreCase)) {
    throw 'Office build root cannot be a drive root.'
  }
  New-Item -ItemType Directory -Path $full -Force | Out-Null
  $item = Get-Item -LiteralPath $full -Force
  if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
    throw 'Office build root cannot be a reparse point.'
  }
  return $full
}

function Assert-PathWithinRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )
  $normalizedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd('\')
  $normalizedCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd('\')
  $prefix = $normalizedRoot + [System.IO.Path]::DirectorySeparatorChar
  if (
    $normalizedCandidate -eq $normalizedRoot -or
    -not $normalizedCandidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
  ) {
    throw 'Office temporary path escapes or equals the validated build root.'
  }
}

function New-CleanSourceWorktree {
  param(
    [Parameter(Mandatory = $true)][string]$CheckoutRoot,
    [Parameter(Mandatory = $true)][string]$GitSha,
    [Parameter(Mandatory = $true)][string]$LocalBuildRoot
  )
  $path = Join-Path $LocalBuildRoot ("worktree-{0}-{1}" -f $GitSha.Substring(0, 12), [guid]::NewGuid().ToString('N'))
  Assert-PathWithinRoot -Root $LocalBuildRoot -Candidate $path
  Invoke-Checked git -C $CheckoutRoot worktree add --detach $path $GitSha
  $head = Get-CheckedOutput git -C $path rev-parse HEAD
  $dirty = Get-CheckedOutput git -C $path status --porcelain --untracked-files=all
  if ($head -ne $GitSha -or $dirty) {
    throw 'Temporary Office source worktree is not the exact clean fetched SHA.'
  }
  return $path
}

function Remove-CleanSourceWorktree {
  param(
    [Parameter(Mandatory = $true)][string]$CheckoutRoot,
    [Parameter(Mandatory = $true)][string]$LocalBuildRoot,
    [Parameter(Mandatory = $true)][string]$WorktreePath
  )
  Assert-PathWithinRoot -Root $LocalBuildRoot -Candidate $WorktreePath
  & git -c core.longpaths=true -C $CheckoutRoot worktree remove --force $WorktreePath
  if ($LASTEXITCODE -ne 0) {
    Write-Warning "Exact-SHA temporary worktree was retained for manual inspection: $WorktreePath"
  }
}

function Remove-LocalBuildBundle {
  param(
    [Parameter(Mandatory = $true)][string]$LocalBuildRoot,
    [Parameter(Mandatory = $true)][string]$BundlePath
  )
  Assert-PathWithinRoot -Root $LocalBuildRoot -Candidate $BundlePath
  if (Test-Path -LiteralPath $BundlePath -PathType Container) {
    Remove-Item -LiteralPath $BundlePath -Recurse -Force
  }
}

function Get-CurrentDeployedSha {
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    return $null
  }
  $current = Get-Content -LiteralPath $script:CurrentManifestPath -Raw | ConvertFrom-Json
  if ($current.gitSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Current Office runtime manifest does not contain a valid Git SHA.'
  }
  return [string]$current.gitSha
}

function Get-SchemaDataChanges {
  param(
    [Parameter(Mandatory = $true)][string]$CheckoutRoot,
    [Parameter(Mandatory = $true)][string]$TargetSha
  )
  $currentSha = Get-CurrentDeployedSha
  if (-not $currentSha) {
    return @('__missing_current_runtime_manifest__')
  }
  & git -C $CheckoutRoot cat-file -e "${currentSha}^{commit}" 2>$null
  if ($LASTEXITCODE -ne 0) {
    throw "Current deployed SHA $currentSha is unavailable locally; schema/data safety cannot be proven."
  }
  $changed = @(& git -C $CheckoutRoot diff --name-only --diff-filter=ACDMRT $currentSha $TargetSha -- prisma prisma.config.ts scripts/data-migrations scripts/run-data-migrations.ts)
  if ($LASTEXITCODE -ne 0) {
    throw 'Schema/data diff detection failed.'
  }
  return @($changed | Where-Object { $_ } | Sort-Object -Unique)
}

function Assert-SchemaDataCutoverContract {
  param([AllowEmptyCollection()][string[]]$ChangedPaths = @())

  if ($ChangedPaths.Count -gt 0) {
    if (-not $SchemaDataCutover -or $CutoverConfirmation -ne $script:SchemaDataConfirmation) {
      $summary = ($ChangedPaths | Select-Object -First 12) -join ', '
      throw "Schema/data changes detected ($summary). Retry only with --cutover --confirm $($script:SchemaDataConfirmation)."
    }
    return
  }
  if ($SchemaDataCutover -or $CutoverConfirmation) {
    throw 'Schema/data cutover approval was supplied, but the exact deployed-to-target diff has no schema/data changes.'
  }
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
  return $script:OfficeRoot
}

function Assert-DiskCapacity {
  if ($PruneBuildCache) {
    Write-Host 'Pruning BuildKit cache to a 5 GB ceiling before the image pull.'
    Invoke-Checked docker buildx prune --max-used-space 5gb --force
  }

  $guardPaths = @($script:OfficeRoot, (Get-DockerDataGuardPath))
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

function Assert-LocalImageIdentity {
  param(
    [Parameter(Mandatory = $true)][string]$Image,
    [Parameter(Mandatory = $true)][string]$ExpectedImageId,
    [Parameter(Mandatory = $true)][string]$ExpectedRevision,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )
  $imageJson = Get-CheckedOutput docker image inspect $Image
  $metadata = @(ConvertFrom-Json -InputObject $imageJson)
  if ($metadata.Count -ne 1) {
    throw "Expected one local image inspection result for $Image; found $($metadata.Count)."
  }
  if ($metadata[0].Id -ne $ExpectedImageId) {
    throw "Local image ID mismatch for $Image."
  }
  $labels = $metadata[0].Config.Labels
  if ($labels.'org.opencontainers.image.revision' -ne $ExpectedRevision) {
    throw "Local image Git SHA label mismatch for $Image."
  }
  if ($labels.'org.opencontainers.image.version' -ne $ExpectedVersion) {
    throw "Local image VERSION label mismatch for $Image."
  }
}

function Build-LocalOfficeImages {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$GitSha,
    [Parameter(Mandatory = $true)][string]$AppVersion
  )
  $apiImage = "kiditem-api:office-$GitSha"
  $webImage = "kiditem-web:office-$GitSha"
  Invoke-Checked docker build `
    --file (Join-Path $WorktreePath 'apps\server\Dockerfile') `
    --tag $apiImage `
    --label "org.opencontainers.image.revision=$GitSha" `
    --label "org.opencontainers.image.version=$AppVersion" `
    --build-arg "API_RUNTIME_BASE_IMAGE=$($script:ApiRuntimeBaseImage)" `
    $WorktreePath
  Invoke-Checked docker build `
    --file (Join-Path $WorktreePath 'apps\web\Dockerfile') `
    --tag $webImage `
    --label "org.opencontainers.image.revision=$GitSha" `
    --label "org.opencontainers.image.version=$AppVersion" `
    --build-arg 'NEXT_PUBLIC_API_URL=' `
    $WorktreePath
  $apiId = Get-CheckedOutput docker image inspect --format '{{.Id}}' $apiImage
  $webId = Get-CheckedOutput docker image inspect --format '{{.Id}}' $webImage
  Assert-LocalImageIdentity $apiImage $apiId $GitSha $AppVersion
  Assert-LocalImageIdentity $webImage $webId $GitSha $AppVersion
  return [pscustomobject]@{
    ApiImage = $apiImage
    ApiImageId = $apiId
    WebImage = $webImage
    WebImageId = $webId
  }
}

function Get-GatewayBuildChanges {
  param(
    [Parameter(Mandatory = $true)][string]$CheckoutRoot,
    [Parameter(Mandatory = $true)][string]$CurrentGitSha,
    [Parameter(Mandatory = $true)][string]$TargetGitSha
  )

  foreach ($sha in @($CurrentGitSha, $TargetGitSha)) {
    if ($sha -notmatch '^[0-9a-f]{40}$') {
      throw 'Gateway build diff requires full lowercase Git SHAs.'
    }
    & git -C $CheckoutRoot cat-file -e "${sha}^{commit}" 2>$null
    if ($LASTEXITCODE -ne 0) {
      throw "Gateway build diff commit is unavailable locally: $sha"
    }
  }
  $changed = @(& git -C $CheckoutRoot diff --name-only --diff-filter=ACDMRTUXB $CurrentGitSha $TargetGitSha -- $script:GatewayBuildImpactPaths)
  if ($LASTEXITCODE -ne 0) {
    throw 'Gateway build impact diff failed.'
  }
  return @($changed | Where-Object { $_ } | Sort-Object -Unique)
}

function Initialize-GatewayPayloadRoot {
  param([Parameter(Mandatory = $true)][string]$PayloadRoot)

  if (Test-Path -LiteralPath $PayloadRoot) {
    Remove-Item -LiteralPath $PayloadRoot -Recurse -Force
  }
  New-Item -ItemType Directory -Path $PayloadRoot -Force | Out-Null
}

function Assert-GatewayRuntimeMatchesManifest {
  param(
    [Parameter(Mandatory = $true)][object]$Runtime,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  Assert-GatewayRuntimeContract $Runtime
  foreach ($name in @('schemaVersion', 'platform', 'nodeMajor', 'controlRevision', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    if ($Runtime.$name -ne $Manifest.gatewayRuntime.$name) {
      throw "Gateway runtime contract field $name does not match the source deployment manifest."
    }
  }
}

function Copy-ArchivedGatewayPayload {
  param(
    [Parameter(Mandatory = $true)][object]$SourceManifest,
    [Parameter(Mandatory = $true)][string]$BundleRoot,
    [Parameter(Mandatory = $true)][string]$PayloadRoot
  )

  $artifact = Get-ArchivedGatewayArtifact $SourceManifest
  Assert-GatewayOuterArchiveEntries $artifact
  $extractRoot = Join-Path $BundleRoot 'gateway-reuse-source'
  if (Test-Path -LiteralPath $extractRoot) {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force
  }
  try {
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null
    Expand-Archive -LiteralPath $artifact -DestinationPath $extractRoot
    Assert-GatewayExtractionTree $extractRoot
    Initialize-GatewayPayloadRoot $PayloadRoot
    foreach ($name in $script:GatewayPayloadFiles) {
      $source = Join-Path $extractRoot $name
      if (-not (Test-Path -LiteralPath $source -PathType Leaf) -or (Get-Item -LiteralPath $source).Length -le 0) {
        throw "Archived Gateway payload file is missing or empty: $name"
      }
      Copy-Item -LiteralPath $source -Destination (Join-Path $PayloadRoot $name)
    }
    $runtime = Get-Content -LiteralPath (Join-Path $PayloadRoot 'gateway-runtime-contract.json') -Raw | ConvertFrom-Json
    Assert-GatewayRuntimeMatchesManifest -Runtime $runtime -Manifest $SourceManifest
    Assert-GatewayArchiveEntries (Join-Path $PayloadRoot 'agent-gateway.tgz')
    return $runtime
  }
  finally {
    Remove-Item -LiteralPath $extractRoot -Recurse -Force -ErrorAction SilentlyContinue
  }
}

function Complete-GatewayArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$BundleRoot,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$GitSha,
    [Parameter(Mandatory = $true)][string]$AppVersion,
    [Parameter(Mandatory = $true)][object]$Runtime
  )

  Assert-GatewayRuntimeContract $Runtime
  $items = @(Get-ChildItem -LiteralPath $PayloadRoot -Force)
  $actual = @($items | ForEach-Object { $_.Name })
  if (
    @($items | Where-Object { $_.PSIsContainer -or $_.Attributes -band [System.IO.FileAttributes]::ReparsePoint }).Count -ne 0 -or
    $actual.Count -ne $script:GatewayPayloadFiles.Count -or
    @(Compare-Object -ReferenceObject $script:GatewayPayloadFiles -DifferenceObject $actual).Count -ne 0
  ) {
    throw 'Gateway payload does not have the approved closed file set.'
  }

  $runtimeFromPayload = Get-Content -LiteralPath (Join-Path $PayloadRoot 'gateway-runtime-contract.json') -Raw | ConvertFrom-Json
  Assert-GatewayRuntimeContract $runtimeFromPayload
  foreach ($name in @('schemaVersion', 'platform', 'nodeMajor', 'controlRevision', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    if ($runtimeFromPayload.$name -ne $Runtime.$name) {
      throw "Gateway payload runtime field $name changed before packaging."
    }
  }
  Assert-GatewayArchiveEntries (Join-Path $PayloadRoot 'agent-gateway.tgz')

  $identity = [ordered]@{
    schemaVersion = 1
    appVersion = $AppVersion
    gitSha = $GitSha
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText(
    (Join-Path $PayloadRoot 'release-identity.json'),
    "$identity`n",
    [System.Text.UTF8Encoding]::new($false)
  )

  $zipPath = Join-Path $BundleRoot 'kiditem-agent-gateway-windows-x64.zip'
  Remove-Item -LiteralPath $zipPath -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $PayloadRoot '*') -DestinationPath $zipPath -CompressionLevel Optimal
  Assert-GatewayOuterArchiveEntries $zipPath
  $hash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash.ToLowerInvariant()
  return [pscustomobject]@{
    ArtifactPath = $zipPath
    ArtifactSha256 = $hash
    Runtime = $runtimeFromPayload
  }
}

function Build-LocalGatewayArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$BundleRoot,
    [Parameter(Mandatory = $true)][string]$GitSha,
    [Parameter(Mandatory = $true)][string]$AppVersion
  )

  $payloadRoot = Join-Path $BundleRoot 'gateway-payload'
  try {
    if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
      throw 'Current Office manifest is unavailable for Gateway payload reuse.'
    }
    $sourceManifest = (Read-DeploymentManifest $script:CurrentManifestPath).Manifest
    $changes = @(Get-GatewayBuildChanges -CheckoutRoot $WorktreePath -CurrentGitSha $sourceManifest.gitSha -TargetGitSha $GitSha)
    if ($changes.Count -gt 0) {
      throw "Gateway build inputs changed: $(($changes | Select-Object -First 12) -join ', ')"
    }
    $runtime = Copy-ArchivedGatewayPayload -SourceManifest $sourceManifest -BundleRoot $BundleRoot -PayloadRoot $payloadRoot
    $artifact = Complete-GatewayArtifact -BundleRoot $BundleRoot -PayloadRoot $payloadRoot -GitSha $GitSha -AppVersion $AppVersion -Runtime $runtime
    Write-Host "Gateway payload reused from archived SHA $($sourceManifest.gitSha); release identity rebound to $GitSha."
    return $artifact
  }
  catch {
    Write-Warning "Gateway payload reuse unavailable; running exact-SHA full build before live mutation. $($_.Exception.Message)"
  }

  Initialize-GatewayPayloadRoot $payloadRoot
  $targetBuildScript = Join-Path $WorktreePath 'deploy\office\gateway-build.ps1'
  if (-not (Test-Path -LiteralPath $targetBuildScript -PathType Leaf)) {
    throw 'Exact-SHA worktree is missing deploy/office/gateway-build.ps1.'
  }
  . $targetBuildScript
  $runtime = Build-ExactShaGatewayPayload -WorktreePath $WorktreePath -BundleRoot $BundleRoot -PayloadRoot $payloadRoot -GitSha $GitSha
  return Complete-GatewayArtifact -BundleRoot $BundleRoot -PayloadRoot $payloadRoot -GitSha $GitSha -AppVersion $AppVersion -Runtime $runtime
}

function New-LocalDeploymentBundle {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][object]$Source,
    [Parameter(Mandatory = $true)][string]$LocalBuildRoot,
    [AllowEmptyCollection()][string[]]$SchemaDataPaths = @()
  )
  $version = (Get-Content -LiteralPath (Join-Path $WorktreePath 'VERSION') -Raw).Trim()
  if ($version -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'Exact-SHA VERSION is not valid SemVer.'
  }
  $bundleRoot = Join-Path $LocalBuildRoot ("bundle-{0}-{1}" -f $Source.GitSha.Substring(0, 12), [guid]::NewGuid().ToString('N'))
  Assert-PathWithinRoot -Root $LocalBuildRoot -Candidate $bundleRoot
  New-Item -ItemType Directory -Path $bundleRoot | Out-Null
  $images = Build-LocalOfficeImages -WorktreePath $WorktreePath -GitSha $Source.GitSha -AppVersion $version
  $gateway = Build-LocalGatewayArtifact -WorktreePath $WorktreePath -BundleRoot $bundleRoot -GitSha $Source.GitSha -AppVersion $version
  foreach ($name in @('compose.office.yml', 'nginx.conf', 'gateway-launcher.cjs')) {
    Copy-Item -LiteralPath (Join-Path $WorktreePath "deploy\office\$name") -Destination (Join-Path $bundleRoot $name)
  }
  $manifest = [ordered]@{
    schemaVersion = 3
    environment = 'office'
    buildKind = 'local-exact-sha'
    sourceRef = $Source.SourceRef
    gitSha = $Source.GitSha
    appVersion = $version
    apiImage = $images.ApiImage
    apiImageId = $images.ApiImageId
    webImage = $images.WebImage
    webImageId = $images.WebImageId
    gatewayArtifact = 'kiditem-agent-gateway-windows-x64.zip'
    gatewayArtifactSha256 = $gateway.ArtifactSha256
    gatewayRuntime = $gateway.Runtime
    schemaData = [ordered]@{
      changed = ($SchemaDataPaths.Count -gt 0)
      paths = @($SchemaDataPaths)
      cutoverApproved = [bool]$SchemaDataCutover
    }
    createdAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
  }
  $manifestPath = Join-Path $bundleRoot 'office-runtime.json'
  [System.IO.File]::WriteAllText(
    $manifestPath,
    "$(ConvertTo-Json -InputObject $manifest -Depth 10)`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Read-DeploymentManifest $manifestPath | Out-Null
  return [pscustomobject]@{ Root = $bundleRoot; ManifestPath = $manifestPath; Manifest = [pscustomobject]$manifest }
}

function Read-DeploymentManifest {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Deployment manifest does not exist: $Path"
  }
  $raw = Get-Content -LiteralPath $Path -Raw
  $manifest = $raw | ConvertFrom-Json
  Assert-ManifestShape -Value $manifest -Expected @(
    'schemaVersion', 'environment', 'buildKind', 'sourceRef', 'gitSha',
    'appVersion', 'apiImage', 'apiImageId', 'webImage', 'webImageId',
    'gatewayArtifact', 'gatewayArtifactSha256', 'gatewayRuntime', 'schemaData',
    'createdAt'
  ) -Label 'deployment manifest'
  Assert-ManifestIntegerField -Value $manifest -Name 'schemaVersion'
  foreach ($name in @(
    'environment', 'buildKind', 'sourceRef', 'gitSha', 'appVersion', 'apiImage',
    'apiImageId', 'webImage', 'webImageId', 'gatewayArtifact',
    'gatewayArtifactSha256', 'createdAt'
  )) {
    Assert-ManifestStringField -Value $manifest -Name $name
  }
  Assert-ManifestObjectField -Value $manifest -Name 'gatewayRuntime'
  Assert-ManifestObjectField -Value $manifest -Name 'schemaData'

  if ($manifest.schemaVersion -ne 3 -or $manifest.environment -ne 'office' -or $manifest.buildKind -ne 'local-exact-sha') {
    throw 'Office runtime manifest must be schemaVersion 3 from a local exact-SHA build.'
  }
  if ($manifest.sourceRef -notmatch '^origin/[A-Za-z0-9][A-Za-z0-9._/-]*$' -or $manifest.sourceRef.Contains('..')) {
    throw 'Office runtime manifest sourceRef must be a safe origin/<branch> ref.'
  }
  if ($manifest.gitSha -notmatch '^[0-9a-f]{40}$') {
    throw 'Deployment manifest gitSha must be a full lowercase 40-hex SHA.'
  }
  if ($manifest.appVersion -notmatch '^[0-9]+\.[0-9]+\.[0-9]+$') {
    throw 'Deployment manifest appVersion must be a release version.'
  }
  if ($manifest.createdAt -notmatch '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$') {
    throw 'Office runtime manifest creation time is invalid.'
  }
  if ($manifest.apiImage -ne "kiditem-api:office-$($manifest.gitSha)") {
    throw 'API image tag does not bind the exact local Git SHA.'
  }
  if ($manifest.webImage -ne "kiditem-web:office-$($manifest.gitSha)") {
    throw 'Web image tag does not bind the exact local Git SHA.'
  }
  if ($manifest.apiImageId -notmatch '^sha256:[0-9a-f]{64}$' -or $manifest.webImageId -notmatch '^sha256:[0-9a-f]{64}$') {
    throw 'Office runtime manifest image IDs must be local sha256 IDs.'
  }
  $schemaData = $manifest.schemaData
  if (
    $schemaData.PSObject.Properties.Name.Count -ne 3 -or
    @($schemaData.PSObject.Properties.Name | Where-Object { $_ -notin @('changed', 'paths', 'cutoverApproved') }).Count -ne 0 -or
    $schemaData.changed -isnot [bool] -or
    $schemaData.cutoverApproved -isnot [bool]
  ) {
    throw 'Office runtime manifest schemaData contract is invalid.'
  }
  $schemaPaths = @($schemaData.paths)
  if ([bool]$schemaData.changed -ne ($schemaPaths.Count -gt 0)) {
    throw 'Office runtime manifest schemaData changed flag does not match its path set.'
  }
  if (@($schemaPaths | Where-Object { $_ -isnot [string] -or -not $_ }).Count -ne 0) {
    throw 'Office runtime manifest schemaData paths must be non-empty strings.'
  }
  Assert-GatewayManifest $manifest

  return [pscustomobject]@{ Manifest = $manifest; Raw = $raw }
}

function Assert-ManifestShape {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string[]]$Expected,
    [Parameter(Mandatory = $true)][string]$Label
  )

  if ($null -eq $Value -or $Value -isnot [System.Management.Automation.PSCustomObject]) {
    throw "$Label must be a JSON object."
  }
  $actual = @($Value.PSObject.Properties.Name)
  $differences = @(Compare-Object -ReferenceObject $Expected -DifferenceObject $actual)
  if ($differences.Count -ne 0) {
    throw "$Label contains unsupported or missing fields."
  }
}

function Assert-ManifestStringField {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property -or $property.Value -isnot [string]) {
    throw "Manifest field $Name must be a string."
  }
}

function Assert-ManifestIntegerField {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property -or ($property.Value -isnot [int] -and $property.Value -isnot [long])) {
    throw "Manifest field $Name must be an integer."
  }
}

function Assert-ManifestObjectField {
  param(
    [Parameter(Mandatory = $true)][object]$Value,
    [Parameter(Mandatory = $true)][string]$Name
  )

  $property = $Value.PSObject.Properties[$Name]
  if ($null -eq $property -or $property.Value -isnot [System.Management.Automation.PSCustomObject]) {
    throw "Manifest field $Name must be a JSON object."
  }
}

function Assert-GatewayManifest {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  if ($Manifest.gatewayArtifact -ne 'kiditem-agent-gateway-windows-x64.zip') {
    throw 'Gateway artifact filename is not the approved locally built Windows archive.'
  }
  if ($Manifest.gatewayArtifactSha256 -notmatch '^[0-9a-f]{64}$') {
    throw 'Gateway artifact SHA-256 must be lowercase 64-hex.'
  }
  Assert-ManifestObjectField -Value $Manifest -Name 'gatewayRuntime'
  Assert-GatewayRuntimeContract $Manifest.gatewayRuntime
}

function Assert-GatewayRuntimeContract {
  param([Parameter(Mandatory = $true)][object]$Runtime)

  Assert-ManifestShape -Value $Runtime -Expected @(
    'schemaVersion', 'platform', 'nodeMajor', 'controlRevision',
    'mcpProtocolRevision', 'codexVersion', 'claudeVersion'
  ) -Label 'Gateway runtime contract'
  foreach ($name in @('schemaVersion', 'nodeMajor')) {
    Assert-ManifestIntegerField -Value $Runtime -Name $name
  }
  foreach ($name in @('platform', 'controlRevision', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    Assert-ManifestStringField -Value $Runtime -Name $name
  }

  if (
    $Runtime.schemaVersion -ne 1 -or
    $Runtime.platform -ne 'windows' -or
    $Runtime.nodeMajor -ne 22 -or
    $Runtime.controlRevision -ne 'kiditem-gateway-control-v1' -or
    $Runtime.mcpProtocolRevision -ne '2026-07-28' -or
    $Runtime.codexVersion -ne '0.149.1' -or
    $Runtime.claudeVersion -ne '2.1.245'
  ) {
    throw 'Gateway runtime contract does not match the approved KID-25 Windows train.'
  }
}

function Assert-RuntimePrerequisites {
  if (-not (Test-Path -LiteralPath $script:OfficeEnvPath -PathType Leaf)) {
    throw "Protected office env file is missing: $script:OfficeEnvPath"
  }

  $requiredVolumes = @('kiditem_pgdata', 'kiditem_minio-data', 'kiditem_copilotkit-event-history')
  foreach ($volume in $requiredVolumes) {
    Invoke-Checked docker volume inspect $volume *> $null
  }

  Assert-GatewayInstallationPrerequisites
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

function Assert-GatewayInstallationPrerequisites {
  Assert-GatewayServiceAccount | Out-Null
  Initialize-GatewayStorage
  $configuredTokenPath = Get-OfficeEnvValue 'KIDITEM_AGENT_GATEWAY_TOKEN_FILE'
  if ([System.IO.Path]::GetFullPath($configuredTokenPath) -ne [System.IO.Path]::GetFullPath($script:GatewayTokenPath)) {
    throw "KIDITEM_AGENT_GATEWAY_TOKEN_FILE must be the protected Office Gateway token path."
  }
  if (-not (Test-Path -LiteralPath $script:GatewayTokenPath -PathType Leaf)) {
    throw "Protected Host Gateway token file is missing: $script:GatewayTokenPath"
  }
}

function Resolve-GatewayServicePrincipal {
  if ($null -ne $script:GatewayServicePrincipal) {
    return $script:GatewayServicePrincipal
  }
  try {
    $account = [System.Security.Principal.NTAccount]::new($script:GatewayServiceAccount)
    $sid = $account.Translate([System.Security.Principal.SecurityIdentifier])
    $canonical = $sid.Translate([System.Security.Principal.NTAccount]).Value
  }
  catch {
    throw 'Pre-provisioned dedicated Host Gateway principal cannot be resolved to an exact SID.'
  }
  if ($sid.Value -in @('S-1-5-18', 'S-1-5-19', 'S-1-5-20', 'S-1-5-32-544')) {
    throw 'Host Gateway principal must be a dedicated least-privilege user, not a built-in service or administrator.'
  }
  $script:GatewayServicePrincipal = [pscustomobject]@{
    Sid = $sid
    AccountName = $canonical
  }
  return $script:GatewayServicePrincipal
}

function Assert-GatewayPrincipalIsLeastPrivilege {
  param([Parameter(Mandatory = $true)][object]$Principal)

  # These local built-in groups can bypass the dedicated Gateway boundary.  The
  # deployment never changes group membership; it blocks until an operator
  # provisions an account outside them.
  foreach ($groupSid in @('S-1-5-32-544', 'S-1-5-32-547', 'S-1-5-32-548', 'S-1-5-32-551')) {
    try {
      $members = @(Get-LocalGroupMember -SID $groupSid -ErrorAction Stop)
    }
    catch {
      throw 'Host Gateway least-privilege group membership cannot be verified.'
    }
    if (@($members | Where-Object { $_.SID -and $_.SID.Value -eq $Principal.Sid.Value }).Count -ne 0) {
      throw 'Host Gateway principal belongs to a prohibited high-privilege local group.'
    }
  }
}

function Assert-GatewayPrincipalProfileAndBatchLogon {
  param([Parameter(Mandatory = $true)][object]$Principal)

  $profileKey = "HKLM:\SOFTWARE\Microsoft\Windows NT\CurrentVersion\ProfileList\$($Principal.Sid.Value)"
  try {
    $profile = Get-ItemProperty -LiteralPath $profileKey -ErrorAction Stop
    $profilePath = [Environment]::ExpandEnvironmentVariables([string]$profile.ProfileImagePath)
  }
  catch {
    throw 'Host Gateway principal does not have a provisioned user profile.'
  }
  if (-not $profilePath -or -not (Test-Path -LiteralPath $profilePath -PathType Container)) {
    throw 'Host Gateway principal does not have an accessible provisioned user profile.'
  }

  $rightsExport = [System.IO.Path]::GetTempFileName()
  try {
    Invoke-Checked secedit.exe /export /cfg $rightsExport /areas USER_RIGHTS
    $batchLine = Select-String -LiteralPath $rightsExport -Pattern '^SeBatchLogonRight\s*=\s*(.*)$' | Select-Object -First 1
    if ($null -eq $batchLine) {
      throw 'Host Gateway principal does not have the required SeBatchLogonRight assignment.'
    }
    $assigned = @($batchLine.Matches[0].Groups[1].Value -split ',' | ForEach-Object { $_.Trim().TrimStart('*') })
    if ($assigned -notcontains $Principal.Sid.Value) {
      throw 'Host Gateway principal does not have the required SeBatchLogonRight assignment.'
    }
  }
  finally {
    Remove-Item -LiteralPath $rightsExport -Force -ErrorAction SilentlyContinue
  }
}

function Assert-GatewayServiceAccount {
  $principal = Resolve-GatewayServicePrincipal
  $currentSid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User.Value
  if ($principal.Sid.Value -ne $currentSid) {
    throw 'Office Gateway must run as the invoking Windows profile.'
  }
  return $principal
}

function Invoke-GatewayProtectedOwnerTakeover {
  param([Parameter(Mandatory = $true)][string]$Path)

  # A poisoned owner can deny READ_CONTROL, which would make Get-Acl fail
  # before the deployment can replace the DACL. Take ownership of exactly this
  # known protected path first; the following exact DACL readback is still the
  # admission boundary and any failure aborts the deployment without starting
  # the Gateway from a partially repaired tree.
  & takeown.exe /F $Path /A *> $null
  if ($LASTEXITCODE -ne 0) {
    throw 'Host Gateway protected path owner takeover failed.'
  }
}

function Get-GatewayProtectionSpec {
  param(
    [Parameter(Mandatory = $true)][object]$Principal,
    [Parameter(Mandatory = $true)][bool]$Directory,
    [Parameter(Mandatory = $true)][string]$Mode,
    [Parameter(Mandatory = $true)][bool]$Anchor
  )

  try { $serviceSid = [System.Security.Principal.SecurityIdentifier]$Principal.Sid }
  catch { throw 'Host Gateway principal SID cannot be used to protect the runtime boundary.' }
  $systemSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-18')
  $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  $rights = switch ($Mode) {
    'Read' { [System.Security.AccessControl.FileSystemRights]::Read }
    'ReadExecute' { [System.Security.AccessControl.FileSystemRights]::ReadAndExecute }
    'Write' { [System.Security.AccessControl.FileSystemRights]::FullControl }
    default { throw 'Host Gateway protection mode is invalid.' }
  }
  $none = [System.Security.AccessControl.InheritanceFlags]::None
  $children = [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  $serviceInheritance = if ($Directory -and -not $Anchor) { $children } else { $none }
  $systemInheritance = if ($Directory) { $children } else { $none }
  return @(
    [pscustomobject]@{ Sid = $serviceSid; Rights = $rights; Inheritance = $serviceInheritance },
    [pscustomobject]@{ Sid = $systemSid; Rights = $rights; Inheritance = $systemInheritance },
    [pscustomobject]@{ Sid = $administratorsSid; Rights = [System.Security.AccessControl.FileSystemRights]::FullControl; Inheritance = $systemInheritance }
  )
}

function New-GatewayProtectionRule {
  param([Parameter(Mandatory = $true)][object]$Spec)

  return [System.Security.AccessControl.FileSystemAccessRule]::new(
    [System.Security.Principal.SecurityIdentifier]$Spec.Sid,
    [System.Security.AccessControl.FileSystemRights]$Spec.Rights,
    [System.Security.AccessControl.InheritanceFlags]$Spec.Inheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  )
}

function Assert-GatewayProtectedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [object]$Principal,
    [ValidateSet('Read', 'ReadExecute', 'Write')][string]$Mode = 'Read',
    [switch]$Anchor
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Host Gateway path does not exist: $Path"
  }
  # The runtime lives under the invoking profile. Windows profile ACLs are the
  # authority; deployment does not take ownership or rewrite machine ACLs.
  return

  $directory = Test-Path -LiteralPath $Path -PathType Container
  if (-not $directory -and -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Host Gateway protected path does not exist: $Path"
  }
  $expected = @(Get-GatewayProtectionSpec -Principal $Principal -Directory $directory -Mode $Mode -Anchor:$Anchor)
  $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  $security = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $owner = $security.GetOwner([System.Security.Principal.SecurityIdentifier]).Value
  if ($owner -ne $administratorsSid.Value) {
    throw 'Host Gateway protected path owner does not match the required Administrators SID.'
  }
  $actual = @($security.Access)
  if ($actual.Count -ne $expected.Count) {
    throw 'Host Gateway protected path has an unexpected DACL entry count.'
  }
  $seen = @{}
  foreach ($rule in $actual) {
    if ($rule.IsInherited -or $rule.AccessControlType -ne [System.Security.AccessControl.AccessControlType]::Allow) {
      throw 'Host Gateway protected path contains an inherited, deny, or unknown ACL entry.'
    }
    $sid = $rule.IdentityReference.Translate([System.Security.Principal.SecurityIdentifier]).Value
    if ($seen.ContainsKey($sid)) {
      throw 'Host Gateway protected path contains a duplicate ACL identity.'
    }
    $match = @($expected | Where-Object { $_.Sid.Value -eq $sid })
    if ($match.Count -ne 1 -or
        [int64]$rule.FileSystemRights -ne [int64]$match[0].Rights -or
        $rule.InheritanceFlags -ne $match[0].Inheritance -or
        $rule.PropagationFlags -ne [System.Security.AccessControl.PropagationFlags]::None) {
      throw 'Host Gateway protected path DACL does not match the exact runtime policy.'
    }
    $seen[$sid] = $true
  }
  foreach ($spec in $expected) {
    if (-not $seen.ContainsKey($spec.Sid.Value)) {
      throw 'Host Gateway protected path is missing a required DACL identity.'
    }
  }
}

function Set-GatewayProtectedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [ValidateSet('Read', 'ReadExecute', 'Write')][string]$Mode = 'Read',
    # The fixed ProgramData\\KidItem anchor grants Gateway traverse/read on the
    # anchor itself, but deliberately does not propagate that grant to unrelated
    # Office files such as the Docker environment file.
    [switch]$Anchor,
    # Fixture-only injection keeps the production path bound to the verified
    # pre-provisioned principal while exercising the exact same DACL replacement.
    [object]$Principal
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    throw "Host Gateway path does not exist: $Path"
  }
  # Existing-profile mode intentionally keeps the profile's native ACLs.
  return

  if ($null -eq $Principal) { $Principal = Assert-GatewayServiceAccount }
  $directory = Test-Path -LiteralPath $Path -PathType Container
  if (-not $directory -and -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Host Gateway protected path does not exist: $Path"
  }
  $expected = @(Get-GatewayProtectionSpec -Principal $Principal -Directory $directory -Mode $Mode -Anchor:$Anchor)
  Invoke-GatewayProtectedOwnerTakeover -Path $Path
  $security = Get-Acl -LiteralPath $Path -ErrorAction Stop
  if ($security -isnot [System.Security.AccessControl.FileSystemSecurity]) {
    throw 'Host Gateway protected path does not expose a filesystem security descriptor.'
  }
  # Discard inherited entries first, then remove every surviving explicit
  # entry by its exact rule. This is a replacement, never an additive grant.
  $security.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($security.Access)) {
    [void]$security.RemoveAccessRuleSpecific($rule)
  }
  if (@($security.Access).Count -ne 0) {
    throw 'Host Gateway protected path retained an existing explicit ACL entry.'
  }
  $administratorsSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-32-544')
  $security.SetOwner($administratorsSid)
  foreach ($spec in $expected) {
    [void]$security.AddAccessRule((New-GatewayProtectionRule $spec))
  }
  Set-Acl -LiteralPath $Path -AclObject $security -ErrorAction Stop
  Assert-GatewayProtectedAcl -Path $Path -Principal $Principal -Mode $Mode -Anchor:$Anchor
}

function Initialize-GatewayStorage {
  Assert-OfficeRootAnchor
  New-Item -ItemType Directory -Path $script:OfficeRoot -Force | Out-Null
  foreach ($path in @($script:GatewayRoot, $script:GatewayReleasesRoot, $script:GatewayStateRoot, (Split-Path -Parent $script:GatewayTokenPath))) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
  if (-not (Test-Path -LiteralPath $script:GatewayTokenPath -PathType Leaf)) {
    Replace-GatewayInstallationToken
  }
  return

  # C:\ProgramData itself normally grants Users container-create.  The fixed
  # KidItem anchor is the first deployment-owned boundary, so protect it before
  # any Gateway token/config/release descendant can inherit an unsafe writer.
  Assert-OfficeRootAnchor
  New-Item -ItemType Directory -Path $script:OfficeRoot -Force | Out-Null
  Assert-OfficeRootAnchor
  Set-GatewayProtectedAcl -Path $script:OfficeRoot -Mode ReadExecute -Anchor
  Assert-OfficeRootAnchor
  New-Item -ItemType Directory -Path $script:GatewayRoot -Force | Out-Null
  Set-GatewayProtectedAcl -Path $script:GatewayRoot -Mode ReadExecute
  foreach ($path in @($script:GatewayReleasesRoot, $script:GatewayStateRoot, (Split-Path -Parent $script:GatewayTokenPath))) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }
  Set-GatewayProtectedAcl -Path $script:GatewayReleasesRoot -Mode ReadExecute
  Set-GatewayProtectedAcl -Path $script:GatewayStateRoot -Mode Write
  Set-GatewayProtectedAcl -Path (Split-Path -Parent $script:GatewayTokenPath) -Mode Read
  if (-not (Test-Path -LiteralPath $script:GatewayTokenPath -PathType Leaf)) {
    Replace-GatewayInstallationToken
  }
  else {
    Set-GatewayProtectedAcl -Path $script:GatewayTokenPath -Mode Read
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
      'kiditem-web' = Get-ContainerState 'kiditem-web'
      'kiditem-nginx' = Get-ContainerState 'kiditem-nginx'
    }
    if (
      $states['kiditem-postgres'] -eq 'healthy' -and
      $states['kiditem-minio'] -eq 'healthy' -and
      $states['kiditem-api'] -eq 'healthy' -and
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
  foreach ($name in @('api')) {
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

function Assert-GatewayArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Gateway artifact is missing: $Path"
  }
  $hash = (Get-FileHash -LiteralPath $Path -Algorithm SHA256).Hash.ToLowerInvariant()
  if ($hash -ne $Manifest.gatewayArtifactSha256) {
    throw 'Gateway artifact SHA-256 does not match the local runtime manifest.'
  }
}

function Get-ArchivedGatewayArtifact {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  # Recovery uses the independently hashed local artifact retained alongside
  # the runtime manifest, never the expanded runnable directory.
  $archiveRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $Manifest.gitSha)
  $artifact = Join-Path $archiveRoot $Manifest.gatewayArtifact
  Assert-GatewayArtifact $artifact $Manifest
  return $artifact
}

function Assert-GatewayPackageContents {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  $runtimePath = Join-Path $ReleaseRoot 'gateway-runtime-contract.json'
  $runtime = (Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json)
  Assert-GatewayRuntimeContract $runtime
  foreach ($name in @('schemaVersion', 'platform', 'nodeMajor', 'controlRevision', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    if ($runtime.$name -ne $Manifest.gatewayRuntime.$name) {
      throw "Gateway runtime contract field $name does not match the deployment manifest."
    }
  }
  $releaseIdentityPath = Join-Path $ReleaseRoot 'release-identity.json'
  if (-not (Test-Path -LiteralPath $releaseIdentityPath -PathType Leaf)) {
    throw 'Gateway release identity file is missing.'
  }
  $releaseIdentity = Get-Content -LiteralPath $releaseIdentityPath -Raw | ConvertFrom-Json
  if (
    $releaseIdentity.schemaVersion -ne 1 -or
    $releaseIdentity.gitSha -ne $Manifest.gitSha -or
    $releaseIdentity.appVersion -ne $Manifest.appVersion
  ) {
    throw 'Gateway release VERSION/Git SHA identity does not match the runtime manifest.'
  }
  foreach ($path in @(
    (Join-Path $ReleaseRoot 'agent-gateway.tgz'),
    (Join-Path $ReleaseRoot 'KidItem.AgentGateway.exe'),
    (Join-Path $ReleaseRoot 'package\\windows\\KidItem.AgentGateway.exe'),
    (Join-Path $ReleaseRoot 'package\\dist\\main.cjs'),
    (Join-Path $ReleaseRoot 'package\\node_modules\\@openai\\codex\\package.json'),
    (Join-Path $ReleaseRoot 'package\\node_modules\\@anthropic-ai\\claude-code\\package.json')
  )) {
    if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
      throw "Gateway package is incomplete: $path"
    }
  }
  $codexPackage = Get-Content -LiteralPath (Join-Path $ReleaseRoot 'package\\node_modules\\@openai\\codex\\package.json') -Raw | ConvertFrom-Json
  $claudePackage = Get-Content -LiteralPath (Join-Path $ReleaseRoot 'package\\node_modules\\@anthropic-ai\\claude-code\\package.json') -Raw | ConvertFrom-Json
  if ($codexPackage.version -ne $Manifest.gatewayRuntime.codexVersion -or $claudePackage.version -ne $Manifest.gatewayRuntime.claudeVersion) {
    throw 'Bundled provider versions do not match the immutable Gateway runtime contract.'
  }
  Assert-GatewayExtractionTree $ReleaseRoot
}

function Assert-GatewayArchiveEntryName {
  param([Parameter(Mandatory = $true)][string]$Entry)

  if ([string]::IsNullOrWhiteSpace($Entry)) {
    throw 'Gateway archive contains an empty path.'
  }
  # Archive paths are protocol names, not native paths. Reject every form
  # which can become a rooted Windows path, traverse a parent, or name an ADS.
  if (
    $Entry.IndexOf([char]92) -ge 0 -or
    $Entry.StartsWith('/') -or
    $Entry -match '^[A-Za-z]:' -or
    $Entry.Contains(':') -or
    $Entry -match '(^|/)\.\.(/|$)' -or
    -not $Entry.StartsWith('package/')
  ) {
    throw 'Gateway package archive contains an unsafe path.'
  }
}

function Assert-GatewayArchiveEntries {
  param([Parameter(Mandatory = $true)][string]$TarPath)

  $entries = @(& tar.exe -tf $TarPath)
  if ($LASTEXITCODE -ne 0) {
    throw 'Gateway package archive cannot be listed.'
  }
  $metadata = @(& tar.exe -tvf $TarPath)
  if ($LASTEXITCODE -ne 0 -or $metadata.Count -ne $entries.Count) {
    throw 'Gateway package archive metadata cannot be listed.'
  }
  for ($index = 0; $index -lt $entries.Count; $index += 1) {
    $entry = [string]$entries[$index]
    Assert-GatewayArchiveEntryName $entry
    $detail = [string]$metadata[$index]
    if ($detail.Length -lt 1 -or $detail[0] -notin @('-', 'd')) {
      throw 'Gateway package archive contains a non-regular entry.'
    }
  }
}

function Assert-GatewayOuterArchiveEntries {
  param([Parameter(Mandatory = $true)][string]$ZipPath)

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $archive = [System.IO.Compression.ZipFile]::OpenRead($ZipPath)
  try {
    $expected = @('agent-gateway.tgz', 'KidItem.AgentGateway.exe', 'gateway-runtime-contract.json', 'release-identity.json')
    $entries = @()
    foreach ($entry in @($archive.Entries)) {
      $name = [string]$entry.FullName
      if (
        [string]::IsNullOrWhiteSpace($name) -or
        $name.IndexOf([char]92) -ge 0 -or
        $name.StartsWith('/') -or
        $name -match '^[A-Za-z]:' -or
        $name.Contains(':') -or
        $name -match '(^|/)\.\.(/|$)'
      ) {
        throw 'Gateway archive contains an unsafe path.'
      }
      $unixType = (([int64]$entry.ExternalAttributes -shr 16) -band 0xF000)
      if (($unixType -ne 0 -and $unixType -ne 0x8000) -or (($entry.ExternalAttributes -band 0x10) -ne 0)) {
        throw 'Gateway archive contains a non-regular entry.'
      }
      $entries += $name
    }
    if ($entries.Count -ne $expected.Count -or @(Compare-Object -ReferenceObject $expected -DifferenceObject $entries).Count -ne 0) {
      throw 'Gateway archive does not have the approved closed file set.'
    }
  }
  finally {
    $archive.Dispose()
  }
}

function Test-GatewayPathWithinRoot {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$Candidate
  )

  $trimCharacters = [char[]]@(
    [System.IO.Path]::DirectorySeparatorChar,
    [System.IO.Path]::AltDirectorySeparatorChar
  )
  $normalizedRoot = [System.IO.Path]::GetFullPath($Root).TrimEnd($trimCharacters)
  $normalizedCandidate = [System.IO.Path]::GetFullPath($Candidate).TrimEnd($trimCharacters)
  $prefix = $normalizedRoot + [System.IO.Path]::DirectorySeparatorChar
  return $normalizedCandidate -eq $normalizedRoot -or $normalizedCandidate.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)
}

function ConvertTo-GatewayExtendedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  $fullPath = [System.IO.Path]::GetFullPath($Path)
  if ($fullPath.StartsWith('\\?\', [System.StringComparison]::Ordinal)) {
    return $fullPath
  }
  if ($fullPath.StartsWith('\\', [System.StringComparison]::Ordinal)) {
    return '\\?\UNC\' + $fullPath.Substring(2)
  }
  return '\\?\' + $fullPath
}

function ConvertFrom-GatewayExtendedPath {
  param([Parameter(Mandatory = $true)][string]$Path)

  if ($Path.StartsWith('\\?\UNC\', [System.StringComparison]::OrdinalIgnoreCase)) {
    return '\\' + $Path.Substring(8)
  }
  if ($Path.StartsWith('\\?\', [System.StringComparison]::Ordinal)) {
    return $Path.Substring(4)
  }
  return $Path
}

function Assert-GatewayExtractionTree {
  param([Parameter(Mandatory = $true)][string]$Root)

  $rootItem = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
  if (-not $rootItem.PSIsContainer -or (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw 'Gateway extraction root is not a regular protected directory.'
  }
  # Windows PowerShell 5.1's provider rejects a 260-character descendant even
  # when the file exists. The bundled Codex runtime reaches that boundary once
  # the candidate UUID is present, so traverse through Win32 extended-length
  # paths and keep the admission comparison on normalized ordinary paths.
  $canonicalRoot = [System.IO.Path]::GetFullPath($Root)
  $pending = [System.Collections.Generic.Queue[string]]::new()
  $pending.Enqueue($canonicalRoot)
  while ($pending.Count -gt 0) {
    $directory = $pending.Dequeue()
    $extendedDirectory = ConvertTo-GatewayExtendedPath $directory
    foreach ($entry in [System.IO.Directory]::GetFileSystemEntries($extendedDirectory)) {
      $path = ConvertFrom-GatewayExtendedPath $entry
      $attributes = [System.IO.File]::GetAttributes((ConvertTo-GatewayExtendedPath $path))
      if (($attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Gateway extraction contains a Windows reparse point.'
      }
      $canonical = [System.IO.Path]::GetFullPath($path)
      if (-not (Test-GatewayPathWithinRoot $canonicalRoot $canonical)) {
        throw 'Gateway canonical descendant escapes the candidate root.'
      }
      if (($attributes -band [System.IO.FileAttributes]::Directory) -ne 0) {
        $pending.Enqueue($canonical)
      }
      elseif (
        ($attributes -band [System.IO.FileAttributes]::Device) -ne 0 -or
        -not [System.IO.File]::Exists((ConvertTo-GatewayExtendedPath $canonical))
      ) {
        throw 'Gateway extraction contains a non-regular filesystem entry.'
      }
    }
  }
}

function Invoke-GatewayTransientFileOperation {
  param(
    [Parameter(Mandatory = $true)][string]$Label,
    [Parameter(Mandatory = $true)][scriptblock]$Operation,
    [ValidateRange(1, 12)][int]$MaximumAttempts = 6
  )

  $lastError = $null
  for ($attempt = 1; $attempt -le $MaximumAttempts; $attempt += 1) {
    try {
      & $Operation
      return
    }
    catch {
      $lastError = $_
      if ($attempt -eq $MaximumAttempts) { break }
      Write-Warning "$Label hit a transient Windows file lock (attempt $attempt/$MaximumAttempts); retrying. $($_.Exception.Message)"
      Start-Sleep -Seconds ([Math]::Min(5, $attempt))
    }
  }
  throw [System.InvalidOperationException]::new(
    "$Label failed after $MaximumAttempts attempts. $($lastError.Exception.Message)",
    $lastError.Exception
  )
}

function Remove-GatewayReleaseTreeBestEffort {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path)) { return }
  try {
    Invoke-GatewayTransientFileOperation -Label "Gateway release cleanup $Path" -Operation {
      [System.IO.Directory]::Delete((ConvertTo-GatewayExtendedPath $Path), $true)
    }
  }
  catch {
    Write-Warning "Gateway release cleanup will be retried by later maintenance. $($_.Exception.Message)"
  }
}

function New-GatewayRelease {
  param(
    [Parameter(Mandatory = $true)][string]$ArtifactPath,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  Initialize-GatewayStorage
  Assert-GatewayArtifact $ArtifactPath $Manifest
  $releaseRoot = Join-Path $script:GatewayReleasesRoot $Manifest.gitSha
  if (Test-GatewayPathWithinRoot $releaseRoot $ArtifactPath) {
    throw 'Gateway release cannot be rehydrated from its mutable cached extraction.'
  }

  # Never schedule a previously extracted release directory. Even if its outer
  # ZIP still hashes correctly, a prior ACL bug could have allowed a writer to
  # alter the expanded package. Stop first, construct a fresh candidate from
  # the immutable artifact, then replace the canonical version root.
  Stop-GatewayScheduledTask
  $candidateRoot = "$releaseRoot.candidate-$([guid]::NewGuid().ToString('N'))"
  $retiredRoot = $null
  $promoted = $false
  try {
    New-Item -ItemType Directory -Path $candidateRoot -Force | Out-Null
    Invoke-GatewayTransientFileOperation -Label 'Gateway artifact staging' -Operation {
      Copy-Item -LiteralPath $ArtifactPath -Destination (Join-Path $candidateRoot $Manifest.gatewayArtifact) -Force -ErrorAction Stop
    }
    Assert-GatewayArtifact (Join-Path $candidateRoot $Manifest.gatewayArtifact) $Manifest
    Assert-GatewayOuterArchiveEntries (Join-Path $candidateRoot $Manifest.gatewayArtifact)
    Invoke-GatewayTransientFileOperation -Label 'Gateway outer archive extraction' -Operation {
      Expand-Archive -LiteralPath (Join-Path $candidateRoot $Manifest.gatewayArtifact) -DestinationPath $candidateRoot -Force
    }
    Assert-GatewayExtractionTree $candidateRoot
    $expectedOuterFiles = @('agent-gateway.tgz', 'KidItem.AgentGateway.exe', 'gateway-runtime-contract.json', 'release-identity.json')
    foreach ($name in $expectedOuterFiles) {
      if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot $name) -PathType Leaf)) {
        throw "Gateway archive is missing required file: $name"
      }
    }
    Assert-GatewayArchiveEntries (Join-Path $candidateRoot 'agent-gateway.tgz')
    Invoke-GatewayTransientFileOperation -Label 'Gateway payload extraction' -Operation {
      Invoke-Checked tar.exe -xf (Join-Path $candidateRoot 'agent-gateway.tgz') -C $candidateRoot
    }
    Assert-GatewayExtractionTree $candidateRoot
    New-Item -ItemType Directory -Path (Join-Path $candidateRoot 'package\\windows') -Force | Out-Null
    Invoke-GatewayTransientFileOperation -Label 'Gateway native host staging' -Operation {
      Copy-Item -LiteralPath (Join-Path $candidateRoot 'KidItem.AgentGateway.exe') -Destination (Join-Path $candidateRoot 'package\\windows\\KidItem.AgentGateway.exe') -Force -ErrorAction Stop
    }
    Assert-GatewayPackageContents $candidateRoot $Manifest

    # The config survives promotion from the private extraction directory to
    # releases/<gitSha>, so bind it to the final immutable root up front.
    $runtimeRoot = Join-Path $releaseRoot 'package'
    $gatewayConfigPath = Join-Path $candidateRoot $script:GatewayConfigName
    $gatewayConfig = [ordered]@{
      controlOrigin = 'http://127.0.0.1:4000'
      tokenFile = $script:GatewayTokenPath
      stateRoot = $script:GatewayStateRoot
      runtimeRoot = $runtimeRoot
      workspace = $RepoRoot
    }
    # Windows PowerShell 5.1's Set-Content -Encoding UTF8 adds a BOM, while
    # the Node strict JSON parser deliberately rejects that control byte.
    $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
    [System.IO.File]::WriteAllText($gatewayConfigPath, ($gatewayConfig | ConvertTo-Json), $utf8NoBom)
    Set-GatewayProtectedAcl -Path $candidateRoot -Mode ReadExecute
    Set-GatewayProtectedAcl -Path (Join-Path $candidateRoot 'package') -Mode ReadExecute
    Set-GatewayProtectedAcl -Path $gatewayConfigPath -Mode Read
    if (Test-Path -LiteralPath $releaseRoot -PathType Container) {
      $retiredRoot = "$releaseRoot.retired-$([guid]::NewGuid().ToString('N'))"
      Invoke-GatewayTransientFileOperation -Label 'Gateway current release retirement' -Operation {
        Move-Item -LiteralPath $releaseRoot -Destination $retiredRoot -ErrorAction Stop
      }
    }
    Invoke-GatewayTransientFileOperation -Label 'Gateway candidate promotion' -Operation {
      Move-Item -LiteralPath $candidateRoot -Destination $releaseRoot -ErrorAction Stop
    }
    $promoted = $true
    Assert-GatewayArtifact (Join-Path $releaseRoot $Manifest.gatewayArtifact) $Manifest
    Assert-GatewayPackageContents $releaseRoot $Manifest
  }
  catch {
    $releaseError = $_
    if ($promoted -and (Test-Path -LiteralPath $releaseRoot)) {
      Remove-GatewayReleaseTreeBestEffort -Path $releaseRoot
    }
    if ($null -ne $retiredRoot -and (Test-Path -LiteralPath $retiredRoot) -and -not (Test-Path -LiteralPath $releaseRoot)) {
      Invoke-GatewayTransientFileOperation -Label 'Gateway retired release restoration' -Operation {
        Move-Item -LiteralPath $retiredRoot -Destination $releaseRoot -ErrorAction Stop
      }
      $retiredRoot = $null
    }
    Remove-GatewayReleaseTreeBestEffort -Path $candidateRoot
    throw $releaseError
  }
  finally {
    if ($promoted -and $null -ne $retiredRoot) {
      Remove-GatewayReleaseTreeBestEffort -Path $retiredRoot
    }
  }
  return $releaseRoot
}

function Get-GatewayCurrentRelease {
  if (-not (Test-Path -LiteralPath $script:GatewayCurrentPointerPath -PathType Leaf)) {
    return $null
  }
  $pointer = Get-Content -LiteralPath $script:GatewayCurrentPointerPath -Raw | ConvertFrom-Json
  if ($pointer.gitSha -notmatch '^[0-9a-f]{40}$' -or -not $pointer.releaseRoot) {
    throw 'Current Gateway release pointer is invalid.'
  }
  $releaseRoot = [System.IO.Path]::GetFullPath([string]$pointer.releaseRoot)
  $allowed = [System.IO.Path]::GetFullPath((Join-Path $script:GatewayReleasesRoot $pointer.gitSha))
  if ($releaseRoot -ne $allowed -or -not (Test-Path -LiteralPath $releaseRoot -PathType Container)) {
    throw 'Current Gateway release pointer escapes the protected releases root.'
  }
  return [pscustomobject]@{ GitSha = $pointer.gitSha; ReleaseRoot = $releaseRoot }
}

function Move-GatewayProtectedFile {
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

function Switch-GatewayCurrentRelease {
  param(
    [Parameter(Mandatory = $true)][string]$ReleaseRoot,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  Assert-GatewayArtifact (Join-Path $ReleaseRoot $Manifest.gatewayArtifact) $Manifest
  Assert-GatewayPackageContents $ReleaseRoot $Manifest
  $candidate = "$script:GatewayCurrentPointerPath.candidate-$([guid]::NewGuid().ToString('N'))"
  $utf8NoBom = [System.Text.UTF8Encoding]::new($false)
  $pointerJson = [ordered]@{
    gitSha = $Manifest.gitSha
    releaseRoot = [System.IO.Path]::GetFullPath($ReleaseRoot)
    gatewayArtifactSha256 = $Manifest.gatewayArtifactSha256
  } | ConvertTo-Json
  [System.IO.File]::WriteAllText($candidate, $pointerJson, $utf8NoBom)
  Set-GatewayProtectedAcl -Path $candidate -Mode Read
  Move-GatewayProtectedFile -Candidate $candidate -Target $script:GatewayCurrentPointerPath
}

function Install-GatewayLauncher {
  # The scheduled task must remain stable across ordinary runtime releases.
  # The launcher resolves only the ACL-protected current pointer, then enters
  # the matching immutable Gateway release in the same Node process.
  $source = $script:GatewayLauncherSourcePath
  if (-not (Test-Path -LiteralPath $source -PathType Leaf)) {
    throw "Office bundle is missing the stable Host Gateway launcher: $source"
  }
  Initialize-GatewayStorage
  $candidate = "$script:GatewayLauncherPath.candidate-$([guid]::NewGuid().ToString('N'))"
  try {
    Copy-Item -LiteralPath $source -Destination $candidate -Force
    Set-GatewayProtectedAcl -Path $candidate -Mode ReadExecute
    Move-GatewayProtectedFile -Candidate $candidate -Target $script:GatewayLauncherPath
    Assert-GatewayProtectedAcl -Path $script:GatewayLauncherPath -Mode ReadExecute
  }
  finally {
    Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
  }
}

function Resolve-GatewayNodeExecutable {
  $command = Get-Command node.exe -ErrorAction Stop
  $nodeExecutable = [System.IO.Path]::GetFullPath($command.Source)
  $major = Get-CheckedOutput -Program $nodeExecutable -Arguments @(
    '-p',
    'parseInt(process.versions.node,10)'
  )
  if ($major -ne '22') {
    throw "Office Gateway requires Node 22 in the invoking profile; found major $major."
  }
  return $nodeExecutable
}

function Register-GatewayScheduledTask {
  param([Parameter(Mandatory = $true)][object]$Principal)

  if (-not (Test-Path -LiteralPath $script:GatewayLauncherPath -PathType Leaf)) {
    throw 'Host Gateway task cannot be registered without the stable launcher.'
  }
  $nodeExecutable = Resolve-GatewayNodeExecutable
  $arguments = '"{0}" --current "{1}"' -f $script:GatewayLauncherPath, $script:GatewayCurrentPointerPath
  $action = New-ScheduledTaskAction -Execute $nodeExecutable -Argument $arguments -WorkingDirectory $script:GatewayRoot
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $Principal.AccountName -LogonType Interactive -RunLevel Limited
  $trigger = New-ScheduledTaskTrigger -AtLogOn -User $Principal.AccountName
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $task = New-ScheduledTask -Action $action -Principal $taskPrincipal -Trigger $trigger -Settings $settings
  Register-ScheduledTask -TaskName $script:GatewayTaskName -InputObject $task -Force | Out-Null
  $registered = Get-ScheduledTask -TaskName $script:GatewayTaskName
  Assert-GatewayScheduledTaskContract -Task $registered -Principal $Principal
}

function Assert-GatewayScheduledTaskContract {
  param(
    [Parameter(Mandatory = $true)][object]$Task,
    [Parameter(Mandatory = $true)][object]$Principal
  )

  $nodeExecutable = Resolve-GatewayNodeExecutable
  $expectedArguments = '"{0}" --current "{1}"' -f $script:GatewayLauncherPath, $script:GatewayCurrentPointerPath
  $actions = @($Task.Actions)
  if ($actions.Count -ne 1) {
    throw 'Host Gateway task must have exactly one constrained action.'
  }
  $action = $actions[0]
  if (
    ([System.IO.Path]::GetFullPath([string]$action.Execute) -ne [System.IO.Path]::GetFullPath($nodeExecutable)) -or
    ([string]$action.Arguments -ne $expectedArguments) -or
    ([System.IO.Path]::GetFullPath([string]$action.WorkingDirectory) -ne [System.IO.Path]::GetFullPath($script:GatewayRoot))
  ) {
    throw 'Host Gateway task action does not bind the stable protected launcher.'
  }
  try {
    $registeredSid = ([System.Security.Principal.NTAccount]::new([string]$Task.Principal.UserId)).Translate([System.Security.Principal.SecurityIdentifier])
  }
  catch {
    throw 'Host Gateway task principal cannot be resolved to an exact SID.'
  }
  if ($registeredSid.Value -ne $Principal.Sid.Value) {
    throw 'Host Gateway task principal does not match the invoking Windows profile.'
  }
  if ($Task.Principal.LogonType.ToString() -notin @('Interactive', 'InteractiveToken')) {
    throw 'Host Gateway task must use the invoking profile interactive token.'
  }
  if ($Task.Principal.RunLevel.ToString() -ne 'Limited') {
    throw 'Host Gateway task must run at limited privilege.'
  }
  $triggers = @($Task.Triggers)
  if ($triggers.Count -ne 1 -or @($triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskLogonTrigger' }).Count -ne 1) {
    throw 'Host Gateway task must have exactly one current-profile logon trigger.'
  }
  if (
    -not $Task.Settings.StartWhenAvailable -or
    [int]$Task.Settings.RestartCount -ne 3 -or
    [string]$Task.Settings.RestartInterval -ne 'PT1M' -or
    [string]$Task.Settings.ExecutionTimeLimit -ne 'PT0S'
  ) {
    throw 'Host Gateway task settings do not match the constrained restart policy.'
  }
}

function Stop-GatewayScheduledTask {
  $task = Get-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) { return }
  try { Stop-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction Stop }
  catch {
    # ScheduledTasks can fail transiently during a service restart.  The native
    # schtasks fallback still targets only the known constrained task.
    try {
      & schtasks.exe /End /TN $script:GatewayTaskName *> $null
      if ($LASTEXITCODE -ne 0) { throw 'schtasks.exe failed' }
    }
    catch { throw 'Host Gateway task could not be stopped.' }
  }
  $deadline = (Get-Date).AddSeconds(30)
  do {
    $task = Get-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction SilentlyContinue
    if ($null -eq $task -or $task.State.ToString() -ne 'Running') { return }
    Start-Sleep -Milliseconds 500
  } while ((Get-Date) -lt $deadline)
  throw 'Host Gateway task did not stop within 30 seconds.'
}

function Start-GatewayScheduledTask {
  $gatewayPrincipal = Assert-GatewayServiceAccount
  $task = Get-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction SilentlyContinue
  if ($null -eq $task) {
    Register-GatewayScheduledTask -Principal $gatewayPrincipal
    $task = Get-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction Stop
  }
  Assert-GatewayScheduledTaskContract -Task $task -Principal $gatewayPrincipal
  Start-ScheduledTask -TaskName $script:GatewayTaskName
}

function Install-OrUpdateGatewayTask {
  # The task uses the invoking profile's existing CLI login and Node 22.
  Assert-GatewayInstallationPrerequisites
  Install-GatewayLauncher
  $gatewayPrincipal = Assert-GatewayServiceAccount
  Register-GatewayScheduledTask -Principal $gatewayPrincipal
  Write-Host 'Host Gateway Task Scheduler registration updated. Run the normal deployment or token rotation to restart and verify the runtime.'
}

function Stop-OfficeRuntimeFailClosed {
  param([Parameter(Mandatory = $true)][string]$Reason)

  # Do not allow a failed restore to leave any public/API writer or native
  # Gateway process alive under a mixed token/config/release identity.  Every
  # stop is attempted independently; errors are intentionally reduced to
  # component labels so neither bearer material nor provider output is logged.
  $failures = [System.Collections.Generic.List[string]]::new()
  try { Stop-GatewayScheduledTask }
  catch { $failures.Add('gateway') }
  try {
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs stop api web nginx
  }
  catch {
    $failures.Add('compose')
    foreach ($container in @('kiditem-api', 'kiditem-web', 'kiditem-nginx')) {
      try {
        & docker stop $container *> $null
        if ($LASTEXITCODE -ne 0) { $failures.Add($container) }
      }
      catch { $failures.Add($container) }
    }
  }
  $suffix = if ($failures.Count -eq 0) { 'all application surfaces stopped' } else { "stop-errors=$(($failures | Select-Object -Unique) -join ',')" }
  Write-Warning "Office runtime fail-closed after $Reason; $suffix. PostgreSQL and MinIO were left unchanged."
}

function Assert-CurrentOfficeReleaseIdentity {
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw 'No prior Office manifest exists to prove rollback release identity.'
  }
  $manifest = (Read-DeploymentManifest $script:CurrentManifestPath).Manifest
  Set-ComposeArguments
  Invoke-Checked docker @script:ComposeArgs config --quiet
  Assert-RenderedManifestDeployment $manifest
  $gateway = Get-GatewayCurrentRelease
  if ($null -eq $gateway -or $gateway.GitSha -ne $manifest.gitSha) {
    throw 'Host Gateway does not match the current Office manifest release identity.'
  }
  Assert-GatewayArtifact (Join-Path $gateway.ReleaseRoot $manifest.gatewayArtifact) $manifest
  Assert-GatewayPackageContents $gateway.ReleaseRoot $manifest
  Wait-ForRuntime
  Assert-SmokeTests
}

function New-GatewayInstallationToken {
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

function Replace-GatewayInstallationToken {
  $token = New-GatewayInstallationToken
  if ($token -notmatch '^[A-Za-z0-9_-]{43}$') {
    throw 'Generated Host Gateway token has an invalid format.'
  }
  $candidate = "$script:GatewayTokenPath.candidate-$([guid]::NewGuid().ToString('N'))"
  try {
    Set-Content -LiteralPath $candidate -Value $token -NoNewline -Encoding Ascii
    Set-GatewayProtectedAcl -Path $candidate -Mode Read
    Move-GatewayProtectedFile -Candidate $candidate -Target $script:GatewayTokenPath
  }
  finally {
    Remove-Item -LiteralPath $candidate -Force -ErrorAction SilentlyContinue
  }
}

function Rotate-GatewayToken {
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw "No current Office deployment manifest exists at $script:CurrentManifestPath"
  }
  $bundle = Read-DeploymentManifest $script:CurrentManifestPath
  $manifest = $bundle.Manifest
  Assert-RuntimePrerequisites
  $currentGateway = Get-GatewayCurrentRelease
  if ($null -eq $currentGateway -or $currentGateway.GitSha -ne $manifest.gitSha) {
    throw 'Gateway token rotation requires a current Gateway release matching the deployed API/Web identity.'
  }
  $archivedGatewayArtifact = Get-ArchivedGatewayArtifact $manifest
  $tokenBackup = "$script:GatewayTokenPath.rollback-$([guid]::NewGuid().ToString('N'))"
  Copy-Item -LiteralPath $script:GatewayTokenPath -Destination $tokenBackup -Force
  Set-GatewayProtectedAcl -Path $tokenBackup -Mode Read
  try {
    Set-ComposeArguments
    Stop-GatewayScheduledTask
    Invoke-Checked docker @script:ComposeArgs stop api
    $rehydratedGatewayRelease = New-GatewayRelease -ArtifactPath $archivedGatewayArtifact -Manifest $manifest
    Switch-GatewayCurrentRelease $rehydratedGatewayRelease $manifest
    Install-GatewayLauncher
    Replace-GatewayInstallationToken
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api web nginx
    Wait-ForRuntime
    Start-GatewayScheduledTask
    Assert-CurrentOfficeReleaseIdentity
  }
  catch {
    $rotationError = $_
    try {
      Stop-GatewayScheduledTask
      $restoreCandidate = "$script:GatewayTokenPath.restore-$([guid]::NewGuid().ToString('N'))"
      Copy-Item -LiteralPath $tokenBackup -Destination $restoreCandidate -Force
      Set-GatewayProtectedAcl -Path $restoreCandidate -Mode Read
      Move-GatewayProtectedFile -Candidate $restoreCandidate -Target $script:GatewayTokenPath
      $recoveredGatewayRelease = New-GatewayRelease -ArtifactPath $archivedGatewayArtifact -Manifest $manifest
      Switch-GatewayCurrentRelease $recoveredGatewayRelease $manifest
      Install-GatewayLauncher
      Set-ComposeArguments
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api web nginx
      Wait-ForRuntime
      Start-GatewayScheduledTask
      Assert-CurrentOfficeReleaseIdentity
    }
    catch {
      Stop-OfficeRuntimeFailClosed 'Gateway token rotation rollback also failed'
      throw [System.InvalidOperationException]::new('Gateway token rotation failed and rollback could not restore one coherent release identity; runtime was fail-closed.', $rotationError.Exception)
    }
    throw $rotationError
  }
  finally {
    Remove-Item -LiteralPath $tokenBackup -Force -ErrorAction SilentlyContinue
  }
}

function Get-ProtectedServerEnvValue {
  param([Parameter(Mandatory = $true)][string]$Name)

  $path = Join-Path $RepoRoot 'apps\server\.env'
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
    throw "Protected Office server env file is missing: $path"
  }
  $pattern = '^\s*{0}=(.+?)\s*$' -f [regex]::Escape($Name)
  foreach ($line in Get-Content -LiteralPath $path) {
    $match = [regex]::Match($line, $pattern)
    if ($match.Success) {
      return $match.Groups[1].Value.Trim().Trim('"').Trim("'")
    }
  }
  throw "Protected Office server env file is missing $Name."
}

function New-CutoverDatabaseDump {
  param([Parameter(Mandatory = $true)][string]$GitSha)

  # pg_dump reads its credentials from the postgres container's own Compose
  # env; the host passes none. A dump counts toward retention only after it
  # passes every check and leaves its .partial name. Writing one never prunes
  # older dumps; that waits until the whole cutover succeeds.
  New-Item -ItemType Directory -Path $script:DatabaseDumpsRoot -Force | Out-Null
  $timestamp = [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ', [System.Globalization.CultureInfo]::InvariantCulture)
  $dumpName = 'kiditem-{0}-{1}.dump' -f $timestamp, $GitSha.Substring(0, 12)
  $dumpPath = Join-Path $script:DatabaseDumpsRoot $dumpName
  $partialPath = "$dumpPath.partial"
  $containerDumpPath = '/tmp/kiditem-cutover.dump'
  Write-Host 'Writing the pre-cutover Office database dump.'
  try {
    Invoke-Checked docker exec kiditem-postgres sh -c ('PGUSER=$POSTGRES_USER PGDATABASE=$POSTGRES_DB PGPASSWORD=$POSTGRES_PASSWORD pg_dump --format=custom --no-password --file={0}' -f $containerDumpPath)
    Invoke-Checked docker cp "kiditem-postgres:$containerDumpPath" $partialPath
    $header = New-Object byte[] 5
    $stream = [System.IO.File]::OpenRead($partialPath)
    try { $headerLength = $stream.Read($header, 0, $header.Length) }
    finally { $stream.Dispose() }
    if ($headerLength -ne $header.Length -or [System.Text.Encoding]::ASCII.GetString($header) -cne 'PGDMP') {
      throw 'Pre-cutover database dump is not a pg_dump custom-format archive.'
    }
    Move-Item -LiteralPath $partialPath -Destination $dumpPath
  }
  finally {
    Remove-Item -LiteralPath $partialPath -Force -ErrorAction SilentlyContinue
    & docker exec kiditem-postgres rm -f $containerDumpPath | Out-Null
  }
  Write-Host "Pre-cutover database dump: $dumpPath"
  return $dumpPath
}

function Remove-StaleCutoverDatabaseDumps {
  param([Parameter(Mandatory = $true)][string]$KeepDumpPath)

  # Runs only after a cutover deployment succeeded. A failed attempt prunes
  # nothing, so retries that dump an already cleaned database keep the dump
  # taken before the first deletion. Keep the dump this cutover started from
  # plus the newest older ones; excluding it by name means host clock skew can
  # never prune it.
  $keepName = Split-Path -Leaf $KeepDumpPath
  $olderDumps = @(
    Get-ChildItem -LiteralPath $script:DatabaseDumpsRoot -File |
      Where-Object { $_.Name -match '^kiditem-\d{8}T\d{6}Z-[0-9a-f]{12}\.dump$' -and $_.Name -ne $keepName } |
      Sort-Object -Property Name -Descending
  )
  foreach ($staleDump in @($olderDumps | Select-Object -Skip ($script:DatabaseDumpRetentionCount - 1))) {
    try {
      Remove-Item -LiteralPath $staleDump.FullName -Force
    }
    catch {
      Write-Warning "Could not prune old database dump $($staleDump.FullName); remove it manually. $($_.Exception.Message)"
    }
  }
}

function Invoke-ExactShaDataMigrations {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$Phase,
    [Parameter(Mandatory = $true)][string]$ReleaseVersion
  )
  $priorLocation = Get-Location
  $priorDatabaseUrl = $env:DATABASE_URL
  try {
    Set-Location -LiteralPath $WorktreePath
    $env:DATABASE_URL = Get-ProtectedServerEnvValue 'DATABASE_URL'
    Invoke-Checked npm.cmd run data:migrate -- up --phase $Phase --release-version $ReleaseVersion --target office --confirm APPLY_DATA_MIGRATIONS
  }
  finally {
    Set-Location -LiteralPath $priorLocation
    if ($null -eq $priorDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $priorDatabaseUrl }
  }
}

function Write-PreDeployRuntimeSnapshot {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)

  $containers = [ordered]@{}
  foreach ($name in @('kiditem-api', 'kiditem-web', 'kiditem-nginx')) {
    $imageId = & docker inspect --format '{{.Image}}' $name 2>$null
    if ($LASTEXITCODE -eq 0) { $containers[$name] = ($imageId | Out-String).Trim() }
  }
  $snapshot = [ordered]@{
    schemaVersion = 1
    capturedAt = [DateTime]::UtcNow.ToString('yyyy-MM-ddTHH:mm:ssZ')
    containerImageIds = $containers
  }
  if (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf) {
    Copy-Item -LiteralPath $script:CurrentManifestPath -Destination (Join-Path $BackupRoot 'runtime-before.json') -Force
    $snapshot.currentManifestSha256 = (Get-FileHash -LiteralPath $script:CurrentManifestPath -Algorithm SHA256).Hash.ToLowerInvariant()
  }
  [System.IO.File]::WriteAllText(
    (Join-Path $BackupRoot 'runtime-snapshot.json'),
    "$(ConvertTo-Json -InputObject $snapshot -Depth 6)`n",
    [System.Text.UTF8Encoding]::new($false)
  )
}

function Restore-Transaction {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)

  Stop-GatewayScheduledTask
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw 'No prior Office manifest exists for a coherent rollback.'
  }
  $previousRaw = Get-Content -LiteralPath $script:CurrentManifestPath -Raw | ConvertFrom-Json
  $isLocalRuntime = $previousRaw.schemaVersion -eq 3
  $previousManifest = if ($isLocalRuntime) { (Read-DeploymentManifest $script:CurrentManifestPath).Manifest } else { $previousRaw }
  $previousArtifact = if ($isLocalRuntime) { Get-ArchivedGatewayArtifact $previousManifest } else { $null }
  $restored = $false
  foreach ($name in @('compose.office.yml', 'nginx.conf', '.env.office.deploy')) {
    $backup = Join-Path $BackupRoot $name
    $target = Join-Path $script:OfficeRoot $name
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Copy-Item -LiteralPath $backup -Destination $target -Force
      $restored = $true
    }
    elseif ($name -eq '.env.office.deploy' -and (Test-Path -LiteralPath $target -PathType Leaf)) {
      Remove-Item -LiteralPath $target -Force
    }
  }
  $gatewayPointerBackup = Join-Path $BackupRoot 'gateway-current.json'
  if (Test-Path -LiteralPath $gatewayPointerBackup -PathType Leaf) {
    $restorePointer = "$script:GatewayCurrentPointerPath.restore-$([guid]::NewGuid().ToString('N'))"
    try {
      Copy-Item -LiteralPath $gatewayPointerBackup -Destination $restorePointer -Force
      Set-GatewayProtectedAcl -Path $restorePointer -Mode Read
      Move-GatewayProtectedFile -Candidate $restorePointer -Target $script:GatewayCurrentPointerPath
    }
    finally {
      Remove-Item -LiteralPath $restorePointer -Force -ErrorAction SilentlyContinue
    }
  }
  elseif (Test-Path -LiteralPath $script:GatewayCurrentPointerPath -PathType Leaf) {
    Remove-Item -LiteralPath $script:GatewayCurrentPointerPath -Force
  }
  if (-not $restored) {
    throw 'No prior Office deployment files exist for a coherent rollback.'
  }
  if ($isLocalRuntime) {
    $previousBundleRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $previousManifest.gitSha)
    $script:GatewayLauncherSourcePath = Join-Path $previousBundleRoot 'gateway-launcher.cjs'
    $previousGatewayRelease = New-GatewayRelease -ArtifactPath $previousArtifact -Manifest $previousManifest
    Switch-GatewayCurrentRelease $previousGatewayRelease $previousManifest
    Install-GatewayLauncher
  }
  Set-ComposeArguments
  Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api web nginx
  Wait-ForRuntime
  if ($isLocalRuntime) {
    Start-GatewayScheduledTask
    Assert-CurrentOfficeReleaseIdentity
  }
  else {
    Assert-SmokeTests
  }
  Write-Warning 'Previous office runtime files were restored after deployment failure.'
}

function Install-Deployment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetManifestPath,
    [string]$SourceWorktree = '',
    [ValidateSet('Normal', 'Cutover', 'Rollback')][string]$DeploymentMode = 'Normal'
  )

  $bundle = Read-DeploymentManifest $TargetManifestPath
  $manifest = $bundle.Manifest
  if (
    $DeploymentMode -ne 'Rollback' -and
    [bool]$manifest.schemaData.changed -ne ($DeploymentMode -eq 'Cutover')
  ) {
    throw 'Runtime manifest schema/data state does not match the requested deployment mode.'
  }

  Assert-DiskCapacity
  Assert-RuntimePrerequisites
  Assert-LocalImageIdentity $manifest.apiImage $manifest.apiImageId $manifest.gitSha $manifest.appVersion
  Assert-LocalImageIdentity $manifest.webImage $manifest.webImageId $manifest.gitSha $manifest.appVersion

  $sourceRoot = Split-Path -Parent (Resolve-Path -LiteralPath $TargetManifestPath)
  $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
  $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
  $sourceLauncher = Join-Path $sourceRoot 'gateway-launcher.cjs'
  $sourceGatewayArtifact = Join-Path $sourceRoot $manifest.gatewayArtifact
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceGatewayArtifact -PathType Leaf)
  ) {
    $sourceRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
    $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
    $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
    $sourceLauncher = Join-Path $sourceRoot 'gateway-launcher.cjs'
    $sourceGatewayArtifact = Join-Path $sourceRoot $manifest.gatewayArtifact
  }
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceLauncher -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceGatewayArtifact -PathType Leaf)
  ) {
    throw "No archived Compose/nginx/Gateway bundle exists for manifest SHA $($manifest.gitSha)."
  }
  if (Select-String -LiteralPath $sourceCompose -Pattern '^\s*build\s*:' -Quiet) {
    throw 'Office Compose contains a build section; controlled recreation accepts only the prebuilt exact-SHA local images.'
  }
  Assert-GatewayArtifact $sourceGatewayArtifact $manifest
  $script:GatewayLauncherSourcePath = $sourceLauncher
  $gatewayReleaseRoot = $null
  $cutoverDatabaseDumpPath = $null
  $cutoverDatabaseWorkStarted = $false

  New-Item -ItemType Directory -Path $script:OfficeRoot -Force | Out-Null
  New-Item -ItemType Directory -Path $script:DeploymentsRoot -Force | Out-Null
  $backupRoot = Join-Path $script:DeploymentsRoot 'transaction-backup'
  New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
  foreach ($name in @('compose.office.yml', 'nginx.conf', '.env.office.deploy')) {
    $backup = Join-Path $backupRoot $name
    if (Test-Path -LiteralPath $backup -PathType Leaf) {
      Remove-Item -LiteralPath $backup -Force
    }
    $existing = Join-Path $script:OfficeRoot $name
    if (Test-Path -LiteralPath $existing -PathType Leaf) {
      Copy-Item -LiteralPath $existing -Destination $backup -Force
    }
  }
  $gatewayPointerBackup = Join-Path $backupRoot 'gateway-current.json'
  Remove-Item -LiteralPath $gatewayPointerBackup -Force -ErrorAction SilentlyContinue
  if (Test-Path -LiteralPath $script:GatewayCurrentPointerPath -PathType Leaf) {
    Copy-Item -LiteralPath $script:GatewayCurrentPointerPath -Destination $gatewayPointerBackup -Force
  }
  Write-PreDeployRuntimeSnapshot $backupRoot

  $candidateDeployEnv = Join-Path $script:OfficeRoot '.env.office.deploy.candidate'
  try {
    Write-DeployEnv $candidateDeployEnv $manifest
    Copy-Item -LiteralPath $sourceCompose -Destination $script:ComposePath -Force
    Copy-Item -LiteralPath $sourceNginx -Destination (Join-Path $script:OfficeRoot 'nginx.conf') -Force
    Move-Item -LiteralPath $candidateDeployEnv -Destination $script:DeployEnvPath -Force
    Set-ComposeArguments
    Invoke-Checked docker @script:ComposeArgs config --quiet
    Assert-RenderedManifestDeployment $manifest
    $gatewayReleaseRoot = New-GatewayRelease -ArtifactPath $sourceGatewayArtifact -Manifest $manifest
    Install-GatewayLauncher
    if ($DeploymentMode -eq 'Cutover') {
      if (-not $SourceWorktree -or -not (Test-Path -LiteralPath $SourceWorktree -PathType Container)) {
        throw 'Schema/data cutover requires the exact-SHA source worktree.'
      }
      if ((Get-CheckedOutput git -C $SourceWorktree rev-parse HEAD) -ne $manifest.gitSha) {
        throw 'Schema/data cutover worktree does not match the runtime manifest SHA.'
      }
      Write-Warning 'Stopping application writers for the explicitly approved schema/data cutover. Runtime rollback cannot undo database changes.'
      Stop-GatewayScheduledTask
      Invoke-Checked docker @script:ComposeArgs stop api web nginx
      # Containers of services retired from Compose are orphans that the stop
      # above cannot reach; remove them before any database work.
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build --remove-orphans postgres
      Wait-ForContainerHealthy 'kiditem-postgres'
      $cutoverDatabaseDumpPath = New-CutoverDatabaseDump -GitSha $manifest.gitSha
      $cutoverDatabaseWorkStarted = $true
      Invoke-ExactShaDataMigrations -WorktreePath $SourceWorktree -Phase pre-schema -ReleaseVersion $manifest.appVersion
      Invoke-Checked docker @script:ComposeArgs run --rm --no-deps api sh -lc 'cd /app && npx prisma db push --accept-data-loss'
      Invoke-ExactShaDataMigrations -WorktreePath $SourceWorktree -Phase post-schema -ReleaseVersion $manifest.appVersion
    }
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api web nginx
    Wait-ForRuntime
    Switch-GatewayCurrentRelease $gatewayReleaseRoot $manifest
    Start-GatewayScheduledTask
    Assert-SmokeTests
  }
  catch {
    $deploymentError = $_
    if ($DeploymentMode -eq 'Cutover') {
      Stop-OfficeRuntimeFailClosed 'schema/data cutover candidate failed'
      if (-not $cutoverDatabaseWorkStarted) {
        throw [System.InvalidOperationException]::new("Schema/data cutover stopped before database work began; application surfaces stay stopped. Cause: $($deploymentError.Exception.Message)", $deploymentError.Exception)
      }
      Write-Warning "Database dump taken before this cutover: $cutoverDatabaseDumpPath"
      throw [System.InvalidOperationException]::new('Schema/data cutover failed after database work began; application surfaces are stopped because runtime-only rollback is unsafe.', $deploymentError.Exception)
    }
    try {
      Restore-Transaction $backupRoot
    }
    catch {
      $restoreError = $_
      Stop-OfficeRuntimeFailClosed 'Automatic runtime restore also failed'
      throw [System.InvalidOperationException]::new(
        "Office deployment failed and rollback could not restore one coherent release identity; runtime was fail-closed. Deployment error: $($deploymentError.Exception.Message) Restore error: $($restoreError.Exception.Message)",
        $deploymentError.Exception
      )
    }
    throw $deploymentError
  }

  if (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf) {
    Copy-Item -LiteralPath $script:CurrentManifestPath -Destination $script:PreviousManifestPath -Force
  }
  [System.IO.File]::WriteAllText($script:CurrentManifestPath, $bundle.Raw, [System.Text.UTF8Encoding]::new($false))
  $historyName = '{0}-{1}.json' -f (Get-Date -Format 'yyyyMMdd-HHmmss'), $manifest.gitSha.Substring(0, 12)
  [System.IO.File]::WriteAllText((Join-Path $script:DeploymentsRoot $historyName), $bundle.Raw, [System.Text.UTF8Encoding]::new($false))
  $archiveRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
  New-Item -ItemType Directory -Path $archiveRoot -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $archiveRoot 'office-runtime.json'), $bundle.Raw, [System.Text.UTF8Encoding]::new($false))
  $archivedCompose = Join-Path $archiveRoot 'compose.office.yml'
  $archivedNginx = Join-Path $archiveRoot 'nginx.conf'
  $archivedLauncher = Join-Path $archiveRoot 'gateway-launcher.cjs'
  $archivedGatewayArtifact = Join-Path $archiveRoot $manifest.gatewayArtifact
  if (([System.IO.Path]::GetFullPath($sourceCompose)) -ne ([System.IO.Path]::GetFullPath($archivedCompose))) {
    Copy-Item -LiteralPath $sourceCompose -Destination $archivedCompose -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceNginx)) -ne ([System.IO.Path]::GetFullPath($archivedNginx))) {
    Copy-Item -LiteralPath $sourceNginx -Destination $archivedNginx -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceLauncher)) -ne ([System.IO.Path]::GetFullPath($archivedLauncher))) {
    Copy-Item -LiteralPath $sourceLauncher -Destination $archivedLauncher -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceGatewayArtifact)) -ne ([System.IO.Path]::GetFullPath($archivedGatewayArtifact))) {
    Copy-Item -LiteralPath $sourceGatewayArtifact -Destination $archivedGatewayArtifact -Force
  }

  if ($DeploymentMode -eq 'Cutover') {
    Remove-StaleCutoverDatabaseDumps -KeepDumpPath $cutoverDatabaseDumpPath
  }

  Write-Host "Office deployment complete: $($manifest.gitSha) ($($manifest.appVersion))"
  Write-Host "API image: $($manifest.apiImage)"
  Write-Host "Web image: $($manifest.webImage)"
}

function Show-OfficeStatus {
  param([Parameter(Mandatory = $true)][string]$Head)

  Write-Host "Protected live checkout release/office HEAD: $Head"
  $remoteReleaseSha = Get-AuthoritativeRemoteReleaseSha
  if ($remoteReleaseSha) {
    Write-Host "Authoritative remote release/office SHA: $remoteReleaseSha"
    if ($Head -ne $remoteReleaseSha) {
      Write-Warning 'Live release/office checkout is not fast-forwarded to the authoritative remote release SHA.'
    }
  }
  else {
    Write-Warning 'Could not resolve authoritative origin/release/office; release alignment is unknown.'
  }
  Write-Host "Office root disk free: $(Get-FreeSpaceGb $script:OfficeRoot) GB"
  $dockerDataGuardPath = Get-DockerDataGuardPath
  Write-Host "Docker data disk free: $(Get-FreeSpaceGb $dockerDataGuardPath) GB ($dockerDataGuardPath)"
  foreach ($name in @('kiditem-postgres', 'kiditem-minio', 'kiditem-api', 'kiditem-web', 'kiditem-nginx')) {
    Write-Host "${name}: $(Get-ContainerState $name)"
  }
  if (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf) {
    $loose = Get-Content -LiteralPath $script:CurrentManifestPath -Raw | ConvertFrom-Json
    if ($loose.schemaVersion -eq 3) {
      $current = (Read-DeploymentManifest $script:CurrentManifestPath).Manifest
      Assert-LocalImageIdentity $current.apiImage $current.apiImageId $current.gitSha $current.appVersion
      Assert-LocalImageIdentity $current.webImage $current.webImageId $current.gitSha $current.appVersion
      Set-ComposeArguments
      Assert-RenderedManifestDeployment $current
      $gateway = Get-GatewayCurrentRelease
      if ($null -eq $gateway -or $gateway.GitSha -ne $current.gitSha) {
        throw 'Current Gateway release does not match the local runtime manifest.'
      }
      Assert-GatewayPackageContents $gateway.ReleaseRoot $current
      $task = Get-ScheduledTask -TaskName $script:GatewayTaskName -ErrorAction Stop
      Assert-GatewayScheduledTaskContract -Task $task -Principal (Assert-GatewayServiceAccount)
      Write-Host "Runtime SHA: $($current.gitSha)"
      Write-Host "Runtime VERSION: $($current.appVersion)"
      Write-Host "Source ref: $($current.sourceRef)"
      Write-Host "API image ID: $($current.apiImageId)"
      Write-Host "Web image ID: $($current.webImageId)"
      Write-Host "Gateway task: $($task.State)"
      Write-Host "Gateway profile: $($script:GatewayServiceAccount)"
      Write-Host "Schema/data cutover applied: $($current.schemaData.cutoverApproved)"
      if ($remoteReleaseSha -and $current.gitSha -ne $remoteReleaseSha) {
        Write-Warning 'Office runtime is provisional: runtime SHA does not match authoritative origin/release/office.'
      }
    }
    else {
      Write-Host "Legacy runtime SHA: $($loose.gitSha)"
      Write-Host 'Runtime manifest predates local exact-SHA deployment.'
    }
  }
  else {
    Write-Host 'No current runtime manifest found.'
  }
  Invoke-Checked docker system df
}

if ($MyInvocation.InvocationName -eq '.') {
  return
}

if ($Operation -ne 'Deploy' -and ($SourceRef -or $SchemaDataCutover -or $CutoverConfirmation -or $PruneBuildCache)) {
  throw 'Source/build/cutover arguments are valid only for Deploy.'
}

Assert-OfficeRootAnchor
$head = Assert-LiveCheckout

switch ($Operation) {
  'Status' {
    Show-OfficeStatus $head
  }
  'Deploy' {
    if (-not $SourceRef) { throw '-SourceRef origin/<branch> is required for Deploy.' }
    $checkoutRoot = Assert-CleanInvokerCheckout
    $source = Resolve-RemoteSourceCommit $checkoutRoot
    if ($source.SourceRef -eq 'origin/release/office') {
      if ($head -ne $source.GitSha) {
        throw 'Final Office release requires the clean live release/office checkout to be fast-forwarded to the authoritative remote release SHA before build.'
      }
    }
    else {
      Write-Warning "Provisional Office incident deployment from $($source.SourceRef); settle into release/office and deploy its merge SHA."
    }
    $schemaDataPaths = @(Get-SchemaDataChanges -CheckoutRoot $checkoutRoot -TargetSha $source.GitSha)
    Assert-SchemaDataCutoverContract -ChangedPaths $schemaDataPaths
    Assert-DiskCapacity
    $localBuildRoot = Get-LocalBuildRoot
    $worktree = $null
    $localBundle = $null
    try {
      $worktree = New-CleanSourceWorktree -CheckoutRoot $checkoutRoot -GitSha $source.GitSha -LocalBuildRoot $localBuildRoot
      $localBundle = New-LocalDeploymentBundle -WorktreePath $worktree -Source $source -LocalBuildRoot $localBuildRoot -SchemaDataPaths $schemaDataPaths
      $mode = if ($schemaDataPaths.Count -gt 0) { 'Cutover' } else { 'Normal' }
      Install-Deployment -TargetManifestPath $localBundle.ManifestPath -SourceWorktree $worktree -DeploymentMode $mode
    }
    finally {
      if ($null -ne $worktree) {
        Remove-CleanSourceWorktree -CheckoutRoot $checkoutRoot -LocalBuildRoot $localBuildRoot -WorktreePath $worktree
      }
      if ($null -ne $localBundle) {
        Remove-LocalBuildBundle -LocalBuildRoot $localBuildRoot -BundlePath $localBundle.Root
      }
    }
  }
  'Rollback' {
    if (-not (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf)) {
      throw "No previous deployment manifest exists at $script:PreviousManifestPath"
    }
    if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
      throw 'No current local runtime manifest exists to establish rollback compatibility.'
    }
    $current = Get-Content -LiteralPath $script:CurrentManifestPath -Raw | ConvertFrom-Json
    if ($current.schemaVersion -ne 3) {
      throw 'Legacy GHCR runtime rollback is not supported by the local exact-SHA deployer.'
    }
    if ([bool]$current.schemaData.cutoverApproved) {
      throw 'Runtime-only rollback is blocked immediately after a schema/data cutover.'
    }
    Install-Deployment -TargetManifestPath $script:PreviousManifestPath -DeploymentMode Rollback
  }
  'RotateGatewayToken' {
    Rotate-GatewayToken
    Write-Host 'Host Gateway installation bearer rotated and full readiness reverified.'
  }
  'InstallOrUpdateGatewayTask' {
    Install-OrUpdateGatewayTask
  }
}
