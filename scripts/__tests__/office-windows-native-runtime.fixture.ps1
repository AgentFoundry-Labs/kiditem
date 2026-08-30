#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$AgentGatewayPath,
  [Parameter(Mandatory = $true)][string]$FixturePath,
  [Parameter(Mandatory = $true)][string]$GatewayEntrypoint,
  [Parameter(Mandatory = $true)][string]$DeploymentScript
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($path in @($AgentGatewayPath, $FixturePath, $GatewayEntrypoint, $DeploymentScript)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Windows fixture dependency is missing: $path" }
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("kiditem-gateway-native-fixture-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null

function Wait-ForFixtureProcessIds {
  param([Parameter(Mandatory = $true)][string]$Path)
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) {
      try {
        $lines = @(Get-Content -LiteralPath $Path -ErrorAction Stop)
        if ($lines.Count -eq 2 -and @($lines | Where-Object { $_ -notmatch '^[1-9][0-9]*$' }).Count -eq 0) {
          return @($lines | ForEach-Object { [int]$_ })
        }
      }
      catch {
        # The async fixture writer may still own or be populating the file.
      }
    }
    Start-Sleep -Milliseconds 50
  }
  throw "Timed out waiting for the complete Windows Job fixture process tree."
}

function Test-FixtureProcessStopped {
  param([Parameter(Mandatory = $true)][int]$Id)
  Start-Sleep -Milliseconds 250
  if (Get-Process -Id $Id -ErrorAction SilentlyContinue) {
    throw "Windows Job Object left fixture process $Id alive."
  }
}

function Start-StructuredHelper {
  param([Parameter(Mandatory = $true)][hashtable]$Launch, [switch]$ForceAssignmentFailure)
  $info = New-Object System.Diagnostics.ProcessStartInfo
  $info.FileName = $AgentGatewayPath
  $info.UseShellExecute = $false
  $info.CreateNoWindow = $true
  $info.RedirectStandardInput = $true
  $info.RedirectStandardOutput = $true
  $info.RedirectStandardError = $true
  if ($ForceAssignmentFailure) { $info.Environment['KIDITEM_JOB_RUNNER_TEST_FORCE_ASSIGN_FAILURE'] = '1' }
  $process = New-Object System.Diagnostics.Process
  $process.StartInfo = $info
  if (-not $process.Start()) { throw 'Windows Job helper did not start.' }
  $process.StandardInput.WriteLine(($Launch | ConvertTo-Json -Compress -Depth 4))
  $process.StandardInput.Flush()
  return $process
}

function Set-FixtureUntrustedAcl {
  param(
    [Parameter(Mandatory = $true)][string]$Path,
    [Parameter(Mandatory = $true)][System.Security.Principal.SecurityIdentifier]$UntrustedSid
  )

  $security = Get-Acl -LiteralPath $Path -ErrorAction Stop
  $security.SetAccessRuleProtection($true, $false)
  foreach ($rule in @($security.Access)) { [void]$security.RemoveAccessRuleSpecific($rule) }
  $security.SetOwner($UntrustedSid)
  $inheritance = if (Test-Path -LiteralPath $Path -PathType Container) {
    [System.Security.AccessControl.InheritanceFlags]::ContainerInherit -bor [System.Security.AccessControl.InheritanceFlags]::ObjectInherit
  }
  else { [System.Security.AccessControl.InheritanceFlags]::None }
  [void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $UntrustedSid,
    [System.Security.AccessControl.FileSystemRights]::FullControl,
    $inheritance,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  ))
  Set-Acl -LiteralPath $Path -AclObject $security -ErrorAction Stop
}

