import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const css = await readFile(path.join(root, 'src/assets/css/qq-legacy.css'), 'utf8');
const source = await readFile(path.join(root, 'src/scripts/ui/app-confirm.js'), 'utf8');
const sessionSharedSource = await readFile(path.join(root, 'src/scripts/ui/session-shared-view-utils.js'), 'utf8');
const bootRuntimeSource = await readFile(path.join(root, 'src/scripts/ui/app-boot-runtime-utils.js'), 'utf8');

const getBlock = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = css.match(new RegExp(`${escaped}\\s*\\{([\\s\\S]*?)\\n\\}`, 'm'));
  assert.ok(match, `missing css block for ${selector}`);
  return match[1];
};

const getZIndex = (block, label) => {
  const match = block.match(/z-index:\s*(\d+)/);
  assert.ok(match, `missing z-index for ${label}`);
  return Number(match[1]);
};

{
  const modal = getBlock('.app-confirm-modal');
  assert.match(modal, /max-height:\s*calc\(var\(--app-visual-height/);
  assert.match(modal, /display:\s*flex;/);
  assert.match(modal, /flex-direction:\s*column;/);
  assert.match(source, /confirmModal\)\s*confirmModal\.style\.display\s*=\s*'flex';/);
  assert.match(source, /choiceModal\)\s*choiceModal\.style\.display\s*=\s*'flex';/);
  console.log('ok - app confirm modals keep flex layout when opened');
}

{
  const actions = getBlock('.app-confirm-actions');
  assert.match(actions, /flex-wrap:\s*wrap;/);
  assert.match(actions, /overflow:\s*auto;/);
  assert.match(actions, /max-height:\s*min\(42vh,\s*320px\);/);
  console.log('ok - app confirm actions can wrap and scroll inside the modal');
}

{
  const button = getBlock('.app-confirm-btn');
  assert.match(button, /flex:\s*0 1 auto;/);
  assert.doesNotMatch(button, /flex:\s*1;/);
  assert.match(button, /white-space:\s*normal;/);
  assert.match(button, /overflow-wrap:\s*anywhere;/);
  console.log('ok - app confirm buttons do not stretch or clip long labels');
}

{
  const choiceActions = getBlock('.app-confirm-modal.is-choice .app-confirm-actions');
  const choiceButton = getBlock('.app-confirm-modal.is-choice .app-confirm-btn');
  assert.match(source, /choiceModal\.className\s*=\s*'app-confirm-modal is-choice';/);
  assert.match(source, /choiceModal\?\.classList\.add\('is-choice'\);/);
  assert.match(choiceActions, /display:\s*grid;/);
  assert.match(choiceActions, /grid-template-columns:\s*1fr;/);
  assert.match(choiceButton, /width:\s*100%;/);
  assert.match(css, /background:\s*rgba\(14,\s*165,\s*233,\s*0\.12\);/);
  console.log('ok - app choice dialogs render as a readable one-column choice list');
}

{
  const confirmOverlay = getZIndex(getBlock('.app-confirm-overlay'), 'app confirm overlay');
  const confirmModal = getZIndex(getBlock('.app-confirm-modal'), 'app confirm modal');
  const archiveManagerPanelMatch = sessionSharedSource.match(/archiveManagerPanel:\s*'[^']*z-index:\s*(\d+)/);
  const fatalOverlayMatch = bootRuntimeSource.match(/z-index:\s*39999/);

  assert.ok(archiveManagerPanelMatch, 'missing archive manager panel z-index');
  assert.ok(fatalOverlayMatch, 'missing fatal error overlay z-index');
  assert.ok(confirmOverlay > Number(archiveManagerPanelMatch[1]));
  assert.ok(confirmModal > confirmOverlay);
  assert.ok(confirmModal < 39999);
  console.log('ok - app confirm dialogs stay above archive manager and below fatal errors');
}
