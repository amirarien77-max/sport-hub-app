/**
 * Full-app Hebrew RTL audit (Expo web).
 * Measures document dir, text-align of sample nodes, chip start edge, screenshots.
 * Run: EXPO_PUBLIC_DEMO_MODE=1 node scripts/qa-full-app-rtl.mjs
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT =
  process.env.QA_OUT ||
  '/cursor/stores/bc-0a3abc9c-55e2-4504-abb3-1a7cf633faed/media/full-app-rtl';
const BASE = process.env.QA_BASE_URL || 'http://localhost:8081';

mkdirSync(OUT, { recursive: true });

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log('SHOT', path);
  return path;
}

async function wait(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function findClickPoint(page, text, { exact = true, last = false } = {}) {
  return page.evaluate(
    ({ text, exact, last }) => {
      const nodes = Array.from(document.querySelectorAll('div, span, button, a, p'));
      const matches = nodes.filter((n) => {
        const t = (n.textContent || '').trim();
        return exact ? t === text : t.includes(text);
      });
      if (!matches.length) return null;
      const el = last ? matches[matches.length - 1] : matches[0];
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    },
    { text, exact, last },
  );
}

async function clickExact(page, text, { last = false } = {}) {
  const pt = await findClickPoint(page, text, { exact: true, last });
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

async function clickIncludes(page, text, { last = false } = {}) {
  const pt = await findClickPoint(page, text, { exact: false, last });
  if (!pt) return false;
  await page.mouse.click(pt.x, pt.y);
  return true;
}

async function fillFirstInput(page, value) {
  return page.evaluate((value) => {
    const input = document.querySelector('input');
    if (!input) return false;
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.dispatchEvent(new Event('change', { bubbles: true }));
    return true;
  }, value);
}

async function auditVisibleText(page, label) {
  return page.evaluate((screen) => {
    const nodes = Array.from(document.querySelectorAll('div, span, p, input, textarea, button'));
    const samples = [];
    let leftish = 0;
    let rightish = 0;
    let centered = 0;
    for (const el of nodes) {
      const style = window.getComputedStyle(el);
      const rect = el.getBoundingClientRect();
      if (rect.width < 8 || rect.height < 8) continue;
      if (rect.bottom < 0 || rect.top > window.innerHeight) continue;
      const text = (el.innerText || el.value || '').trim();
      if (!text || text.length < 2) continue;
      if (el.children.length > 3) continue;
      const ta = style.textAlign;
      const dir = style.direction;
      const entry = {
        screen,
        text: text.slice(0, 48).replace(/\s+/g, ' '),
        textAlign: ta,
        direction: dir,
        tag: el.tagName.toLowerCase(),
        left: Math.round(rect.left),
        right: Math.round(rect.right),
      };
      if (ta === 'right' || (ta === 'start' && dir === 'rtl')) rightish += 1;
      else if (ta === 'center') centered += 1;
      else if (ta === 'left' || (ta === 'start' && dir === 'ltr') || (ta === 'end' && dir === 'rtl')) {
        leftish += 1;
        samples.push(entry);
      }
    }
    const styleTag = Boolean(document.getElementById('sport-hub-rtl-base'));
    return {
      screen,
      htmlDir: document.documentElement.getAttribute('dir'),
      htmlLang: document.documentElement.getAttribute('lang'),
      bodyDir: document.body?.getAttribute('dir'),
      rtlStyleInjected: styleTag,
      counts: { rightish, leftish, centered },
      leftSamples: samples.slice(0, 25),
    };
  }, label);
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--window-size=390,844'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});

const page = await browser.newPage();
page.setDefaultTimeout(60000);
const report = { screens: [], errors: [], nav: {} };

page.on('pageerror', (err) => report.errors.push(String(err)));

try {
  await page.goto(BASE, { waitUntil: 'networkidle0', timeout: 120000 });
  await wait(2500);
  await shot(page, '01-landing');

  report.nav.inviteFilled = await fillFirstInput(page, 'HAP-U16-2026');
  await shot(page, '02-invite');
  report.nav.continue = await clickExact(page, 'המשך');
  await wait(2000);

  await shot(page, '03-profile-setup');
  report.screens.push(await auditVisibleText(page, 'profile-setup'));

  // Quick persona head coach (last exact match)
  report.nav.quickCoach = await clickExact(page, 'מאמן ראשי', { last: true });
  await wait(2500);

  await shot(page, '04-schedule');
  report.screens.push(await auditVisibleText(page, 'schedule'));

  report.nav.listView = await clickIncludes(page, 'רשימה');
  await wait(800);
  await shot(page, '05-schedule-list');
  report.screens.push(await auditVisibleText(page, 'schedule-list'));

  report.nav.weekly = await clickIncludes(page, 'לו״ז שבועי');
  await wait(1500);
  await shot(page, '06-weekly-schedule');
  report.screens.push(await auditVisibleText(page, 'weekly-schedule'));

  report.nav.weeklyBack = await clickIncludes(page, 'חזרה');
  await wait(1000);

  for (const [name, label] of [
    ['07-attendance', 'נוכחות'],
    ['08-health', 'בריאות'],
    ['09-plays', 'תרגילים'],
    ['10-profile', 'פרופיל'],
  ]) {
    report.nav[name] = await clickExact(page, label, { last: true });
    await wait(1500);
    await shot(page, name);
    report.screens.push(await auditVisibleText(page, name));
  }

  // Back to plays + open seeded play
  await clickExact(page, 'תרגילים', { last: true });
  await wait(1000);
  report.nav.playOpened = await page.evaluate(() => {
    const candidates = Array.from(document.querySelectorAll('div, span')).filter((n) => {
      const t = (n.textContent || '').trim();
      return t.includes('הורן') || t.includes('סט ');
    });
    if (!candidates.length) return false;
    candidates[0].click();
    return true;
  });
  await wait(1500);
  await shot(page, '11-play-detail');
  report.screens.push(await auditVisibleText(page, 'play-detail'));

  report.nav.courtOpened = await clickIncludes(page, 'מסך מלא');
  await wait(1500);
  await shot(page, '12-court-editor');
  report.screens.push(await auditVisibleText(page, 'court-editor'));

  // Measure court back button edge
  report.courtBack = await page.evaluate(() => {
    const n = Array.from(document.querySelectorAll('div, span')).find((el) =>
      (el.textContent || '').includes('חזרה'),
    );
    if (!n) return null;
    const r = n.getBoundingClientRect();
    return {
      text: (n.textContent || '').trim().slice(0, 40),
      left: Math.round(r.left),
      right: Math.round(r.right),
      nearerRight: r.left > window.innerWidth - r.right,
    };
  });
} catch (e) {
  report.errors.push(String(e?.stack || e));
  console.error(e);
  await shot(page, '99-error').catch(() => {});
}

writeFileSync(join(OUT, 'rtl-audit.json'), JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));
await browser.close();
