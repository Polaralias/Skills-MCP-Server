import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { Skill } from "./skills/types.js";
import fs from "fs/promises";

export function createMcpServer(skills: Skill[]) {
  const server = new McpServer({
    name: "Skill Collection Server",
    version: "1.0.0",
  });

  for (const skill of skills) {
    const promptName = `${skill.family}/${skill.id}`;

    // Register Prompt
    server.prompt(
        promptName,
        skill.description,
        async () => {
            const content = await fs.readFile(skill.promptPath, 'utf-8');
            return {
                messages: [
                    {
                        role: 'user',
                        content: {
                            type: 'text',
                            text: content
                        }
                    }
                ]
            };
        }
    );

    // Register Resource
    const resourceUri = `resources://${skill.family}/${skill.id}`;

    server.resource(
        skill.title,
        resourceUri,
        {
            description: skill.description,
            mimeType: "text/markdown"
        },
        async (uri) => {
             const content = await fs.readFile(skill.resourcePath, 'utf-8');
             return {
                 contents: [
                     {
                         uri: uri.href,
                         mimeType: "text/markdown",
                         text: content
                     }
                 ]
             };
        }
    );
  }

  return server;
}
