#!/usr/bin/env tsx
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { hashAuthPassword } from '../apps/server/src/auth/domain/auth-credentials';
import {
  extractSupplierOfferId,
  parseAllowedSupplierUrl,
} from '../apps/server/src/sourcing/domain/supplier-source-url-policy';
import { canonicalSourcingCandidateIdentity } from '../apps/server/src/sourcing/domain/sourcing-candidate-identity';

export const GENERATED_DATABASE_MARKER = 'kiditem_agent_os_clean_cutover';
export const BROWSER_QA_SEED_TARGET_ENV = 'KIDITEM_BROWSER_QA_SEED_TARGET';
export const BROWSER_QA_EMAIL_ENV = 'KIDITEM_BROWSER_QA_EMAIL';

const DEFAULT_DEVELOPMENT_DATABASE_NAMES = new Set([
  'kiditem',
  'kiditem_dev',
  'kiditem_development',
  'kiditem_local',
  'postgres',
]);

const BROWSER_QA_ORGANIZATION = {
  name: 'Browser QA',
  slug: 'browser-qa-agent-os',
  isActive: true,
} as const;

const BROWSER_QA_SUPPLIER = parseAllowedSupplierUrl(
  'https://detail.1688.com/offer/900000000000.html',
);
const BROWSER_QA_EXTERNAL_OFFER_ID = extractSupplierOfferId(BROWSER_QA_SUPPLIER);
if (!BROWSER_QA_EXTERNAL_OFFER_ID) {
  throw new Error('Browser-QA synthetic supplier fixture requires a 1688 offer ID.');
}

const BROWSER_QA_SOURCING_CANDIDATE = {
  sourceUrl: BROWSER_QA_SUPPLIER.normalizedUrl,
  sourcePlatform: 'ALIBABA_1688',
  externalOfferId: BROWSER_QA_EXTERNAL_OFFER_ID,
  sourceIdentityHash: canonicalSourcingCandidateIdentity({
    sourcePlatform: 'ALIBABA_1688',
    sourceUrl: BROWSER_QA_SUPPLIER.normalizedUrl,
    validatedExternalOfferId: BROWSER_QA_EXTERNAL_OFFER_ID,
    variantKeyNormalized: '',
  }),
  variantKeyNormalized: '',
  name: 'Browser QA fixture',
  description: 'Synthetic record for isolated Agent OS browser QA.',
  status: 'sourced',
  isDeleted: false,
} as const;

export type BrowserQaSeedTarget = {
  databaseName: string;
  host: string;
  mappedPort: number;
};

export type BrowserQaSeedPlan = {
  organization: typeof BROWSER_QA_ORGANIZATION;
  user: {
    email: string;
    name: string;
    passwordHash: string;
    role: string;
    type: string;
    isActive: boolean;
  };
  membership: {
    role: string;
    status: string;
  };
  sourcingCandidate: typeof BROWSER_QA_SOURCING_CANDIDATE;
};

export type BrowserQaPasswordInput = {
  isTTY?: boolean;
  setRawMode?: (enabled: boolean) => unknown;
  on: (event: 'data' | 'end' | 'error', listener: (...args: any[]) => void) => unknown;
  removeListener?: (event: 'data' | 'end' | 'error', listener: (...args: any[]) => void) => unknown;
  resume?: () => unknown;
  pause?: () => unknown;
};

export type BrowserQaPasswordOutput = {
  write: (chunk: string) => unknown;
};

export function parseBrowserQaSeedArgs(
  argv: string[],
  environment: NodeJS.ProcessEnv = process.env,
): { email: string } {
  let email = environment[BROWSER_QA_EMAIL_ENV];

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--email') {
      const value = argv[index + 1];
      if (!value || value.startsWith('--')) throw new Error('--email requires a value.');
      email = value;
      index += 1;
      continue;
    }
    if (argument.startsWith('--email=')) {
      email = argument.slice('--email='.length);
      continue;
    }
    if (argument === '--password' || argument.startsWith('--password=')) {
      throw new Error('Browser-QA password is accepted only through interactive stdin.');
    }
    throw new Error(`Unsupported browser-QA seed argument: ${argument}`);
  }

  return { email: normalizeEmail(email ?? '') };
}

