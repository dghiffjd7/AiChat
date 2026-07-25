import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';

import { createWsClient } from '../dev/cdp-client.mjs';

const endpoint = process.env.CDP_ENDPOINT || 'http://127.0.0.1:9222';
const outputDir = process.argv[2] ? path.resolve(process.argv[2]) : '';
const targets = await fetch(`${endpoint}/json`).then(response => response.json());
const target = targets.find(item => item.type === 'page' && item.title === 'Chat App');
if (!target?.webSocketDebuggerUrl) throw new Error('Chat App CDP target not found');

let commandId = 0;
const pending = new Map();
// Node 20 无全局 WebSocket：走 cdp-client 的零依赖实现（与其他烟测一致）
const socket = await new Promise((resolve, reject) => {
  const client = createWsClient(target.webSocketDebuggerUrl, {
    onOpen: () => resolve(client),
    onError: reject,
    onMessage: (raw) => {
      const message = JSON.parse(String(raw || '{}'));
      if (!message.id || !pending.has(message.id)) return;
      const waiter = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message));
      else waiter.resolve(message.result);
    },
  });
});

const send = (method, params = {}) => new Promise((resolve, reject) => {
  commandId += 1;
  pending.set(commandId, { resolve, reject });
  socket.send(JSON.stringify({ id: commandId, method, params }));
});

const evaluate = async (expression) => {
  const result = await send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text || 'CDP evaluation failed');
  }
  return result.result?.value;
};

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const waitFor = async (expression, timeoutMs = 15000) => {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    if (await evaluate(expression)) return true;
    await wait(100);
  }
  throw new Error(`Timed out waiting for: ${expression}`);
};

const capture = async (name) => {
  if (!outputDir) return '';
  await fs.mkdir(outputDir, { recursive: true });
  const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
  const filePath = path.join(outputDir, name);
  await fs.writeFile(filePath, Buffer.from(result.data, 'base64'));
  return filePath;
};

await send('Runtime.enable');
await send('Page.enable');
await send('Page.reload', { ignoreCache: true });
await waitFor(`document.readyState === 'complete' && Boolean(document.querySelector('#quick-menu'))`);
await waitFor(`!document.querySelector('#app-splash') || document.querySelector('#app-splash').style.display === 'none' || getComputedStyle(document.querySelector('#app-splash')).display === 'none'`, 25000);

const visiblePlusExpression = `Array.from(document.querySelectorAll('.qq-message-topbar .topbar-plus-btn')).find(el => {
  const rect = el.getBoundingClientRect();
  const style = getComputedStyle(el);
  return rect.width > 0 && rect.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
})`;

await evaluate(`(() => { const button = ${visiblePlusExpression}; button?.click(); return Boolean(button); })()`);
await wait(260);
const quickMenu = await evaluate(`(() => {
  const menu = document.querySelector('#quick-menu');
  const trigger = ${visiblePlusExpression};
  const rect = menu.getBoundingClientRect();
  return {
    open: menu.classList.contains('is-open'),
    hidden: menu.classList.contains('hidden'),
    ariaHidden: menu.getAttribute('aria-hidden'),
    itemCount: menu.querySelectorAll('.quick-menu-item').length,
    descriptions: Array.from(menu.querySelectorAll('.quick-menu-description')).map(el => el.textContent.trim()),
    width: Math.round(rect.width),
    opacity: getComputedStyle(menu).opacity,
    plusBackground: getComputedStyle(trigger).backgroundColor,
    plusColor: getComputedStyle(trigger).color,
    plusTransform: getComputedStyle(trigger.querySelector('.topbar-plus-glyph')).transform,
  };
})()`);
const quickMenuScreenshot = await capture('group-quick-menu-light.png');

