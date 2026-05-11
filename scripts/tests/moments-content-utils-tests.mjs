import assert from 'node:assert/strict';

const previousLocalStorage = globalThis.localStorage;
const previousSetTimeout = globalThis.setTimeout;
if (previousLocalStorage === undefined) {
  globalThis.localStorage = {
    getItem() {
      return null;
    },
    setItem() {},
    removeItem() {},
  };
}
globalThis.setTimeout = () => 0;

const {
  extractMomentMedia,
  renderMomentTextWithStickers,
  resolveMomentDisplayText,
} = await import('../../src/scripts/ui/moments-content-utils.js');
globalThis.setTimeout = previousSetTimeout;

const previousWindow = globalThis.window;
globalThis.window = {
  appBridge: {
    applyInputDisplayRegex(text) {
      return `IN:${text}`;
    },
    applyOutputDisplayRegex(text) {
      return `OUT:${text}`;
    },
  },
};

{
  assert.equal(resolveMomentDisplayText({ author: '我', content: 'hello' }), 'IN:hello');
  assert.equal(resolveMomentDisplayText({ author: '角色', content: 'hello' }), 'OUT:hello');
  assert.equal(resolveMomentDisplayText({ author: '角色', content: 'hello', regexMode: 'input' }), 'IN:hello');
  console.log('ok - resolveMomentDisplayText respects input fallback for self records and explicit regex mode');
}

{
  const html = renderMomentTextWithStickers('第一行\n[bqb-https://example.com/sticker.png]');
  assert.equal(html.includes('第一行'), true);
  assert.equal(html.includes('<img class="moment-sticker"'), true);
  assert.equal(html.includes('https://example.com/sticker.png'), true);
  console.log('ok - renderMomentTextWithStickers keeps text lines and expands sticker tokens');
}

{
  const media = extractMomentMedia('正文\n[img-https://example.com/a.png]\n[yy-https://example.com/b.mp3]');
  assert.deepEqual(media.images, [{ url: 'https://example.com/a.png', label: 'https://example.com/a.png' }]);
  assert.deepEqual(media.audios, [{ url: 'https://example.com/b.mp3', label: 'https://example.com/b.mp3' }]);
  assert.equal(media.text, '正文');
  console.log('ok - extractMomentMedia separates image audio tokens from remaining text');
}

{
  const previousTauri = globalThis.__TAURI__;
  globalThis.__TAURI__ = { core: { convertFileSrc: value => `asset://${String(value).replace(/\\/g, '/')}` } };
  const media = extractMomentMedia('[img-D:\\app\\generated.png]');
  assert.deepEqual(media.images, [{ url: 'asset://D:/app/generated.png', label: 'D:\\app\\generated.png' }]);
  assert.equal(media.text, '');
  if (previousTauri === undefined) delete globalThis.__TAURI__;
  else globalThis.__TAURI__ = previousTauri;
  console.log('ok - extractMomentMedia converts local generated image paths for display');
}

if (previousWindow === undefined) {
  delete globalThis.window;
} else {
  globalThis.window = previousWindow;
}

if (previousLocalStorage === undefined) {
  delete globalThis.localStorage;
} else {
  globalThis.localStorage = previousLocalStorage;
}

globalThis.setTimeout = previousSetTimeout;
