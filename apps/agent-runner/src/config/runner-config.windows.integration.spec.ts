import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { loadRunnerConfig } from './runner-config';

describe('Windows Office protected-path admission', () => {
  it.skipIf(process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')(
    'accepts a deployment-owned KidItem anchor below a normal ProgramData parent ACL',
    async () => {
      const programData = process.env.ProgramData ?? 'C:\\ProgramData';
      const anchor = join(programData, 'KidItem');
      if (existsSync(anchor)) throw new Error('Windows CI must reserve a clean ProgramData\\KidItem anchor for this live ACL fixture.');
      const release = join(anchor, 'agent-runner', 'releases', 'a'.repeat(40));
      const runtimeRoot = join(release, 'package');
      const entrypoint = join(runtimeRoot, 'dist', 'main.cjs');
      const configPath = join(release, 'runner-config.json');
      const tokenFile = join(anchor, 'secrets', 'agent-runner-token');
      const attemptRoot = join(anchor, 'agent-runner', 'attempts');
      const serviceSid = currentWindowsServiceSid();
      try {
        await mkdir(join(runtimeRoot, 'dist'), { recursive: true });
        await mkdir(attemptRoot, { recursive: true });
        await mkdir(join(anchor, 'secrets'), { recursive: true });
        await writeFile(entrypoint, '');
        await writeFile(tokenFile, 'A'.repeat(43));
        await writeFile(configPath, JSON.stringify({
          controlOrigin: 'http://127.0.0.1:4000', tokenFile, attemptRoot, runtimeRoot,
        }));

        // The fixture starts with an attacker-controlled anchor/file.  It then
        // invokes the production deployment replacement helper, rather than a
        // test-local icacls approximation, before production config admission.
        seedUntrustedAcl(anchor);
        seedUntrustedAcl(configPath);
        await expect(loadRunnerConfig(['--config', configPath], { entrypoint }))
          .rejects.toThrow('runner_protected_path_owner_invalid');
        protectWithDeploymentScript(anchor, serviceSid, 'ReadExecute', true);
        for (const path of [
          join(anchor, 'agent-runner'),
          join(anchor, 'agent-runner', 'releases'),
          release,
          runtimeRoot,
          join(runtimeRoot, 'dist'),
        ]) protectWithDeploymentScript(path, serviceSid, 'ReadExecute');
        protectWithDeploymentScript(attemptRoot, serviceSid, 'Write');
        protectWithDeploymentScript(join(anchor, 'secrets'), serviceSid, 'Read');
        protectWithDeploymentScript(configPath, serviceSid, 'Read');
        protectWithDeploymentScript(tokenFile, serviceSid, 'Read');

        await expect(loadRunnerConfig(['--config', configPath], { entrypoint })).resolves.toMatchObject({
          controlOrigin: 'http://127.0.0.1:4000',
          tokenFile,
          attemptRoot,
          runtimeRoot,
        });

        // A post-protection outsider read grant is still a hard admission
        // failure. The running Runner must not wait for a later file read to
        // notice that its bearer/config boundary has been weakened.
        addUntrustedReadAcl(anchor);
        await expect(loadRunnerConfig(['--config', configPath], { entrypoint }))
          .rejects.toThrow('runner_protected_path_acl_invalid');
        protectWithDeploymentScript(anchor, serviceSid, 'ReadExecute', true);

        // A junction has a canonical-looking descendant spelling but escapes
        // the protected root. It must be rejected before any Attempt workspace
        // can be created beneath it.
        const outsideRoot = await mkdtemp(join(tmpdir(), 'kiditem-runner-junction-target-'));
        try {
          await rm(attemptRoot, { recursive: true, force: true });
          execFileSync('cmd.exe', ['/d', '/s', '/c', `mklink /J "${attemptRoot}" "${outsideRoot}"`], { stdio: 'pipe' });
          await expect(loadRunnerConfig(['--config', configPath], { entrypoint }))
            .rejects.toThrow('runner_attempt_root_symlink_rejected');
        } finally {
          await rm(outsideRoot, { recursive: true, force: true });
        }
      } finally {
        await rm(anchor, { recursive: true, force: true });
      }
    },
  );

  it.skipIf(process.platform !== 'win32' || process.env.GITHUB_ACTIONS !== 'true')(
    'rejects a protected config outside the code-owned ProgramData KidItem anchor',
    async () => {
      const outsideRoot = await mkdtemp(join(tmpdir(), 'kiditem-runner-outside-anchor-'));
      const configPath = join(outsideRoot, 'runner-config.json');
      try {
        await writeFile(configPath, '{}');
        await expect(loadRunnerConfig(['--config', configPath], {
          entrypoint: join(outsideRoot, 'package', 'dist', 'main.cjs'),
        })).rejects.toThrow('runner_protected_path_anchor_invalid');
      } finally {
        await rm(outsideRoot, { recursive: true, force: true });
      }
    },
  );
});

