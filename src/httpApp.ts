import express, { Request, Response } from "express";
import cors from "cors";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createMcpServer } from "./server.js";
import { loadSkills } from "./skills/loader.js";
import { Skill } from "./skills/types.js";

const app = express();
const PORT = process.env.PORT || 8080;
const ROOT_DIR = process.env.ROOT_DIR || process.cwd();

app.use(
  cors({
    origin: "*",
    exposedHeaders: ["mcp-Session-Id", "mcp-protocol-version"],
    allowedHeaders: ["Content-Type", "mcp-session-id"],
  })
);

app.use(express.json());

let cachedSkillsPromise: Promise<Skill[]> | null = null;

async function getSkills(): Promise<Skill[]> {
  if (!cachedSkillsPromise) {
    cachedSkillsPromise = loadSkills(ROOT_DIR);
  }
  if (!cachedSkillsPromise) {
    throw new Error("Failed to load skills");
  }
  return cachedSkillsPromise;
}

app.all("/mcp", async (req: Request, res: Response) => {
  try {
    const skills = await getSkills();
    const server = createMcpServer(skills);
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });

    res.on("close", () => {
      transport.close().catch(err => console.error("Error closing transport:", err));
      server.close().catch(err => console.error("Error closing server:", err));
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);

  } catch (error) {
    console.error("MCP Error:", error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: "2.0",
        error: {
          code: -32603,
          message: "Internal server error",
        },
        id: null,
      });
    }
  }
});

export function startHttpServer() {
  app.listen(PORT, () => {
    console.log(`Skills MCP HTTP Server listening on port ${PORT}`);
  });
}