await evaluate(`document.querySelector('#quick-menu [data-action="create-group"]')?.click()`);
await wait(760);
const createInitial = await evaluate(`(() => {
  const panel = document.querySelector('#group-create-panel');
  const overlay = document.querySelector('#group-create-overlay');
  const rect = panel.getBoundingClientRect();
  const collage = panel.querySelector('#group-avatar-preview [data-group-avatar]');
  const body = panel.querySelector('.group-create-body');
  const toolbar = panel.querySelector('.group-create-member-toolbar');
  const search = panel.querySelector('.group-create-search');
  const list = panel.querySelector('#group-contacts');
  const rows = Array.from(list.querySelectorAll('.group-create-member-row'));
  const firstRow = rows[0];
  const secondRow = rows[1];
  const firstRect = firstRow?.getBoundingClientRect();
  const secondRect = secondRow?.getBoundingClientRect();
  const avatar = firstRow?.querySelector('.group-create-member-avatar');
  const name = firstRow?.querySelector('.group-create-member-name');
  const description = firstRow?.querySelector('.group-create-member-description');
  const footer = panel.querySelector('.group-create-footer');
  return {
    open: panel.classList.contains('is-open'),
    display: getComputedStyle(panel).display,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    memberRows: panel.querySelectorAll('.group-create-member-row').length,
    collageLayout: collage?.dataset?.layout || '',
    backdropFilter: getComputedStyle(overlay).backdropFilter,
    nameInvalid: panel.querySelector('#group-name-field')?.classList.contains('is-invalid'),
    nameHint: panel.querySelector('#group-name-hint')?.textContent.trim(),
    membersInvalid: panel.querySelector('.group-create-members-section')?.classList.contains('is-invalid'),
    memberHint: panel.querySelector('#group-member-hint')?.textContent.trim(),
    layout: {
      bodyPadding: getComputedStyle(body).padding,
      bodyGap: getComputedStyle(body).gap,
      toolbarMarginBottom: getComputedStyle(toolbar).marginBottom,
      searchSize: [Math.round(search.getBoundingClientRect().width), Math.round(search.getBoundingClientRect().height)],
      listMaxHeight: getComputedStyle(list).maxHeight,
      listPaddingRight: getComputedStyle(list).paddingRight,
      listGap: firstRect && secondRect ? String(Math.round(secondRect.top - firstRect.bottom)) + 'px' : '',
      rowHeight: Math.round(firstRect?.height || 0),
      rowGap: getComputedStyle(firstRow).gap,
      rowPadding: getComputedStyle(firstRow).padding,
      rowRadius: getComputedStyle(firstRow).borderRadius,
      rowTransitionDuration: getComputedStyle(firstRow).transitionDuration,
      avatarSize: avatar
        ? [Math.round(avatar.getBoundingClientRect().width), Math.round(avatar.getBoundingClientRect().height)]
        : [],
      infoHeight: Math.round(firstRow.querySelector('.group-create-member-info')?.getBoundingClientRect().height || 0),
      nameHeight: Math.round(name?.getBoundingClientRect().height || 0),
      descriptionHeight: Math.round(description?.getBoundingClientRect().height || 0),
      nameLineHeight: getComputedStyle(name).lineHeight,
      descriptionLineHeight: getComputedStyle(description).lineHeight,
      footerPadding: getComputedStyle(footer).padding,
      footerHeight: Math.round(footer.getBoundingClientRect().height),
    },
  };
})()`);

