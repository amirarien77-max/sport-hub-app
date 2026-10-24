/**
 * Focused QA: fullscreen Save/Clear visible+clickable, arrow press-drag-release.
 * Run: node scripts/qa-court-board-edit-fix.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT =
  '/cursor/stores/bc-0a3abc9c-55e2-4504-abb3-1a7cf633faed/media/court-board-edit-fix';
const BASE = process.env.QA_BASE_URL || 'http://localhost:8081';

mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('SHOT', path);
}

const browser = await chromium.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const results = {
  openFullscreen: 'UNKNOWN',
  saveVisible: 'UNKNOWN',
  clearVisible: 'UNKNOWN',
  clearWorks: 'UNKNOWN',
  arrowDrawn: 'UNKNOWN',
  saveWorks: 'UNKNOWN',
};

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(3000);
  await shot(page, '01-landing');

  if (await page.getByText('המשך').count()) {
    const invite = page.getByPlaceholder('HAP-U16-2026');
    if (await invite.count()) {
      await invite.click();
      await invite.fill('HAP-U16-2026');
    }
    await page.getByText('המשך', { exact: true }).click();
    await page.waitForTimeout(1500);
  }

  const enterHub = page.getByText('כניסה למרכז', { exact: false });
  await enterHub.waitFor({ timeout: 20000 });
  const quickCoach = page.getByText('מאמן ראשי', { exact: true });
  const count = await quickCoach.count();
  if (count >= 2) {
    await quickCoach.nth(count - 1).click();
  } else {
    const nameBox = page
      .locator('input')
      .filter({ hasNot: page.locator('[placeholder="HAP-U16-2026"]') })
      .last();
    await nameBox.waitFor({ state: 'visible', timeout: 10000 });
    await nameBox.fill('QA Coach');
    await page.getByText('מאמן ראשי', { exact: true }).first().click();
    await enterHub.click();
  }
  await page.waitForTimeout(2000);

  await page.getByText('תרגילים').last().click();
  await page.waitForTimeout(1500);

  const seeded = page.getByText(/הורן|סט /, { exact: false }).first();
  if (await seeded.count()) {
    await seeded.click();
  } else {
    const titleInput = page.locator('input').first();
    if (await titleInput.isVisible().catch(() => false)) {
      await titleInput.fill('QA Court Board');
    }
    const create = page.getByText('יצירת תרגיל', { exact: false });
    if (await create.count()) await create.first().click();
  }
  await page.waitForTimeout(1500);
  await shot(page, '02-play-detail');

  // Inline Save/Clear should exist for coach
  const inlineClear = page.getByLabel('ניקוי לוח').first();
  const inlineSave = page.getByLabel('שמירת לוח').first();
  console.log(
    'INLINE',
    JSON.stringify({
      clear: await inlineClear.count(),
      save: await inlineSave.count(),
    }),
  );

  const openCourt = page.getByText('פתיחת מגרש במסך מלא', { exact: false });
  if (await openCourt.count()) {
    await openCourt.first().click();
  } else {
    await page.getByText(/לוח מגרש|סקיצת/, { exact: false }).first().click();
  }
  await page.waitForTimeout(1200);
  await shot(page, '03-fullscreen');
  results.openFullscreen =
    (await page.getByText('עריכת לוח מגרש', { exact: false }).count()) > 0 ? 'PASS' : 'FAIL';

  const fsClear = page.getByLabel('ניקוי לוח').last();
  const fsSave = page.getByLabel('שמירת לוח').last();
  const clearBox = await fsClear.boundingBox();
  const saveBox = await fsSave.boundingBox();
  const inViewport = (box) =>
    !!box && box.y >= 0 && box.y + box.height <= 844 && box.height >= 40;
  results.clearVisible = inViewport(clearBox) ? 'PASS' : 'FAIL';
  results.saveVisible = inViewport(saveBox) ? 'PASS' : 'FAIL';
  console.log('ACTION_BOXES', JSON.stringify({ clearBox, saveBox }));

  // Draw arrow
  await page.getByText('חץ', { exact: true }).first().click();
  await page.waitForTimeout(300);
  const courtBox = await page.locator('svg').first().boundingBox();
  if (!courtBox) throw new Error('no court svg bbox');
  const sx = courtBox.x + courtBox.width * 0.2;
  const sy = courtBox.y + courtBox.height * 0.75;
  const ex = courtBox.x + courtBox.width * 0.8;
  const ey = courtBox.y + courtBox.height * 0.3;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 10 });
  await page.mouse.move(ex, ey, { steps: 12 });
  await page.mouse.up();
  await page.waitForTimeout(700);
  await shot(page, '04-arrow-drawn');

  // After drag, hint should leave "release" state; yellow arrow shaft should exist
  const yellowBars = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div')];
    return nodes.filter((n) => {
      const s = getComputedStyle(n);
      const bg = s.backgroundColor;
      return (
        (bg.includes('244') || bg.includes('211') || bg.toLowerCase().includes('f4d35e')) &&
        parseFloat(s.height) >= 3 &&
        parseFloat(s.width) >= 20
      );
    }).length;
  });
  results.arrowDrawn = yellowBars > 0 ? 'PASS' : 'FAIL';
  console.log('YELLOW_ARROW_CANDIDATES', yellowBars);

  // Place a marker then clear
  await page.getByText('סימון', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.mouse.click(courtBox.x + courtBox.width * 0.5, courtBox.y + courtBox.height * 0.55);
  await page.waitForTimeout(400);
  await shot(page, '05-marker');

  await fsClear.click({ force: true });
  await page.waitForTimeout(500);
  await shot(page, '06-cleared');
  const yellowAfterClear = await page.evaluate(() => {
    const nodes = [...document.querySelectorAll('div')];
    return nodes.filter((n) => {
      const s = getComputedStyle(n);
      const bg = s.backgroundColor;
      return (
        (bg.includes('244') || bg.includes('211') || bg.toLowerCase().includes('f4d35e')) &&
        parseFloat(s.height) >= 3 &&
        parseFloat(s.width) >= 20
      );
    }).length;
  });
  results.clearWorks = yellowAfterClear === 0 ? 'PASS' : 'FAIL';

  // Redraw arrow, then save (closes modal)
  await page.getByText('חץ', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move(ex, ey, { steps: 15 });
  await page.mouse.up();
  await page.waitForTimeout(400);

  await fsSave.click({ force: true });
  await page.waitForTimeout(1000);
  await shot(page, '07-after-save');
  const stillFullscreen =
    (await page.getByText('עריכת לוח מגרש', { exact: false }).count()) > 0;
  results.saveWorks = stillFullscreen ? 'FAIL' : 'PASS';

  console.log('RESULTS', JSON.stringify(results, null, 2));
  const failed = Object.values(results).some((v) => v === 'FAIL' || v === 'UNKNOWN');
  if (failed) process.exitCode = 1;
} catch (err) {
  console.error('QA_ERROR', err);
  await shot(page, '99-error');
  results.error = String(err?.message || err);
  console.log('RESULTS', JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