export function assertIsolatedBrowserQaSeedTarget({
  databaseUrl,
  seedTarget,
}: {
  databaseUrl: string | undefined;
  seedTarget: string | undefined;
}): BrowserQaSeedTarget & { databaseUrl: string } {
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error('Browser-QA seed requires the clean-cutover injected DATABASE_URL.');
  }
  const expected = parseSeedTarget(seedTarget);
  const parsedUrl = parsePostgresUrl(databaseUrl);
  const actualHost = normalizeHost(parsedUrl.hostname);
  const actualPort = Number(parsedUrl.port || '5432');
  const actualDatabaseName = readDatabaseName(parsedUrl);

  assertNotDefaultDevelopmentDatabaseName(actualDatabaseName);
  assertGeneratedDatabaseName(actualDatabaseName);
  if (isOfficeHost(actualHost)) {
    throw new Error('Refusing Office host for the isolated browser-QA seed.');
  }
  if (actualHost !== expected.host) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: host does not match the clean-cutover target.');
  }
  if (actualPort !== expected.mappedPort) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: port does not match the clean-cutover target.');
  }
  if (actualDatabaseName !== expected.databaseName) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: database does not match the clean-cutover target.');
  }

  return { ...expected, databaseUrl };
}

export async function readBrowserQaPassword(
  input: BrowserQaPasswordInput,
  output: BrowserQaPasswordOutput,
): Promise<string> {
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    throw new Error('Browser-QA password requires interactive stdin.');
  }

  output.write('Browser-QA password: ');
  input.setRawMode(true);
  input.resume?.();

  return new Promise((resolvePromise, rejectPromise) => {
    let received = '';
    let settled = false;

    const cleanup = () => {
      input.removeListener?.('data', onData);
      input.removeListener?.('end', onEnd);
      input.removeListener?.('error', onError);
      input.setRawMode?.(false);
      input.pause?.();
    };
    const settle = (result: { value: string } | { error: Error }) => {
      if (settled) return;
      settled = true;
      cleanup();
      output.write('\n');
      if ('error' in result) rejectPromise(result.error);
      else resolvePromise(result.value);
    };
    const onData = (chunk: unknown) => {
      const value = Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk);
      if (value.includes('\u0003')) {
        settle({ error: new Error('Browser-QA password entry was cancelled.') });
        return;
      }
      received += value;
      const terminator = received.search(/[\r\n]/);
      if (terminator < 0) return;
      const password = received.slice(0, terminator);
      if (password.length === 0) {
        settle({ error: new Error('Browser-QA password must not be empty.') });
        return;
      }
      settle({ value: password });
    };
    const onEnd = () => settle({ error: new Error('Browser-QA password was not provided.') });
    const onError = () => settle({ error: new Error('Browser-QA password could not be read from stdin.') });

    input.on('data', onData);
    input.on('end', onEnd);
    input.on('error', onError);
  });
}

export function createBrowserQaSeedPlan({
  email,
  passwordHash,
}: {
  email: string;
  passwordHash: string;
}): BrowserQaSeedPlan {
  return {
    organization: BROWSER_QA_ORGANIZATION,
    user: {
      email,
      name: 'Browser QA user',
      passwordHash,
      role: 'owner',
      type: 'human',
      isActive: true,
    },
    membership: {
      role: 'owner',
      status: 'active',
    },
    sourcingCandidate: BROWSER_QA_SOURCING_CANDIDATE,
  };
}

export async function runBrowserQaSeed({
  prisma,
  email,
  password,
  hashPassword = hashAuthPassword,
}: {
  prisma: PrismaClient;
  email: string;
  password: string;
  hashPassword?: (value: string) => Promise<string>;
}): Promise<{
  organizationId: string;
  userId: string;
  membershipId: string;
  sourcingCandidateId: string;
}> {
  const passwordHash = await hashPassword(password);
  const plan = createBrowserQaSeedPlan({ email, passwordHash });

  return prisma.$transaction(async (transaction) => {
    const organization = await transaction.organization.upsert({
      where: { slug: plan.organization.slug },
      update: {
        name: plan.organization.name,
        isActive: plan.organization.isActive,
      },
      create: plan.organization,
      select: { id: true },
    });
    const user = await transaction.user.upsert({
      where: { email: plan.user.email },
      update: {
        name: plan.user.name,
        passwordHash: plan.user.passwordHash,
        role: plan.user.role,
        type: plan.user.type,
        isActive: plan.user.isActive,
      },
      create: plan.user,
      select: { id: true },
    });
    const membership = await transaction.organizationMembership.upsert({
      where: {
        organizationId_userId: {
          organizationId: organization.id,
          userId: user.id,
        },
      },
      update: plan.membership,
      create: {
        organizationId: organization.id,
        userId: user.id,
        ...plan.membership,
      },
      select: { id: true },
    });
    const existingCandidate = await transaction.sourcingCandidate.findFirst({
      where: {
        organizationId: organization.id,
        sourceUrl: plan.sourcingCandidate.sourceUrl,
        sourcePlatform: plan.sourcingCandidate.sourcePlatform,
        sourceIdentityHash: plan.sourcingCandidate.sourceIdentityHash,
        isDeleted: false,
      },
      select: { id: true },
    });
    const sourcingCandidate = existingCandidate ?? await transaction.sourcingCandidate.create({
      data: {
        organizationId: organization.id,
        triggeredByUserId: user.id,
        ...plan.sourcingCandidate,
      },
      select: { id: true },
    });

    return {
      organizationId: organization.id,
      userId: user.id,
      membershipId: membership.id,
      sourcingCandidateId: sourcingCandidate.id,
    };
  });
}

