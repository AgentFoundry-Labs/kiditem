import type { ChildProcess } from 'node:child_process';

export async function stopTrackedChild(child: ChildProcess, graceMs = 5_000): Promise<void> {
  if (child.exitCode !== null) return;
  await new Promise<void>((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', finish);
    const timer = setTimeout(() => {
      if (child.exitCode === null) child.kill('SIGKILL');
    }, graceMs);
    child.kill('SIGTERM');
  });
}
