# Shop Director User Docs

User-facing help documentation for [Shop Director](https://shopdirector.app), built with MkDocs Material.

## URLs

| Environment | URL |
|-------------|-----|
| Production | https://support.shopdirector.app |
| Staging | https://docs-staging.shopdirector.app |

## Local Development

```bash
# Create virtual environment
python3 -m venv .venv
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Start dev server (http://localhost:8000)
mkdocs serve
```

## Deployment

Deployed via **Cloudflare Pages** (auto-deploys on push):

- `main` branch → production (support.shopdirector.app)
- `staging` branch → staging (docs-staging.shopdirector.app)

### Auth Worker

SSO authentication handled by Cloudflare Worker in `workers/`. Users access docs via Help button in Shop Director app, which generates a signed token.

```bash
# Deploy worker changes
cd workers
npx wrangler deploy
```

Worker env vars (set in CF dashboard):
- `DOCS_SIGNING_SECRET` - Shared with Rails app
- `RAILS_APP_URL` - App URL for redirects

## Writing Docs

### Article Structure

All docs go in `docs/` with required frontmatter:

```yaml
---
title: Article Title
feature_area: quotes | scheduling | customers | inventory | sales
last_reviewed: 2026-01-12
owner: ai | human | ai-generated
---
```

### Screenshot Markers

Add markers where images should go:

```markdown
<!-- SCREENSHOT: /path | Description of what to capture -->
```

CI auto-captures screenshots on PR using staging app.

### Local Screenshot Capture

```bash
cd scripts
npm install
npx playwright install chromium
npm run capture
```

## CI Workflows

- **Quality Checks** - Validates frontmatter, checks for stale docs, builds site
- **Capture Screenshots** - Auto-captures screenshots from staging on PR

## Branch Strategy

- **staging** - Default branch, development happens here
- **main** - Production deployments only

PRs should target `staging`. Merge `staging` → `main` when ready to deploy to production.
