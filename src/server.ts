import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { Skill } from "./skills/types.js";
import { searchSkills } from "./skills/search.js";

export function createMcpServer(skills: Skill[]) {
  const server = new McpServer({
    name: "Skill Collection Server",
    version: "1.0.0",
  });

  for (const skill of skills) {
    const toolName = `skill_${skill.id}`;
    // @ts-ignore: TS2589 excessive depth
    server.tool(
      toolName,
      {},
      async () => {
        return {
          content: [
            {
              type: "text",
              text: skill.content,
            },
          ],
        };
      }
    );
  }

  // @ts-ignore: TS2589 excessive depth
  server.tool(
    "search_skills",
    {
      query: z.string().describe("Search query or keywords"),
      limit: z.number().int().positive().optional().describe("Maximum number of primary matches to return"),
    },
    async ({ query, limit }) => {
      const { primaryMatches, alternativeMatches } = searchSkills(skills, query, limit ?? 5);
      return {
        content: [
          {
            type: "text",
            text: JSON.stringify({
              primaryMatches: primaryMatches.map(m => ({ id: m.id, title: m.title, description: m.description, score: m.score })),
              alternativeMatches: alternativeMatches.map(m => ({ id: m.id, title: m.title, description: m.description, score: m.score }))
            }, null, 2)
          },
        ],
      };
    }
  );

  return server;
}
