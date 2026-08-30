#requires -Version 5.1

[CmdletBinding()]
param(
  [ValidateSet('Deploy', 'CutoverDeploy', 'Status', 'Rollback', 'RotateGatewayToken', 'InstallOrUpdateGatewayTask')]
  [string]$Operation = 'Status',
  [string]$ManifestPath,
  [string]$RepoRoot = 'C:\workspace\kiditem',
  [string]$DockerDataRoot = '',
  [ValidateRange(5, 500)]
  [int]$MinimumFreeGb = 10,
  [switch]$PruneBuildCache,
  [switch]$ApplySchema,
  [switch]$AcceptDataLoss,
  [switch]$ConfirmCutoverDeploy,
  [ValidateRange(30, 900)]
  [int]$HealthTimeoutSeconds = 300,
  # Used only by -Operation InstallOrUpdateGatewayTask. The deployment never
  # creates this local account or reads provider login material. Supply this
  # object from an interactive Get-Credential prompt or approved in-memory
  # secret provider, never from argv, an environment value, or an Office env.
  [string]$GatewayServiceAccount = 'KidItemAgentGateway',
  [pscredential]$GatewayTaskCredential
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

# This is a release-contract constant, deliberately not an operator or Gateway
# config input.  The Host Gateway only admits descendants of this exact anchor.
$script:OfficeRoot = 'C:\ProgramData\KidItem'
$script:ComposePath = Join-Path $script:OfficeRoot 'compose.office.yml'
$script:OfficeEnvPath = Join-Path $script:OfficeRoot '.env.office'
$script:DeployEnvPath = Join-Path $script:OfficeRoot '.env.office.deploy'
$script:DeploymentsRoot = Join-Path $script:OfficeRoot 'deployments'
$script:CurrentManifestPath = Join-Path $script:DeploymentsRoot 'current.json'
$script:PreviousManifestPath = Join-Path $script:DeploymentsRoot 'previous.json'
$script:ComposeArgs = @()
# Keep a configured domain identity intact.  A bare name is explicitly local
# and is resolved to its SID before it is ever granted ACLs or scheduled.
$script:GatewayServiceAccount = if ($GatewayServiceAccount -match '[\\@]') { $GatewayServiceAccount } else { "$env:COMPUTERNAME\$GatewayServiceAccount" }
$script:GatewayServicePrincipal = $null
$script:GatewayTaskName = 'KidItem Agent Gateway'
$script:GatewayRoot = Join-Path $script:OfficeRoot 'agent-gateway'
$script:GatewayReleasesRoot = Join-Path $script:GatewayRoot 'releases'
$script:GatewayCurrentPointerPath = Join-Path $script:GatewayRoot 'current.json'
$script:GatewayStateRoot = Join-Path $script:GatewayRoot 'state'
$script:GatewayTokenPath = Join-Path $script:OfficeRoot 'secrets\agent-gateway-token'
$script:GatewayConfigName = 'gateway-config.json'
$script:GatewayLauncherPath = Join-Path $script:GatewayRoot 'gateway-launcher.cjs'

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

function Read-DeploymentManifest {
  param([Parameter(Mandatory = $true)][string]$Path)

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    throw "Deployment manifest does not exist: $Path"
  }
  $raw = Get-Content -LiteralPath $Path -Raw
  $manifest = $raw | ConvertFrom-Json
  Assert-ManifestShape -Value $manifest -Expected @(
    'schemaVersion', 'environment', 'sourceRef', 'gitSha', 'appVersion',
    'apiImage', 'apiDigest', 'webImage', 'webDigest', 'gatewayArtifact',
    'gatewayArtifactSha256', 'gatewayRuntime', 'createdAt', 'workflowRunUrl'
  ) -Label 'deployment manifest'
  Assert-ManifestIntegerField -Value $manifest -Name 'schemaVersion'
  foreach ($name in @(
    'environment', 'sourceRef', 'gitSha', 'appVersion', 'apiImage', 'apiDigest',
    'webImage', 'webDigest', 'gatewayArtifact', 'gatewayArtifactSha256', 'createdAt',
    'workflowRunUrl'
  )) {
    Assert-ManifestStringField -Value $manifest -Name $name
  }
  Assert-ManifestObjectField -Value $manifest -Name 'gatewayRuntime'

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
    throw 'Gateway artifact filename is not the approved immutable Windows archive.'
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
    'cliContractIdentity', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion'
  ) -Label 'Gateway runtime contract'
  foreach ($name in @('schemaVersion', 'nodeMajor')) {
    Assert-ManifestIntegerField -Value $Runtime -Name $name
  }
  foreach ($name in @('platform', 'controlRevision', 'cliContractIdentity', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    Assert-ManifestStringField -Value $Runtime -Name $name
  }

  if (
    $Runtime.schemaVersion -ne 1 -or
    $Runtime.platform -ne 'windows' -or
    $Runtime.nodeMajor -ne 22 -or
    $Runtime.controlRevision -ne 'kiditem-gateway-control-v1' -or
    $Runtime.cliContractIdentity -ne 'office-cli-contract-v2' -or
    $Runtime.mcpProtocolRevision -ne '2026-07-28' -or
    $Runtime.codexVersion -ne '0.149.1' -or
    $Runtime.claudeVersion -ne '2.1.245'
  ) {
    throw 'Gateway runtime contract does not match the approved KID-25 Windows train.'
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
  try {
    $account = Get-CimInstance -ClassName Win32_UserAccount -Filter ("SID='{0}'" -f $principal.Sid.Value) -ErrorAction Stop
  }
  catch {
    throw 'Pre-provisioned dedicated Host Gateway user cannot be verified.'
  }
  if ($null -eq $account -or $account.Disabled) {
    throw 'Pre-provisioned dedicated Host Gateway user is missing or disabled.'
  }
  Assert-GatewayPrincipalIsLeastPrivilege $principal
  Assert-GatewayPrincipalProfileAndBatchLogon $principal
  return $principal
}

function Assert-GatewayTaskCredential {
  param([Parameter(Mandatory = $true)][object]$Principal)

  if ($null -eq $GatewayTaskCredential -or [string]::IsNullOrWhiteSpace([string]$GatewayTaskCredential.UserName)) {
    throw 'Host Gateway task requires -GatewayTaskCredential from Get-Credential; never provide the password through argv, an environment value, or an Office env file.'
  }
  try {
    $credentialSid = ([System.Security.Principal.NTAccount]::new([string]$GatewayTaskCredential.UserName)).Translate([System.Security.Principal.SecurityIdentifier])
  }
  catch {
    throw 'Host Gateway task credential username cannot be resolved to an exact SID.'
  }
  if ($credentialSid.Value -ne $Principal.Sid.Value) {
    throw 'Host Gateway task credential username does not match the configured dedicated principal SID.'
  }
  if ([string]::IsNullOrWhiteSpace($GatewayTaskCredential.GetNetworkCredential().Password)) {
    throw 'Host Gateway task credential password is empty.'
  }
  return $GatewayTaskCredential
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
    [Parameter(Mandatory = $true)][object]$Principal,
    [ValidateSet('Read', 'ReadExecute', 'Write')][string]$Mode = 'Read',
    [switch]$Anchor
  )

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
    throw 'Gateway artifact SHA-256 does not match the immutable deployment manifest.'
  }
}

