#!/usr/bin/env tsx
import 'dotenv/config';

import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const LOCAL_HOSTS = new Set(['localhost', '127.0.0.1', '::1', '[::1]']);
const FORBIDDEN_DATABASE_NAME = /(prod|production|staging)/i;

export type BootstrapAuthoritativeInventoryArgs = {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  coupangAccountId?: string;
  rocketAccountId?: string;
};

export type BootstrapAuthoritativeInventoryPlan = {
  organization: {
    id: string;
    name: string;
    slug: string;
    isActive: true;
  };
  channelAccounts: Array<{
    id?: string;
    organizationId: string;
    channel: 'coupang' | 'rocket';
    name: string;
    externalAccountId: 'dev-wing' | 'dev-rocket';
    status: 'active';
    isPrimary: true;
  }>;
};

export function assertLocalDevelopmentDatabase(databaseUrl: string): URL {
  let url: URL;
  try {
    url = new URL(databaseUrl);
  } catch {
    throw new Error('Refusing non-local database: DATABASE_URL is invalid');
  }

  const databaseName = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (!LOCAL_HOSTS.has(url.hostname) || FORBIDDEN_DATABASE_NAME.test(databaseName)) {
    throw new Error('Refusing non-local development database');
  }
  if (!databaseName) {
    throw new Error('Refusing non-local database: database name is missing');
  }
  return url;
}

export function parseBootstrapArgs(argv: string[]): BootstrapAuthoritativeInventoryArgs {
  const value = (name: string): string | undefined => {
    const index = argv.indexOf(`--${name}`);
    return index >= 0 ? argv[index + 1] : undefined;
  };
  const organizationId = value('organization-id');
  const organizationName = value('organization-name');
  if (!organizationId) throw new Error('--organization-id is required');
  if (!UUID_PATTERN.test(organizationId)) throw new Error('--organization-id must be a UUID');
  if (!organizationName?.trim()) throw new Error('--organization-name is required');

  const coupangAccountId = optionalUuid(value('coupang-account-id'), '--coupang-account-id');
  const rocketAccountId = optionalUuid(value('rocket-account-id'), '--rocket-account-id');
  return {
    organizationId,
    organizationName: organizationName.trim(),
    organizationSlug: value('organization-slug')?.trim() || slugify(organizationName),
    ...(coupangAccountId ? { coupangAccountId } : {}),
    ...(rocketAccountId ? { rocketAccountId } : {}),
  };
}

export function buildBootstrapPlan(
  args: BootstrapAuthoritativeInventoryArgs,
): BootstrapAuthoritativeInventoryPlan {
  const account = (
    channel: 'coupang' | 'rocket',
    name: string,
    externalAccountId: 'dev-wing' | 'dev-rocket',
    id?: string,
  ) => ({
    ...(id ? { id } : {}),
    organizationId: args.organizationId,
    channel,
    name,
    externalAccountId,
    status: 'active' as const,
    isPrimary: true as const,
  });

  return {
    organization: {
      id: args.organizationId,
      name: args.organizationName,
      slug: args.organizationSlug,
      isActive: true,
    },
    channelAccounts: [
      account('coupang', 'Coupang Wing', 'dev-wing', args.coupangAccountId),
      account('rocket', 'Coupang Rocket', 'dev-rocket', args.rocketAccountId),
    ],
  };
}

export async function bootstrapAuthoritativeInventoryDevelopment(
  prisma: PrismaClient,
  plan: BootstrapAuthoritativeInventoryPlan,
): Promise<void> {
  await prisma.$transaction(async (tx) => {
    await tx.organization.upsert({
      where: { id: plan.organization.id },
      update: {
        name: plan.organization.name,
        slug: plan.organization.slug,
        isActive: true,
      },
      create: plan.organization,
    });

    for (const account of plan.channelAccounts) {
      const where = account.id
        ? { id: account.id }
        : {
            organizationId_channel_externalAccountId: {
              organizationId: account.organizationId,
              channel: account.channel,
              externalAccountId: account.externalAccountId,
            },
          };
      const data = {
        organizationId: account.organizationId,
        channel: account.channel,
        name: account.name,
        externalAccountId: account.externalAccountId,
        status: account.status,
        isPrimary: account.isPrimary,
      };
      await tx.channelAccount.upsert({
        where,
        update: data,
        create: { ...(account.id ? { id: account.id } : {}), ...data },
      });
    }
  });
}

function optionalUuid(value: string | undefined, label: string): string | undefined {
  if (!value) return undefined;
  if (!UUID_PATTERN.test(value)) throw new Error(`${label} must be a UUID`);
  return value;
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'kiditem-dev';
}

async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');
  const target = assertLocalDevelopmentDatabase(databaseUrl);
  const args = parseBootstrapArgs(process.argv.slice(2));
  const adapter = new PrismaPg({ connectionString: databaseUrl });
  const prisma = new PrismaClient({ adapter });
  try {
    await bootstrapAuthoritativeInventoryDevelopment(prisma, buildBootstrapPlan(args));
    console.log(
      `bootstrapped authoritative inventory dev metadata: ${target.hostname}/${target.pathname.slice(1)}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
