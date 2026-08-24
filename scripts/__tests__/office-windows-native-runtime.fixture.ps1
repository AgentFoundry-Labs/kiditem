#requires -Version 5.1
[CmdletBinding()]
param(
  [Parameter(Mandatory = $true)][string]$JobRunnerPath,
  [Parameter(Mandatory = $true)][string]$FixturePath,
  [Parameter(Mandatory = $true)][string]$RunnerEntrypoint,
  [Parameter(Mandatory = $true)][string]$DeploymentScript
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

foreach ($path in @($JobRunnerPath, $FixturePath, $RunnerEntrypoint, $DeploymentScript)) {
  if (-not (Test-Path -LiteralPath $path -PathType Leaf)) { throw "Windows fixture dependency is missing: $path" }
}

$root = Join-Path ([System.IO.Path]::GetTempPath()) ("kiditem-runner-native-fixture-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $root -Force | Out-Null

function Wait-ForFixtureFile {
  param([Parameter(Mandatory = $true)][string]$Path)
  $deadline = (Get-Date).AddSeconds(10)
  while ((Get-Date) -lt $deadline) {
    if (Test-Path -LiteralPath $Path -PathType Leaf) { return }
    Start-Sleep -Milliseconds 50
  }
  throw "Timed out waiting for Windows Job fixture marker."
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
  $info.FileName = $JobRunnerPath
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

try {
  $pidFile = Join-Path $root 'tree-pids.txt'
  $treeLaunch = @{
    executable = [System.IO.Path]::GetFullPath($FixturePath)
    args = @('--tree', $pidFile)
    cwd = $root
    env = @{ TEMP = $root; TMP = $root; PATH = $env:PATH }
  }
  $tree = Start-StructuredHelper $treeLaunch
  Wait-ForFixtureFile $pidFile
  $pids = @(Get-Content -LiteralPath $pidFile | ForEach-Object { [int]$_ })
  if ($pids.Count -ne 2) { throw 'Windows Job fixture did not report a parent and descendant.' }
  $tree.StandardInput.Close()
  if (-not $tree.WaitForExit(15_000)) { $tree.Kill(); throw 'Windows Job helper did not terminate after Runner control EOF.' }
  foreach ($pid in $pids) { Test-FixtureProcessStopped $pid }
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
  if (-not $failure.WaitForExit(15_000)) { $failure.Kill(); throw 'Windows Job helper did not terminate after forced assignment failure.' }
  if ($failure.ExitCode -ne 70) { throw "Forced Job assignment failure returned $($failure.ExitCode), expected 70." }
  if (Test-Path -LiteralPath $marker) { throw 'A suspended provider executed after forced Job assignment failure.' }
  $failure.Dispose()

  # Dot-source production admission helpers only; no deployment action runs.
  . $DeploymentScript

  # Pre-seed the deployment-owned anchor and a protected file with an arbitrary
  # explicit SID and untrusted owner. The production replacement helper must
  # remove both, establish its exact DACL/owner, and read it back before any
  # Runner config could be admitted.
  $fixturePrincipal = [pscustomobject]@{
    Sid = [System.Security.Principal.WindowsIdentity]::GetCurrent().User
    AccountName = 'Windows CI ACL fixture'
  }
  $untrustedSid = [System.Security.Principal.SecurityIdentifier]::new('S-1-5-21-42424242-42424242-42424242-4242')
  $aclAnchor = Join-Path $root 'acl-anchor'
  $aclFile = Join-Path $aclAnchor 'runner-token'
  New-Item -ItemType Directory -Path $aclAnchor -Force | Out-Null
  Set-Content -LiteralPath $aclFile -Value 'fixture' -NoNewline
  Set-FixtureUntrustedAcl -Path $aclAnchor -UntrustedSid $untrustedSid
  Set-FixtureUntrustedAcl -Path $aclFile -UntrustedSid $untrustedSid
  Set-RunnerProtectedAcl -Path $aclAnchor -Mode ReadExecute -Anchor -Principal $fixturePrincipal
  Set-RunnerProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal
  Assert-RunnerProtectedAcl -Path $aclAnchor -Mode ReadExecute -Anchor -Principal $fixturePrincipal
  Assert-RunnerProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal

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
  try { Assert-RunnerProtectedAcl -Path $aclFile -Mode Read -Principal $fixturePrincipal; throw 'Surviving arbitrary explicit SID was admitted.' }
  catch {
    if ($_.Exception.Message -notmatch 'DACL') { throw }
  }

  # Exercise the real scheduler registration/readback function with an
  # in-process ScheduledTasks adapter. This avoids changing the Windows CI
  # host while still proving the one production implementation builds and
  # verifies its exact S4U action/principal/trigger/settings contract.
  $taskRelease = Join-Path $root 'task-release'
  $taskRuntime = Join-Path $taskRelease 'package'
  $taskEntrypoint = Join-Path $taskRuntime 'dist\main.cjs'
  $taskConfig = Join-Path $taskRelease 'runner-config.json'
  New-Item -ItemType Directory -Path (Split-Path -Parent $taskEntrypoint) -Force | Out-Null
  Set-Content -LiteralPath $taskEntrypoint -Value 'fixture' -NoNewline
  Set-Content -LiteralPath $taskConfig -Value '{}' -NoNewline
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
  try {
    $script:fixtureRegisteredTask = $null
    function Assert-RunnerServiceAccount { return $fixturePrincipal }
    function New-ScheduledTaskAction {
      param([string]$Execute, [string]$Argument, [string]$WorkingDirectory)
      return [pscustomobject]@{ Execute = $Execute; Arguments = $Argument; WorkingDirectory = $WorkingDirectory }
    }
    function New-ScheduledTaskPrincipal {
      param([string]$UserId, [object]$LogonType, [object]$RunLevel)
      return [pscustomobject]@{ UserId = $UserId; LogonType = $LogonType; RunLevel = $RunLevel }
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
        RestartInterval = 'PT1M'
        ExecutionTimeLimit = 'PT0S'
      }
    }
    function Register-ScheduledTask {
      param([string]$TaskName, [object]$Action, [object]$Principal, [object]$Trigger, [object]$Settings, [switch]$Force)
      if ($TaskName -ne 'KidItem Agent Runner' -or -not $Force) {
        throw 'Fixture expected the exact constrained Host Runner task registration.'
      }
      $script:fixtureRegisteredTask = [pscustomobject]@{
        Actions = @($Action)
        Principal = $Principal
        Triggers = @($Trigger)
        Settings = $Settings
      }
      return $script:fixtureRegisteredTask
    }
    function Get-ScheduledTask {
      param([string]$TaskName)
      return $script:fixtureRegisteredTask
    }

    Register-RunnerScheduledTask $taskRelease
    Assert-RunnerScheduledTaskContract -Task $script:fixtureRegisteredTask -ReleaseRoot $taskRelease -Principal $fixturePrincipal
    $extraTriggerTask = [pscustomobject]@{
      Actions = $script:fixtureRegisteredTask.Actions
      Principal = $script:fixtureRegisteredTask.Principal
      Triggers = @($script:fixtureRegisteredTask.Triggers[0], $script:fixtureRegisteredTask.Triggers[0])
      Settings = $script:fixtureRegisteredTask.Settings
    }
    try { Assert-RunnerScheduledTaskContract -Task $extraTriggerTask -ReleaseRoot $taskRelease -Principal $fixturePrincipal; throw 'Task with multiple triggers was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'exactly one boot trigger') { throw }
    }
    $extraActionTask = [pscustomobject]@{
      Actions = @($script:fixtureRegisteredTask.Actions[0], $script:fixtureRegisteredTask.Actions[0])
      Principal = $script:fixtureRegisteredTask.Principal
      Triggers = $script:fixtureRegisteredTask.Triggers
      Settings = $script:fixtureRegisteredTask.Settings
    }
    try { Assert-RunnerScheduledTaskContract -Task $extraActionTask -ReleaseRoot $taskRelease -Principal $fixturePrincipal; throw 'Task with multiple actions was admitted.' }
    catch {
      if ($_.Exception.Message -notmatch 'exactly one constrained action') { throw }
    }
  }
  finally {
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
      runnerArtifact = 'kiditem-agent-runner-windows-x64.zip'
      runnerArtifactSha256 = $hash
      runnerRuntime = [ordered]@{
        schemaVersion = 1
        platform = 'windows'
        nodeMajor = 22
        controlRevision = 'kiditem-runner-control-v1'
        cliContractIdentity = 'office-cli-contract-v2'
        mcpProtocolRevision = '2026-07-28'
        codexVersion = '0.149.1'
        claudeVersion = '2.1.241'
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
  Test-FixtureManifestRejected 'object manifest field' { param($value) $value['runnerArtifactSha256'] = [ordered]@{ value = $value['runnerArtifactSha256'] } }
  Test-FixtureManifestRejected 'manifest drift' { param($value) $value['runnerRuntime']['nodeMajor'] = 21 }

  foreach ($unsafeEntry in @('package\\native-backslash.txt', 'package/../escape.txt', 'C:/escape.txt', '/escape.txt', 'package/stream:ads')) {
    try { Assert-RunnerArchiveEntryName $unsafeEntry; throw "Unsafe runner archive entry was admitted: $unsafeEntry" }
    catch {
      if ($_.Exception.Message -notmatch 'unsafe path') { throw }
    }
  }

  # An unrecoverable deployment restore must leave no writer or public surface
  # live even when the compose-level stop itself has failed. Exercise the real
  # fail-closed helper with only in-process command doubles; no Docker state is
  # touched by this fixture.
  $failClosedStops = [System.Collections.Generic.List[string]]::new()
  function Stop-RunnerScheduledTask { $failClosedStops.Add('runner'); throw 'fixture runner stop failure' }
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
    'runner',
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
  try { Assert-RunnerArchiveEntries $hardLinkTar; throw 'Hardlink tar archive was admitted.' }
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
  try { Assert-RunnerOuterArchiveEntries $traversalZip; throw 'Traversal zip archive was admitted.' }
  catch {
    if ($_.Exception.Message -notmatch 'unsafe path|closed file set') { throw }
  }

  # Windows may require Developer Mode for symlink creation; hardlink and
  # traversal admissions above are mandatory, and this exercises reparse
  # rejection whenever the runner image grants symlink creation.
  try {
    $reparseRoot = Join-Path $root 'reparse-root'
    New-Item -ItemType Directory -Path $reparseRoot -Force | Out-Null
    New-Item -ItemType SymbolicLink -Path (Join-Path $reparseRoot 'linked') -Target $safeRoot -ErrorAction Stop | Out-Null
    try { Assert-RunnerExtractionTree $reparseRoot; throw 'Reparse-point extraction tree was admitted.' }
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
