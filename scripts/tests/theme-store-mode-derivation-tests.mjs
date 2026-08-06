import assert from 'node:assert/strict';

import { appSettings } from '../../src/scripts/storage/app-settings.js';
import { normalizeThemePreset, themeStore } from '../../src/scripts/storage/theme-store.js';

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

// --- 内建主题契约：纸墨 paper-ink ---

test('无已保存设置时默认启用 paper-ink', () => {
  assert.equal(appSettings.get().uiThemePresetId, 'paper-ink');
});

const relLum = (hex) => {
  const c = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4]
    .map((i) => parseInt(c.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => {
  const [hi, lo] = [relLum(a), relLum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

test('内建主题共 3 个、id 唯一，包含 paper-ink', () => {
  const builtins = themeStore.getBuiltinThemes();
  assert.equal(builtins.length, 3);
  const ids = builtins.map((t) => t.id);
  assert.equal(new Set(ids).size, 3);
  assert.ok(ids.includes('paper-ink'));
});

test('前两个内建主题显示为经典白、经典黑', () => {
  const [light, dark] = themeStore.getBuiltinThemes();
  assert.deepEqual(
    [light.id, light.name, dark.id, dark.name],
    ['classic-light', '经典白', 'classic-dark', '经典黑'],
  );
});

test('paper-ink 元数据完整且为浅色内建主题', () => {
  const paper = themeStore.getBuiltinThemes().find((t) => t.id === 'paper-ink');
  assert.ok(paper);
  assert.equal(paper.mode, 'light');
  assert.equal(paper.version, 1);
  assert.equal(paper.source, 'chat-app-builtin');
  assert.equal(paper.meta.builtin, true);
  assert.equal(paper.meta.importedFrom, 'builtin');
  assert.ok(paper.meta.createdAt && paper.meta.updatedAt);
});

test('paper-ink token 键集合与 classic-light 完全同构（round-trip 不丢不漏）', () => {
  const builtins = themeStore.getBuiltinThemes();
  const paper = builtins.find((t) => t.id === 'paper-ink');
  const light = builtins.find((t) => t.id === 'classic-light');
  assert.ok(paper && light);
  assert.deepEqual(Object.keys(paper.tokens).sort(), Object.keys(light.tokens).sort());
  for (const group of Object.keys(light.tokens)) {
    assert.deepEqual(
      Object.keys(paper.tokens[group]).sort(),
      Object.keys(light.tokens[group]).sort(),
      `token 组 ${group} 键集合应与 classic-light 一致`,
    );
  }
  // normalize round-trip：merge base 不应改动任何 token，亮度推导为 light
  const t = normalizeThemePreset(paper);
  assert.equal(t.mode, 'light');
  assert.deepEqual(t.tokens, paper.tokens);
});

test('paper-ink 自有文字满足对比度门槛（普通字 4.5:1）', () => {
  const paper = themeStore.getBuiltinThemes().find((t) => t.id === 'paper-ink');
  assert.ok(paper);
  const { surface, text, bubble } = paper.tokens;
  assert.ok(contrast(text.primary, surface.page) >= 4.5, 'primary/page');
  assert.ok(contrast(text.secondary, surface.page) >= 4.5, 'secondary/page');
  assert.ok(contrast(text.muted, surface.page) >= 4.5, 'muted/page');
  assert.ok(contrast(text.muted, '#ffffff') >= 4.5, 'muted/card');
  assert.ok(contrast(text.link, surface.page) >= 4.5, 'link/page');
  assert.ok(contrast(text.inverse, bubble.user) >= 4.5, 'inverse/bubble.user');
  assert.ok(contrast(text.primary, bubble.assistant) >= 4.5, 'primary/bubble.assistant');
});

test('builtin id 不可被自定义主题覆盖（paper-ink 同 id 保存会改派新 id）', async () => {
  const saved = await themeStore.saveTheme({
    id: 'paper-ink',
    name: 'fake paper',
    tokens: { surface: { page: '#101010' } },
  });
  assert.notEqual(saved.id, 'paper-ink');
  assert.equal(saved.meta.builtin, false);
  const resolved = themeStore.getTheme('paper-ink');
  assert.equal(resolved.meta.builtin, true);
  assert.equal(resolved.mode, 'light');
  await themeStore.deleteTheme(saved.id);
});

let failed = 0;
for (const t of tests) {
  try { await t.fn(); console.log(`ok - ${t.name}`); }
  catch (err) { failed += 1; console.error(`not ok - ${t.name}`); console.error(err); }
}
if (failed > 0) process.exit(1);
