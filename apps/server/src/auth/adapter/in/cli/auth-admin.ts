import { resolve } from 'node:path';
import { config } from 'dotenv';
import { AuthService } from '../../../application/auth.service';
import { PrismaAuthRepository } from '../../out/prisma/prisma-auth.repository';
import { PrismaService } from '../../../../prisma/prisma.service';

interface AuthAdministration {
  setPassword(email: string, password: string): Promise<void>;
  revokeAllSessions(email: string): Promise<void>;
}

export interface AuthAdminRuntime {
  argv: string[];
  readStdin: () => Promise<string>;
  write: (text: string) => void;
  service: AuthAdministration;
}

export async function runAuthAdmin(runtime: AuthAdminRuntime): Promise<void> {
  const [command] = runtime.argv;
  const email = requiredOption(runtime.argv, '--email');

  if (command === 'set-password') {
    if (!runtime.argv.includes('--password-stdin') || runtime.argv.includes('--password')) {
      throw new Error('set-password requires --password-stdin; password argv values are forbidden');
    }
    rejectUnknownOptions(runtime.argv, ['--email', '--password-stdin']);
    const password = stripOneTrailingNewline(await runtime.readStdin());
    if (!password || /[\r\n]/.test(password)) {
      throw new Error('password stdin must contain exactly one non-empty line');
    }
    await runtime.service.setPassword(email, password);
    runtime.write('password updated; all sessions revoked\n');
    return;
  }

  if (command === 'revoke-sessions') {
    rejectUnknownOptions(runtime.argv, ['--email']);
    await runtime.service.revokeAllSessions(email);
    runtime.write('all sessions revoked\n');
    return;
  }

  throw new Error(
    'usage: auth-admin <set-password --email EMAIL --password-stdin | revoke-sessions --email EMAIL>',
  );
}

function requiredOption(argv: string[], name: string): string {
  const index = argv.indexOf(name);
  const value = index >= 0 ? argv[index + 1] : undefined;
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

function rejectUnknownOptions(argv: string[], allowed: string[]): void {
  for (const value of argv.slice(1)) {
    if (value.startsWith('--') && !allowed.includes(value)) {
      throw new Error(`unknown or forbidden option: ${value}`);
    }
  }
}

function stripOneTrailingNewline(value: string): string {
  return value.replace(/\r?\n$/, '');
}

async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) {
    throw new Error('--password-stdin requires a redirected or piped stdin stream');
  }
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  config({ path: resolve(__dirname, '..', '..', '..', '..', '..', '.env') });
  config({ path: resolve(__dirname, '..', '..', '..', '..', '..', '..', '..', '.env') });
  const prisma = new PrismaService();
  await prisma.$connect();
  try {
    const service = new AuthService(new PrismaAuthRepository(prisma));
    await runAuthAdmin({
      argv: process.argv.slice(2),
      readStdin: readProcessStdin,
      write: (text) => process.stdout.write(text),
      service,
    });
  } finally {
    await prisma.$disconnect();
  }
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
