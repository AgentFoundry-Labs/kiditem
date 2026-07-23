export type RocketWorkbookTransmissionIntentRecord = {
  intentKey: string;
  status: 'prepared' | 'finalized' | 'aborted';
  finalizedGeneration: bigint | null;
};

export interface RocketWorkbookProgressRepositoryPort {
  read(input: {
    transaction: unknown;
    organizationId: string;
    intentKeys: string[];
  }): Promise<{
    verifiedGeneration: bigint;
    intents: RocketWorkbookTransmissionIntentRecord[];
  }>;
}

export const ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT = Symbol(
  'ROCKET_WORKBOOK_PROGRESS_REPOSITORY_PORT',
);
