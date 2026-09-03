#requires -Version 5.1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest
Import-Module Microsoft.PowerShell.Utility -ErrorAction Stop

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
. (Join-Path $repoRoot 'deploy\office\apply-deployment.ps1')

function Assert-Fixture {
  param(
    [Parameter(Mandatory = $true)][bool]$Condition,
    [Parameter(Mandatory = $true)][string]$Message
  )
  if (-not $Condition) { throw $Message }
}

function Invoke-FixtureGit {
  param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(ValueFromRemainingArguments = $true)][string[]]$Arguments
  )
  $priorPreference = $ErrorActionPreference
  try {
    $ErrorActionPreference = 'Continue'
    $output = & git -C $Repository @Arguments 2>&1
    $exitCode = $LASTEXITCODE
  }
  finally {
    $ErrorActionPreference = $priorPreference
  }
  if ($exitCode -ne 0) {
    throw "Fixture git command failed: git $($Arguments -join ' ')`n$($output | Out-String)"
  }
  return (($output | Out-String).Trim())
}

function Write-FixtureFile {
  param(
    [Parameter(Mandatory = $true)][string]$Root,
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Content
  )
  $path = Join-Path $Root $RelativePath
  $parent = Split-Path -Parent $path
  New-Item -ItemType Directory -Path $parent -Force | Out-Null
  [System.IO.File]::WriteAllText($path, $Content, [System.Text.UTF8Encoding]::new($false))
}

function New-FixturePayload {
  param(
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][object]$Runtime,
    [Parameter(Mandatory = $true)][string]$ScratchRoot
  )
  Initialize-GatewayPayloadRoot $PayloadRoot
  $tarRoot = Join-Path $ScratchRoot ("tar-{0}" -f [guid]::NewGuid().ToString('N'))
  $packageRoot = Join-Path $tarRoot 'package\dist'
  New-Item -ItemType Directory -Path $packageRoot -Force | Out-Null
  [System.IO.File]::WriteAllText((Join-Path $packageRoot 'main.cjs'), "export {};`n")
  & tar.exe -czf (Join-Path $PayloadRoot 'agent-gateway.tgz') -C $tarRoot package
  if ($LASTEXITCODE -ne 0) { throw 'Fixture Gateway tar creation failed.' }
  [System.IO.File]::WriteAllBytes((Join-Path $PayloadRoot 'KidItem.AgentGateway.exe'), [byte[]](1, 2, 3, 4))
  [System.IO.File]::WriteAllText(
    (Join-Path $PayloadRoot 'gateway-runtime-contract.json'),
    "$(ConvertTo-Json -InputObject $Runtime -Depth 5)`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  Remove-Item -LiteralPath $tarRoot -Recurse -Force
}

function New-FixtureManifest {
  param(
    [Parameter(Mandatory = $true)][string]$GitSha,
    [Parameter(Mandatory = $true)][string]$ArtifactSha256,
    [Parameter(Mandatory = $true)][object]$Runtime
  )
  return [ordered]@{
    schemaVersion = 3
    environment = 'office'
    buildKind = 'local-exact-sha'
    sourceRef = 'origin/test-office-gateway-reuse'
    gitSha = $GitSha
    appVersion = '0.1.30'
    apiImage = "kiditem-api:office-$GitSha"
    apiImageId = "sha256:$('a' * 64)"
    webImage = "kiditem-web:office-$GitSha"
    webImageId = "sha256:$('b' * 64)"
    gatewayArtifact = 'kiditem-agent-gateway-windows-x64.zip'
    gatewayArtifactSha256 = $ArtifactSha256
    gatewayRuntime = $Runtime
    schemaData = [ordered]@{
      changed = $false
      paths = @()
      cutoverApproved = $false
    }
    createdAt = '2026-09-02T00:00:00Z'
  }
}

