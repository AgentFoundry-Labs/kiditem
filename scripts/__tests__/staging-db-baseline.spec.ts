import { describe, expect, it } from 'vitest';
import {
  PUBLIC_SCHEMA_GRANTS_SQL,
  PUBLIC_SCHEMA_RESET_SQL,
  STAGING_DB_BASELINE_SCHEMA_VERSION,
  assertRestoreConfirmation,
  assertSanitizedExportAcknowledged,
  baselineObjectKeys,
  buildChecksumsFile,
  isDefinitelyProductionDatabaseUrl,
  parseChecksumsFile,
  safeProfileId,
  validateBaselineManifest,
} from '../staging-db-baseline';

describe('staging-db-baseline manifest helpers', () => {
  it('requires pinned immutable profile ids', () => {
    expect(safeProfileId('staging-smoke-2026-05-10-v1')).toBe('staging-smoke-2026-05-10-v1');

    expect(() => safeProfileId('latest')).toThrow(/pinned profileId/i);
    expect(() => safeProfileId('../staging-smoke')).toThrow(/unsafe profileId/i);
    expect(() => safeProfileId('staging smoke')).toThrow(/unsafe profileId/i);
  });

  it('builds Supabase Storage object keys without exposing a mutable latest path', () => {
    expect(baselineObjectKeys('staging-smoke-2026-05-10-v1')).toEqual({
      dump: 'staging-db-baselines/staging-smoke-2026-05-10-v1/public.dump.pgcustom',
      manifest: 'staging-db-baselines/staging-smoke-2026-05-10-v1/manifest.json',
      checksums: 'staging-db-baselines/staging-smoke-2026-05-10-v1/checksums.sha256',
    });

    expect(baselineObjectKeys('staging-smoke-2026-05-10-v1', 'custom-prefix/')).toEqual({
      dump: 'custom-prefix/staging-smoke-2026-05-10-v1/public.dump.pgcustom',
      manifest: 'custom-prefix/staging-smoke-2026-05-10-v1/manifest.json',
      checksums: 'custom-prefix/staging-smoke-2026-05-10-v1/checksums.sha256',
    });
  });

  it('round-trips checksum files and validates manifest consistency', () => {
    const checksums = {
      'staging-db-baselines/staging-smoke-2026-05-10-v1/public.dump.pgcustom': 'a'.repeat(64),
      'staging-db-baselines/staging-smoke-2026-05-10-v1/manifest.json': 'b'.repeat(64),
    };

    const checksumFile = buildChecksumsFile(checksums);
    expect(parseChecksumsFile(checksumFile)).toEqual(checksums);

    const manifest = {
      schemaVersion: STAGING_DB_BASELINE_SCHEMA_VERSION,
      environment: 'staging',
      profileId: 'staging-smoke-2026-05-10-v1',
      schemaGitSha: 'abc123',
      prismaSchemaHash: 'c'.repeat(64),
      createdAt: '2026-05-10T00:00:00.000Z',
      sanitized: true,
      dump: {
        path: 'staging-db-baselines/staging-smoke-2026-05-10-v1/public.dump.pgcustom',
        sha256: 'a'.repeat(64),
        bytes: 123,
        format: 'pgcustom',
      },
      rowCounts: { organizations: 1 },
      excludedSchemas: ['auth', 'storage'],
      notes: 'public schema only',
    };

    expect(validateBaselineManifest(manifest)).toEqual(manifest);
    expect(validateBaselineManifest(manifest, {
      profileId: 'staging-smoke-2026-05-10-v1',
      dumpPath: 'staging-db-baselines/staging-smoke-2026-05-10-v1/public.dump.pgcustom',
    })).toEqual(manifest);
    expect(() =>
      validateBaselineManifest({
        ...manifest,
        dump: { ...manifest.dump, sha256: 'bad' },
      }),
    ).toThrow(/dump.sha256/i);
    expect(() =>
      validateBaselineManifest({
        ...manifest,
        dump: { ...manifest.dump, path: 'staging-db-baselines/other-profile/public.dump.pgcustom' },
      }),
    ).toThrow(/profileId/i);
    expect(() =>
      validateBaselineManifest(manifest, { profileId: 'other-profile' }),
    ).toThrow(/profileId/i);
    expect(() =>
      validateBaselineManifest(manifest, { dumpPath: 'staging-db-baselines/other-profile/public.dump.pgcustom' }),
    ).toThrow(/dump.path/i);
  });

  it('protects restore with explicit confirmation and production-url guardrails', () => {
    expect(() => assertRestoreConfirmation(undefined)).toThrow(/RESET_STAGING_DB/);
    expect(() => assertRestoreConfirmation('RESET_STAGING_DB')).not.toThrow();
    expect(() => assertSanitizedExportAcknowledged(undefined)).toThrow(/sanitized/i);
    expect(() => assertSanitizedExportAcknowledged('false')).toThrow(/sanitized/i);
    expect(() => assertSanitizedExportAcknowledged('true')).not.toThrow();

    expect(isDefinitelyProductionDatabaseUrl('postgresql://user:pass@prod-db.example.com/app')).toBe(true);
    expect(isDefinitelyProductionDatabaseUrl('postgresql://user:prod-secret@staging-db.example.com/app')).toBe(false);
    expect(isDefinitelyProductionDatabaseUrl('postgresql://user:pass@staging-db.example.com/app')).toBe(false);
  });

  it('defines an exact public schema reset before restore', () => {
    expect(PUBLIC_SCHEMA_RESET_SQL).toContain('DROP SCHEMA IF EXISTS public CASCADE');
    expect(PUBLIC_SCHEMA_RESET_SQL).toContain('CREATE SCHEMA public');
    expect(PUBLIC_SCHEMA_GRANTS_SQL).toContain('GRANT USAGE ON SCHEMA public TO anon');
    expect(PUBLIC_SCHEMA_GRANTS_SQL).toContain('GRANT USAGE ON SCHEMA public TO authenticated');
    expect(PUBLIC_SCHEMA_GRANTS_SQL).toContain('GRANT ALL ON SCHEMA public TO service_role');
  });
});
