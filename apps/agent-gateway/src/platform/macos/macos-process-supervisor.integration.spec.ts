import { afterEach, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { MacosProcessSupervisor } from './macos-process-supervisor';
import { startProcessTreeWatchdog } from './process-tree-watchdog';

const enabled = process.env.KIDITEM_RUNNER_REAL_PROCESS_TEST === '1' && process.platform === 'darwin';
const testIf = enabled ? it : it.skip;
const roots: string[] = [];
afterEach(async () => { await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))); });

describe('MacosProcessSupervisor real fixture process tree', () => {
  testIf('keeps the EOF watchdog alive through SIGKILL escalation for an SIGTERM-ignoring descendant', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-watchdog-eof-tree-')); roots.push(root);
    const fixture = join(root, 'fixture.cjs'); const pids = join(root, 'pids.json');
    await writeFile(fixture, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});process.stdout.write("ready");setInterval(()=>{},1000)'],{stdio:['ignore','pipe','ignore']}); child.stdout.once('data',()=>fs.writeFileSync(process.argv[2], JSON.stringify({parent:process.pid,child:child.pid}))); setInterval(()=>{},1000);`);
    const fixtureProcess = spawn(process.execPath, [fixture, pids], {
      cwd: root,
      detached: true,
      env: { PATH: process.env.PATH ?? '' },
      stdio: 'ignore',
    });
    if (!fixtureProcess.pid) { fixtureProcess.kill(); throw new Error('fixture_process_pid_missing'); }
    fixtureProcess.unref();
    const watchdog = startProcessTreeWatchdog(fixtureProcess.pid);
    try {
      await waitFor(async () => { try { await readFile(pids, 'utf8'); return true; } catch { return false; } });
      const ids = JSON.parse(await readFile(pids, 'utf8')) as { parent: number; child: number };

      watchdog.close();

      await waitFor(() => !alive(ids.parent) && !alive(ids.child), 4_000);
      expect(alive(ids.parent)).toBe(false);
      expect(alive(ids.child)).toBe(false);
    } finally {
      killGroup(fixtureProcess.pid);
    }
  }, 10_000);

  testIf('kills the detached fixture parent and descendant when the watchdog control pipe closes', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-tree-')); roots.push(root);
    const fixture = join(root, 'fixture.cjs'); const pids = join(root, 'pids.json');
    await writeFile(fixture, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(process.argv[2], JSON.stringify({parent:process.pid,child:child.pid})); setInterval(()=>{},1000);`);
    const supervisor = new MacosProcessSupervisor();
    const running = await supervisor.launch({ executable: process.execPath, args: [fixture, pids], cwd: root, env: { PATH: process.env.PATH ?? '' } });
    await waitFor(async () => { try { await readFile(pids, 'utf8'); return true; } catch { return false; } });
    const ids = JSON.parse(await readFile(pids, 'utf8')) as { parent: number; child: number };
    await running.simulateGatewayAbruptExitForTest();
    await waitFor(() => !alive(ids.parent) && !alive(ids.child), 4_000);
    expect(alive(ids.parent)).toBe(false); expect(alive(ids.child)).toBe(false);
  }, 10_000);

  testIf('waits for an SIGTERM-ignoring descendant to leave the full process group before terminate resolves', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-term-tree-')); roots.push(root);
    const fixture = join(root, 'fixture.cjs'); const pids = join(root, 'pids.json');
    await writeFile(fixture, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(process.argv[2], JSON.stringify({parent:process.pid,child:child.pid})); process.on('SIGTERM',()=>process.exit(0)); setInterval(()=>{},1000);`);
    const supervisor = new MacosProcessSupervisor();
    const running = await supervisor.launch({ executable: process.execPath, args: [fixture, pids], cwd: root, env: { PATH: process.env.PATH ?? '' } });
    await waitFor(async () => { try { await readFile(pids, 'utf8'); return true; } catch { return false; } });
    const ids = JSON.parse(await readFile(pids, 'utf8')) as { parent: number; child: number };

    await running.terminate();

    expect(alive(ids.parent)).toBe(false);
    expect(alive(ids.child)).toBe(false);
  }, 10_000);

  testIf('does not release natural parent exit until an SIGTERM-ignoring descendant is gone', async () => {
    const root = await mkdtemp(join(tmpdir(), 'kiditem-runner-natural-tree-')); roots.push(root);
    const fixture = join(root, 'fixture.cjs'); const pids = join(root, 'pids.json');
    await writeFile(fixture, `const {spawn}=require('node:child_process'); const fs=require('node:fs'); const child=spawn(process.execPath,['-e','process.on("SIGTERM",()=>{});setInterval(()=>{},1000)'],{stdio:'ignore'}); fs.writeFileSync(process.argv[2], JSON.stringify({parent:process.pid,child:child.pid})); setTimeout(()=>process.exit(0),100);`);
    const supervisor = new MacosProcessSupervisor(); let exits = 0;
    await supervisor.launch({ executable: process.execPath, args: [fixture, pids], cwd: root, env: { PATH: process.env.PATH ?? '' } }, { onExit: () => { exits += 1; } });
    await waitFor(async () => { try { await readFile(pids, 'utf8'); return true; } catch { return false; } });
    const ids = JSON.parse(await readFile(pids, 'utf8')) as { parent: number; child: number };
    await waitFor(() => !alive(ids.parent));

    expect(alive(ids.child)).toBe(true);
    expect(exits).toBe(0);
    await waitFor(() => exits === 1, 4_000);
    expect(alive(ids.child)).toBe(false);
  }, 10_000);
});
function alive(pid: number): boolean { try { process.kill(pid, 0); return true; } catch { return false; } }
function killGroup(processGroupId: number): void { try { process.kill(-processGroupId, 'SIGKILL'); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error; } }
async function waitFor(check: () => boolean | Promise<boolean>, timeout = 2_000): Promise<void> { const end = Date.now() + timeout; while (!(await check())) { if (Date.now() > end) throw new Error('fixture_timeout'); await new Promise((resolve) => setTimeout(resolve, 25)); } }
