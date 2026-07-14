import assert from 'node:assert/strict';

import { normalizeThemePreset } from '../../src/scripts/storage/theme-store.js';

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// --- mode 从表面亮度推导，纠正作者填错的 mode 字段（根除深浅混）---

test('深色表面 + 作者误标 mode:light → 纠正为 dark', () => {
  const t = normalizeThemePreset({
    name: 'x', mode: 'light',
    tokens: { surface: { page: '#171b20' } },
  });
  assert.equal(t.mode, 'dark');
});

test('浅色表面 + 作者误标 mode:dark → 纠正为 light', () => {
  const t = normalizeThemePreset({
    name: 'x', mode: 'dark',
    tokens: { surface: { page: '#f4f5f6' } },
  });
  assert.equal(t.mode, 'light');
});

test('rgba 深色表面 → dark（忽略 alpha）', () => {
  const t = normalizeThemePreset({
    name: 'x', tokens: { surface: { page: 'rgba(20, 24, 30, 0.9)' } },
  });
  assert.equal(t.mode, 'dark');
});

test('surface.page 缺失时退回 panel/card 判断明暗', () => {
  const t = normalizeThemePreset({
    name: 'x', tokens: { surface: { panel: '#2a1a44' } },
  });
  assert.equal(t.mode, 'dark');
});

test('无法解析的表面色（渐变）→ 退回作者标注的 mode', () => {
  const t = normalizeThemePreset({
    name: 'x', mode: 'dark',
    tokens: { surface: { page: 'linear-gradient(#111, #222)' } },
  });
  assert.equal(t.mode, 'dark');
});

test('完全无 tokens → 退回作者 mode（默认 light）', () => {
  assert.equal(normalizeThemePreset({ name: 'x' }).mode, 'light');
  assert.equal(normalizeThemePreset({ name: 'x', mode: 'dark' }).mode, 'dark');
});

// --- base 按 mode 选择：深色主题以 classic-dark 为底，漏给的 token 继承深色默认 ---

test('深色主题漏给 text token → 继承 classic-dark 的浅色文字（非浅色默认深字）', () => {
  const t = normalizeThemePreset({
    name: 'x',
    tokens: { surface: { page: '#171b20', panel: '#262c34' } },
    // 故意不给 text
  });
  assert.equal(t.mode, 'dark');
  // classic-dark 的 text.primary 是浅色 #f0f6fc；若错用浅色 base 会是深色 #0f172a
  assert.equal(t.tokens.text.primary, '#f0f6fc');
});

test('浅色主题漏给 text token → 继承 classic-light 的深色文字', () => {
  const t = normalizeThemePreset({
    name: 'x',
    tokens: { surface: { page: '#ffffff' } },
  });
  assert.equal(t.mode, 'light');
  assert.equal(t.tokens.text.primary, '#0f172a');
});

test('自定义 token 覆盖 base（深色主题自定义强调色保留）', () => {
  const t = normalizeThemePreset({
    name: 'x',
    tokens: { surface: { page: '#1a0f2e' }, accent: { primary: '#c084fc' } },
  });
  assert.equal(t.mode, 'dark');
  assert.equal(t.tokens.accent.primary, '#c084fc');
});

// --- 内建主题不受影响（无回归）---

test('内建 classic-light 形态（浅表面+mode light）→ 仍 light', () => {
  const t = normalizeThemePreset({
    id: 'classic-light', mode: 'light',
    tokens: { surface: { page: '#f4f5f6' } },
  });
  assert.equal(t.mode, 'light');
});

test('内建 classic-dark 形态（深表面+mode dark）→ 仍 dark', () => {
  const t = normalizeThemePreset({
    id: 'classic-dark', mode: 'dark',
    tokens: { surface: { page: '#171b20' } },
  });
  assert.equal(t.mode, 'dark');
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok - ${t.name}`); }
  catch (err) { failed += 1; console.error(`not ok - ${t.name}`); console.error(err); }
}
if (failed > 0) process.exit(1);
