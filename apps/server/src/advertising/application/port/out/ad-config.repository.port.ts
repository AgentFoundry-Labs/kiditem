// Outgoing port for `SystemSetting`-backed advertising configuration storage.
// AdConfigService composes defaults + validation over this port; the
// Prisma-backed adapter handles SystemSetting CRUD scoped by organization.

export const AD_CONFIG_REPOSITORY_PORT = Symbol('AdConfigRepositoryPort');

export interface AdConfigSettingRow {
  key: string;
  value: unknown;
}

export interface AdConfigRepositoryPort {
  /** Read every `ads.*` setting row scoped to the organization. */
  findAdSettings(organizationId: string): Promise<AdConfigSettingRow[]>;

  /**
   * Upsert one `ads.*` setting. Adapter binds the `(organizationId, key)`
   * compound unique on the underlying SystemSetting row.
   */
  upsertSetting(
    key: string,
    value: unknown,
    organizationId: string,
  ): Promise<void>;

  /**
   * Seed every default `ads.*` setting in one batch when no row exists yet.
   * Returns the number of rows actually inserted (0 when a concurrent caller
   * already seeded).
   */
  seedDefaults(
    defaults: Record<string, unknown>,
    organizationId: string,
  ): Promise<number>;
}