function Write-FixtureSourceArchive {
  param(
    [Parameter(Mandatory = $true)][string]$DeploymentsRoot,
    [Parameter(Mandatory = $true)][string]$SourceSha,
    [Parameter(Mandatory = $true)][object]$PayloadRuntime,
    [Parameter(Mandatory = $true)][object]$ManifestRuntime,
    [Parameter(Mandatory = $true)][string]$ScratchRoot
  )
  $bundleRoot = Join-Path $DeploymentsRoot ("bundles\$SourceSha")
  $payloadRoot = Join-Path $ScratchRoot ("source-payload-{0}" -f [guid]::NewGuid().ToString('N'))
  New-FixturePayload -PayloadRoot $payloadRoot -Runtime $PayloadRuntime -ScratchRoot $ScratchRoot
  $identity = [ordered]@{ schemaVersion = 1; appVersion = '0.1.30'; gitSha = $SourceSha }
  [System.IO.File]::WriteAllText(
    (Join-Path $payloadRoot 'release-identity.json'),
    "$(ConvertTo-Json -InputObject $identity)`n",
    [System.Text.UTF8Encoding]::new($false)
  )
  New-Item -ItemType Directory -Path $bundleRoot -Force | Out-Null
  $artifact = Join-Path $bundleRoot 'kiditem-agent-gateway-windows-x64.zip'
  Remove-Item -LiteralPath $artifact -Force -ErrorAction SilentlyContinue
  Compress-Archive -Path (Join-Path $payloadRoot '*') -DestinationPath $artifact -CompressionLevel Optimal
  $hash = (Get-FileHash -LiteralPath $artifact -Algorithm SHA256).Hash.ToLowerInvariant()
  $manifest = New-FixtureManifest -GitSha $SourceSha -ArtifactSha256 $hash -Runtime $ManifestRuntime
  $json = "$(ConvertTo-Json -InputObject $manifest -Depth 10)`n"
  [System.IO.File]::WriteAllText((Join-Path $DeploymentsRoot 'current.json'), $json, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText((Join-Path $bundleRoot 'office-runtime.json'), $json, [System.Text.UTF8Encoding]::new($false))
  Remove-Item -LiteralPath $payloadRoot -Recurse -Force
  return [pscustomobject]@{ Artifact = $artifact; Hash = $hash }
}

function New-FixtureCommit {
  param(
    [Parameter(Mandatory = $true)][string]$Repository,
    [Parameter(Mandatory = $true)][string]$BaseSha,
    [Parameter(Mandatory = $true)][string]$RelativePath,
    [Parameter(Mandatory = $true)][string]$Marker
  )
  Invoke-FixtureGit -Repository $Repository reset --hard $BaseSha | Out-Null
  Write-FixtureFile -Root $Repository -RelativePath $RelativePath -Content "$Marker`n"
  Invoke-FixtureGit -Repository $Repository add -- $RelativePath | Out-Null
  Invoke-FixtureGit -Repository $Repository commit -m "test: $Marker" | Out-Null
  return (Invoke-FixtureGit -Repository $Repository rev-parse HEAD)
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("kiditem-office-gateway-reuse-{0}" -f [guid]::NewGuid().ToString('N'))
try {
  $gitRoot = Join-Path $fixtureRoot 'repo'
  $deploymentsRoot = Join-Path $fixtureRoot 'deployments'
  $scratchRoot = Join-Path $fixtureRoot 'scratch'
  New-Item -ItemType Directory -Path $gitRoot, $deploymentsRoot, $scratchRoot -Force | Out-Null

  Invoke-FixtureGit -Repository $gitRoot init | Out-Null
  Invoke-FixtureGit -Repository $gitRoot config core.autocrlf false | Out-Null
  Invoke-FixtureGit -Repository $gitRoot config user.email 'office-gateway-reuse@example.invalid' | Out-Null
  Invoke-FixtureGit -Repository $gitRoot config user.name 'Office Gateway Reuse Fixture' | Out-Null
  foreach ($path in @(
    'package.json',
    'package-lock.json',
    '.npmrc',
    'tsconfig.json',
    'prisma/schema.prisma',
    'prisma.config.ts',
    'packages/shared/base.txt',
    'apps/agent-gateway/base.txt',
    'deploy/office/gateway-build.ps1',
    'deploy/office/apply-deployment.ps1'
  )) {
    Write-FixtureFile -Root $gitRoot -RelativePath $path -Content "base $path`n"
  }
  $fixtureGatewayBuild = @'
function Build-ExactShaGatewayPayload {
  param(
    [Parameter(Mandatory = $true)][string]$WorktreePath,
    [Parameter(Mandatory = $true)][string]$BundleRoot,
    [Parameter(Mandatory = $true)][string]$PayloadRoot,
    [Parameter(Mandatory = $true)][string]$GitSha
  )
  $script:FullBuildCount += 1
  New-FixturePayload -PayloadRoot $PayloadRoot -Runtime $runtime -ScratchRoot $scratchRoot
  return $runtime
}
'@
  Write-FixtureFile -Root $gitRoot -RelativePath 'deploy/office/gateway-build.ps1' -Content $fixtureGatewayBuild
  Invoke-FixtureGit -Repository $gitRoot add --all | Out-Null
  Invoke-FixtureGit -Repository $gitRoot commit -m 'test: base gateway payload' | Out-Null
  $sourceSha = Invoke-FixtureGit -Repository $gitRoot rev-parse HEAD

  $runtime = [pscustomobject][ordered]@{
    schemaVersion = 1
    platform = 'windows'
    nodeMajor = 22
    controlRevision = 'kiditem-gateway-control-v1'
    mcpProtocolRevision = '2026-07-28'
    codexVersion = '0.149.1'
    claudeVersion = '2.1.245'
  }
  $source = Write-FixtureSourceArchive -DeploymentsRoot $deploymentsRoot -SourceSha $sourceSha -PayloadRuntime $runtime -ManifestRuntime $runtime -ScratchRoot $scratchRoot
  $script:DeploymentsRoot = $deploymentsRoot
  $script:CurrentManifestPath = Join-Path $deploymentsRoot 'current.json'

  $script:FullBuildCount = 0

  $deployOnlySha = New-FixtureCommit -Repository $gitRoot -BaseSha $sourceSha -RelativePath 'deploy/office/apply-deployment.ps1' -Marker 'deploy-only'
  $reuseBundle = Join-Path $fixtureRoot 'bundle-reuse'
  New-Item -ItemType Directory -Path $reuseBundle -Force | Out-Null
  $reused = Build-LocalGatewayArtifact -WorktreePath $gitRoot -BundleRoot $reuseBundle -GitSha $deployOnlySha -AppVersion '0.1.31'
  Assert-Fixture ($script:FullBuildCount -eq 0) 'Deploy script-only change unexpectedly ran the full Gateway build.'
  Assert-Fixture ($reused.ArtifactSha256 -ne $source.Hash) 'Reused payload archive was not repackaged with a new hash.'
  $identityRoot = Join-Path $fixtureRoot 'identity-check'
  Expand-Archive -LiteralPath $reused.ArtifactPath -DestinationPath $identityRoot
  $sourcePayloadRoot = Join-Path $fixtureRoot 'source-payload-check'
  Expand-Archive -LiteralPath $source.Artifact -DestinationPath $sourcePayloadRoot
  $identity = Get-Content -LiteralPath (Join-Path $identityRoot 'release-identity.json') -Raw | ConvertFrom-Json
  Assert-Fixture ($identity.gitSha -eq $deployOnlySha) 'Reused Gateway artifact identity did not bind the target Git SHA.'
  Assert-Fixture ($identity.appVersion -eq '0.1.31') 'Reused Gateway artifact identity did not bind the target VERSION.'
  foreach ($name in $script:GatewayPayloadFiles) {
    $sourcePayloadHash = (Get-FileHash -LiteralPath (Join-Path $sourcePayloadRoot $name) -Algorithm SHA256).Hash
    $targetPayloadHash = (Get-FileHash -LiteralPath (Join-Path $identityRoot $name) -Algorithm SHA256).Hash
    Assert-Fixture ($sourcePayloadHash -eq $targetPayloadHash) "Reused Gateway payload bytes changed: $name"
  }

  foreach ($impactPath in @('package-lock.json', 'packages/shared/base.txt', 'apps/agent-gateway/base.txt')) {
    $impactSha = New-FixtureCommit -Repository $gitRoot -BaseSha $sourceSha -RelativePath $impactPath -Marker ("impact-{0}" -f ($impactPath -replace '[^A-Za-z0-9]', '-'))
    $impactBundle = Join-Path $fixtureRoot ("bundle-impact-{0}" -f [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Path $impactBundle -Force | Out-Null
    $before = $script:FullBuildCount
    Build-LocalGatewayArtifact -WorktreePath $gitRoot -BundleRoot $impactBundle -GitSha $impactSha -AppVersion '0.1.31' | Out-Null
    Assert-Fixture ($script:FullBuildCount -eq ($before + 1)) "Gateway impact path did not force a full build: $impactPath"
  }

  Invoke-FixtureGit -Repository $gitRoot reset --hard $deployOnlySha | Out-Null
  $artifactBackup = "$($source.Artifact).fixture-backup"
  Copy-Item -LiteralPath $source.Artifact -Destination $artifactBackup
  [System.IO.File]::AppendAllText($source.Artifact, 'corrupt')
  $beforeCorrupt = $script:FullBuildCount
  $corruptBundle = Join-Path $fixtureRoot 'bundle-corrupt'
  New-Item -ItemType Directory -Path $corruptBundle -Force | Out-Null
  Build-LocalGatewayArtifact -WorktreePath $gitRoot -BundleRoot $corruptBundle -GitSha $deployOnlySha -AppVersion '0.1.31' | Out-Null
  Assert-Fixture ($script:FullBuildCount -eq ($beforeCorrupt + 1)) 'Corrupt archived artifact did not fall back to a full build.'

  Copy-Item -LiteralPath $artifactBackup -Destination $source.Artifact -Force
  Remove-Item -LiteralPath $source.Artifact -Force
  $beforeMissing = $script:FullBuildCount
  $missingBundle = Join-Path $fixtureRoot 'bundle-missing'
  New-Item -ItemType Directory -Path $missingBundle -Force | Out-Null
  Build-LocalGatewayArtifact -WorktreePath $gitRoot -BundleRoot $missingBundle -GitSha $deployOnlySha -AppVersion '0.1.31' | Out-Null
  Assert-Fixture ($script:FullBuildCount -eq ($beforeMissing + 1)) 'Missing archived artifact did not fall back to a full build.'

  $badRuntime = [pscustomobject][ordered]@{
    schemaVersion = 1
    platform = 'windows'
    nodeMajor = 22
    controlRevision = 'kiditem-gateway-control-v1'
    mcpProtocolRevision = '2026-07-28'
    codexVersion = '0.149.1'
    claudeVersion = '0.0.0'
  }
  Write-FixtureSourceArchive -DeploymentsRoot $deploymentsRoot -SourceSha $sourceSha -PayloadRuntime $badRuntime -ManifestRuntime $runtime -ScratchRoot $scratchRoot | Out-Null
  $beforeMismatch = $script:FullBuildCount
  $mismatchBundle = Join-Path $fixtureRoot 'bundle-runtime-mismatch'
  New-Item -ItemType Directory -Path $mismatchBundle -Force | Out-Null
  Build-LocalGatewayArtifact -WorktreePath $gitRoot -BundleRoot $mismatchBundle -GitSha $deployOnlySha -AppVersion '0.1.31' | Out-Null
  Assert-Fixture ($script:FullBuildCount -eq ($beforeMismatch + 1)) 'Runtime-mismatched archived artifact did not fall back to a full build.'

  Write-Output 'office-gateway-reuse fixture passed'
}
finally {
  Remove-Item -LiteralPath $fixtureRoot -Recurse -Force -ErrorAction SilentlyContinue
}
