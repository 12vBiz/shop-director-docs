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
<!-- SCREENSHOT: /path | Description | highlight:selector1,selector2 -->
<!-- SCREENSHOT: /path | Description | highlight:selector | arrow:bottom-right -->
<!-- GIF: /step1 | /step2 | /step3 -->
```

**Highlight parameter:** CSS selectors for elements to highlight with green outline. Small elements (<10% viewport) automatically get arrows.

**Arrow override:** Direction keyword when auto-positioning doesn't work well.
- `arrow:bottom-right` (default)
- `arrow:bottom-left`
- `arrow:top-right`
- `arrow:top-left`

**Arrow style:** 10px green line (#22c55e), 32×38px triangle arrowhead.

CI captures screenshots automatically on PR from staging app.

**Local capture:**
```bash
cd scripts && npm install && npx playwright install chromium
npx tsx scripts/capture-screenshots.ts
# Or for specific file:
npx tsx scripts/capture-screenshots.ts --file docs/path/to/doc.md
```

## CI Workflows

- **Quality Checks** - Validates frontmatter, checks stale docs (90+ days), builds with `--strict`
- **Capture Screenshots** - Auto-captures from staging app on PR

## Conventions

- Use admonitions (`!!! tip`, `!!! warning`) for callouts
- Navigation in `mkdocs.yml` nav section
- Bold UI elements: `**Click Save**`
- Keep articles focused (1-2 minute reads)
