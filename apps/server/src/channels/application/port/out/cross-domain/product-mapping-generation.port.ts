export const CHANNELS_PRODUCT_MAPPING_GENERATION_PORT = Symbol(
  'CHANNELS_PRODUCT_MAPPING_GENERATION_PORT',
);

/**
 * Advances Products' mapping-evidence generation inside Channels' own
 * transaction, after a canonical mapping mutation succeeds in that same
 * transaction. Channels never writes `MasterProductAbcFormulaState` itself
 * (KID-310) — this anti-corruption port is the only door. `TClient` stays
 * generic (not `Prisma.TransactionClient`) so this pure application port
 * carries no Prisma dependency; the adapter binds the concrete type.
 */
export interface ChannelsProductMappingGenerationPort {
  advance<TClient>(tx: TClient, organizationId: string): Promise<bigint>;
}
