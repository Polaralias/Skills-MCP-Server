import fs from 'fs/promises';
import path from 'path';
import { Skill } from './types.js';

async function parseSkillFile(filePath: string, rootDir: string): Promise<Skill | null> {
  try {
    const content = await fs.readFile(filePath, 'utf-8');
    const relativePath = path.relative(rootDir, filePath);
    const directoryName = path.dirname(relativePath).split(path.sep).pop();

    // Default metadata
    // Handle case where file is in rootDir (directoryName is '.' or undefined)
    let idCandidate = directoryName && directoryName !== '.' ? directoryName : path.basename(filePath, '.md');

    let id = idCandidate.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    let title = '';
    let description = '';
    let tags: string[] = [];
    let markdownContent = content;

    // Parse frontmatter if present
    const frontMatterRegex = /^---\r?\n([\s\S]*?)\r?\n---\r?\n/;
    const match = content.match(frontMatterRegex);

    if (match) {
      const frontMatter = match[1];
      markdownContent = content.slice(match[0].length);

      const lines = frontMatter.split(/\r?\n/);
      let currentKey: string | null = null;

      for (const line of lines) {
        const keyVal = line.match(/^([a-z]+):\s*(.*)$/);
        if (keyVal) {
          const key = keyVal[1];
          const value = keyVal[2];

          if (key === 'id') id = value.trim();
          else if (key === 'title') title = value.trim();
          else if (key === 'description') description = value.trim();
          else if (key === 'tags') {
              // Start of tags list
              currentKey = 'tags';
          }
        } else if (currentKey === 'tags' && line.trim().startsWith('-')) {
             tags.push(line.trim().substring(1).trim());
        }
      }
    }

    // Fallback for title: first H1
    if (!title) {
      const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
      if (titleMatch) {
        title = titleMatch[1].trim();
      } else {
        title = id; // Last resort
      }
    }

    // Fallback for description
    if (!description) {
      // Find first paragraph after title
      const lines = markdownContent.split(/\r?\n/);
      let foundTitle = false;
      for (const line of lines) {
        if (line.match(/^#\s+(.+)$/)) {
          foundTitle = true;
          continue;
        }
        if (foundTitle && line.trim().length > 0 && !line.startsWith('#')) {
          description = line.trim();
          break;
        }
      }

      if (!description) {
        description = markdownContent.slice(0, 200).replace(/\n/g, ' ') + (markdownContent.length > 200 ? '...' : '');
      }
    }

    return {
      id,
      title,
      description,
      tags,
      content: markdownContent,
      path: filePath
    };

  } catch (error) {
    console.warn(`Failed to parse skill file ${filePath}:`, error);
    return null;
  }
}

async function scanDirectory(dir: string, rootDir: string): Promise<Skill[]> {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  const skills: Skill[] = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      skills.push(...await scanDirectory(fullPath, rootDir));
    } else if (entry.isFile() && entry.name === 'SKILL.md') {
      const skill = await parseSkillFile(fullPath, rootDir);
      if (skill) {
        skills.push(skill);
      }
    }
  }

  return skills;
}

export async function loadSkills(rootDir: string): Promise<Skill[]> {
  try {
    const absoluteRootDir = path.resolve(rootDir);
    await fs.access(absoluteRootDir);
    return await scanDirectory(absoluteRootDir, absoluteRootDir);
  } catch (error) {
    console.error(`Error loading skills from ${rootDir}:`, error);
    throw error;
  }
}
