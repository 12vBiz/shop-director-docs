# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

MkDocs Material documentation site for Shop Director (scheduling-first POS for 12-volt retail). Published to https://support.shopdirector.app.

## Commands

```bash
# Install dependencies
pip install -r requirements.txt

# Local dev server (hot reload)
mkdocs serve

# Build static site
mkdocs build

# Deploy (if configured)
mkdocs gh-deploy
```

## Structure

- `docs/` - Markdown content, organized by feature area
- `docs/_templates/article.md` - Article template with required frontmatter
- `overrides/` - Theme customizations
- `mkdocs.yml` - Site config, navigation, theme settings

## Article Frontmatter

All articles require:
```yaml
---
title: Article Title
feature_area: quotes | scheduling | customers | inventory | settings
last_reviewed: YYYY-MM-DD
owner: ai | human
---
```

Optional: `feature_flag`, `related`

## Conventions

- Use admonitions (`!!! tip`, `!!! warning`) for callouts
- Mark screenshot placeholders: `<!-- SCREENSHOT: description -->`
- Navigation structure defined in `mkdocs.yml` nav section
- Grid cards on index use Material's card syntax with icons
