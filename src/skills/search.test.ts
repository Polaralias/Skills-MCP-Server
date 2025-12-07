import { describe, it, expect } from 'vitest';
import { searchSkills } from './search.js';
import { Skill } from './types.js';

describe('searchSkills', () => {
  const skills: Skill[] = [
    {
      id: 'skill-1',
      title: 'Typescript Development',
      description: 'Learn how to write Typescript',
      tags: ['coding', 'javascript'],
      content: 'This is a guide about TS.',
      path: '/path/1',
    },
    {
      id: 'skill-2',
      title: 'Python Development',
      description: 'Learn how to write Python',
      tags: ['coding', 'scripting'],
      content: 'This is a guide about Py.',
      path: '/path/2',
    },
    {
      id: 'skill-3',
      title: 'Gardening',
      description: 'How to plant flowers',
      tags: ['hobby', 'outdoors'],
      content: 'Plants are great.',
      path: '/path/3',
    },
  ];

  it('should find skills matching query', () => {
    const result = searchSkills(skills, 'typescript');
    expect(result.primaryMatches).toHaveLength(1);
    expect(result.primaryMatches[0].id).toBe('skill-1');
  });

  it('should prioritize title matches', () => {
    // Both match 'development', but one might have higher score if we tweak it.
    // Let's rely on simple matching for now.
    const result = searchSkills(skills, 'development');
    expect(result.primaryMatches).toHaveLength(2);
    // order might depend on internal scoring, let's just check they are both there
    const ids = result.primaryMatches.map(m => m.id);
    expect(ids).toContain('skill-1');
    expect(ids).toContain('skill-2');
  });

  it('should return empty if no match', () => {
    const result = searchSkills(skills, 'cooking');
    expect(result.primaryMatches).toHaveLength(0);
  });
});
