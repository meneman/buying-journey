const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(
  path.join(__dirname, '..', 'frontend', 'src', 'index.css'),
  'utf8'
);

function block(selector) {
  const m = css.match(new RegExp(`${selector}\\s*\\{([^}]*)\\}`));
  assert.ok(m, `missing ${selector} block in index.css`);
  return m[1];
}

function varsOf(blockCss) {
  const vars = {};
  for (const m of blockCss.matchAll(/--([\w-]+)\s*:\s*(#[0-9a-fA-F]{6})/g)) {
    vars[m[1]] = m[2];
  }
  return vars;
}

function channel(c) {
  c /= 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function luminance(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function ratio(fg, bg) {
  const hi = Math.max(luminance(fg), luminance(bg));
  const lo = Math.min(luminance(fg), luminance(bg));
  return (hi + 0.05) / (lo + 0.05);
}

const light = varsOf(block(':root'));

function check(fgVar, bgVar, min, label) {
  const fg = light[fgVar];
  const bg = light[bgVar];
  assert.ok(fg, `missing --${fgVar} in :root`);
  assert.ok(bg, `missing --${bgVar} in :root`);
  const r = ratio(fg, bg);
  assert.ok(
    r >= min,
    `${label}: --${fgVar} (${fg}) on --${bgVar} (${bg}) = ${r.toFixed(2)}:1, needs >= ${min}:1`
  );
}

test('light theme body and surface text meets WCAG AA (4.5:1)', () => {
  check('foreground', 'background', 4.5, 'body text');
  check('card-foreground', 'card', 4.5, 'card text');
  check('secondary-foreground', 'secondary', 4.5, 'secondary text');
  check('accent-foreground', 'accent', 4.5, 'accent text');
  check('hiviz-foreground', 'hiviz', 4.5, 'hiviz badge text');
});

test('light theme muted text meets WCAG AA on every surface it sits on', () => {
  for (const bg of ['muted', 'background', 'card', 'secondary']) {
    check('muted-foreground', bg, 4.5, 'muted text');
  }
  check('steel', 'background', 4.5, 'steel icons');
});

test('light theme brand colors meet WCAG AA as text and as fill', () => {
  check('celeste', 'card', 4.5, 'celeste text on card');
  check('celeste', 'background', 4.5, 'celeste text on background');
  check('primary-foreground', 'primary', 4.5, 'button/badge text');
  check('celeste-foreground', 'celeste', 4.5, 'status badge text');
  check('rust-foreground', 'rust', 4.5, 'rust badge text');
  check('destructive-foreground', 'destructive', 4.5, 'destructive button text');
  check('rust', 'card', 4.5, 'rust text on card');
});

test('light theme focus ring meets WCAG AA non-text contrast (3:1)', () => {
  check('ring', 'background', 3, 'focus ring');
});

test('dark theme tokens are untouched by the light contrast fix', () => {
  const dark = varsOf(block('\\.dark'));
  assert.equal(dark['primary'], '#4FB3A0');
  assert.equal(dark['muted-foreground'], '#8A94A6');
  assert.equal(dark['celeste'], '#4FB3A0');
});