function New-FixtureGatewayArtifact {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][object]$Manifest
  )

  $payloadRoot = Join-Path $Root 'gateway-payload'
  $packageRoot = Join-Path $payloadRoot 'package'
  New-Item -ItemType Directory -Path (Join-Path $packageRoot 'dist') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $packageRoot 'node_modules\@openai\codex') -Force | Out-Null
  New-Item -ItemType Directory -Path (Join-Path $packageRoot 'node_modules\@anthropic-ai\claude-code') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $packageRoot 'dist\main.cjs') -Value 'trusted cached-release fixture' -NoNewline
  Set-Content -LiteralPath (Join-Path $packageRoot 'node_modules\@openai\codex\package.json') -Value '{"version":"0.149.1"}' -NoNewline
  Set-Content -LiteralPath (Join-Path $packageRoot 'node_modules\@anthropic-ai\claude-code\package.json') -Value '{"version":"2.1.245"}' -NoNewline

  $tgz = Join-Path $Root 'agent-gateway.tgz'
  & tar.exe -czf $tgz -C $payloadRoot package
  if ($LASTEXITCODE -ne 0) { throw 'Windows fixture could not create a trusted Gateway package archive.' }

  $outerRoot = Join-Path $Root 'gateway-outer'
  New-Item -ItemType Directory -Path $outerRoot -Force | Out-Null
  Copy-Item -LiteralPath $tgz -Destination (Join-Path $outerRoot 'agent-gateway.tgz') -Force
  Set-Content -LiteralPath (Join-Path $outerRoot 'KidItem.AgentGateway.exe') -Value 'fixture helper' -NoNewline
  [System.IO.File]::WriteAllText(
    (Join-Path $outerRoot 'gateway-runtime-contract.json'),
    ($Manifest.gatewayRuntime | ConvertTo-Json -Depth 4),
    [System.Text.UTF8Encoding]::new($false)
  )
  $artifact = Join-Path $Root $Manifest.gatewayArtifact
  Compress-Archive -Path (Join-Path $outerRoot '*') -DestinationPath $artifact -CompressionLevel Optimal
  $Manifest.gatewayArtifactSha256 = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  return $artifact
}

