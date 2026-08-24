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

  # Dot-source only pure archive admission helpers; no deployment action runs.
  . $DeploymentScript
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
