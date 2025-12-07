import { startHttpServer } from "./httpApp.js";

async function main() {
  const transport = process.env.TRANSPORT || "http";

  if (transport === "http") {
    startHttpServer();
  } else {
    throw new Error("Only HTTP transport is supported in this deployment configuration");
  }
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});
