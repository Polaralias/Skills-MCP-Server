# Phase 2: Core Logic (Loader & Search)

## Overview

This phase implements the logic for loading skills from the filesystem and indexing them for search. This is the "brain" of the server.

## Steps

1.  **Implement Skill Loader**
    -   In `src/skills/loader.ts`, implement `loadSkills(rootDir: string): Promise<Skill[]>`.
    -   **Logic:**
        -   Recursively scan `rootDir` (default `skills/`) for `SKILL.md` files.
        -   For each file found:
            -   Read content.
            -   Parse front matter (yaml-like block at the top) if present.
            -   **Metadata Extraction Order:**
                1.  **ID**: Front matter `id` -> Parent directory name (slugified).
                2.  **Title**: Front matter `title` -> First H1 header (`# Title`).
                3.  **Description**: Front matter `description` -> First paragraph after H1 -> First 200 chars.
                4.  **Tags**: Front matter `tags` (array) -> Empty array.
                5.  **Content**: Full file content.
            -   Construct `Skill` object.
    -   Handle I/O errors gracefully.

2.  **Implement Search Engine**
    -   In `src/skills/search.ts`, implement `searchSkills(skills: Skill[], query: string, limit = 5): { primaryMatches: SkillSearchMatch[]; alternativeMatches: SkillSearchMatch[] }`.
    -   **Indexing/Scoring Logic:**
        -   Normalize text (lowercase, strip markdown).
        -   Tokenize query.
        -   Calculate score: `score = w_title * titleHits + w_desc * descHits + w_tags * tagHits + w_body * bodyHits`.
            -   Suggested weights: Title (5), Description (3), Tags (3), Body (1).
        -   Sort by score (descending).
    -   **Filtering:**
        -   `primaryMatches`: Top `limit` results with score > 0.
        -   `alternativeMatches`: Next 10 results (or remaining).

3.  **Unit Tests**
    -   Create a test file (e.g., `test/loader.test.ts` or inline if preferred) to verify:
        -   Loader correctly parses a sample `SKILL.md`.
        -   Loader handles missing metadata fields correctly.
        -   Search returns relevant results for specific keywords.

## Success Criteria
-   `loadSkills` correctly reads and parses existing `SKILL.md` files in the repo.
-   `searchSkills` correctly ranks results based on query relevance.
-   Tests pass.
