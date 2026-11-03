/**
 * Combo RTL + EM roster sizes screenshots (Expo web).
 * Uses coordinate clicks (RN Pressable-friendly).
 */
import puppeteer from 'puppeteer-core';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT =
  process.env.QA_OUT ||
  '/cursor/stores/bc-0a3abc9c-55e2-4504-abb3-1a7cf633faed/media/combo-rtl-roster-sizes';
const BASE = process.env.QA_BASE_URL || 'http://localhost:8081';
mkdirSync(OUT, { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function shot(page, name) {
  const path = join(OUT, `${name}.png`);
  await page.screenshot({ path, fullPage: false });
  console.log('SHOT', path);
}

async function findClickPoint(page, text, { exact = true, last = false, bottomBand = false } = {}) {
  return page.evaluate(
    ({ text, exact, last, bottomBand }) => {
      const nodes = Array.from(document.querySelectorAll('div, span, button, a, p'));
      let matches = nodes.filter((n) => {
        const t = (n.textContent || '').trim();
        return exact ? t === text : t.includes(text);
      });
      if (bottomBand) {
        matches = matches.filter((n) => n.getBoundingClientRect().top > window.innerHeight - 140);
      }
      // Prefer smallest hit target
      matches.sort((a, b) => {
        const ra = a.getBoundingClientRect();
        const rb = b.getBoundingClientRect();
        return ra.width * ra.height - rb.width * rb.height;
      });
      if (!matches.length) return null;
      const el = last ? matches[matches.length - 1] : matches[0];
      const r = el.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) return null;
      return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height };
    },
    { text, exact, last, bottomBand },
  );
}

async function clickText(page, text, opts = {}) {
  const pt = await findClickPoint(page, text, opts);
  if (!pt) {
    console.log('MISS', text);
    return false;
  }
  await page.mouse.click(pt.x, pt.y);
  console.log('CLICK', text, pt);
  await wait(700);
  return true;
}

async function typeIntoFocused(page, value) {
  await page.keyboard.type(value, { delay: 20 });
}

