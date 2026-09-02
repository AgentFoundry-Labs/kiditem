#requires -Version 5.1

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$repoRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..\..'))
$operatorPath = Join-Path $repoRoot 'deploy\office\apply-deployment.ps1'
$tokens = $null
$errors = $null
$ast = [System.Management.Automation.Language.Parser]::ParseFile($operatorPath, [ref]$tokens, [ref]$errors)
if ($errors.Count -ne 0) { throw 'Office operator did not parse for the long-path fixture.' }
foreach ($function in $ast.FindAll({
  param($node)
  $node -is [System.Management.Automation.Language.FunctionDefinitionAst]
}, $true)) {
  Invoke-Expression $function.Extent.Text
}

$fixtureRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("kiditem-office-gateway-long-path-{0}" -f [guid]::NewGuid().ToString('N'))
try {
  [System.IO.Directory]::CreateDirectory($fixtureRoot) | Out-Null
  $deepRoot = $fixtureRoot
  foreach ($segment in @(('a' * 72), ('b' * 72), ('c' * 72))) {
    $deepRoot = Join-Path $deepRoot $segment
  }
  $deepFile = Join-Path $deepRoot 'codex-code-mode-host.exe'
  if ($deepFile.Length -le 260) { throw 'Long-path fixture did not cross the Windows PowerShell provider boundary.' }
  [System.IO.Directory]::CreateDirectory((ConvertTo-GatewayExtendedPath $deepRoot)) | Out-Null
  [System.IO.File]::WriteAllBytes((ConvertTo-GatewayExtendedPath $deepFile), [byte[]](1, 2, 3, 4))

  Assert-GatewayExtractionTree $fixtureRoot
  Remove-GatewayReleaseTreeBestEffort $fixtureRoot
  if ([System.IO.Directory]::Exists((ConvertTo-GatewayExtendedPath $fixtureRoot))) {
    throw 'Extended-length Gateway release cleanup left the fixture tree behind.'
  }
  Write-Output 'office-gateway-long-path fixture passed'
}
finally {
  if ([System.IO.Directory]::Exists((ConvertTo-GatewayExtendedPath $fixtureRoot))) {
    [System.IO.Directory]::Delete((ConvertTo-GatewayExtendedPath $fixtureRoot), $true)
  }
}
