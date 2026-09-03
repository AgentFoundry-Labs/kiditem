#requires -Version 5.1

# This file is the explicit Gateway payload build boundary. Changes here can
# invalidate payload reuse; general Office admission/status/rollback changes in
# apply-deployment.ps1 deliberately cannot.

function Resolve-DotNetExecutable {
  $command = Get-Command dotnet.exe -ErrorAction SilentlyContinue
  if ($null -eq $command) {
    $fallback = Join-Path $script:OfficeRoot 'tools\dotnet\dotnet.exe'
    if (Test-Path -LiteralPath $fallback -PathType Leaf) {
      return $fallback
    }
    throw 'The local Office Gateway build requires a .NET 8 SDK (dotnet.exe).'
  }
  return [System.IO.Path]::GetFullPath($command.Source)
}

function Invoke-BundledCliVersionCheck {
  param(
    [Parameter(Mandatory = $true)][string]$Name,
    [Parameter(Mandatory = $true)][string]$Executable,
    [Parameter(Mandatory = $true)][string[]]$Arguments,
    [Parameter(Mandatory = $true)][string]$ExpectedVersion
  )
  $output = & $Executable @Arguments 2>&1 | Out-String
  $exitCode = $LASTEXITCODE
  $bounded = $output.Trim()
  if ($bounded.Length -gt 256) { $bounded = $bounded.Substring(0, 256) }
  if ($exitCode -ne 0) { throw "$Name bundled version command failed." }
  $accepted = if ($Name -eq 'Codex') {
    @($ExpectedVersion, "codex $ExpectedVersion", "codex-cli $ExpectedVersion")
  }
  else {
    @($ExpectedVersion, "claude $ExpectedVersion", "$ExpectedVersion (Claude Code)", "Claude Code $ExpectedVersion")
  }
  if ($accepted -notcontains $bounded) {
    throw "$Name bundled version does not match the Gateway runtime contract."
  }
}

