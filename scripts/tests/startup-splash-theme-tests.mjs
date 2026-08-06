import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const indexHtml = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');

const scriptMatch = indexHtml.match(
  /<script\s+id=["']app-startup-splash-theme["'][^>]*>([\s\S]*?)<\/script>/i,
);

assert.ok(scriptMatch, 'index.html 应在启动遮罩绘制前内联首帧主题脚本');

const runStartupTheme = (storageEntries = {}) => {
  const properties = new Map();
  const rootStyle = {
    colorScheme: '',
    setProperty(name, value) {
      properties.set(name, String(value));
    },
  };
  const themeMeta = {
    content: '',
    setAttribute(name, value) {
      if (name === 'content') this.content = String(value);
    },
  };
  const localStorage = {
    getItem(key) {
      return Object.hasOwn(storageEntries, key) ? storageEntries[key] : null;
    },
  };
  const document = {
    documentElement: { style: rootStyle },
    querySelector(selector) {
      return selector === 'meta[name="theme-color"]' ? themeMeta : null;
    },
  };

  vm.runInNewContext(scriptMatch[1], { document, localStorage });
  return { properties, rootStyle, themeMeta };
};

const readVars = (result) => ({
  page: result.properties.get('--app-splash-page'),
  pageAlt: result.properties.get('--app-splash-page-alt'),
  text: result.properties.get('--app-splash-text'),
});

{
  const result = runStartupTheme();
  assert.deepEqual(readVars(result), {
    page: '#f3f1ec',
    pageAlt: '#eceae2',
    text: '#746c5e',
  });
  assert.equal(result.rootStyle.colorScheme, 'light');
}

{
  const result = runStartupTheme({
    app_settings_v1: JSON.stringify({ uiThemePresetId: 'classic-dark' }),
  });
  assert.deepEqual(readVars(result), {
    page: '#171b20',
    pageAlt: '#1d232a',
    text: '#8b98a7',
  });
  assert.equal(result.rootStyle.colorScheme, 'dark');
}

{
  const result = runStartupTheme({
    app_settings_v1: JSON.stringify({ uiThemePresetId: 'theme-custom' }),
    ui_theme_store_v1: JSON.stringify({
      customThemes: [{
        id: 'theme-custom',
        mode: 'dark',
        tokens: {
          surface: { page: '#120d18', pageAlt: '#21172b', topbar: '#1a1221' },
          text: { secondary: '#eadff1' },
        },
      }],
    }),
  });
  assert.deepEqual(readVars(result), {
    page: '#120d18',
    pageAlt: '#21172b',
    text: '#eadff1',
  });
  assert.equal(result.rootStyle.colorScheme, 'dark');
  assert.equal(result.themeMeta.content, '#1a1221');
}

{
  const result = runStartupTheme({ app_settings_v1: '{invalid' });
  assert.equal(result.properties.get('--app-splash-page'), '#f3f1ec');
}

const splashMatch = indexHtml.match(/<div\s+id=["']app-splash["'][^>]*style=["']([\s\S]*?)["']/i);
assert.ok(splashMatch, 'index.html 应保留 app-splash 启动遮罩');
assert.match(splashMatch[1], /var\(--app-splash-page\s*,\s*#f3f1ec\)/);
assert.match(splashMatch[1], /var\(--app-splash-page-alt\s*,\s*#eceae2\)/);
assert.doesNotMatch(splashMatch[1], /#0a0f1a/i);
assert.match(indexHtml, /var\(--app-splash-text\s*,\s*#746c5e\)/);

console.log('ok - startup splash uses paper-ink by default and restores cached themes before first paint');
