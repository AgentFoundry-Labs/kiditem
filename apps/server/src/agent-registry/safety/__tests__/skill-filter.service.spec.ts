import { describe, it, expect } from 'vitest';
import { SkillFilterService } from '../skill-filter.service';

describe('SkillFilterService', () => {
  const service = new SkillFilterService();

  it('sorts skills alphabetically', () => {
    const result = service.filterAndSort(['db-query', 'api-client', 'result-callback'], []);
    expect(result).toEqual(['api-client', 'db-query', 'result-callback']);
  });

  it('filters denied skills', () => {
    const result = service.filterAndSort(['db-query', 'dangerous-skill', 'result-callback'], ['dangerous-skill']);
    expect(result).toEqual(['db-query', 'result-callback']);
  });

  it('handles empty arrays', () => {
    expect(service.filterAndSort([], [])).toEqual([]);
    expect(service.filterAndSort([], ['foo'])).toEqual([]);
  });
});
