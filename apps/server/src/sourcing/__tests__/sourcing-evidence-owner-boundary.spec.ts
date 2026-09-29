import 'reflect-metadata';
import { describe, expect, it } from 'vitest';
import { PATH_METADATA } from '@nestjs/common/constants';
import { SourcingIntelligenceController } from '../adapter/in/http/sourcing-intelligence.controller';
import { SourcingEvidenceLedgerRepositoryAdapter } from '../adapter/out/persistence/sourcing-evidence-ledger.repository';

describe('Sourcing evidence has one source-owner mutation boundary', () => {
  it('서버 구동 수집은 실행 계약이 맡아 evidence run 읽기·쓰기 라우트가 없다(KID-389)', () => {
    const routes = Object.getOwnPropertyNames(SourcingIntelligenceController.prototype)
      .map((name) => Reflect.getMetadata(PATH_METADATA,
        SourcingIntelligenceController.prototype[name as keyof SourcingIntelligenceController]));
    expect(routes.filter((route) => typeof route === 'string' && route.startsWith('evidence-runs'))).toEqual([]);
    for (const prototype of [SourcingEvidenceLedgerRepositoryAdapter.prototype]) {
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['startRun']));
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['appendObservations']));
      expect(Object.getOwnPropertyNames(prototype)).not.toEqual(expect.arrayContaining(['finalizeRun']));
    }
  });
});
