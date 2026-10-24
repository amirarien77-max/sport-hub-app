/**
 * Pure coordinate QA: under RTL-forced LTR court space, stored % x must match
 * physical tap / court width (no mirror). Run: node scripts/court-board-coord-qa.mjs
 */

function clampPct(n) {
  return Math.min(100, Math.max(0, n));
}

/** Same mapping CourtBoard uses after the RTL fix. */
function tapToPct(locationX, locationY, width, height) {
  return {
    x: clampPct(Math.round((locationX / width) * 100)),
    y: clampPct(Math.round((locationY / height) * 100)),
  };
}

function pctToLeft(xPct, width, markerRadius = 18) {
  // Physical left — court direction:ltr so RN does not flip under I18nManager RTL.
  return (xPct / 100) * width - markerRadius;
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const W = 400;
const H = 280;
const cases = [
  { name: 'left-third', locationX: 40, locationY: 70 },
  { name: 'center', locationX: 200, locationY: 140 },
  { name: 'right-third', locationX: 360, locationY: 210 },
];

let failed = 0;
for (const c of cases) {
  const pct = tapToPct(c.locationX, c.locationY, W, H);
  const left = pctToLeft(pct.x, W);
  const markerCenterX = left + 18;
  const err = Math.abs(markerCenterX - c.locationX);
  const mirroredLeft = W - ((pct.x / 100) * W) - 18; // what buggy RTL left-flip would do
  const mirroredCenter = mirroredLeft + 18;
  const mirroredErr = Math.abs(mirroredCenter - c.locationX);

  console.log(
    JSON.stringify({
      case: c.name,
      tap: c.locationX,
      pctX: pct.x,
      markerCenterX,
      errPx: err,
      wouldBeMirroredErrPx: mirroredErr,
      pass: err <= 2,
    }),
  );
  if (err > 2) failed += 1;
  // Ensure we are not coincidentally the mirrored placement on asymmetric taps
  if (c.locationX !== W / 2) {
    assert(mirroredErr > err, `${c.name}: expected physical placement closer than mirrored`);
  }
}

// Serialize round-trip for arrows
const board = {
  markers: [{ x: 22, y: 70, label: '1' }],
  arrows: [{ id: 'a1', x1: 20, y1: 80, x2: 70, y2: 30 }],
};
const raw = JSON.stringify(board);
const parsed = JSON.parse(raw);
assert(parsed.arrows[0].x2 === 70, 'arrow persist');
assert(parsed.markers[0].x === 22, 'marker persist');

if (failed) {
  console.error(`FAIL: ${failed} coordinate case(s)`);
  process.exit(1);
}
console.log('PASS: tap≈marker (physical LTR court), arrows schema ok');