const deploymentScript = resolve(__dirname, '../../../../deploy/office/apply-deployment.ps1');
const untrustedSid = 'S-1-5-32-545';

function currentWindowsServiceSid(): string {
  const output = execFileSync('whoami.exe', ['/user', '/fo', 'csv', '/nh'], { encoding: 'utf8' });
  const sid = /S-\d+(?:-\d+)+/i.exec(output)?.[0];
  if (!sid) throw new Error('Windows ACL fixture could not resolve its current SID.');
  return sid;
}

function protectWithDeploymentScript(
  path: string,
  serviceSid: string,
  mode: 'Read' | 'ReadExecute' | 'Write',
  anchor = false,
): void {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '. $args[0]',
    "$principal = [pscustomobject]@{ Sid = [System.Security.Principal.SecurityIdentifier]::new($args[3]); AccountName = 'Windows CI fixture' }",
    '$anchor = [System.Convert]::ToBoolean($args[4])',
    'if ($anchor) { Set-RunnerProtectedAcl -Path $args[1] -Mode $args[2] -Anchor -Principal $principal } else { Set-RunnerProtectedAcl -Path $args[1] -Mode $args[2] -Principal $principal }',
  ].join('; ');
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command,
    deploymentScript, path, mode, serviceSid, String(anchor),
  ], { stdio: 'pipe' });
}

function seedUntrustedAcl(path: string): void {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '$security = Get-Acl -LiteralPath $args[0]',
    '$security.SetAccessRuleProtection($true, $false)',
    'foreach ($rule in @($security.Access)) { [void]$security.RemoveAccessRuleSpecific($rule) }',
    '$untrusted = [System.Security.Principal.SecurityIdentifier]::new($args[1])',
    '$security.SetOwner($untrusted)',
    '[void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($untrusted, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.InheritanceFlags]::None, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow))',
    'Set-Acl -LiteralPath $args[0] -AclObject $security -ErrorAction Stop',
  ].join('; ');
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command, path, untrustedSid,
  ], { stdio: 'pipe' });
}

function addUntrustedReadAcl(path: string): void {
  const command = [
    "$ErrorActionPreference = 'Stop'",
    '$security = Get-Acl -LiteralPath $args[0]',
    '$untrusted = [System.Security.Principal.SecurityIdentifier]::new($args[1])',
    '[void]$security.AddAccessRule([System.Security.AccessControl.FileSystemAccessRule]::new($untrusted, [System.Security.AccessControl.FileSystemRights]::Read, [System.Security.AccessControl.InheritanceFlags]::None, [System.Security.AccessControl.PropagationFlags]::None, [System.Security.AccessControl.AccessControlType]::Allow))',
    'Set-Acl -LiteralPath $args[0] -AclObject $security -ErrorAction Stop',
  ].join('; ');
  execFileSync('powershell.exe', [
    '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', command, path, untrustedSid,
  ], { stdio: 'pipe' });
}
