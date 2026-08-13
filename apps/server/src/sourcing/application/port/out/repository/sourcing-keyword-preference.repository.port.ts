export const SOURCING_KEYWORD_PREFERENCE_REPOSITORY_PORT = Symbol(
  'SourcingKeywordPreferenceRepositoryPort',
);

export interface SourcingKeywordPreferenceRecord {
  keyword: string;
  excluded: boolean;
  version: number;
  updatedAt: Date;
}

export interface SaveSourcingKeywordPreferenceCommand {
  organizationId: string;
  keywordNormalized: string;
  displayKeyword: string;
  excluded: boolean;
  expectedVersion: number;
}

export type SaveSourcingKeywordPreferenceResult =
  | { kind: 'saved'; preference: SourcingKeywordPreferenceRecord }
  | { kind: 'version_conflict'; currentVersion: number };

export interface SourcingKeywordPreferenceRepositoryPort {
  list(organizationId: string): Promise<SourcingKeywordPreferenceRecord[]>;
  save(
    command: SaveSourcingKeywordPreferenceCommand,
  ): Promise<SaveSourcingKeywordPreferenceResult>;
}
