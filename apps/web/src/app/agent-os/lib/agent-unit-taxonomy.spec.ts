import { describe, expect, it } from 'vitest';
import {
  getAgentUnitTaxonomy,
  normalizeAgentUnitOperationalRole,
  resolveAgentUnitTaxonomy,
} from './agent-unit-taxonomy';

describe('agent unit taxonomy', () => {
  it('defines employees separately from capabilities and assigns capability owners', () => {
    expect(getAgentUnitTaxonomy('manager')).toMatchObject({
      role: 'employee',
      displayName: '운영 총괄',
      ownerAgentType: null,
    });
    expect(getAgentUnitTaxonomy('listing')).toMatchObject({
      role: 'employee',
      displayName: '상품 등록 담당',
      ownerAgentType: null,
    });
    expect(getAgentUnitTaxonomy('rules_evaluation')).toMatchObject({
      role: 'capability',
      displayName: '룰 평가 능력',
      ownerAgentType: 'manager',
    });
    expect(getAgentUnitTaxonomy('rules_suggest')).toMatchObject({
      role: 'capability',
      displayName: '임계값 제안 능력',
      ownerAgentType: 'manager',
    });
    expect(getAgentUnitTaxonomy('thumbnail_analyst')).toMatchObject({
      role: 'capability',
      displayName: '썸네일 분석 능력',
      ownerAgentType: 'listing',
    });
  });

  it('lets persisted role/title override only the display classification fields', () => {
    expect(
      resolveAgentUnitTaxonomy({
        type: 'manager',
        name: 'Operator',
        role: 'ceo',
        title: '대표실',
      }),
    ).toMatchObject({
      role: 'employee',
      displayName: '대표실',
      responsibility: '운영 우선순위, 위임, 승인 흐름을 총괄한다.',
    });
  });

  it('does not expose retired direct AI job types as office units', () => {
    expect(getAgentUnitTaxonomy('image_edit')).toBeNull();
    expect(getAgentUnitTaxonomy('thumbnail_generate')).toBeNull();
    expect(getAgentUnitTaxonomy('detail_page_generate')).toBeNull();
    expect(normalizeAgentUnitOperationalRole('legacy')).toBeNull();
  });
});