export async function main({
  argv = process.argv.slice(2),
  environment = process.env,
  input = process.stdin,
  output = process.stderr,
}: {
  argv?: string[];
  environment?: NodeJS.ProcessEnv;
  input?: BrowserQaPasswordInput;
  output?: BrowserQaPasswordOutput;
} = {}): Promise<void> {
  const target = assertIsolatedBrowserQaSeedTarget({
    databaseUrl: environment.DATABASE_URL,
    seedTarget: environment[BROWSER_QA_SEED_TARGET_ENV],
  });
  const { email } = parseBrowserQaSeedArgs(argv, environment);
  const password = await readBrowserQaPassword(input, output);
  const adapter = new PrismaPg({ connectionString: target.databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    await runBrowserQaSeed({ prisma, email, password });
    process.stdout.write('Isolated browser-QA fixture seeded.\n');
  } finally {
    await prisma.$disconnect();
  }
}

function parseSeedTarget(value: string | undefined): BrowserQaSeedTarget {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error('Browser-QA seed requires the isolated clean-cutover target context.');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error('Browser-QA seed requires a valid isolated clean-cutover target context.');
  }
  if (!isRecord(parsed)
    || Object.keys(parsed).length !== 3
    || typeof parsed.databaseName !== 'string'
    || typeof parsed.host !== 'string'
    || typeof parsed.mappedPort !== 'number') {
    throw new Error('Browser-QA seed requires a valid isolated clean-cutover target context.');
  }

  const target = {
    databaseName: parsed.databaseName,
    host: normalizeHost(parsed.host),
    mappedPort: normalizeMappedPort(parsed.mappedPort),
  };
  assertNotDefaultDevelopmentDatabaseName(target.databaseName);
  assertGeneratedDatabaseName(target.databaseName);
  if (isOfficeHost(target.host)) {
    throw new Error('Refusing Office host for the isolated browser-QA seed.');
  }
  return target;
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error('Browser-QA email must be a valid email address.');
  }
  return email;
}

function parsePostgresUrl(databaseUrl: string): URL {
  let parsedUrl: URL;
  try {
    parsedUrl = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  if (parsedUrl.protocol !== 'postgresql:' && parsedUrl.protocol !== 'postgres:') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: a PostgreSQL URL is required.');
  }
  return parsedUrl;
}

function normalizeHost(host: string): string {
  if (host.trim() === '') {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: host is required.');
  }
  return host.trim().replace(/^\[|\]$/g, '').toLowerCase();
}

function normalizeMappedPort(mappedPort: number): number {
  if (!Number.isInteger(mappedPort) || mappedPort < 1 || mappedPort > 65535) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: mapped port is required.');
  }
  return mappedPort;
}

function readDatabaseName(parsedUrl: URL): string {
  const databaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\/+/, ''));
  if (!databaseName || databaseName.includes('/')) {
    throw new Error('Refusing non-Testcontainer DATABASE_URL: exactly one database name is required.');
  }
  return databaseName;
}

function assertNotDefaultDevelopmentDatabaseName(databaseName: string): void {
  if (DEFAULT_DEVELOPMENT_DATABASE_NAMES.has(databaseName.toLowerCase())) {
    throw new Error('Refusing default development database name for the isolated browser-QA seed.');
  }
}

function assertGeneratedDatabaseName(databaseName: string): void {
  const pattern = new RegExp(`^${GENERATED_DATABASE_MARKER}_[a-f0-9]{16}$`);
  if (!pattern.test(databaseName)) {
    throw new Error('Refusing database without the clean-cutover generated marker.');
  }
}

function isOfficeHost(host: string): boolean {
  return /(^|[.-])office([.-]|$)|kiditem.*office|office.*kiditem/i.test(host);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
