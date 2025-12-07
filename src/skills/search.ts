import { Skill, SkillSearchMatch } from './types.js';

const WEIGHTS = {
  title: 5,
  description: 3,
  tags: 3,
  body: 1,
};

function tokenize(text: string): string[] {
  return text.toLowerCase().replace(/[^\w\s]/g, '').split(/\s+/).filter(t => t.length > 0);
}

function countHits(tokens: string[], queryTokens: string[]): number {
  let hits = 0;
  for (const q of queryTokens) {
    for (const t of tokens) {
        if (t.includes(q)) {
            hits++;
        }
    }
  }
  return hits;
}

export function searchSkills(skills: Skill[], query: string, limit = 5): { primaryMatches: SkillSearchMatch[]; alternativeMatches: SkillSearchMatch[] } {
  const queryTokens = tokenize(query);

  const matches: SkillSearchMatch[] = skills.map(skill => {
    const titleTokens = tokenize(skill.title);
    const descTokens = tokenize(skill.description);
    const tagTokens = tokenize(skill.tags.join(' '));
    const bodyTokens = tokenize(skill.content);

    const titleHits = countHits(titleTokens, queryTokens);
    const descHits = countHits(descTokens, queryTokens);
    const tagHits = countHits(tagTokens, queryTokens);
    const bodyHits = countHits(bodyTokens, queryTokens);

    const score =
      WEIGHTS.title * titleHits +
      WEIGHTS.description * descHits +
      WEIGHTS.tags * tagHits +
      WEIGHTS.body * bodyHits;

    return {
      ...skill,
      score,
    };
  }).filter(m => m.score > 0);

  // Sort by score descending, then by title
  matches.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return a.title.localeCompare(b.title);
  });

  const primaryMatches = matches.slice(0, limit);
  // Spec: alternativeMatches: next 10 hits beyond limit (or all remaining matches if fewer than 10).
  const alternativeMatches = matches.slice(limit, limit + 10);

  return { primaryMatches, alternativeMatches };
}
