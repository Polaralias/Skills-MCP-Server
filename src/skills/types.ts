export interface Skill {
  id: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
  path: string;
}

export interface SkillSearchMatch {
  id: string;
  title: string;
  description: string;
  tags: string[];
  content: string;
  score: number;
}
