import { describe, expect, it } from 'vitest';
import {
  findAgentSkillByKey,
  listAgentSkills,
  listAgentSkillsForAgentType,
} from '../agent-skill.registry';

describe('agent skill registry', () => {
  it('registers magic-scraper as a Sourcing development workflow skill', () => {
    const skill = findAgentSkillByKey('sourcing.magic_scraper');

    expect(skill).toEqual({
      key: 'sourcing.magic_scraper',
      name: 'Magic Scraper',
      description: expect.stringContaining('Sourcing browser extractors'),
      category: 'sourcing',
      version: '1.0.0',
      skillPath: '~/.codex/skills/magic-scraper/SKILL.md',
      defaultPreload: false,
      allowedAgentTypes: ['sourcing'],
      mode: 'development_workflow',
    });
  });

  it('keeps Magic Scraper development-only and out of runtime preload', () => {
    expect(findAgentSkillByKey('sourcing.magic_scraper')).toMatchObject({
      defaultPreload: false,
      mode: 'development_workflow',
    });
    expect(
      listAgentSkillsForAgentType('sourcing')
        .filter((skill) => skill.defaultPreload)
        .map((skill) => skill.key),
    ).toEqual([
      'sourcing.evidence-grounded-analysis',
      'sourcing.collection-planning',
      'sourcing.safe-review-handoff',
    ]);
  });

  it('lists skills by allowed agent type', () => {
    expect(listAgentSkillsForAgentType('sourcing').map((skill) => skill.key)).toEqual([
      'sourcing.magic_scraper',
      'sourcing.evidence-grounded-analysis',
      'sourcing.collection-planning',
      'sourcing.safe-review-handoff',
    ]);
    expect(listAgentSkillsForAgentType('order')).toEqual([]);
  });

  it('returns defensive copies of skill definitions', () => {
    const [skill] = listAgentSkills();
    skill.allowedAgentTypes.push('order');

    expect(findAgentSkillByKey('sourcing.magic_scraper')?.allowedAgentTypes).toEqual([
      'sourcing',
    ]);
  });
});
