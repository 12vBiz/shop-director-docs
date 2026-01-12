/**
 * Screenshot Capture Pipeline for Shop Director Docs
 *
 * Parses markdown files for screenshot markers and captures screenshots
 * using Playwright with authenticated sessions.
 *
 * Usage:
 *   npx tsx capture-screenshots.ts [--file path/to/doc.md]
 *
 * For local dev:
 *   - Auto-detects running Rails server on common ports
 *   - Create scripts/.env for credentials (optional, has defaults)
 *
 * Screenshot marker formats:
 *   <!-- SCREENSHOT: description -->
 *   <!-- SCREENSHOT: /path | description -->
 *   <!-- SCREENSHOT: /path | description | highlight:.selector -->
 *   <!-- SCREENSHOT: /path | description | highlight:.btn-primary,#submit -->
 *
 * Highlight selectors:
 *   - Any valid CSS selector (.class, #id, [data-attr], etc.)
 *   - Multiple selectors separated by commas
 *   - Elements get orange outline + subtle background highlight
 *
 * GIF marker format:
 *   <!-- GIF: step1 | step2 | step3 -->
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { execFileSync, execSync } from 'child_process';
import { config } from 'dotenv';
import { createCanvas, loadImage } from '@napi-rs/canvas';

// Load .env from scripts directory
config({ path: path.join(__dirname, '.env') });

// Auto-detect local Rails server port
function detectLocalPort(): number | null {
  const commonPorts = [3000, 3100, 3200, 3300, 55000, 55001, 55002, 55003, 55004, 55005];

  for (const port of commonPorts) {
    try {
      // Check if port is in use by a Rails/Puma process
      const result = execSync(
        `lsof -i :${port} -sTCP:LISTEN 2>/dev/null | grep -E 'ruby|puma' || true`,
        { encoding: 'utf-8', timeout: 2000 }
      ).trim();

      if (result) {
        console.log(`Auto-detected Rails server on port ${port}`);
        return port;
      }
    } catch {
      // Port check failed, continue to next
    }
  }
  return null;
}

// Determine base URL: explicit env var > auto-detect local > staging
function getBaseUrl(): string {
  if (process.env.APP_URL) {
    return process.env.APP_URL;
  }

  const localPort = detectLocalPort();
  if (localPort) {
    return `http://127.0.0.1:${localPort}`;
  }

  console.log('No local server detected, using staging');
  return 'https://staging.shopdirector.app';
}

// Configuration - paths relative to repo root (one level up from scripts/)
const REPO_ROOT = path.resolve(__dirname, '..');
const CONFIG = {
  baseUrl: getBaseUrl(),
  credentials: {
    email: process.env.DEMO_EMAIL || 'c1admin1@example.com',
    password: process.env.DEMO_PASSWORD || 'sd1234'
  },
  outputDir: path.join(REPO_ROOT, 'docs/assets/images'),
  docsDir: path.join(REPO_ROOT, 'docs')
};

interface ScreenshotMarker {
  type: 'screenshot' | 'gif';
  description: string;
  path?: string;
  steps?: string[];
  highlights?: string[];  // CSS selectors to highlight
  sourceFile: string;
  lineNumber: number;
}

// Parse a single markdown file for screenshot markers
function parseMarkdownFile(filePath: string): ScreenshotMarker[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const markers: ScreenshotMarker[] = [];

  lines.forEach((line, index) => {
    // Screenshot marker formats:
    //   <!-- SCREENSHOT: description -->
    //   <!-- SCREENSHOT: /path | description -->
    //   <!-- SCREENSHOT: /path | description | highlight:.selector1,.selector2 -->
    const screenshotMatch = line.match(/<!--\s*SCREENSHOT:\s*(.+?)\s*-->/i);
    if (screenshotMatch) {
      const parts = screenshotMatch[1].split('|').map(s => s.trim());

      // Parse highlight selectors if present
      let highlights: string[] | undefined;
      const highlightPart = parts.find(p => p.startsWith('highlight:'));
      if (highlightPart) {
        highlights = highlightPart
          .replace('highlight:', '')
          .split(',')
          .map(s => s.trim())
          .filter(s => s.length > 0);
      }

      // Remove highlight part from parts array for path/description parsing
      const contentParts = parts.filter(p => !p.startsWith('highlight:'));

      if (contentParts.length >= 2 && contentParts[0].startsWith('/')) {
        markers.push({
          type: 'screenshot',
          path: contentParts[0],
          description: contentParts[1],
          highlights,
          sourceFile: filePath,
          lineNumber: index + 1
        });
      } else {
        markers.push({
          type: 'screenshot',
          description: contentParts[0],
          highlights,
          sourceFile: filePath,
          lineNumber: index + 1
        });
      }
    }

    // GIF marker: <!-- GIF: step1 | step2 | step3 -->
    const gifMatch = line.match(/<!--\s*GIF:\s*(.+?)\s*-->/i);
    if (gifMatch) {
      const steps = gifMatch[1].split('|').map(s => s.trim());
      markers.push({
        type: 'gif',
        description: steps[0],
        steps: steps,
        sourceFile: filePath,
        lineNumber: index + 1
      });
    }
  });

  return markers;
}

// Generate filename from description
function generateFilename(marker: ScreenshotMarker): string {
  const slug = marker.description
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 50);

  // Get feature area from source file path
  const parts = marker.sourceFile.split('/');
  const featureArea = parts[parts.length - 2] || 'general';

  const ext = marker.type === 'gif' ? 'gif' : 'png';
  return `${featureArea}/${slug}.${ext}`;
}

// Login to Shop Director
async function login(page: Page): Promise<void> {
  console.log('Logging in...');
  await page.goto(`${CONFIG.baseUrl}/users/sign_in`);
  await page.fill('input[name="user[email]"]', CONFIG.credentials.email);
  await page.fill('input[name="user[password]"]', CONFIG.credentials.password);
  await page.click('input[type="submit"]');
  // Wait for redirect away from sign_in page
  await page.waitForURL((url) => !url.pathname.includes('sign_in'), { timeout: 30000 });
  console.log('Logged in successfully');
}

// Infer page path from description
function inferPath(description: string): string {
  const pathMappings: Record<string, string> = {
    'quote': '/quotes',
    'quotes': '/quotes',
    'calendar': '/calendar',
    'appointment': '/appointments',
    'customer': '/customers',
    'inventory': '/inventory',
    'order': '/orders',
    'work order': '/work_orders',
    'invoice': '/invoices',
    'dashboard': '/dashboard',
    'settings': '/settings'
  };

  const lowerDesc = description.toLowerCase();
  for (const [keyword, path] of Object.entries(pathMappings)) {
    if (lowerDesc.includes(keyword)) {
      return path;
    }
  }

  return '/dashboard';
}

interface ArrowTarget {
  x: number;
  y: number;
  width: number;
  height: number;
}

// Apply highlight styles and collect arrow targets
async function applyHighlights(page: Page, selectors: string[]): Promise<ArrowTarget[]> {
  const viewport = page.viewportSize();
  const viewportArea = (viewport?.width || 1400) * (viewport?.height || 900);
  const smallElementThreshold = viewportArea * 0.10; // 10% of screen

  // Inject highlight CSS - bright green (no arrows in DOM)
  await page.addStyleTag({
    content: `
      .sd-docs-highlight {
        outline: 3px solid #22c55e !important;
        outline-offset: 4px !important;
        position: relative;
        z-index: 1000;
      }
      .sd-docs-highlight::after {
        content: '';
        position: absolute;
        inset: -8px;
        border-radius: 8px;
        background: rgba(34, 197, 94, 0.1);
        pointer-events: none;
        z-index: -1;
      }
    `
  });

  // Collect elements that need arrows (small elements)
  const arrowTargets: ArrowTarget[] = [];

  // Add highlight class to matching elements
  for (const selector of selectors) {
    try {
      const elements = await page.locator(selector).all();
      for (const element of elements) {
        await element.evaluate(el => el.classList.add('sd-docs-highlight'));

        // Check if element is small enough for an arrow
        const box = await element.boundingBox();
        if (box) {
          const elementArea = box.width * box.height;
          if (elementArea < smallElementThreshold) {
            arrowTargets.push(box);
          }
        }
      }
      console.log(`  Highlighted ${elements.length} element(s) for: ${selector}`);
    } catch (e) {
      console.log(`  Warning: Could not find elements for selector: ${selector}`);
    }
  }

  return arrowTargets;
}

// Pick best arrow direction based on element position
function pickArrowDirection(
  box: ArrowTarget,
  viewportWidth: number,
  viewportHeight: number
): 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' {
  const centerX = box.x + box.width / 2;
  const centerY = box.y + box.height / 2;

  // Prefer bottom-right unless element is in that quadrant
  const inRightHalf = centerX > viewportWidth * 0.6;
  const inBottomHalf = centerY > viewportHeight * 0.6;

  if (inRightHalf && inBottomHalf) {
    return 'top-left';
  } else if (inRightHalf) {
    return 'bottom-left';
  } else if (inBottomHalf) {
    return 'top-right';
  }
  return 'bottom-right';
}

// Draw arrows on screenshot using Canvas 2D API
async function addArrowsToImage(
  imagePath: string,
  targets: ArrowTarget[],
  viewportWidth: number,
  viewportHeight: number
): Promise<void> {
  if (targets.length === 0) return;

  // Load the original screenshot
  const image = await loadImage(imagePath);
  const canvas = createCanvas(viewportWidth, viewportHeight);
  const ctx = canvas.getContext('2d');

  // Draw original image
  ctx.drawImage(image, 0, 0);

  // Arrow style settings - thick line with prominent arrowhead
  const STROKE_WIDTH = 10;
  const ARROW_COLOR = '#22c55e';
  const ARROWHEAD_SIZE = 32;

  for (const box of targets) {
    const direction = pickArrowDirection(box, viewportWidth, viewportHeight);

    // Calculate element corner based on direction (where arrow points TO)
    const pad = 12; // padding from element
    let targetX: number, targetY: number;
    let startOffsetX: number, startOffsetY: number;

    switch (direction) {
      case 'bottom-right':
        targetX = box.x + box.width + pad;
        targetY = box.y + box.height + pad;
        startOffsetX = 80;
        startOffsetY = 80;
        break;
      case 'bottom-left':
        targetX = box.x - pad;
        targetY = box.y + box.height + pad;
        startOffsetX = -80;
        startOffsetY = 80;
        break;
      case 'top-right':
        targetX = box.x + box.width + pad;
        targetY = box.y - pad;
        startOffsetX = 80;
        startOffsetY = -80;
        break;
      case 'top-left':
        targetX = box.x - pad;
        targetY = box.y - pad;
        startOffsetX = -80;
        startOffsetY = -80;
        break;
    }

    // Arrow starts from empty space, points TO the element
    const startX = targetX + startOffsetX;
    const startY = targetY + startOffsetY;
    const endX = targetX;
    const endY = targetY;

    // Calculate arrow angle
    const angle = Math.atan2(endY - startY, endX - startX);

    // Shorten line to make room for arrowhead
    const lineEndX = endX - Math.cos(angle) * ARROWHEAD_SIZE;
    const lineEndY = endY - Math.sin(angle) * ARROWHEAD_SIZE;

    // Draw the line
    ctx.strokeStyle = ARROW_COLOR;
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(lineEndX, lineEndY);
    ctx.stroke();

    // Draw arrowhead as filled triangle - wider for prominence
    const headLength = ARROWHEAD_SIZE;
    const headWidth = ARROWHEAD_SIZE * 1.2; // wider triangle

    ctx.fillStyle = ARROW_COLOR;
    ctx.beginPath();
    // Tip of arrow
    ctx.moveTo(endX, endY);
    // Left side of arrowhead
    ctx.lineTo(
      endX - headLength * Math.cos(angle) + headWidth * Math.sin(angle) / 2,
      endY - headLength * Math.sin(angle) - headWidth * Math.cos(angle) / 2
    );
    // Right side of arrowhead
    ctx.lineTo(
      endX - headLength * Math.cos(angle) - headWidth * Math.sin(angle) / 2,
      endY - headLength * Math.sin(angle) + headWidth * Math.cos(angle) / 2
    );
    ctx.closePath();
    ctx.fill();
  }

  // Save the result
  const buffer = canvas.toBuffer('image/png');
  fs.writeFileSync(imagePath, buffer);

  console.log(`  Added ${targets.length} arrow(s) via Canvas 2D`);
}

// Capture a single screenshot
async function captureScreenshot(
  page: Page,
  marker: ScreenshotMarker
): Promise<string> {
  const targetPath = marker.path || inferPath(marker.description);
  const outputPath = path.join(CONFIG.outputDir, generateFilename(marker));

  console.log(`Capturing: ${marker.description}`);
  console.log(`  Path: ${targetPath}`);
  console.log(`  Output: ${outputPath}`);

  // Navigate to page
  await page.goto(`${CONFIG.baseUrl}${targetPath}`);
  await page.waitForLoadState('networkidle');

  // Wait a bit for any animations
  await page.waitForTimeout(500);

  // Apply highlights and collect arrow targets
  let arrowTargets: ArrowTarget[] = [];
  if (marker.highlights && marker.highlights.length > 0) {
    arrowTargets = await applyHighlights(page, marker.highlights);
    console.log(`  Applied ${marker.highlights.length} highlight(s)`);
  }

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Take screenshot
  await page.screenshot({
    path: outputPath,
    fullPage: false
  });

  console.log(`  Saved: ${outputPath}`);

  // Add arrows via Sharp post-processing
  const viewport = page.viewportSize();
  if (arrowTargets.length > 0 && viewport) {
    await addArrowsToImage(outputPath, arrowTargets, viewport.width, viewport.height);
  }

  return outputPath;
}

// Capture GIF from multiple steps
async function captureGif(
  page: Page,
  marker: ScreenshotMarker
): Promise<string> {
  if (!marker.steps || marker.steps.length === 0) {
    throw new Error('GIF marker requires steps');
  }

  const outputPath = path.join(CONFIG.outputDir, generateFilename(marker));
  const tempDir = `/tmp/gif-frames-${Date.now()}`;
  fs.mkdirSync(tempDir, { recursive: true });

  console.log(`Capturing GIF: ${marker.description}`);
  console.log(`  Steps: ${marker.steps.join(' -> ')}`);

  // Capture frame for each step
  const frames: string[] = [];
  for (let i = 0; i < marker.steps.length; i++) {
    const step = marker.steps[i];
    const framePath = path.join(tempDir, `frame-${i.toString().padStart(3, '0')}.png`);

    // Parse step - could be a path or description
    const targetPath = step.startsWith('/') ? step : inferPath(step);

    await page.goto(`${CONFIG.baseUrl}${targetPath}`);
    await page.waitForLoadState('networkidle');
    await page.waitForTimeout(300);

    await page.screenshot({ path: framePath });
    frames.push(framePath);
    console.log(`  Frame ${i + 1}/${marker.steps.length}: ${step}`);
  }

  // Create GIF using ffmpeg (using execFileSync for security - no shell injection)
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  try {
    execFileSync('ffmpeg', [
      '-y',
      '-framerate', '0.5',
      '-i', `${tempDir}/frame-%03d.png`,
      '-vf', 'scale=1200:-1',
      outputPath
    ], { stdio: 'pipe' });
    console.log(`  Saved GIF: ${outputPath}`);
  } catch (error) {
    console.error('  FFmpeg failed, GIF not created');
    throw error;
  }

  // Cleanup temp frames
  fs.rmSync(tempDir, { recursive: true });

  return outputPath;
}

// Main execution
async function main() {
  const args = process.argv.slice(2);
  let targetFiles: string[] = [];

  // Parse arguments
  const fileArgIndex = args.indexOf('--file');
  if (fileArgIndex !== -1 && args[fileArgIndex + 1]) {
    targetFiles = [args[fileArgIndex + 1]];
  } else {
    // Find all markdown files
    targetFiles = await glob(`${CONFIG.docsDir}/**/*.md`);
  }

  console.log(`Scanning ${targetFiles.length} file(s) for screenshot markers...`);

  // Collect all markers
  const allMarkers: ScreenshotMarker[] = [];
  for (const file of targetFiles) {
    const markers = parseMarkdownFile(file);
    allMarkers.push(...markers);
  }

  console.log(`Found ${allMarkers.length} marker(s)`);

  if (allMarkers.length === 0) {
    console.log('No markers to process');
    return;
  }

  // Launch browser and process markers
  const browser: Browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1400, height: 900 }
  });
  const page = await context.newPage();

  try {
    await login(page);

    const results: { marker: ScreenshotMarker; output: string; success: boolean }[] = [];

    for (const marker of allMarkers) {
      try {
        let output: string;
        if (marker.type === 'gif') {
          output = await captureGif(page, marker);
        } else {
          output = await captureScreenshot(page, marker);
        }
        results.push({ marker, output, success: true });
      } catch (error) {
        console.error(`Failed to capture: ${marker.description}`);
        console.error(error);
        results.push({ marker, output: '', success: false });
      }
    }

    // Summary
    console.log('\n--- Summary ---');
    console.log(`Total: ${results.length}`);
    console.log(`Success: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);

    // Output results as JSON for CI integration
    if (process.env.CI) {
      console.log('\n--- Results JSON ---');
      console.log(JSON.stringify(results.map(r => ({
        description: r.marker.description,
        output: r.output,
        success: r.success
      }))));
    }

  } finally {
    await browser.close();
  }
}

main().catch(console.error);
