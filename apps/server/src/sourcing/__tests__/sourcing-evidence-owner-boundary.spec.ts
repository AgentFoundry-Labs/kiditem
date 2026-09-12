import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SourcingIntelligenceController } from '../adapter/in/http/sourcing-intelligence.controller';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/repository/sourcing-evidence-ledger.repository.adapter';
import { SourcingEvidenceLedgerService } from '../application/service/sourcing-evidence-ledger.service';

describe('Sourcing evidence has one source-owner mutation boundary', () => {
  it('keeps evidence provenance lookup without a second public attempt writer', () => {
    const routes = Object.getOwnPropertyNames(SourcingIntelligenceController.prototype)
      .map((name) => Reflect.getMetadata(PATH_METADATA,
        SourcingIntelligenceController.prototype[name as keyof SourcingIntelligenceController]));
    expect(routes).toContain('evidence-runs/:id');
    expect(routes).not.toContain('evidence-runs');
    expect(routes).not.toContain('evidence-runs/:id/observations');
    expect(routes).not.toContain('evidence-runs/:id/finalize');
    for (const prototype of [SourcingEvidenceLedgerService.prototype, SourcingEvidenceLedgerRepositoryAdapter.prototype]) {
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['startRun']));
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['appendObservations']));
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['finalizeRun']));
    }
  });
});
