# Phase 1: Foundation & Setup

## Overview

This phase establishes the project structure, installs necessary dependencies, and defines the core types and configurations. The goal is to have a compilable TypeScript project ready for logic implementation.

## Steps

1.  **Initialize Project**
    -   Ensure `package.json` exists with the following dependencies (as per spec):
        -   `dependencies`: `@modelcontextprotocol/sdk`, `cors`, `express`, `zod`.
        -   `devDependencies`: `@types/cors`, `@types/express`, `@types/node`, `tsx`, `typescript`.
    -   Create `tsconfig.json` with the following compiler options:
        -   `target`: "ES2020"
        -   `module`: "ESNext"
        -   `rootDir`: "src"
        -   `outDir`: "dist"
        -   `strict`: true
        -   `resolveJsonModule`: true
        -   `esModuleInterop`: true

2.  **Directory Structure**
    -   Create the following directory structure in `src/`:
        ```text
        src/
        ├── config.ts
        ├── server.ts
        ├── httpApp.ts
        ├── index.ts
        └── skills/
            ├── types.ts
            ├── loader.ts
            ├── registry.ts
            └── search.ts
        ```
    -   *Note: Just create empty files for now or files with basic placeholders.*

3.  **Define Types**
    -   In `src/skills/types.ts`, define the following interfaces:
        ```typescript
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
        ```

4.  **Configuration**
    -   In `src/config.ts`, export configuration constants reading from `process.env`:
        -   `PORT` (default 8080)
        -   `SKILLS_DIR` (default "skills")
        -   `TRANSPORT` (default "http")

5.  **Verification**
    -   Run `npm install` to ensure dependencies are installed.
    -   Run `npx tsc --noEmit` to ensure the project compiles with the defined types and config.

## Success Criteria
-   `package.json` and `tsconfig.json` are correctly configured.
-   Project directory structure matches the plan.
-   `src/skills/types.ts` contains the correct interfaces.
-   `npm install` and compilation succeed.
