import fs from 'fs/promises';
import path from 'path';
import { Skill } from './types.js';

export async function loadSkills(rootDir: string): Promise<Skill[]> {
  const manifestsDir = path.join(rootDir, 'manifests');
  const promptsDir = path.join(rootDir, 'prompts');
  const resourcesDir = path.join(rootDir, 'resources');

  const skills: Skill[] = [];

  try {
    // Check if manifests directory exists
    try {
        await fs.access(manifestsDir);
    } catch {
        console.warn(`Manifests directory not found at ${manifestsDir}`);
        return [];
    }

    const families = await fs.readdir(manifestsDir, { withFileTypes: true });

    for (const familyEntry of families) {
      if (!familyEntry.isDirectory()) continue;
      const family = familyEntry.name;
      const familyPath = path.join(manifestsDir, family);

      const manifests = await fs.readdir(familyPath, { withFileTypes: true });
      for (const manifestEntry of manifests) {
          if (!manifestEntry.isFile() || !manifestEntry.name.endsWith('.json')) continue;

          const id = path.basename(manifestEntry.name, '.json');
          const manifestPath = path.join(familyPath, manifestEntry.name);

          try {
              const manifestContent = await fs.readFile(manifestPath, 'utf-8');
              const manifest = JSON.parse(manifestContent);

              const promptPath = path.join(promptsDir, family, `${id}.md`);
              const resourcePath = path.join(resourcesDir, family, `${id}.md`);

              // Verify prompt and resource exist
              await fs.access(promptPath);
              await fs.access(resourcePath);

              skills.push({
                  family,
                  id,
                  title: manifest.title || id,
                  description: manifest.description || '',
                  tags: manifest.tags || [],
                  manifestPath,
                  promptPath,
                  resourcePath
              });

          } catch (err) {
              console.warn(`Failed to load skill ${family}/${id}:`, err);
          }
      }
    }
  } catch (error) {
    console.error(`Error loading skills from ${rootDir}:`, error);
    throw error;
  }

  return skills;
}
