import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../../src/index.html', import.meta.url), 'utf8');
const legacyCss = await readFile(new URL('../../src/assets/css/qq-legacy.css', import.meta.url), 'utf8');
const mainCss = await readFile(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8');
const appSource = await readFile(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');

const getCssBlock = (source, selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = source.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `missing css block for ${selector}`);
  return match[1];
};

const getZIndex = (block, label) => {
  const match = block.match(/z-index:\s*(\d+)/);
  assert.ok(match, `missing z-index for ${label}`);
  return Number(match[1]);
};

{
  const overlayZ = getZIndex(getCssBlock(legacyCss, '.popup-overlay'), 'chat settings overlay');
  const popupZ = getZIndex(getCssBlock(legacyCss, '.chat-setting-popup'), 'chat settings popup');
  assert.match(mainCss, /\.topbar\s*\{[^}]*z-index:\s*12000;/s);
  assert.equal(overlayZ, 20000);
  assert.equal(popupZ, 20010);
  assert.ok(popupZ > overlayZ && overlayZ > 12000);
  console.log('ok - chat settings overlay and popup stay above the sticky chat topbar');
}

{
  assert.match(html, /<img\s+id="wallpaper-preview-image"[^>]*\sdraggable="false"[^>]*>/);
  assert.match(getCssBlock(legacyCss, '.wallpaper-preview'), /touch-action:\s*none;/);
  assert.match(
    appSource,
    /wallpaperPreview\?\.addEventListener\('pointercancel',\s*handleWallpaperDragEnd\);/,
  );
  console.log('ok - wallpaper preview keeps pointer drag ownership through mouse and touch cancellation');
}