function Build-ExactShaGatewayPayload {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$BundleRoot,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$GitSha
  )

  $worktreeSha = Get-CheckedOutput git -C $WorktreePath rev-parse HEAD
  if ($worktreeSha -ne $GitSha) {
    throw 'Gateway payload build worktree does not match the target Git SHA.'
  }

  $dotnet = Resolve-DotNetExecutable
  $nativeRoot = Join-Path $BundleRoot 'native'
  $verifyRoot = Join-Path $BundleRoot 'gateway-verify'
  foreach ($path in @($nativeRoot, $PayloadRoot)) {
    New-Item -ItemType Directory -Path $path -Force | Out-Null
  }

  $priorLocation = Get-Location
  $priorNodeOptions = $env:NODE_OPTIONS
  $priorDatabaseUrl = $env:DATABASE_URL
  $priorPuppeteerSkip = $env:PUPPETEER_SKIP_DOWNLOAD
  $priorRunner = $env:KIDITEM_WINDOWS_JOB_RUNNER_PATH
  $staged = $false
  try {
    Set-Location -LiteralPath $WorktreePath
    $env:NODE_OPTIONS = '--max-old-space-size=4096'
    $env:DATABASE_URL = 'postgresql://kiditem:kiditem@127.0.0.1:5433/kiditem'
    $env:PUPPETEER_SKIP_DOWNLOAD = 'true'
    Invoke-Checked npm.cmd ci --no-audit --no-fund
    Invoke-Checked npm.cmd run build --workspace=packages/shared
    Invoke-Checked npm.cmd run build --workspace=apps/agent-gateway
    Invoke-Checked npm.cmd run prepack --workspace=apps/agent-gateway
    $staged = $true
    Invoke-Checked -Program $dotnet -Arguments @(
      'publish',
      'apps/agent-gateway/windows/KidItem.JobRunner/KidItem.JobRunner.csproj',
      '-c', 'Release',
      '-r', 'win-x64',
      '--self-contained', 'true',
      '-p:PublishSingleFile=true',
      '-o', $nativeRoot
    )
    $nativeExe = Join-Path $nativeRoot 'KidItem.JobRunner.exe'
    $env:KIDITEM_WINDOWS_JOB_RUNNER_PATH = $nativeExe
    Invoke-Checked npm.cmd exec --workspace=apps/agent-gateway vitest -- run
    '{"unexpected":true}' | & $nativeExe *> $null
    if ($LASTEXITCODE -ne 64) {
      throw 'Windows Gateway native helper admitted malformed structured input.'
    }
    $global:LASTEXITCODE = 0

    Invoke-Checked npm.cmd pack --workspace=apps/agent-gateway --ignore-scripts
    $tgz = Get-ChildItem -LiteralPath $WorktreePath -Filter 'kiditem-agent-gateway-*.tgz' | Select-Object -First 1
    if ($null -eq $tgz) { throw 'Gateway npm package was not produced.' }
    $gatewayTgz = Join-Path $PayloadRoot 'agent-gateway.tgz'
    Move-Item -LiteralPath $tgz.FullName -Destination $gatewayTgz
    Copy-Item -LiteralPath $nativeExe -Destination (Join-Path $PayloadRoot 'KidItem.AgentGateway.exe')
    $runtimePath = Join-Path $PayloadRoot 'gateway-runtime-contract.json'
    $runtimeCode = "import { writeFileSync } from 'node:fs'; import { GATEWAY_RUNTIME_TRAIN } from './packages/shared/dist/agent-runtime/index.js'; writeFileSync(process.argv[1], JSON.stringify({ schemaVersion: 1, platform: 'windows', ...GATEWAY_RUNTIME_TRAIN }, null, 2) + '\n');"
    Invoke-Checked -Program node.exe -Arguments @(
      '--input-type=module',
      '-e',
      $runtimeCode,
      $runtimePath
    )
    $runtime = Get-Content -LiteralPath $runtimePath -Raw | ConvertFrom-Json
    Assert-GatewayRuntimeContract $runtime

    New-Item -ItemType Directory -Path $verifyRoot -Force | Out-Null
    Invoke-Checked tar.exe -xf $gatewayTgz -C $verifyRoot
    $packageRoot = Join-Path $verifyRoot 'package'
    Invoke-BundledCliVersionCheck -Name Codex -Executable (Resolve-GatewayNodeExecutable) -Arguments @((Join-Path $packageRoot 'node_modules\@openai\codex\bin\codex.js'), '--version') -ExpectedVersion $runtime.codexVersion
    Invoke-BundledCliVersionCheck -Name Claude -Executable (Join-Path $packageRoot 'node_modules\@anthropic-ai\claude-code\bin\claude.exe') -Arguments @('--version') -ExpectedVersion $runtime.claudeVersion
    return $runtime
  }
  finally {
    if ($staged) {
      & npm.cmd run postpack --workspace=apps/agent-gateway *> $null
    }
    Set-Location -LiteralPath $priorLocation
    if ($null -eq $priorNodeOptions) { Remove-Item Env:NODE_OPTIONS -ErrorAction SilentlyContinue } else { $env:NODE_OPTIONS = $priorNodeOptions }
    if ($null -eq $priorDatabaseUrl) { Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue } else { $env:DATABASE_URL = $priorDatabaseUrl }
    if ($null -eq $priorPuppeteerSkip) { Remove-Item Env:PUPPETEER_SKIP_DOWNLOAD -ErrorAction SilentlyContinue } else { $env:PUPPETEER_SKIP_DOWNLOAD = $priorPuppeteerSkip }
    if ($null -eq $priorRunner) { Remove-Item Env:KIDITEM_WINDOWS_JOB_RUNNER_PATH -ErrorAction SilentlyContinue } else { $env:KIDITEM_WINDOWS_JOB_RUNNER_PATH = $priorRunner }
  }
}