try {
  $pidFile = Join-Path $root 'tree-pids.txt'
  $treeLaunch = @{
    executable = [System.IO.Path]::GetFullPath($FixturePath)
    args = @('--tree', $pidFile)
    cwd = $root
    env = @{ TEMP = $root; TMP = $root; PATH = $env:PATH }
  }
  $tree = Start-StructuredHelper $treeLaunch
  $pids = @(Wait-ForFixtureProcessIds $pidFile)
  if ($pids.Count -ne 2) { throw 'Windows Job fixture did not report a parent and descendant.' }
  $tree.StandardInput.Close()
  if (-not $tree.WaitForExit(15000)) { $tree.Kill(); throw 'Windows Job helper did not terminate after Gateway control EOF.' }
  foreach ($processId in $pids) { Test-FixtureProcessStopped $processId }
  $tree.Dispose()

  $marker = Join-Path $root 'assignment-failure-marker.txt'
  $failureLaunch = @{
    executable = [System.IO.Path]::GetFullPath($FixturePath)
    args = @('--marker', $marker)
    cwd = $root
    env = @{ TEMP = $root; TMP = $root; PATH = $env:PATH }
  }
  $failure = Start-StructuredHelper $failureLaunch -ForceAssignmentFailure
  $failure.StandardInput.Close()
  if (-not $failure.WaitForExit(15000)) { $failure.Kill(); throw 'Windows Job helper did not terminate after forced assignment failure.' }
  if ($failure.ExitCode -ne 70) { throw "Forced Job assignment failure returned $($failure.ExitCode), expected 70." }
  if (Test-Path -LiteralPath $marker) { throw 'A suspended provider executed after forced Job assignment failure.' }
  $failure.Dispose()

  # Dot-source production admission helpers only; no deployment action runs.
  . $DeploymentScript

  # Pre-seed the deployment-owned anchor and a protected file with an arbitrary
  # explicit SID and untrusted owner. The production replacement helper must
  # remove both, establish its exact DACL/owner, and read it back before any
  # Gateway config could be admitted.
  $fixturePrincipal = [pscustomobject]@{
    Sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    AccountName = 'Windows CI ACL fixture'
  }
  $untrustedSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-21-42424242-42424242-42424242-4242')
  $aclAnchor = Join-Path $root 'acl-anchor'
  $aclFile = Join-Path $aclAnchor 'gateway-token'
  New-Item -ItemType Directory -Path $aclAnchor -Force | Out-Null
  Set-Content -LiteralPath $aclFile -Value 'fixture' -NoNewline
  Set-FixtureUntrustedAcl -Path $aclAnchor -UntrustedSid $untrustedSid
  Set-FixtureUntrustedAcl -Path $aclFile -UntrustedSid $untrustedSid
  Set-GatewayProtectedAcl -Path $aclAnchor -Mode ReadExecute -Anchor -Principal $fixturePrincipal
  Set-GatewayProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal
  Assert-GatewayProtectedAcl -Path $aclAnchor -Mode ReadExecute -Anchor -Principal $fixturePrincipal
  Assert-GatewayProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal

  # A surviving arbitrary ACE or untrusted owner is a hard failure, never a
  # harmless compatibility grant.
  $rejectedSecurity = Get-Acl -LiteralPath $aclFile -ErrorAction Stop
  [void]$rejectedSecurity.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new(
    $untrustedSid,
    [System.Security.AccessControl.FileSystemRights]::Read,
    [System.Security.AccessControl.InheritanceFlags]::None,
    [System.Security.AccessControl.PropagationFlags]::None,
    [System.Security.AccessControl.AccessControlType]::Allow
  ))
  Set-Acl -LiteralPath $aclFile -AclObject $rejectedSecurity -ErrorAction Stop
  try { Assert-GatewayProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal; throw 'Surviving arbitrary explicit SID was admitted.' }
  catch {
    if ($_.Exception.Message -notmatch 'DACL') { throw }
  }

  # If an ordinary owner removes READ_CONTROL, production repair must take
  # ownership before it inspects the DACL. A takeover failure leaves the
  # boundary fail-closed and must not fall through to a potentially hostile
  # ACL read/replace path.
  $originalOwnerTakeover = ${function:Invoke-GatewayProtectedOwnerTakeover}
  $script:ownerTakeoverAclReads = 0
  function Invoke-GatewayProtectedOwnerTakeover { throw 'fixture owner takeover failure' }
  function Get-Acl { $script:ownerTakeoverAclReads += 1; throw 'fixture unexpected DACL inspection' }
  try {
    try { Set-GatewayProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal; throw 'Owner takeover failure was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'owner takeover failure') { throw }
    }
    if ($script:ownerTakeoverAclReads -ne 0) { throw 'Owner takeover failure reached Get-Acl before fail-closed exit.' }
  }
  finally {
    Set-Item -Path function:Invoke-GatewayProtectedOwnerTakeover -Value $originalOwnerTakeover
    Remove-Item -Path function:Get-Acl -Force
  }

  # Exercise the real scheduler registration/readback function with an
  # in-process ScheduledTasks adapter. This avoids changing the Windows CI
  # host while still proving the one production implementation builds and
  # verifies its exact credentialed Password action/principal/trigger/settings
  # contract without forwarding the password to a child process.
  $taskGatewayRoot = Join-Path $root 'task-gateway'
  $taskLauncher = Join-Path $taskGatewayRoot 'gateway-launcher.cjs'
  $taskPointer = Join-Path $taskGatewayRoot 'current.json'
  New-Item -ItemType Directory -Path $taskGatewayRoot -Force | Out-Null
  Set-Content -LiteralPath $taskLauncher -Value 'fixture launcher' -NoNewline
  Set-Content -LiteralPath $taskPointer -Value '{}' -NoNewline
  $fixturePrincipal = [pscustomobject]@{
    Sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    AccountName = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
  }
  $originalProgramFiles = $env:ProgramFiles
  $fixtureProgramFiles = Join-Path $root 'program-files'
  $fixtureNode = Join-Path $fixtureProgramFiles 'nodejs\node.exe'
  New-Item -ItemType Directory -Path (Split-Path -Parent $fixtureNode) -Force | Out-Null
  Set-Content -LiteralPath $fixtureNode -Value 'fixture' -NoNewline
  $env:ProgramFiles = $fixtureProgramFiles
  $originalGatewayTaskCredential = Get-Variable -Name GatewayTaskCredential -Scope Script -ValueOnly
  $originalTaskGatewayRoot = $script:GatewayRoot
  $originalTaskGatewayLauncherPath = $script:GatewayLauncherPath
  $originalTaskGatewayCurrentPointerPath = $script:GatewayCurrentPointerPath
  $fixtureTaskPassword = [guid]::NewGuid().ToString('N')
  $fixtureTaskCredential = [pscredential]::new(
    $fixturePrincipal.AccountName,
    (ConvertTo-SecureString -String $fixtureTaskPassword -AsPlainText -Force)
  )
  Set-Variable -Name GatewayTaskCredential -Scope Script -Value $fixtureTaskCredential
  try {
    $script:GatewayRoot = $taskGatewayRoot
    $script:GatewayLauncherPath = $taskLauncher
    $script:GatewayCurrentPointerPath = $taskPointer
    $script:fixtureRegisteredTask = $null
    function Assert-GatewayServiceAccount { return $fixturePrincipal }
    function New-ScheduledTaskAction {
      param([string]$Execute, [string]$Argument, [string]$WorkingDirectory)
      return [pscustomobject]@{ Execute = $Execute; Arguments = $Argument; WorkingDirectory = $WorkingDirectory }
    }
    function New-ScheduledTaskPrincipal {
      param([string]$UserId, [object]$LogonType, [object]$RunLevel)
      return [pscustomobject]@{ UserId = $UserId; LogonType = $LogonType; RunLevel = $RunLevel }
    }
    function New-ScheduledTask {
      param([object]$Action, [object]$Principal, [object]$Trigger, [object]$Settings)
      return [pscustomobject]@{
        Actions = @($Action)
        Principal = $Principal
        Triggers = @($Trigger)
        Settings = $Settings
      }
    }
    function New-ScheduledTaskTrigger {
      param([switch]$AtStartup)
      if (-not $AtStartup) { throw 'Fixture expected a boot trigger.' }
      return [pscustomobject]@{ CimClass = [pscustomobject]@{ CimClassName = 'MSFT_TaskBootTrigger' } }
    }
    function New-ScheduledTaskSettingsSet {
      param([switch]$StartWhenAvailable, [int]$RestartCount, [object]$RestartInterval, [object]$ExecutionTimeLimit)
      return [pscustomobject]@{
        StartWhenAvailable = [bool]$StartWhenAvailable
        RestartCount = $RestartCount
        RestartInterval = [System.Xml.XmlConvert]::ToString([TimeSpan]$RestartInterval)
        ExecutionTimeLimit = [System.Xml.XmlConvert]::ToString([TimeSpan]$ExecutionTimeLimit)
      }
    }
    function Register-ScheduledTask {
      param([string]$TaskName, [object]$InputObject, [string]$User, [string]$Password, [switch]$Force)
      if ($TaskName -ne 'KidItem Agent Gateway' -or -not $Force -or $User -ne $fixturePrincipal.AccountName) {
        throw 'Fixture expected the exact constrained Host Gateway task registration.'
      }
      if ($Password -ne $fixtureTaskPassword) {
        throw 'Fixture received a Scheduler password different from the supplied in-memory credential.'
      }
      if ($InputObject.Principal.LogonType.ToString() -ne 'Password' -or $InputObject.Principal.RunLevel.ToString() -ne 'Limited') {
        throw 'Fixture expected a limited Password-logon Task Scheduler principal.'
      }
      $script:fixtureRegisteredTask = $InputObject
      return $InputObject
    }
    function Get-ScheduledTask {
      param([string]$TaskName)
      return $script:fixtureRegisteredTask
    }

    Register-GatewayScheduledTask -Principal $fixturePrincipal
    Assert-GatewayScheduledTaskContract -Task $script:fixtureRegisteredTask -Principal $fixturePrincipal
    $extraTriggerTask = [pscustomobject]@{
      Actions = $script:fixtureRegisteredTask.Actions
      Principal = $script:fixtureRegisteredTask.Principal
      Triggers = @($script:fixtureRegisteredTask.Triggers[0], $script:fixtureRegisteredTask.Triggers[0])
      Settings = $script:fixtureRegisteredTask.Settings
    }
    try { Assert-GatewayScheduledTaskContract -Task $extraTriggerTask -Principal $fixturePrincipal; throw 'Task with multiple triggers was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'exactly one boot trigger') { throw }
    }
    $extraActionTask = [pscustomobject]@{
      Actions = @($script:fixtureRegisteredTask.Actions[0], $script:fixtureRegisteredTask.Actions[0])
      Principal = $script:fixtureRegisteredTask.Principal
      Triggers = $script:fixtureRegisteredTask.Triggers
      Settings = $script:fixtureRegisteredTask.Settings
    }
    try { Assert-GatewayScheduledTaskContract -Task $extraActionTask -Principal $fixturePrincipal; throw 'Task with multiple actions was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'exactly one constrained action') { throw }
    }
  }
  finally {
    Set-Variable -Name GatewayTaskCredential -Scope Script -Value $originalGatewayTaskCredential
    $script:GatewayRoot = $originalTaskGatewayRoot
    $script:GatewayLauncherPath = $originalTaskGatewayLauncherPath
    $script:GatewayCurrentPointerPath = $originalTaskGatewayCurrentPointerPath
    $env:ProgramFiles = $originalProgramFiles
  }

  function New-FixtureManifest {
    $hash = ('a' * 64) -join ''
    $gitSha = ('b' * 40) -join ''
    return [ordered]@{
      schemaVersion = 2
      environment = 'office'
      sourceRef = 'refs/heads/release/office'
      gitSha = $gitSha
      appVersion = '1.2.3'
      apiImage = "ghcr.io/agentfoundry-labs/kiditem-api@sha256:$hash"
      apiDigest = "sha256:$hash"
      webImage = "ghcr.io/agentfoundry-labs/kiditem-web@sha256:$hash"
      webDigest = "sha256:$hash"
      gatewayArtifact = 'kiditem-agent-gateway-windows-x64.zip'
      gatewayArtifactSha256 = $hash
      gatewayRuntime = [ordered]@{
        schemaVersion = 1
        platform = 'windows'
        nodeMajor = 22
        controlRevision = 'kiditem-gateway-control-v1'
        cliContractIdentity = 'office-cli-contract-v2'
        mcpProtocolRevision = '2026-07-28'
        codexVersion = '0.149.1'
        claudeVersion = '2.1.245'
      }
      createdAt = '2026-08-25T00:00:00Z'
      workflowRunUrl = 'https://github.com/agentfoundry-labs/kiditem/actions/runs/123'
    }
  }

  function Test-FixtureManifestRejected {
    param([Parameter(Mandatory = $true)][string]$Label, [Parameter(Mandatory = $true)][scriptblock]$Mutation)
    $manifest = New-FixtureManifest
    & $Mutation $manifest
    $path = Join-Path $root ("manifest-$([guid]::NewGuid().ToString('N')).json")
    [System.IO.File]::WriteAllText($path, ($manifest | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
    try { Read-DeploymentManifest $path | Out-Null; throw "$Label was admitted." }
    catch {
      if ($_.Exception.Message -eq "$Label was admitted.") { throw }
    }
  }

  $validManifestPath = Join-Path $root 'valid-manifest.json'
  [System.IO.File]::WriteAllText($validManifestPath, ((New-FixtureManifest) | ConvertTo-Json -Depth 8), [System.Text.UTF8Encoding]::new($false))
  Read-DeploymentManifest $validManifestPath | Out-Null
  # Unknown manifest field, missing field, wrong scalar/array/object types,
  # and a valid-type manifest drift must all be rejected by the production parser.
  Test-FixtureManifestRejected 'unknown manifest field' { param($value) $value['unexpected'] = 'x' }
  Test-FixtureManifestRejected 'missing manifest field' { param($value) [void]$value.Remove('webDigest') }
  Test-FixtureManifestRejected 'wrong scalar manifest field' { param($value) $value['schemaVersion'] = '2' }
  Test-FixtureManifestRejected 'array manifest field' { param($value) $value['apiImage'] = @($value['apiImage']) }
  Test-FixtureManifestRejected 'object manifest field' { param($value) $value['gatewayArtifactSha256'] = [ordered]@{ value = $value['gatewayArtifactSha256'] } }
  Test-FixtureManifestRejected 'manifest drift' { param($value) $value['gatewayRuntime']['nodeMajor'] = 21 }

  # A tampered cached Gateway release is never a recovery source. Both a
  # repeated deployment and Restore-Transaction must rebuild runnable content
  # from the immutable archive held outside the mutable releases/<gitSha> root.
  $releaseFixtureRoot = Join-Path $root 'rehydrate-release'
  $releaseManifest = New-FixtureManifest
  $releaseArtifact = New-FixtureGatewayArtifact -Root $releaseFixtureRoot -Manifest $releaseManifest
  $releaseVariables = [ordered]@{}
  foreach ($name in @(
    'OfficeRoot', 'ComposePath', 'OfficeEnvPath', 'DeployEnvPath', 'DeploymentsRoot',
    'CurrentManifestPath', 'PreviousManifestPath', 'ComposeArgs', 'GatewayRoot',
    'GatewayReleasesRoot', 'GatewayCurrentPointerPath', 'GatewayStateRoot',
    'GatewayTokenPath', 'GatewayConfigName', 'GatewayLauncherPath'
  )) {
    $releaseVariables[$name] = Get-Variable -Name $name -Scope Script -ValueOnly
  }
  $releaseFunctions = @{}
  foreach ($name in @(
    'Initialize-GatewayStorage', 'Set-GatewayProtectedAcl', 'Stop-GatewayScheduledTask',
    'Set-ComposeArguments', 'Invoke-Checked', 'Wait-ForRuntime',
    'Install-GatewayLauncher', 'Start-GatewayScheduledTask',
    'Assert-CurrentOfficeReleaseIdentity'
  )) {
    $releaseFunctions[$name] = (Get-Command $name -CommandType Function).ScriptBlock
  }
  try {
    $script:OfficeRoot = Join-Path $releaseFixtureRoot 'office'
    $script:ComposePath = Join-Path $script:OfficeRoot 'compose.office.yml'
    $script:OfficeEnvPath = Join-Path $script:OfficeRoot '.env.office'
    $script:DeployEnvPath = Join-Path $script:OfficeRoot '.env.office.deploy'
    $script:DeploymentsRoot = Join-Path $script:OfficeRoot 'deployments'
    $script:CurrentManifestPath = Join-Path $script:DeploymentsRoot 'current.json'
    $script:PreviousManifestPath = Join-Path $script:DeploymentsRoot 'previous.json'
    $script:ComposeArgs = @()
    $script:GatewayRoot = Join-Path $script:OfficeRoot 'agent-gateway'
    $script:GatewayReleasesRoot = Join-Path $script:GatewayRoot 'releases'
    $script:GatewayCurrentPointerPath = Join-Path $script:GatewayRoot 'current.json'
    $script:GatewayStateRoot = Join-Path $script:GatewayRoot 'state'
    $script:GatewayTokenPath = Join-Path $script:OfficeRoot 'secrets\agent-gateway-token'
    $script:GatewayConfigName = 'gateway-config.json'
    $script:GatewayLauncherPath = Join-Path $script:GatewayRoot 'gateway-launcher.cjs'
    New-Item -ItemType Directory -Path $script:OfficeRoot, $script:GatewayRoot, $script:DeploymentsRoot -Force | Out-Null

    $bundleRoot = Join-Path $script:DeploymentsRoot ("bundles\{0}" -f $releaseManifest.gitSha)
    New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
    Copy-Item -LiteralPath $releaseArtifact -Destination (Join-Path $bundleRoot $releaseManifest.gatewayArtifact) -Force
    [System.IO.File]::WriteAllText(
      $script:CurrentManifestPath,
      ($releaseManifest | ConvertTo-Json -Depth 8),
      [System.Text.UTF8Encoding]::new($false)
    )

    function Initialize-GatewayStorage { New-Item -ItemType Directory -Path $script:GatewayReleasesRoot, $script:GatewayStateRoot -Force | Out-Null }
    function Set-GatewayProtectedAcl { param([string]$Path, [string]$Mode, [switch]$Anchor, [object]$Principal) }
    $script:fixtureGatewayStops = 0
    function Stop-GatewayScheduledTask { $script:fixtureGatewayStops += 1 }
    function Set-ComposeArguments { $script:ComposeArgs = @('fixture-compose') }
    function Invoke-Checked { param([string]$Program, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments) }
    function Wait-ForRuntime { }
    $script:fixtureLauncherInstalls = 0
    function Install-GatewayLauncher { $script:fixtureLauncherInstalls += 1 }
    function Start-GatewayScheduledTask { }
    function Assert-CurrentOfficeReleaseIdentity { }

    $releaseRoot = New-GatewayRelease -ArtifactPath $releaseArtifact -Manifest $releaseManifest
    $mainPath = Join-Path $releaseRoot 'package\dist\main.cjs'
    $trustedMain = Get-Content -LiteralPath $mainPath -Raw
    Set-Content -LiteralPath $mainPath -Value 'tampered cached release' -NoNewline
    $rehydratedRoot = New-GatewayRelease -ArtifactPath $releaseArtifact -Manifest $releaseManifest
    if ((Get-Content -LiteralPath (Join-Path $rehydratedRoot 'package\dist\main.cjs') -Raw) -ne $trustedMain) {
      throw 'Cached Gateway release was reused instead of rehydrated from its immutable archive.'
    }

    Set-Content -LiteralPath (Join-Path $rehydratedRoot 'package\dist\main.cjs') -Value 'tampered cached release before rollback' -NoNewline
    [ordered]@{
      gitSha = $releaseManifest.gitSha
      releaseRoot = $rehydratedRoot
      gatewayArtifactSha256 = $releaseManifest.gatewayArtifactSha256
    } | ConvertTo-Json | Set-Content -LiteralPath $script:GatewayCurrentPointerPath -Encoding UTF8
    $restoreBackup = Join-Path $releaseFixtureRoot 'restore-backup'
    New-Item -ItemType Directory -Path $restoreBackup -Force | Out-Null
    foreach ($name in @('compose.office.yml', 'nginx.conf', '.env.office.deploy')) {
      Set-Content -LiteralPath (Join-Path $restoreBackup $name) -Value 'fixture' -NoNewline
    }
    Copy-Item -LiteralPath $script:GatewayCurrentPointerPath -Destination (Join-Path $restoreBackup 'gateway-current.json') -Force
    Restore-Transaction -BackupRoot $restoreBackup
    if ((Get-Content -LiteralPath (Join-Path $rehydratedRoot 'package\dist\main.cjs') -Raw) -ne $trustedMain) {
      throw 'Rollback recovery scheduled a tampered cached Gateway release instead of rebuilding it from the archived artifact.'
    }
    $recoveredPointer = Get-GatewayCurrentRelease
    if ($null -eq $recoveredPointer -or $recoveredPointer.ReleaseRoot -ne $rehydratedRoot -or $script:fixtureLauncherInstalls -lt 1 -or $script:fixtureGatewayStops -lt 2) {
      throw 'Rollback recovery did not restart the existing task against the rehydrated Gateway release.'
    }
  }
  finally {
    foreach ($entry in $releaseFunctions.GetEnumerator()) {
      Set-Item -Path ("function:{0}" -f $entry.Key) -Value $entry.Value
    }
    foreach ($entry in $releaseVariables.GetEnumerator()) {
      Set-Variable -Name $entry.Key -Scope Script -Value $entry.Value
    }
  }

  foreach ($unsafeEntry in @('package\\native-backslash.txt', 'package/../escape.txt', 'C:/escape.txt', '/escape.txt', 'package/stream:ads')) {
    try { Assert-GatewayArchiveEntryName $unsafeEntry; throw "Unsafe gateway archive entry was admitted: $unsafeEntry" }
    catch {
      if ($_.Exception.Message -notmatch 'unsafe path') { throw }
    }
  }

  # An unrecoverable deployment restore must leave no writer or public surface
  # live even when the compose-level stop itself has failed. Exercise the real
  # fail-closed helper with only in-process command doubles; no Docker state is
  # touched by this fixture.
  $failClosedStops = [System.Collections.Generic.List[string]]::new()
  function Stop-GatewayScheduledTask { $failClosedStops.Add('gateway'); throw 'fixture gateway stop failure' }
  function Set-ComposeArguments { $script:ComposeArgs = @('compose-fixture') }
  function Invoke-Checked {
    param([string]$Program, [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $failClosedStops.Add("compose:$($Arguments -join ' ')")
    throw 'fixture compose stop failure'
  }
  function docker {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments)
    $failClosedStops.Add("container:$($Arguments -join ' ')")
    $global:LASTEXITCODE = 0
  }
  Stop-OfficeRuntimeFailClosed 'Windows fixture simulated rollback failure'
  foreach ($expectedStop in @(
    'gateway',
    'container:stop kiditem-api',
    'container:stop kiditem-worker',
    'container:stop kiditem-web',
    'container:stop kiditem-nginx'
  )) {
    if ($failClosedStops -notcontains $expectedStop) { throw "Fail-closed stop did not attempt $expectedStop." }
  }
  if (@($failClosedStops | Where-Object { $_ -match '^compose:.*stop api worker web nginx$' }).Count -ne 1) {
    throw 'Fail-closed stop did not attempt the full Compose writer/public-surface stop.'
  }

  $safeRoot = Join-Path $root 'archive-root'
  New-Item -ItemType Directory -Path (Join-Path $safeRoot 'package') -Force | Out-Null
  Set-Content -LiteralPath (Join-Path $safeRoot 'package\regular.txt') -Value 'regular' -NoNewline
  $hardLink = Join-Path $safeRoot 'package\hardlink.txt'
  New-Item -ItemType HardLink -Path $hardLink -Target (Join-Path $safeRoot 'package\regular.txt') | Out-Null
  $hardLinkTar = Join-Path $root 'hardlink.tgz'
  & tar.exe -cf $hardLinkTar -C $safeRoot package
  if ($LASTEXITCODE -ne 0) { throw 'Windows fixture could not create a hardlink tar archive.' }
  try { Assert-GatewayArchiveEntries $hardLinkTar; throw 'Hardlink tar archive was admitted.' }
  catch {
    if ($_.Exception.Message -notmatch 'non-regular') { throw }
  }

  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $traversalZip = Join-Path $root 'traversal.zip'
  $zip = [System.IO.Compression.ZipFile]::Open($traversalZip, [System.IO.Compression.ZipArchiveMode]::Create)
  try {
    [void]$zip.CreateEntry('../escape.txt')
  }
  finally { $zip.Dispose() }
  try { Assert-GatewayOuterArchiveEntries $traversalZip; throw 'Traversal zip archive was admitted.' }
  catch {
    if ($_.Exception.Message -notmatch 'unsafe path|closed file set') { throw }
  }

  # Windows may require Developer Mode for symlink creation; hardlink and
  # traversal admissions above are mandatory, and this exercises reparse
  # rejection whenever the gateway image grants symlink creation.
  try {
    $reparseRoot = Join-Path $root 'reparse-root'
    New-Item -ItemType Directory -Path $reparseRoot -Force | Out-Null
    New-Item -ItemType SymbolicLink -Path (Join-Path $reparseRoot 'linked') -Target $safeRoot -ErrorAction Stop | Out-Null
    try { Assert-GatewayExtractionTree $reparseRoot; throw 'Reparse-point extraction tree was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'reparse point') { throw }
    }
  }
  catch [System.UnauthorizedAccessException] { Write-Host 'Windows symlink fixture unavailable; hardlink/traversal admissions verified.' }
  catch [System.NotSupportedException] { Write-Host 'Windows symlink fixture unavailable; hardlink/traversal admissions verified.' }
}
finally {
  Remove-Item -LiteralPath $root -Recurse -Force -ErrorAction SilentlyContinue
}
