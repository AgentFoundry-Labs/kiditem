#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient, type Prisma } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { hashAuthPassword } from '../apps/server/src/auth/domain/auth-credentials';
import { assertLocalDevelopmentDatabase } from './_shared/local-development-database';
import { ensureAbsoluteProductAbcFormulaForOrganization } from './data-migrations/ensure/absolute-product-abc-formula';

export type LocalAuthBootstrapArgs = Readonly<{
  email: string;
  name: string;
  organizationName: string;
  organizationSlug: string;
}>;

export type LocalAuthBootstrapPlan = Readonly<{
  organization: { name: string; slug: string; isActive: true };
  user: {
    email: string;
    name: string;
    passwordHash: string;
    role: 'admin';
    type: 'human';
    isActive: true;
  };
  membership: { role: 'admin'; status: 'active'; lastSelectedAt: Date };
}>;

type LocalAuthTransaction = {
  organization: { upsert(input: unknown): Promise<{ id: string }> };
  user: { upsert(input: unknown): Promise<{ id: string }> };
  organizationMembership: { upsert(input: unknown): Promise<unknown> };
  authSession: { updateMany(input: unknown): Promise<unknown> };
};

type LocalAuthPrisma = {
  $transaction<T>(callback: (tx: LocalAuthTransaction) => Promise<T>): Promise<T>;
};

/** Initializes an organization inside the bootstrap transaction. */
export type LocalAuthOrganizationInitializer = (
  tx: LocalAuthTransaction,
  organizationId: string,
) => Promise<unknown>;

// main() passes a real PrismaClient, so the transaction is a full
// Prisma.TransactionClient; LocalAuthTransaction only narrows it for tests.
const installCurrentAbcFormula: LocalAuthOrganizationInitializer = (tx, organizationId) =>
  ensureAbsoluteProductAbcFormulaForOrganization(
    tx as unknown as Prisma.TransactionClient,
    organizationId,
  );

export function parseLocalAuthBootstrapArgs(argv: readonly string[]): LocalAuthBootstrapArgs {
  if (argv.includes('--password')) throw new Error('password argv values are forbidden');
  const allowed = new Set([
    '--email', '--name', '--organization-name', '--organization-slug', '--password-stdin',
  ]);
  for (const value of argv) {
    if (value.startsWith('--') && !allowed.has(value)) throw new Error(`unknown option: ${value}`);
  }
  if (!argv.includes('--password-stdin')) throw new Error('--password-stdin is required');
  const email = requiredOption(argv, '--email').trim().toLowerCase();
  const name = requiredOption(argv, '--name').trim();
  const organizationName = requiredOption(argv, '--organization-name').trim();
  const requestedSlug = optionalOption(argv, '--organization-slug')?.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('--email is invalid');
  if (!name) throw new Error('--name is required');
  if (!organizationName) throw new Error('--organization-name is required');
  const organizationSlug = requestedSlug || slugify(organizationName);
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(organizationSlug)) {
    throw new Error('--organization-slug is invalid');
  }
  return { email, name, organizationName, organizationSlug };
}

export function readSinglePasswordLine(source: string): string {
  const password = source.replace(/\r?\n$/, '');
  if (!password || /[\r\n]/.test(password)) {
    throw new Error('password stdin must contain exactly one non-empty line');
  }
  return password;
}

export function buildLocalAuthBootstrapPlan(
  args: LocalAuthBootstrapArgs,
  passwordHash: string,
  now = new Date(),
): LocalAuthBootstrapPlan {
  return {
    organization: {
      name: args.organizationName,
      slug: args.organizationSlug,
      isActive: true,
    },
    user: {
      email: args.email,
      name: args.name,
      passwordHash,
      role: 'admin',
      type: 'human',
      isActive: true,
    },
    membership: {
      role: 'admin',
      status: 'active',
      lastSelectedAt: now,
    },
  };
}

export async function bootstrapLocalAuthUser(
  prisma: LocalAuthPrisma,
  plan: LocalAuthBootstrapPlan,
  initializeOrganization: LocalAuthOrganizationInitializer = installCurrentAbcFormula,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    const organization = await tx.organization.upsert({
      where: { slug: plan.organization.slug },
      update: { name: plan.organization.name, isActive: true },
      create: plan.organization,
      select: { id: true },
    });
    const user = await tx.user.upsert({
      where: { email: plan.user.email },
      update: {
        name: plan.user.name,
        passwordHash: plan.user.passwordHash,
        role: plan.user.role,
        type: plan.user.type,
        isActive: true,
      },
      create: plan.user,
      select: { id: true },
    });
    await tx.organizationMembership.upsert({
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
    });
    await initializeOrganization(tx, organization.id);
    await tx.authSession.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: plan.membership.lastSelectedAt },
    });
  });
}

function requiredOption(argv: readonly string[], name: string): string {
  const value = optionalOption(argv, name);
  if (!value || value.startsWith('--')) throw new Error(`${name} is required`);
  return value;
}

function optionalOption(argv: readonly string[], name: string): string | undefined {
  const index = argv.indexOf(name);
  return index >= 0 ? argv[index + 1] : undefined;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  if (!slug) throw new Error('--organization-name cannot produce a slug');
  return slug;
}

async function readProcessStdin(): Promise<string> {
  if (process.stdin.isTTY) throw new Error('--password-stdin requires redirected stdin');
  const chunks: Buffer[] = [];
  for await (const chunk of process.stdin) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  assertLocalDevelopmentDatabase(databaseUrl);
  const args = parseLocalAuthBootstrapArgs(process.argv.slice(2));
  const password = readSinglePasswordLine(await readProcessStdin());
  const passwordHash = await hashAuthPassword(password);
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    await prisma.$connect();
    await bootstrapLocalAuthUser(
      prisma as unknown as LocalAuthPrisma,
      buildLocalAuthBootstrapPlan(args, passwordHash),
    );
    process.stdout.write(`local login identity ready: ${args.email} (${args.organizationSlug})\n`);
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
    process.exitCode = 1;
  });
}
