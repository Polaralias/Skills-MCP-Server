import process from 'node:process';
import { loadConfig } from '../src/config';
import { SkillService } from '../src/skills';

const usage = `Usage:
  npm run cli -- search <query> [limit]
  npm run cli -- load <skill-id>`;

const main = async (): Promise<void> => {
  const [, , command, ...rest] = process.argv;
  if (!command) {
    console.error(usage);
    process.exitCode = 1;
    return;
  }

  const config = loadConfig();
  const service = new SkillService({ config });

  switch (command) {
    case 'search': {
      const [query, limitArg] = rest;
      if (!query) {
        console.error('Missing search query.');
        process.exitCode = 1;
        return;
      }
      const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
      const results = await service.searchSkills(query, limit);
      console.log(JSON.stringify({ results }, null, 2));
      break;
    }
    case 'load': {
      const [id] = rest;
      if (!id) {
        console.error('Missing skill identifier.');
        process.exitCode = 1;
        return;
      }
      const skill = await service.loadSkill(id);
      console.log(JSON.stringify(skill, null, 2));
      break;
    }
    default:
      console.error(`Unknown command: ${command}`);
      console.error(usage);
      process.exitCode = 1;
  }
};

main().catch((error) => {
  console.error('CLI execution failed:', error);
  process.exitCode = 1;
});
