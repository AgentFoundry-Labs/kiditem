import { Prisma } from '@prisma/client';

export type SettlementFact = Prisma.SettlementGetPayload<{}>;

export async function readSettlements(
  tx: Prisma.TransactionClient,
  input: Readonly<{ organizationId: string; period?: string }>,
): Promise<SettlementFact[]> {
  const periodFilter = input.period?.length === 7
    ? { period: input.period }
    : input.period?.length === 4
      ? { period: { startsWith: input.period } }
      : undefined;
  return tx.settlement.findMany({
    where: { organizationId: input.organizationId, ...periodFilter },
    orderBy: { period: 'desc' },
  });
}