function Get-ArchivedGatewayArtifact {
  param([Parameter(Mandatory = $true)][object]$Manifest)

  # Recovery never treats releases/<gitSha> as a source: that is a runnable
  # cache, not immutable evidence. The deployment bundle is the independently
  # hashed artifact retained for the release identity.
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
  foreach ($name in @('schemaVersion', 'platform', 'nodeMajor', 'controlRevision', 'cliContractIdentity', 'mcpProtocolRevision', 'codexVersion', 'claudeVersion')) {
    if ($runtime.$name -ne $Manifest.gatewayRuntime.$name) {
      throw "Gateway runtime contract field $name does not match the deployment manifest."
    }
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
    $expected = @('agent-gateway.tgz', 'KidItem.AgentGateway.exe', 'gateway-runtime-contract.json')
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

function Assert-GatewayExtractionTree {
  param([Parameter(Mandatory = $true)][string]$Root)

  $rootItem = Get-Item -LiteralPath $Root -Force -ErrorAction Stop
  if (-not $rootItem.PSIsContainer -or (($rootItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0)) {
    throw 'Gateway extraction root is not a regular protected directory.'
  }
  $canonicalRoot = (Resolve-Path -LiteralPath $Root -ErrorAction Stop).ProviderPath
  $pending = [System.Collections.Generic.Queue[string]]::new()
  $pending.Enqueue($canonicalRoot)
  while ($pending.Count -gt 0) {
    $directory = $pending.Dequeue()
    foreach ($path in [System.IO.Directory]::GetFileSystemEntries($directory)) {
      $item = Get-Item -LiteralPath $path -Force -ErrorAction Stop
      if (($item.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw 'Gateway extraction contains a Windows reparse point.'
      }
      $canonical = (Resolve-Path -LiteralPath $path -ErrorAction Stop).ProviderPath
      if (-not (Test-GatewayPathWithinRoot $canonicalRoot $canonical)) {
        throw 'Gateway canonical descendant escapes the candidate root.'
      }
      if ($item.PSIsContainer) {
        $pending.Enqueue($canonical)
      }
      elseif (-not ($item -is [System.IO.FileInfo])) {
        throw 'Gateway extraction contains a non-regular filesystem entry.'
      }
    }
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
    Copy-Item -LiteralPath $ArtifactPath -Destination (Join-Path $candidateRoot $Manifest.gatewayArtifact) -Force
    Assert-GatewayArtifact (Join-Path $candidateRoot $Manifest.gatewayArtifact) $Manifest
    Assert-GatewayOuterArchiveEntries (Join-Path $candidateRoot $Manifest.gatewayArtifact)
    Expand-Archive -LiteralPath (Join-Path $candidateRoot $Manifest.gatewayArtifact) -DestinationPath $candidateRoot
    Assert-GatewayExtractionTree $candidateRoot
    $expectedOuterFiles = @('agent-gateway.tgz', 'KidItem.AgentGateway.exe', 'gateway-runtime-contract.json')
    foreach ($name in $expectedOuterFiles) {
      if (-not (Test-Path -LiteralPath (Join-Path $candidateRoot $name) -PathType Leaf)) {
        throw "Gateway archive is missing required file: $name"
      }
    }
    Assert-GatewayArchiveEntries (Join-Path $candidateRoot 'agent-gateway.tgz')
    Invoke-Checked tar.exe -xf (Join-Path $candidateRoot 'agent-gateway.tgz') -C $candidateRoot
    Assert-GatewayExtractionTree $candidateRoot
    New-Item -ItemType Directory -Path (Join-Path $candidateRoot 'package\\windows') -Force | Out-Null
    Copy-Item -LiteralPath (Join-Path $candidateRoot 'KidItem.AgentGateway.exe') -Destination (Join-Path $candidateRoot 'package\\windows\\KidItem.AgentGateway.exe') -Force
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
      Move-Item -LiteralPath $releaseRoot -Destination $retiredRoot
    }
    Move-Item -LiteralPath $candidateRoot -Destination $releaseRoot
    $promoted = $true
    Assert-GatewayArtifact (Join-Path $releaseRoot $Manifest.gatewayArtifact) $Manifest
    Assert-GatewayPackageContents $releaseRoot $Manifest
  }
  catch {
    Remove-Item -LiteralPath $candidateRoot -Recurse -Force -ErrorAction SilentlyContinue
    throw
  }
  finally {
    if ($promoted -and $null -ne $retiredRoot) {
      Remove-Item -LiteralPath $retiredRoot -Recurse -Force -ErrorAction SilentlyContinue
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
  $source = Join-Path $PSScriptRoot 'gateway-launcher.cjs'
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

function Register-GatewayScheduledTask {
  param([Parameter(Mandatory = $true)][object]$Principal)

  if (-not (Test-Path -LiteralPath $script:GatewayLauncherPath -PathType Leaf)) {
    throw 'Host Gateway task cannot be registered without the stable launcher.'
  }
  $nodeExecutable = Join-Path $env:ProgramFiles 'nodejs\\node.exe'
  if (-not (Test-Path -LiteralPath $nodeExecutable -PathType Leaf)) {
    throw "Host Node 22 executable is missing: $nodeExecutable"
  }
  $arguments = '"{0}" --current "{1}"' -f $script:GatewayLauncherPath, $script:GatewayCurrentPointerPath
  $action = New-ScheduledTaskAction -Execute $nodeExecutable -Argument $arguments -WorkingDirectory $script:GatewayRoot
  $taskCredential = Assert-GatewayTaskCredential -Principal $Principal
  # Microsoft TASK_LOGON_S4U cannot access network resources or encrypted
  # files. The Gateway needs provider HTTPS and its dedicated account's login
  # store, so register the task with TASK_LOGON_PASSWORD instead. The password
  # reaches the in-process ScheduledTasks cmdlet only and is never an external
  # process argument or log value.
  $taskPrincipal = New-ScheduledTaskPrincipal -UserId $Principal.AccountName -LogonType Password -RunLevel Limited
  $trigger = New-ScheduledTaskTrigger -AtStartup
  $settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1) -ExecutionTimeLimit ([TimeSpan]::Zero)
  $task = New-ScheduledTask -Action $action -Principal $taskPrincipal -Trigger $trigger -Settings $settings
  $taskPassword = $null
  try {
    $taskPassword = $taskCredential.GetNetworkCredential().Password
    Register-ScheduledTask -TaskName $script:GatewayTaskName -InputObject $task -User $Principal.AccountName -Password $taskPassword -Force | Out-Null
  }
  finally {
    $taskPassword = $null
  }
  $registered = Get-ScheduledTask -TaskName $script:GatewayTaskName
  Assert-GatewayScheduledTaskContract -Task $registered -Principal $Principal
}

function Assert-GatewayScheduledTaskContract {
  param(
    [Parameter(Mandatory = $true)][object]$Task,
    [Parameter(Mandatory = $true)][object]$Principal
  )

  $nodeExecutable = Join-Path $env:ProgramFiles 'nodejs\\node.exe'
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
    throw 'Host Gateway task principal does not match the configured dedicated principal SID.'
  }
  if ($Task.Principal.LogonType.ToString() -ne 'Password') {
    throw 'Host Gateway task must use Password logon.'
  }
  if ($Task.Principal.RunLevel.ToString() -ne 'Limited') {
    throw 'Host Gateway task must run at limited privilege.'
  }
  $triggers = @($Task.Triggers)
  if ($triggers.Count -ne 1 -or @($triggers | Where-Object { $_.CimClass.CimClassName -eq 'MSFT_TaskBootTrigger' }).Count -ne 1) {
    throw 'Host Gateway task must have exactly one boot trigger.'
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
    throw 'Host Gateway task is missing. Run -Operation InstallOrUpdateGatewayTask before a normal runtime operation.'
  }
  Assert-GatewayScheduledTaskContract -Task $task -Principal $gatewayPrincipal
  Start-ScheduledTask -TaskName $script:GatewayTaskName
}

function Install-OrUpdateGatewayTask {
  # This is the only credentialed Task Scheduler operation. It is run during
  # initial host provisioning, a deliberate task-definition update, or after
  # the dedicated Windows account password changes. Normal release operations
  # only replace the immutable runtime/current pointer and restart this task.
  Assert-GatewayInstallationPrerequisites
  Install-GatewayLauncher
  $gatewayPrincipal = Assert-GatewayServiceAccount
  Assert-GatewayTaskCredential -Principal $gatewayPrincipal | Out-Null
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
    Invoke-Checked docker @script:ComposeArgs stop api worker web nginx
  }
  catch {
    $failures.Add('compose')
    foreach ($container in @('kiditem-api', 'kiditem-worker', 'kiditem-web', 'kiditem-nginx')) {
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
  param([Parameter(Mandatory = $true)][string]$ExpectedHead)

  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw "No current Office deployment manifest exists at $script:CurrentManifestPath"
  }
  $bundle = Read-DeploymentManifest $script:CurrentManifestPath
  $manifest = $bundle.Manifest
  if ($manifest.gitSha -ne $ExpectedHead) {
    throw 'Gateway token rotation is blocked because the current runtime does not match release/office HEAD.'
  }
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
    Invoke-Checked docker @script:ComposeArgs stop api worker
    $rehydratedGatewayRelease = New-GatewayRelease -ArtifactPath $archivedGatewayArtifact -Manifest $manifest
    Switch-GatewayCurrentRelease $rehydratedGatewayRelease $manifest
    Install-GatewayLauncher
    Replace-GatewayInstallationToken
    Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api worker web nginx
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
      Invoke-Checked docker @script:ComposeArgs up --detach --no-build --force-recreate api worker web nginx
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

function Restore-Transaction {
  param([Parameter(Mandatory = $true)][string]$BackupRoot)

  Stop-GatewayScheduledTask
  if (-not (Test-Path -LiteralPath $script:CurrentManifestPath -PathType Leaf)) {
    throw 'No prior Office manifest exists for a coherent rollback.'
  }
  $previousManifest = (Read-DeploymentManifest $script:CurrentManifestPath).Manifest
  $previousArtifact = Get-ArchivedGatewayArtifact $previousManifest
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
  $previousGatewayRelease = New-GatewayRelease -ArtifactPath $previousArtifact -Manifest $previousManifest
  Switch-GatewayCurrentRelease $previousGatewayRelease $previousManifest
  Install-GatewayLauncher
  Set-ComposeArguments
  Invoke-Checked docker @script:ComposeArgs up --detach --no-build api worker web nginx
  Wait-ForRuntime
  Start-GatewayScheduledTask
  Assert-CurrentOfficeReleaseIdentity
  Write-Warning 'Previous office runtime files were restored after deployment failure.'
}

function Install-Deployment {
  param(
    [Parameter(Mandatory = $true)][string]$TargetManifestPath,
    [Parameter(Mandatory = $true)][string]$ExpectedHead,
    [switch]$AllowAncestor,
    [switch]$ApplySchema,
    [switch]$AcceptDataLoss,
    [ValidateSet('Normal', 'Cutover')][string]$DeploymentMode = 'Normal'
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
  $sourceGatewayArtifact = Join-Path $sourceRoot $manifest.gatewayArtifact
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceGatewayArtifact -PathType Leaf)
  ) {
    $sourceRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $manifest.gitSha)
    $sourceCompose = Join-Path $sourceRoot 'compose.office.yml'
    $sourceNginx = Join-Path $sourceRoot 'nginx.conf'
    $sourceGatewayArtifact = Join-Path $sourceRoot $manifest.gatewayArtifact
  }
  if (
    -not (Test-Path -LiteralPath $sourceCompose -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceNginx -PathType Leaf) -or
    -not (Test-Path -LiteralPath $sourceGatewayArtifact -PathType Leaf)
  ) {
    throw "No archived Compose/nginx/Gateway bundle exists for manifest SHA $($manifest.gitSha)."
  }
  if (Select-String -LiteralPath $sourceCompose -Pattern '^\s*build\s*:' -Quiet) {
    throw 'Office Compose contains a local build section; only immutable pulled images are allowed.'
  }
  Assert-GatewayArtifact $sourceGatewayArtifact $manifest
  $gatewayReleaseRoot = $null

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
    Switch-GatewayCurrentRelease $gatewayReleaseRoot $manifest
    Start-GatewayScheduledTask
    Assert-SmokeTests
  }
  catch {
    $deploymentError = $_
    if ($DeploymentMode -eq 'Cutover') {
      Stop-OfficeRuntimeFailClosed 'CutoverDeploy candidate failed after contracted schema'
      throw [System.InvalidOperationException]::new('CutoverDeploy failed after schema contraction; application surfaces are stopped. Restore the approved pre-cutover database backup manually and use the retained transaction backup before retrying.', $deploymentError.Exception)
    }
    try {
      Restore-Transaction $backupRoot
    }
    catch {
      Stop-OfficeRuntimeFailClosed 'Automatic runtime restore also failed'
      throw [System.InvalidOperationException]::new('Office deployment failed and rollback could not restore one coherent release identity; runtime was fail-closed.', $deploymentError.Exception)
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
  $archivedGatewayArtifact = Join-Path $archiveRoot $manifest.gatewayArtifact
  if (([System.IO.Path]::GetFullPath($sourceCompose)) -ne ([System.IO.Path]::GetFullPath($archivedCompose))) {
    Copy-Item -LiteralPath $sourceCompose -Destination $archivedCompose -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceNginx)) -ne ([System.IO.Path]::GetFullPath($archivedNginx))) {
    Copy-Item -LiteralPath $sourceNginx -Destination $archivedNginx -Force
  }
  if (([System.IO.Path]::GetFullPath($sourceGatewayArtifact)) -ne ([System.IO.Path]::GetFullPath($archivedGatewayArtifact))) {
    Copy-Item -LiteralPath $sourceGatewayArtifact -Destination $archivedGatewayArtifact -Force
  }

  Write-Host "Office deployment complete: $($manifest.gitSha) ($($manifest.appVersion))"
  Write-Host "API image: $($manifest.apiImage)"
  Write-Host "Web image: $($manifest.webImage)"
}

function Show-OfficeStatus {
  param([Parameter(Mandatory = $true)][string]$Head)

  Write-Host "release/office HEAD: $Head"
  Write-Host "Office root disk free: $(Get-FreeSpaceGb $script:OfficeRoot) GB"
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
  $gateway = Get-GatewayCurrentRelease
  if ($null -ne $gateway) {
    Write-Host "Current Host Gateway SHA: $($gateway.GitSha)"
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
if ($Operation -eq 'CutoverDeploy' -and -not $ConfirmCutoverDeploy) {
  throw '-Operation CutoverDeploy requires -ConfirmCutoverDeploy after the contracted schema has been applied.'
}
if ($ConfirmCutoverDeploy -and $Operation -ne 'CutoverDeploy') {
  throw '-ConfirmCutoverDeploy is valid only with -Operation CutoverDeploy.'
}

Assert-OfficeRootAnchor
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
  'CutoverDeploy' {
    if (-not $ManifestPath) {
      throw '-ManifestPath is required for CutoverDeploy.'
    }
    Install-Deployment $ManifestPath $head -DeploymentMode Cutover
  }
  'Rollback' {
    if (-not (Test-Path -LiteralPath $script:PreviousManifestPath -PathType Leaf)) {
      throw "No previous deployment manifest exists at $script:PreviousManifestPath"
    }
    Install-Deployment $script:PreviousManifestPath $head -AllowAncestor
  }
  'RotateGatewayToken' {
    Rotate-GatewayToken $head
    Write-Host 'Host Gateway installation bearer rotated and full readiness reverified.'
  }
  'InstallOrUpdateGatewayTask' {
    Install-OrUpdateGatewayTask
  }
}
