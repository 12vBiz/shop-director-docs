# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MkDocs Material documentation site for Shop Director (scheduling-first POS for 12-volt retail).

| Environment | URL |
|-------------|-----|
| Production | https://support.shopdirector.app |
| Staging | https://docs-staging.shopdirector.app |

## Commands

```bash
# Install dependencies (use venv)
source .venv/bin/activate
pip install -r requirements.txt

# Local dev server (hot reload)
mkdocs serve

# Build static site
mkdocs build --strict
```

## Deployment

**Cloudflare Pages** auto-deploys on push:
- `staging` → docs-staging.shopdirector.app
- `main` → support.shopdirector.app

**Auth Worker** (`workers/`):
```bash
cd workers && npx wrangler deploy
```

## Branch Strategy

- **staging** - Default branch, PRs target here
- **main** - Production only, merge from staging when ready

## Structure

- `docs/` - Markdown content by feature area
- `docs/_templates/article.md` - Article template
- `overrides/` - Theme customizations
- `mkdocs.yml` - Site config, navigation
- `scripts/` - Screenshot capture tooling
- `workers/` - Cloudflare Worker for SSO auth

## Article Frontmatter

All articles require:
```yaml
---
title: Article Title
feature_area: quotes | scheduling | customers | inventory | sales
last_reviewed: YYYY-MM-DD
owner: ai | human | ai-generated
---
```

## Screenshot Markers

```markdown
<!-- SCREENSHOT: /path | Description -->
<!-- GIF: /step1 | /step2 | /step3 -->
```

CI captures screenshots automatically on PR from staging app.

## Conventions

- Use admonitions (`!!! tip`, `!!! warning`) for callouts
- Navigation in `mkdocs.yml` nav section
- Bold UI elements: `**Click Save**`
- Keep articles focused (1-2 minute reads)
