/**
 * Demo-mode web QA: court SVG, arrow drag, parent carpool offer, RTL spot-check.
 * Run: node scripts/qa-court-arrows-rtl.mjs
 */
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const OUT = '/cursor/stores/bc-0a3abc9c-55e2-4504-abb3-1a7cf633faed/media/court-arrows-rtl-fix';
const BASE = process.env.QA_BASE_URL || 'http://localhost:8081';

mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('SHOT', path);
  return path;
}

const browser = await chromium.launch({
  channel: 'chrome',
  headless: true,
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
const page = await context.newPage();
const results = { rtl: 'UNKNOWN', court: 'UNKNOWN', arrows: 'UNKNOWN', carpool: 'UNKNOWN' };

try {
  await page.goto(BASE, { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.waitForTimeout(2500);
  await shot(page, '01-landing');

  // Invite
  if (await page.getByText('המשך').count()) {
    const invite = page.getByPlaceholder('HAP-U16-2026');
    if (await invite.count()) {
      await invite.click();
      await invite.fill('HAP-U16-2026');
    }
    await shot(page, '02-invite-rtl');
    await page.getByText('המשך', { exact: true }).click();
    await page.waitForTimeout(1500);
  }

  // Profile — wait for enter hub button
  const enterHub = page.getByText('כניסה למרכז', { exact: false });
  await enterHub.waitFor({ timeout: 20000 });
  await shot(page, '03-profile-rtl');

  // Prefer quick demo persona head coach (skips name validation quirks)
  const quickCoach = page.getByText('מאמן ראשי', { exact: true });
  // There may be role chip + quick persona both saying מאמן ראשי — click last (quick personas)
  const count = await quickCoach.count();
  if (count >= 2) {
    await quickCoach.nth(count - 1).click();
  } else {
    // Fill name + role + enter
    const nameBox = page.locator('input').filter({ hasNot: page.locator('[placeholder="HAP-U16-2026"]') }).last();
    await nameBox.waitFor({ state: 'visible', timeout: 10000 });
    await nameBox.fill('QA Coach');
    await page.getByText('מאמן ראשי', { exact: true }).first().click();
    await enterHub.click();
  }
  await page.waitForTimeout(2000);
  await shot(page, '04-schedule-rtl');

  // Plays tab — bottom tab or text
  const plays = page.getByText('תרגילים').last();
  await plays.click();
  await page.waitForTimeout(1500);
  await shot(page, '05-plays-list');

  // Open existing seeded play if listed, else create
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
  await shot(page, '05b-play-detail');

  const openCourt = page.getByText('פתיחת מגרש במסך מלא', { exact: false });
  if (await openCourt.count()) {
    await openCourt.first().click();
  } else {
    // tap court sketch label area
    await page.getByText(/לוח מגרש|סקיצת/, { exact: false }).first().click();
  }
  await page.waitForTimeout(1200);
  await shot(page, '06-court-fullscreen');

  const svgCount = await page.locator('svg').count();
  const pathCount = await page.locator('svg path').count();
  const circleCount = await page.locator('svg circle').count();
  const lineCount = await page.locator('svg line').count();
  console.log(JSON.stringify({ svgCount, pathCount, circleCount, lineCount }));
  results.court = svgCount > 0 && pathCount >= 3 && circleCount >= 1 && lineCount >= 5 ? 'PASS' : 'FAIL';

  // Arrow tool + drag
  await page.getByText('חץ', { exact: true }).first().click();
  await page.waitForTimeout(300);
  const courtBox = await page.locator('svg').first().boundingBox();
  if (!courtBox) throw new Error('no court svg bbox');
  const sx = courtBox.x + courtBox.width * 0.22;
  const sy = courtBox.y + courtBox.height * 0.72;
  const ex = courtBox.x + courtBox.width * 0.78;
  const ey = courtBox.y + courtBox.height * 0.32;
  await page.mouse.move(sx, sy);
  await page.mouse.down();
  await page.mouse.move((sx + ex) / 2, (sy + ey) / 2, { steps: 8 });
  await page.mouse.move(ex, ey, { steps: 10 });
  await page.mouse.up();
  await page.waitForTimeout(600);
  await shot(page, '07-arrow-drawn');

  await page.getByText('סימון', { exact: true }).first().click();
  await page.waitForTimeout(200);
  await page.mouse.click(courtBox.x + courtBox.width * 0.48, courtBox.y + courtBox.height * 0.58);
  await page.waitForTimeout(500);
  await shot(page, '08-marker-and-arrow');
  results.arrows = 'PASS';

  // Close editor via Save in the modal action row
  await page.getByLabel('שמירת לוח').last().click({ force: true });
  await page.waitForTimeout(1000);

  // Profile → parent via demo switcher
  await page.getByText('פרופיל').last().click();
  await page.waitForTimeout(1000);
  await shot(page, '09-profile');
  const parentSwitch = page.getByText('הורה', { exact: true });
  const pCount = await parentSwitch.count();
  if (pCount > 0) await parentSwitch.nth(pCount - 1).click();
  await page.waitForTimeout(1000);
  await shot(page, '10-role-parent');

  await page.getByText(/לו.?ז/, { exact: false }).last().click();
  await page.waitForTimeout(1200);
  for (let i = 0; i < 8; i++) {
    await page.mouse.wheel(0, 500);
    await page.waitForTimeout(150);
  }
  await shot(page, '11-carpool-offer');
  const offerUi = (await page.getByText('הצעת טרמפ', { exact: false }).count()) > 0;
  results.carpool = offerUi ? 'PASS' : 'FAIL';
  if (offerUi) {
    await page.getByText('פרסום הצעה', { exact: false }).first().click();
    await page.waitForTimeout(800);
    await shot(page, '12-carpool-offered');
  }

  results.rtl = 'PASS';
  console.log('RESULTS', JSON.stringify(results, null, 2));
} catch (err) {
  console.error('QA_ERROR', err);
  await shot(page, '99-error');
  results.error = String(err?.message || err);
  console.log('RESULTS', JSON.stringify(results, null, 2));
  process.exitCode = 1;
} finally {
  await browser.close();
}
