import { spawn, type ChildProcess } from 'node:child_process';

export type ProcessTreeWatchdog = Readonly<{ close(): void }>;

/** A detached, pipe-only guardian: Runner EOF kills the exact provider process group. */
export function startProcessTreeWatchdog(processGroupId: number): ProcessTreeWatchdog {
  if (!Number.isSafeInteger(processGroupId) || processGroupId <= 0) throw new Error('watchdog_process_group_invalid');
  const source = [
    'const pgid=Number(process.argv[1]);',
    'let done=false;',
    'function kill(signal){try{process.kill(-pgid,signal)}catch(error){if(error&&error.code!=="ESRCH")process.exitCode=1}}',
    'function finish(){if(done)return;done=true;kill("SIGTERM");setTimeout(()=>{kill("SIGKILL");process.exit(0)},1000).unref()}',
    'process.stdin.resume();process.stdin.once("end",finish);process.stdin.once("error",finish);',
  ].join('');
  const child = spawn(process.execPath, ['-e', source, String(processGroupId)], {
    detached: true,
    stdio: ['pipe', 'ignore', 'ignore'],
    windowsHide: true,
  }) as ChildProcess;
  const stdin = child.stdin;
  if (!stdin) { child.kill(); throw new Error('watchdog_pipe_missing'); }
  child.unref();
  return Object.freeze({ close: () => { if (!stdin.destroyed) stdin.end(); } });
}