const firstSelectionMotion = await evaluate(`(() => {
  const rows = document.querySelectorAll('#group-contacts .group-create-member-row');
  const firstRow = rows[0];
  rows[0]?.click();
  const firstRowAfterToggle = document.querySelector('#group-contacts .group-create-member-row');
  const firstChip = document.querySelector('#group-selected-chips .group-selected-chip');
  const firstFooterAvatar = document.querySelector('#group-footer-selected .group-avatar-stack img');
  const next = Array.from(rows).find(row => !row.classList.contains('is-selected'));
  next?.click();
  const firstChipAfterSecondToggle = document.querySelector('#group-selected-chips .group-selected-chip');
  const firstFooterAvatarAfterSecondToggle = document.querySelector('#group-footer-selected .group-avatar-stack img');
  const replayedEntranceAnimations = Array.from(document.querySelectorAll('#group-contacts .group-create-member-row'))
    .flatMap(row => row.getAnimations())
    .filter(animation => animation.animationName === 'group-create-member-in')
    .length;
  return {
    sameNode: firstRow === firstRowAfterToggle,
    retainedChipNode: firstChip === firstChipAfterSecondToggle,
    retainedFooterAvatarNode: firstFooterAvatar === firstFooterAvatarAfterSecondToggle,
    replayedEntranceAnimations,
  };
})()`);
await wait(220);
const createSelected = await evaluate(`(() => {
  const panel = document.querySelector('#group-create-panel');
  const collage = panel.querySelector('#group-avatar-preview [data-group-avatar]');
  return {
    selectedRows: panel.querySelectorAll('.group-create-member-row.is-selected').length,
    chips: panel.querySelectorAll('#group-selected-chips .group-selected-chip').length,
    collageKind: collage?.dataset?.groupAvatar || '',
    collageLayout: collage?.dataset?.layout || '',
    collageCells: collage?.querySelectorAll('.group-avatar-collage-cell').length || 0,
    createAriaDisabled: panel.querySelector('#group-create')?.getAttribute('aria-disabled'),
  };
})()`);
const createScreenshot = await capture('group-create-light.png');
const firstDeselectionMotion = await evaluate(`(() => {
  const selectedRows = Array.from(document.querySelectorAll('#group-contacts .group-create-member-row.is-selected'));
  const row = selectedRows[0];
  const contactId = row?.dataset?.contactId || '';
  const chip = Array.from(document.querySelectorAll('#group-selected-chips .group-selected-chip'))
    .find(item => item.dataset.contactId === contactId);
  const otherChip = Array.from(document.querySelectorAll('#group-selected-chips .group-selected-chip'))
    .find(item => item.dataset.contactId !== contactId);
  const otherFooterAvatar = Array.from(document.querySelectorAll('#group-footer-selected .group-avatar-stack img'))
    .find(item => item.dataset.contactId !== contactId);
  row?.click();
  const rowAfterToggle = Array.from(document.querySelectorAll('#group-contacts .group-create-member-row'))
    .find(item => item.dataset.contactId === contactId);
  const chipAfterToggle = Array.from(document.querySelectorAll('#group-selected-chips .group-selected-chip'))
    .find(item => item.dataset.contactId === contactId);
  const otherChipAfterToggle = Array.from(document.querySelectorAll('#group-selected-chips .group-selected-chip'))
    .find(item => item.dataset.contactId !== contactId);
  const otherFooterAvatarAfterToggle = Array.from(document.querySelectorAll('#group-footer-selected .group-avatar-stack img'))
    .find(item => item.dataset.contactId !== contactId);
  return {
    contactId,
    sameRowNode: row === rowAfterToggle,
    removedChipLeaves: chip === chipAfterToggle && chipAfterToggle?.classList.contains('is-leaving'),
    retainedOtherChipNode: otherChip === otherChipAfterToggle,
    retainedOtherFooterAvatarNode: otherFooterAvatar === otherFooterAvatarAfterToggle,
    selectedRows: document.querySelectorAll('#group-contacts .group-create-member-row.is-selected').length,
  };
})()`);
await wait(180);
const firstDeselectionSettled = await evaluate(`(() => ({
  selectedRows: document.querySelectorAll('#group-contacts .group-create-member-row.is-selected').length,
  chips: document.querySelectorAll('#group-selected-chips .group-selected-chip').length,
  removedChipPresent: Array.from(document.querySelectorAll('#group-selected-chips .group-selected-chip'))
    .some(item => item.dataset.contactId === ${JSON.stringify(firstDeselectionMotion.contactId)}),
}))()`);
await evaluate(`Array.from(document.querySelectorAll('#group-contacts .group-create-member-row'))
  .find(item => item.dataset.contactId === ${JSON.stringify(firstDeselectionMotion.contactId)})?.click()`);
await wait(220);
await evaluate(`(() => {
  const input = document.querySelector('#group-name');
  input.value = '周五奶茶拼单群';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  return input.value;
})()`);
await wait(80);

await evaluate(`(async () => {
  const [{ themeManager }, { themeStore }] = await Promise.all([
    import('./scripts/ui/theme-manager.js'),
    import('./scripts/storage/theme-store.js'),
  ]);
  const preset = themeStore.getTheme('classic-dark');
  themeManager.applyThemePreset({ preset, appearance: preset.appearance, mode: 'dark' });
  await new Promise(resolve => setTimeout(resolve, 220));
  return document.body.dataset.themeMode;
})()`);
const darkCreate = await evaluate(`(() => {
  const panel = document.querySelector('#group-create-panel');
  const selectedRow = panel.querySelector('.group-create-member-row.is-selected');
  const createButton = panel.querySelector('#group-create');
  return {
    themeMode: document.body.dataset.themeMode,
    panelBackground: getComputedStyle(panel).backgroundColor,
    rowBackground: getComputedStyle(selectedRow || panel.querySelector('.group-create-member-row')).backgroundColor,
    textColor: getComputedStyle(panel).color,
    createAriaDisabled: createButton?.getAttribute('aria-disabled'),
    createButtonClass: createButton?.className || '',
    createButtonBackgroundColor: getComputedStyle(createButton).backgroundColor,
    createButtonBackground: getComputedStyle(createButton).backgroundImage,
  };
})()`);
const darkCreateScreenshot = await capture('group-create-dark.png');
await evaluate(`(async () => {
  const { themeManager } = await import('./scripts/ui/theme-manager.js');
  themeManager.applyCurrentTheme();
  await new Promise(resolve => setTimeout(resolve, 220));
  return document.body.dataset.themeMode;
})()`);

