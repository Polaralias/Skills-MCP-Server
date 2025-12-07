# Phase 5: Documentation & Deployment Guide

## Overview

This phase ensures the project is documented and ready for deployment to Smithery.

## Steps

1.  **Update README.md**
    -   Add a "Getting Started" section.
    -   Explain how to add new skills (create folder/file in `skills/`).
    -   Explain how to run locally.

2.  **Smithery Deployment Guide**
    -   Create `docs/SMITHERY_DEPLOYMENT.md`.
    -   **Steps:**
        1.  Build & Push Docker image (e.g., to GHCR or Docker Hub).
        2.  Create "Custom Container" server in Smithery.
        3.  Config:
            -   Image: `<your-image-url>`
            -   Port: `8080`
            -   MCP Path: `/mcp`
            -   Env: `TRANSPORT=http`, `SKILLS_DIR=/app/skills`.
        4.  (Optional) Explanation of volume mounting for dynamic skills.

3.  **Final Verification**
    -   Walk through the entire setup one last time.
    -   Ensure all "Success Criteria" from previous phases are met.

## Success Criteria
-   Comprehensive README.
-   Clear deployment instructions.
-   Project ready for handoff.