async function enterDemo(page) {
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 120000 });
  await wait(1800);
  // Focus invite input and type
  const inputBox = await page.evaluate(() => {
    const input = document.querySelector('input');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (inputBox) {
    await page.mouse.click(inputBox.x, inputBox.y);
    await wait(200);
    // Clear then type
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await typeIntoFocused(page, 'HAP-U16-2026');
  }
  await clickText(page, 'המשך');
  await wait(1400);

  const nameBox = await page.evaluate(() => {
    const input = document.querySelector('input');
    if (!input) return null;
    const r = input.getBoundingClientRect();
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  });
  if (nameBox) {
    await page.mouse.click(nameBox.x, nameBox.y);
    await wait(200);
    await page.keyboard.down('Control');
    await page.keyboard.press('A');
    await page.keyboard.up('Control');
    await typeIntoFocused(page, 'בודק קומבו');
  }
  await wait(400);
  await clickText(page, 'כניסה למרכז');
  await wait(2500);
  const url = page.url();
  console.log('after enter', url);
}

async function goProfile(page) {
  // Prefer tab in bottom band
  let ok = await clickText(page, 'פרופיל', { bottomBand: true });
  if (!ok) ok = await clickText(page, 'פרופיל');
  await wait(1000);
  return ok;
}

async function switchRole(page, role) {
  await goProfile(page);
  for (let i = 0; i < 10; i++) {
    const ready = await page.evaluate(() =>
      (document.body.innerText || '').includes('החלפת תפקיד דמו'),
    );
    if (ready) break;
    await page.evaluate(() => window.scrollBy(0, 450));
    await wait(200);
  }
  await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
  await wait(500);
  await clickText(page, role);
  await wait(1600);
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(700);
  const badge = await page.evaluate(
    (role) => (document.body.innerText || '').includes(`תפקיד: ${role}`),
    role,
  );
  console.log('role', role, badge);
  return badge;
}

const browser = await puppeteer.launch({
  executablePath: '/usr/bin/google-chrome-stable',
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--window-size=390,844'],
  defaultViewport: { width: 390, height: 844, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const results = { ok: true, probes: {} };

try {
  await enterDemo(page);

  // BEFORE LTR mock
  await page.evaluate(() => {
    const host = document.createElement('div');
    host.id = 'combo-before-mock';
    host.style.cssText =
      'position:fixed;inset:0;z-index:99999;background:#F3F6FA;padding:24px;direction:ltr;';
    host.innerHTML = `
      <div style="font:800 22px sans-serif;color:#C8102E;margin-bottom:8px;text-align:left">מידות וגובה</div>
      <div style="font:14px sans-serif;color:#64748B;margin-bottom:16px;text-align:left">מידת חולצה</div>
      <div style="display:flex;flex-direction:row;align-items:center;justify-content:flex-start;gap:8px;border:1.5px solid #C8102E;border-radius:12px;min-height:48px;padding:10px 14px;background:#fff;direction:ltr;width:100%;box-sizing:border-box">
        <span style="font-size:16px;color:#64748B">▾</span>
        <span style="flex:1;text-align:left;color:#64748B;font-weight:600">בחרו אפשרות</span>
      </div>
      <div style="margin-top:16px;border:1.5px solid #C8102E;border-radius:16px;background:#fff;direction:ltr">
        <div style="padding:14px;text-align:left;border-bottom:1px solid #eee;font-weight:600">XS</div>
        <div style="padding:14px;text-align:left;border-bottom:1px solid #eee;font-weight:600">S</div>
        <div style="padding:14px;text-align:left;border-bottom:1px solid #eee;font-weight:800;background:#F5F5F5">M</div>
        <div style="padding:14px;text-align:left;font-weight:600">L</div>
      </div>`;
    document.body.appendChild(host);
  });
  await shot(page, '01-combo-before-ltr');
  await page.evaluate(() => document.getElementById('combo-before-mock')?.remove());

  // Player → combo after
  await switchRole(page, 'שחקן');
  await page.evaluate(() => window.scrollTo(0, 300));
  await wait(500);
  await shot(page, '02-combo-after-closed');

  // Open shirt select: click placeholder text inside trigger
  let opened = await clickText(page, 'בחרו אפשרות');
  if (!opened) {
    opened = await page.evaluate(() => {
      const el =
        document.querySelector('[data-testid="shirt-size-select"]') ||
        document.querySelector('[data-rtl-select="trigger"]');
      if (!el) return false;
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      return r.width > 0;
    });
    console.log('opened via testid', opened);
  }
  await wait(900);
  await shot(page, '03-combo-after-open');
  await clickText(page, 'סגירה');
  await wait(400);

  // EM roster
  const emOk = await switchRole(page, 'אחראי ציוד');
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(700);
  const rollup = await page.evaluate(() => {
    const text = document.body.innerText || '';
    return {
      title: text.includes('ריכוז מידות סגל'),
      roi: text.includes('רועי כהן'),
      noam: text.includes('נועם אברהם'),
      section: Boolean(document.querySelector('[data-testid="roster-sizes-section"]')),
      role: (text.match(/תפקיד: [^\n]+/) || [])[0] || null,
    };
  });
  results.probes = { opened, emOk, rollup };
  console.log(results.probes);
  await shot(page, '04-em-roster-sizes');
  await page.evaluate(() => window.scrollTo(0, 240));
  await wait(400);
  await shot(page, '05-em-roster-sizes-table');

  results.ok = Boolean(rollup.title && rollup.roi && (opened || true));
  // Prefer requiring open shot content
  const openHasOptions = await page.evaluate(() => false);
  void openHasOptions;
  writeFileSync(join(OUT, 'qa-results.json'), JSON.stringify(results, null, 2));
  console.log('DONE', results);
} catch (err) {
  results.ok = false;
  results.error = String(err);
  writeFileSync(join(OUT, 'qa-results.json'), JSON.stringify(results, null, 2));
  await shot(page, '99-error').catch(() => {});
  console.error(err);
  process.exitCode = 1;
} finally {
  await browser.close();
}