const createClosing = await evaluate(`(() => {
  document.querySelector('#group-close')?.click();
  const panel = document.querySelector('#group-create-panel');
  return {
    closing: panel.classList.contains('is-closing'),
    display: getComputedStyle(panel).display,
  };
})()`);
await wait(240);
const createClosed = await evaluate(`(() => {
  const panel = document.querySelector('#group-create-panel');
  return { display: getComputedStyle(panel).display, inlineDisplay: panel.style.display };
})()`);

await evaluate(`(() => { const button = ${visiblePlusExpression}; button?.click(); return Boolean(button); })()`);
await wait(220);
await evaluate(`document.querySelector('#quick-menu [data-action="new-group"]')?.click()`);
await wait(320);
const groupManager = await evaluate(`(() => {
  const panel = document.querySelector('.group-panel-shell');
  const rect = panel.getBoundingClientRect();
  return {
    open: panel.classList.contains('is-open'),
    display: getComputedStyle(panel).display,
    width: Math.round(rect.width),
    height: Math.round(rect.height),
    colors: panel.querySelectorAll('.group-color-choice').length,
    selectedColors: panel.querySelectorAll('.group-color-choice.is-selected').length,
    cards: panel.querySelectorAll('.group-manager-card').length,
    empty: Boolean(panel.querySelector('.group-manager-empty')),
    parentButton: panel.querySelector('#group-parent-select-btn')?.textContent.trim(),
  };
})()`);

const inlineEdit = await evaluate(`(() => {
  const edit = document.querySelector('.group-manager-card [data-group-edit]');
  if (!edit) return { available: false };
  edit.click();
  const editing = Boolean(document.querySelector('.group-manager-card.is-editing'));
  document.querySelector('.group-manager-card [data-group-inline-cancel]')?.click();
  return { available: true, editing };
})()`);
const managerScreenshot = await capture('group-manager-light.png');
await evaluate(`(async () => {
  const [{ themeManager }, { themeStore }] = await Promise.all([
    import('./scripts/ui/theme-manager.js'),
    import('./scripts/storage/theme-store.js'),
  ]);
  const preset = themeStore.getTheme('classic-dark');
  themeManager.applyThemePreset({ preset, appearance: preset.appearance, mode: 'dark' });
  await new Promise(resolve => setTimeout(resolve, 220));
  return document.body.dataset.themeMode;
})()`);
const darkManager = await evaluate(`(() => {
  const panel = document.querySelector('#group-panel');
  const createButton = panel.querySelector('#group-create-btn');
  return {
    themeMode: document.body.dataset.themeMode,
    panelBackground: getComputedStyle(panel).backgroundColor,
    panelId: panel.id,
    colorBackgrounds: Array.from(panel.querySelectorAll('.group-color-choice'))
      .map(button => getComputedStyle(button).backgroundColor),
    createButtonBackground: getComputedStyle(createButton).backgroundImage,
  };
})()`);
const darkManagerScreenshot = await capture('group-manager-dark.png');
await evaluate(`(async () => {
  const { themeManager } = await import('./scripts/ui/theme-manager.js');
  themeManager.applyCurrentTheme();
  await new Promise(resolve => setTimeout(resolve, 220));
  return document.body.dataset.themeMode;
})()`);

const managerClosing = await evaluate(`(() => {
  document.querySelector('#group-panel-close')?.click();
  const panel = document.querySelector('.group-panel-shell');
  return {
    closing: panel.classList.contains('is-closing'),
    display: getComputedStyle(panel).display,
  };
})()`);
await wait(240);
const managerClosed = await evaluate(`getComputedStyle(document.querySelector('.group-panel-shell')).display`);

