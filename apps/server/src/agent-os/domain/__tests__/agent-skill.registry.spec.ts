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
      skillPath: 'tools/codex/skills/magic-scraper/SKILL.md',
      defaultPreload: true,
      allowedAgentTypes: ['sourcing'],
      mode: 'development_workflow',
    });
  });

  it('lists skills by allowed agent type', () => {
    expect(listAgentSkillsForAgentType('sourcing').map((skill) => skill.key)).toEqual([
      'sourcing.magic_scraper',
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
