import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const serverRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const venvDir = join(serverRoot, '.venv');
const pythonBin = process.platform === 'win32'
  ? join(venvDir, 'Scripts', 'python.exe')
  : join(venvDir, 'bin', 'python');
const requirements = join(
  serverRoot,
  'src',
  'orders',
  'coupang-directship',
  'requirements.txt',
);

if (!existsSync(pythonBin)) {
  run('python3', ['-m', 'venv', venvDir], 'Python 가상환경 생성');
}

if (!hasWorkbookDependencies()) {
  run(
    pythonBin,
    ['-m', 'pip', 'install', '--disable-pip-version-check', '-r', requirements],
    '쿠팡직배송 Python 패키지 설치',
  );
}

if (!hasWorkbookDependencies()) {
  throw new Error('쿠팡직배송 Python 패키지를 확인할 수 없습니다.');
}

function hasWorkbookDependencies() {
  return spawnSync(
    pythonBin,
    ['-c', 'import xlrd, xlwt, xlutils'],
    { stdio: 'ignore' },
  ).status === 0;
}

function run(command, args, label) {
  process.stdout.write(`[server] ${label} 중...\n`);
  const result = spawnSync(command, args, {
    cwd: serverRoot,
    env: process.env,
    stdio: 'inherit',
  });
  if (result.status !== 0) {
    throw new Error(`${label}에 실패했습니다.`);
  }
}
