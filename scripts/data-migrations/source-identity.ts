import { createHash } from 'node:crypto';

/**
 * Identity of the source file a data migration runs from.
 *
 * A migration id `v<release>:<NNN>_<name>` lives at
 * `scripts/data-migrations/v<release>/<NNN>_<name>.ts`, the rule the release
 * contract guard enforces. The runner records the hash of that file in
 * `data_migration_runs.details._runner`, so a ledger row can later be compared
 * with the file the checkout holds now.
 */

export const MIGRATION_ID_PATTERN =
  /^v(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?):(\d{3}_[a-z0-9_]+)$/;

/** Top-level `details` key reserved for the runner's record of the source it ran. */
export const RUNNER_DETAILS_KEY = '_runner';

/** SHA-256 of the file bytes after each CRLF becomes LF. */
export const SOURCE_HASH_ALGORITHM = 'sha256-lf';

export type RunnerSourceIdentity = {
  sourcePath: string;
  sourceSha256: string;
  hashAlgorithm: typeof SOURCE_HASH_ALGORITHM;
};

/**
 * How a ledger row relates to the current checkout:
 * - `retired` / `unregistered`: the id is no longer executable.
 * - `match` / `drift`: the row records the hash of the source it ran.
 * - `unrecorded-*`: an older row without that hash. The source is read from
 *   the row's `git_sha` when the checkout has that commit, and is otherwise
 *   `unrecorded-unknown`.
 */
export type SourceCheck =
  | 'match'
  | 'drift'
  | 'unrecorded-derived-match'
  | 'unrecorded-derived-drift'
  | 'unrecorded-unknown'
  | 'retired'
  | 'unregistered';

const CARRIAGE_RETURN = 0x0d;
const LINE_FEED = 0x0a;
const SHA256_HEX = /^[0-9a-f]{64}$/;

export function migrationSourcePath(migrationId: string): string {
  const match = MIGRATION_ID_PATTERN.exec(migrationId);
  if (!match) {
    throw new Error(
      `${JSON.stringify(migrationId)} is not a versioned data migration id (v<release>:<NNN>_<name>).`,
    );
  }
  return `scripts/data-migrations/v${match[1]}/${match[2]}.ts`;
}

/**
 * Hashes a migration source so a Windows checkout with CRLF line endings and
 * an LF checkout agree. For a file without CRLF this is the plain SHA-256 of
 * its bytes, the value `retired.json` records.
 */
export function normalizedSourceSha256(source: Uint8Array | string): string {
  const bytes = typeof source === 'string' ? Buffer.from(source, 'utf8') : source;
  return createHash('sha256').update(withoutCarriageReturnsBeforeLineFeeds(bytes)).digest('hex');
}

function withoutCarriageReturnsBeforeLineFeeds(bytes: Uint8Array): Uint8Array {
  if (bytes.indexOf(CARRIAGE_RETURN) === -1) return bytes;
  const normalized = new Uint8Array(bytes.length);
  let length = 0;
  for (let index = 0; index < bytes.length; index += 1) {
    if (bytes[index] === CARRIAGE_RETURN && bytes[index + 1] === LINE_FEED) continue;
    normalized[length] = bytes[index];
    length += 1;
  }
  return normalized.subarray(0, length);
}

export function classifySourceCheck(input: {
  registered: boolean;
  retired: boolean;
  recordedSha256: string | null;
  currentSha256: string | null;
  derivedSha256: string | null;
}): SourceCheck {
  if (!input.registered) return input.retired ? 'retired' : 'unregistered';
  if (input.recordedSha256 !== null) {
    return input.recordedSha256 === input.currentSha256 ? 'match' : 'drift';
  }
  if (input.derivedSha256 !== null) {
    return input.derivedSha256 === input.currentSha256
      ? 'unrecorded-derived-match'
      : 'unrecorded-derived-drift';
  }
  return 'unrecorded-unknown';
}

/**
 * Reads the source hash from a ledger row's `details._runner` value. Rows the
 * runner wrote before it recorded sources, and values in any other shape or
 * hash algorithm, have no comparable hash.
 */
export function recordedRunnerSourceSha256(runner: unknown): string | null {
  if (typeof runner !== 'object' || runner === null || Array.isArray(runner)) return null;
  const { sourceSha256, hashAlgorithm } = runner as Record<string, unknown>;
  if (hashAlgorithm !== SOURCE_HASH_ALGORITHM) return null;
  return typeof sourceSha256 === 'string' && SHA256_HEX.test(sourceSha256) ? sourceSha256 : null;
}

/** The details the ledger stores: the migration's own details plus `_runner`. */
export function detailsWithRunnerSource(
  migrationId: string,
  details: Record<string, unknown>,
  runner: RunnerSourceIdentity,
): Record<string, unknown> {
  if (typeof details !== 'object' || details === null || Array.isArray(details)) {
    throw new Error(`Data migration ${migrationId} must return a details object.`);
  }
  if (Object.prototype.hasOwnProperty.call(details, RUNNER_DETAILS_KEY)) {
    throw new Error(
      `Data migration ${migrationId} returned details.${RUNNER_DETAILS_KEY}, a key reserved for the runner's source record.`,
    );
  }
  return { ...details, [RUNNER_DETAILS_KEY]: runner };
}