socket.close();
assert.equal(quickMenu.open, true);
assert.equal(quickMenu.hidden, false);
assert.equal(quickMenu.ariaHidden, 'false');
assert.equal(quickMenu.itemCount, 3);
assert.equal(quickMenu.width, 224);
// is-open 态与顶栏 ⚙ hover 同款 surface-subtle（融合修复后不再保持白卡）
assert.match(quickMenu.plusBackground, /^rgba?\(248,\s*250,\s*252/);
assert.equal(createInitial.open, true);
assert.equal(createInitial.display, 'flex');
assert.equal(createInitial.nameInvalid, false);
assert.equal(createInitial.nameHint, '');
assert.equal(createInitial.membersInvalid, false);
assert.equal(createInitial.memberHint, '已选择 0 位成员');
assert.equal(createInitial.layout.bodyPadding, '20px 28px');
assert.equal(createInitial.layout.bodyGap, '20px');
assert.equal(createInitial.layout.toolbarMarginBottom, '8px');
assert.deepEqual(createInitial.layout.searchSize, [200, 36]);
assert.equal(createInitial.layout.listMaxHeight, '236px');
assert.equal(createInitial.layout.listPaddingRight, '4px');
assert.equal(createInitial.layout.listGap, '4px');
assert.equal(createInitial.layout.rowHeight, 63, JSON.stringify(createInitial.layout));
assert.equal(createInitial.layout.rowGap, '12px');
assert.equal(createInitial.layout.rowPadding, '10px 12px');
assert.equal(createInitial.layout.rowRadius, '12px');
assert.deepEqual(createInitial.layout.avatarSize, [38, 38]);
assert.equal(createInitial.layout.nameLineHeight, '21px');
assert.equal(createInitial.layout.descriptionLineHeight, '18px');
assert.equal(createInitial.layout.footerPadding, '16px 28px');
assert.equal(createInitial.layout.footerHeight, 73);
assert.deepEqual(firstSelectionMotion, {
  sameNode: true,
  retainedChipNode: true,
  retainedFooterAvatarNode: true,
  replayedEntranceAnimations: 0,
});
assert.equal(createSelected.selectedRows, 2);
assert.equal(createSelected.chips, 2);
assert.equal(createSelected.collageKind, 'collage');
assert.equal(createSelected.collageLayout, 'split');
assert.equal(createSelected.collageCells, 2);
assert.deepEqual(firstDeselectionMotion, {
  contactId: firstDeselectionMotion.contactId,
  sameRowNode: true,
  removedChipLeaves: true,
  retainedOtherChipNode: true,
  retainedOtherFooterAvatarNode: true,
  selectedRows: 1,
});
assert.deepEqual(firstDeselectionSettled, {
  selectedRows: 1,
  chips: 1,
  removedChipPresent: false,
});
assert.equal(darkCreate.themeMode, 'dark');
assert.match(darkCreate.panelBackground, /^rgba?\((?:30|38),/);
// token 化后暗色行底随主题 accent 联动（旧字面量在暗色下反而是错的浅蓝），只校验 13% 透明度
assert.match(darkCreate.rowBackground, /0\.13\)$/);
assert.equal(darkCreate.createAriaDisabled, 'false');
assert.match(darkCreate.createButtonBackground, /linear-gradient/, JSON.stringify(darkCreate));
assert.deepEqual(createClosing, { closing: true, display: 'flex' });
assert.deepEqual(createClosed, { display: 'none', inlineDisplay: 'none' });
assert.equal(groupManager.open, true);
assert.equal(groupManager.display, 'flex');
assert.equal(groupManager.colors, 5);
assert.equal(groupManager.selectedColors, 1);
assert.equal(darkManager.themeMode, 'dark');
assert.equal(darkManager.panelId, 'group-panel');
assert.equal(new Set(darkManager.colorBackgrounds).size, 5);
assert.match(darkManager.createButtonBackground, /linear-gradient/);
assert.equal(managerClosing.closing, true);
assert.equal(managerClosing.display, 'flex');
assert.equal(managerClosed, 'none');
console.log(JSON.stringify({
  quickMenu,
  createInitial,
  firstSelectionMotion,
  createSelected,
  firstDeselectionMotion,
  firstDeselectionSettled,
  darkCreate,
  createClosing,
  createClosed,
  groupManager,
  inlineEdit,
  darkManager,
  managerClosing,
  managerClosed,
  screenshots: {
    quickMenu: quickMenuScreenshot,
    create: createScreenshot,
    createDark: darkCreateScreenshot,
    manager: managerScreenshot,
    managerDark: darkManagerScreenshot,
  },
}, null, 2));
