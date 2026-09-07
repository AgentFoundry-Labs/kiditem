import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const APPLY_SCHEMA_DATA_CONFIRMATION = 'APPLY_SCHEMA_DATA';

export function parseOfficeDeployArgs(argv) {
  const [operation = 'help', ...rest] = argv;
  if (!['deploy', 'status', 'rollback'].includes(operation)) {
    throw new Error('Expected deploy, status, or rollback operation.');
  }

  const parsed = {
    operation,
    sourceRef: undefined,
    schemaDataCutover: false,
    confirmation: undefined,
    pruneBuildCache: false,
  };
  for (let index = 0; index < rest.length; index += 1) {
    const token = rest[index];
    if (token === '--ref') {
      parsed.sourceRef = rest[++index];
    } else if (token === '--cutover') {
      parsed.schemaDataCutover = true;
    } else if (token === '--confirm') {
      parsed.confirmation = rest[++index];
    } else if (token === '--prune-build-cache') {
      parsed.pruneBuildCache = true;
    } else {
      throw new Error(`Unsupported Office deployment argument: ${token}`);
    }
  }

  if (operation === 'deploy') {
    if (!parsed.sourceRef) {
      throw new Error('deploy requires --ref origin/<branch>.');
    }
    if (!/^origin\/[A-Za-z0-9][A-Za-z0-9._/-]*$/.test(parsed.sourceRef)
      || parsed.sourceRef.includes('..')
      || parsed.sourceRef.endsWith('/')) {
      throw new Error('Office source ref must be a safe origin/<branch> remote ref.');
    }
    if (parsed.schemaDataCutover && parsed.confirmation !== APPLY_SCHEMA_DATA_CONFIRMATION) {
      throw new Error(`--cutover requires --confirm ${APPLY_SCHEMA_DATA_CONFIRMATION}.`);
    }
    if (!parsed.schemaDataCutover && parsed.confirmation !== undefined) {
      throw new Error('--confirm is valid only with --cutover.');
    }
  } else if (rest.length > 0) {
    throw new Error(`${operation} does not accept deployment arguments.`);
  }

  return parsed;
}

function checkedRepoRoot() {
  const result = spawnSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf8',
    windowsHide: true,
  });
  if (result.status !== 0) {
    throw new Error('Run the Office command from a KidItem Git checkout.');
  }
  return result.stdout.trim();
}

export function powershellArgs(parsed, repoRoot) {
  const scriptRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const deploymentScript = resolve(scriptRoot, 'deploy', 'office', 'apply-deployment.ps1');
  const operation = parsed.operation[0].toUpperCase() + parsed.operation.slice(1);
  const args = [
    '-NoProfile',
    '-ExecutionPolicy', 'Bypass',
    '-File', deploymentScript,
    '-Operation', operation,
    '-InvokerRepoRoot', repoRoot,
  ];
  if (parsed.sourceRef) args.push('-SourceRef', parsed.sourceRef);
  if (parsed.schemaDataCutover) {
    args.push('-SchemaDataCutover', '-CutoverConfirmation', parsed.confirmation);
  }
  if (parsed.pruneBuildCache) args.push('-PruneBuildCache');
  return args;
}

function printHelp() {
  console.log(`Usage:
  npm run deploy:office:local -- --ref origin/release/office
  npm run deploy:office:local -- --ref origin/release/office --cutover --confirm ${APPLY_SCHEMA_DATA_CONFIRMATION}
  npm run deploy:office:status
  npm run deploy:office:rollback`);
}

export function main(argv = process.argv.slice(2)) {
  if (argv.length === 0 || argv[0] === 'help' || argv[0] === '--help') {
    printHelp();
    return;
  }
  if (process.platform !== 'win32') {
    throw new Error('Office deployment is supported only from the Windows Office host.');
  }
  const parsed = parseOfficeDeployArgs(argv);
  const repoRoot = checkedRepoRoot();
  const result = spawnSync('powershell.exe', powershellArgs(parsed, repoRoot), {
    cwd: repoRoot,
    stdio: 'inherit',
    windowsHide: false,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}
