/**
 * Screenshot Capture Pipeline for Shop Director Docs
 *
 * Parses markdown files for screenshot markers and captures screenshots
 * using Playwright with authenticated sessions.
 *
 * Usage:
 *   npx ts-node scripts/capture-screenshots.ts [--file path/to/doc.md]
 *
 * Screenshot marker format:
 *   <!-- SCREENSHOT: description of what to capture -->
 *   <!-- SCREENSHOT: /path/to/page | description -->
 *
 * GIF marker format:
 *   <!-- GIF: step1 | step2 | step3 -->
 */

import { chromium, Browser, Page } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';
import { glob } from 'glob';
import { execFileSync } from 'child_process';

// Configuration
const CONFIG = {
  baseUrl: process.env.APP_URL || 'https://staging.shopdirector.app',
  credentials: {
    email: process.env.DEMO_EMAIL || 'c1admin1@example.com',
    password: process.env.DEMO_PASSWORD || 'sd1234'
  },
  outputDir: 'docs/assets/images',
  docsDir: 'docs'
};

interface ScreenshotMarker {
  type: 'screenshot' | 'gif';
  description: string;
  path?: string;
  steps?: string[];
  sourceFile: string;
  lineNumber: number;
}

// Parse a single markdown file for screenshot markers
function parseMarkdownFile(filePath: string): ScreenshotMarker[] {
  const content = fs.readFileSync(filePath, 'utf-8');
  const lines = content.split('\n');
  const markers: ScreenshotMarker[] = [];

  lines.forEach((line, index) => {
    // Screenshot marker: <!-- SCREENSHOT: description --> or <!-- SCREENSHOT: /path | description -->
    const screenshotMatch = line.match(/<!--\s*SCREENSHOT:\s*(.+?)\s*-->/i);
    if (screenshotMatch) {
      const parts = screenshotMatch[1].split('|').map(s => s.trim());
      if (parts.length === 2 && parts[0].startsWith('/')) {
        markers.push({
          type: 'screenshot',
          path: parts[0],
          description: parts[1],
          sourceFile: filePath,
          lineNumber: index + 1
        });
      } else {
        markers.push({
          type: 'screenshot',
          description: parts[0],
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
  await page.waitForURL(/\/(dashboard|$)/);
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

  // Ensure output directory exists
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });

  // Take screenshot
  await page.screenshot({
    path: outputPath,
    fullPage: false
  });

  console.log(`  Saved: ${outputPath}`);
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
