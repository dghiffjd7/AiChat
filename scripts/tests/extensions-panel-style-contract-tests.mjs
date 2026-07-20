import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const extensionsSource = await readFile(path.join(root, 'src/scripts/ui/extensions-panel.js'), 'utf8');
const regexSource = await readFile(path.join(root, 'src/scripts/ui/regex-panel.js'), 'utf8');
const scriptSource = await readFile(path.join(root, 'src/scripts/ui/script-panel.js'), 'utf8');
const pluginSource = await readFile(path.join(root, 'src/scripts/ui/plugin-panel.js'), 'utf8');
const themeSource = await readFile(path.join(root, 'src/assets/css/theme.css'), 'utf8');
const { ExtensionsPanel } = await import('../../src/scripts/ui/extensions-panel.js');

assert.match(extensionsSource, /width:\s*min\(1240px,\s*94vw\)/);
assert.match(extensionsSource, /height:\s*min\(880px,\s*92(?:d)?vh\)/);
assert.match(extensionsSource, /font-family:\s*"Inter",\s*"Noto Sans SC"/);
assert.match(extensionsSource, /EXTENSIONS · 正则 \/ 脚本 \/ 插件/);
assert.match(extensionsSource, /class="extensions-runtime-status"/);
assert.match(extensionsSource, /class="extensions-section-icon extensions-section-icon--\$\{key\}"/);
assert.match(extensionsSource, /class="extensions-section-chip"/);
assert.match(extensionsSource, /class="extensions-section-description"/);
assert.match(extensionsSource, /chevron:\s*iconSvg\(/);
assert.match(extensionsSource, /class="extensions-chevron"/);
assert.doesNotMatch(extensionsSource, /class="chevron">▾/);

assert.match(extensionsSource, /grid-template-rows:\s*0fr/);
assert.match(extensionsSource, /\.extensions-body\.is-expanded[\s\S]*?grid-template-rows:\s*1fr/);
assert.match(extensionsSource, /cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/);
assert.match(extensionsSource, /setExpandedSection\(/);
assert.match(extensionsSource, /querySelectorAll\('\.extensions-toggle'\)/);
assert.match(extensionsSource, /setAttribute\('aria-expanded'/);
assert.match(extensionsSource, /classList\.toggle\('is-expanded'/);
assert.match(extensionsSource, /requestAnimationFrame/);
assert.match(extensionsSource, /classList\.add\('is-visible'\)/);
assert.match(extensionsSource, /classList\.remove\('is-visible'\)/);
assert.match(extensionsSource, /if \(shouldOpen\)[\s\S]*?await this\.ensureEmbedded\(key\)[\s\S]*?querySelectorAll\('\.extensions-toggle'\)/);

assert.match(extensionsSource, /@media \(max-width:\s*720px\)/);
assert.match(extensionsSource, /var\(--app-visual-height,\s*100dvh\)/);
assert.match(extensionsSource, /env\(safe-area-inset-bottom,\s*0px\)/);
assert.match(extensionsSource, /@media \(max-width:\s*720px\)[\s\S]*?min-height:\s*44px/);
assert.match(extensionsSource, /@media \(max-width:\s*720px\)[\s\S]*?\.regex-editor-title-row\s*\{[\s\S]*?flex-direction:\s*column/);
assert.match(extensionsSource, /@media \(max-width:\s*720px\)[\s\S]*?\.regex-editor-actions\s*\{[\s\S]*?width:\s*100%/);
assert.match(extensionsSource, /body\[data-reduced-motion='on'\]/);
assert.match(extensionsSource, /@media \(prefers-reduced-motion:\s*reduce\)/);

assert.match(regexSource, /class="regex-tabs"/);
assert.match(regexSource, /class="regex-tab-indicator"/);
assert.match(regexSource, /async setActiveTab\(/);
assert.match(regexSource, /\.regex-tab-view\.is-tab-leaving/);
assert.match(regexSource, /\.regex-tab-view\.is-tab-entering/);
assert.match(regexSource, /regex-tab-view-out[\s\S]*?translateY\(-6px\)/);
assert.match(regexSource, /regex-tab-view-in[\s\S]*?translateY\(8px\)/);
assert.match(regexSource, /className = 'regex-set-indicator'/);
assert.match(regexSource, /transitionScopedEditor\(/);
assert.match(regexSource, /\.is-collection-leaving/);
assert.match(regexSource, /\.is-collection-entering/);
assert.match(regexSource, /class="re-toggle"[\s\S]*?<svg/);
assert.match(regexSource, /#regex-panel \.re-body\s*\{[\s\S]*?grid-template-rows:\s*0fr/);
assert.match(regexSource, /\.regex-rule\[data-collapsed='false'\] \.re-body[\s\S]*?grid-template-rows:\s*1fr/);
assert.match(regexSource, /transition:[^;]*300ms cubic-bezier\(0\.32,\s*0\.72,\s*0,\s*1\)/);
assert.match(regexSource, /\.re-body-inner\s*\{[\s\S]*?padding:\s*0 12px[\s\S]*?transition:\s*padding-block 300ms/);
assert.match(regexSource, /data-collapsed='false'\] \.re-body-inner\s*\{[\s\S]*?padding-block:\s*12px/);
assert.doesNotMatch(regexSource, /body\.style\.display\s*=\s*collapsed/);
assert.match(regexSource, /removeRuleCard\(/);
assert.match(regexSource, /\.regex-rule\.is-rule-entering/);
assert.match(regexSource, /\.regex-rule\.is-rule-leaving/);
assert.match(regexSource, /#regex-panel input\[type='checkbox'\]\s*\{[\s\S]*?appearance:\s*none/);
assert.match(regexSource, /input\[type='checkbox'\]:checked::before\s*\{[\s\S]*?scale\(1\)/);
assert.match(themeSource, /--app-text-on-accent:\s*#ffffff/);
assert.match(regexSource, /input\[type='checkbox'\]::before\s*\{[\s\S]*?box-sizing:\s*content-box[\s\S]*?var\(--app-text-on-accent\)/);
assert.match(extensionsSource, /#extensions-panel #regex-panel input:not\(\[type='checkbox'\]\)/);
assert.match(regexSource, /const shouldRestart = element\.classList\.contains\(className\)/);
assert.match(regexSource, /if \(shouldRestart\) \{[\s\S]*?void element\.offsetWidth/);
assert.doesNotMatch(extensionsSource, /if \(type === 'regex' && typeof panel\.refreshAll/);
assert.match(extensionsSource, /\.extensions-body-clip\s*\{[\s\S]*?contain:\s*layout paint/);
assert.match(extensionsSource, /\.extensions-body:not\(\.is-expanded\) \.plugin-empty-icon\s*\{[\s\S]*?animation-play-state:\s*paused/);
assert.match(extensionsSource, /\.extensions-item::before,[\s\S]*?\.extensions-item::after[\s\S]*?transition:\s*opacity/);
assert.doesNotMatch(extensionsSource, /\.extensions-item\s*\{[^}]*transition:[^;}]*box-shadow/);
assert.match(extensionsSource, /\.regex-btn-primary\s*\{[\s\S]*?background:\s*var\(--app-accent-primary\)/);

assert.match(scriptSource, /script-panel-polish-style/);
assert.match(scriptSource, /class="script-editor-code-shell"/);
assert.match(scriptSource, /id="script-editor-gutter"/);
assert.match(scriptSource, /className = 'script-panel-card'/);
assert.match(scriptSource, /className = 'script-panel-card-icon'/);
assert.match(scriptSource, /script-panel-card-in/);
assert.match(scriptSource, /<svg class="script-panel-icon"/);
assert.doesNotMatch(scriptSource, /\.script-editor-overlay\s*\{[^}]*opacity:\s*0/);
assert.match(scriptSource, /@keyframes script-editor-overlay-in\s*\{[\s\S]*?from\s*\{\s*opacity:\s*0/);
assert.match(scriptSource, /\.script-panel-card\.is-entering\s*\{[\s\S]*?animation:\s*script-panel-card-in 220ms ease backwards/);
assert.match(scriptSource, /dataset\.motionInitialized/);

assert.match(pluginSource, /class="plugin-empty-icon"/);
assert.match(pluginSource, /class="plugin-empty-title"/);
assert.match(pluginSource, /class="plugin-empty-support"/);
assert.match(pluginSource, /plugin-empty-float/);
assert.match(pluginSource, /@media \(max-width:\s*680px\)[\s\S]*?\.plugin-panel-empty/);
assert.match(pluginSource, /body\[data-reduced-motion='on'\][\s\S]*?\.plugin-empty-icon/);
assert.match(pluginSource, /\.plugin-card\.is-entering\s*\{[\s\S]*?animation:\s*plugin-card-in 220ms ease backwards/);
assert.doesNotMatch(pluginSource, /animation:\s*plugin-card-in 220ms ease both/);
assert.match(pluginSource, /dataset\.motionInitialized/);

assert.match(regexSource, /header\.addEventListener\('keydown',[\s\S]*?event\.target !== event\.currentTarget/);
assert.match(regexSource, /hasUnsavedChanges\(\)[\s\S]*?editorDirty/);

assert.match(themeSource, /body\[data-theme-mode='dark'\] #extensions-panel \.extensions-header/);
assert.match(themeSource, /body\[data-theme-mode='dark'\] #extensions-panel :is\(\.extensions-section-chip, \.extensions-chevron\)/);
assert.match(themeSource, /body\[data-theme-mode='dark'\] #extensions-panel \.extensions-title-icon/);
assert.match(themeSource, /body\[data-theme-mode='dark'\] #plugin-panel \.plugin-empty-icon/);
assert.match(themeSource, /body\[data-theme-mode='dark'\] #plugin-panel \.plugin-empty-glow/);

const createClassList = () => {
  const values = new Set();
  return {
    contains: value => values.has(value),
    toggle: (value, force) => {
      if (force) values.add(value);
      else values.delete(value);
    },
  };
};

const buttons = ['regex', 'scripts', 'plugins'].map(target => ({
  dataset: { target, expanded: '0' },
  attributes: {},
  setAttribute(name, value) { this.attributes[name] = value; },
}));
const bodies = ['regex', 'scripts', 'plugins'].map(body => ({
  dataset: { body },
  attributes: {},
  classList: createClassList(),
  setAttribute(name, value) { this.attributes[name] = value; },
  toggleAttribute(name, force) { this.attributes[name] = force; },
}));
const fakeElement = {
  querySelector(selector) {
    const target = selector.match(/data-target="([^"]+)"/)?.[1];
    return buttons.find(button => button.dataset.target === target) || null;
  },
  querySelectorAll(selector) {
    if (selector === '.extensions-toggle') return buttons;
    if (selector === '.extensions-body') return bodies;
    return [];
  },
};

const panel = new ExtensionsPanel();
panel.element = fakeElement;
const embedded = [];
panel.ensureEmbedded = async target => embedded.push(target);

await panel.setExpandedSection('regex', { forceOpen: true });
assert.deepEqual(buttons.map(button => button.dataset.expanded), ['1', '0', '0']);
assert.deepEqual(bodies.map(body => body.classList.contains('is-expanded')), [true, false, false]);
assert.equal(panel.activeSection, 'regex');

await panel.setExpandedSection('scripts');
assert.deepEqual(buttons.map(button => button.dataset.expanded), ['0', '1', '0']);
assert.deepEqual(bodies.map(body => body.classList.contains('is-expanded')), [false, true, false]);
assert.equal(panel.activeSection, 'scripts');

await panel.setExpandedSection('scripts');
assert.deepEqual(buttons.map(button => button.dataset.expanded), ['0', '0', '0']);
assert.deepEqual(bodies.map(body => body.classList.contains('is-expanded')), [false, false, false]);
assert.equal(panel.activeSection, '');
assert.deepEqual(embedded, ['regex', 'scripts']);

let mountedShowCalls = 0;
let mountedRefreshCalls = 0;
const mountedRoot = { style: { display: 'none' } };
const mountedPanel = new ExtensionsPanel({
  regexPanel: {
    element: mountedRoot,
    async show() { mountedShowCalls += 1; },
    hasUnsavedChanges: () => false,
    async refreshAll() { mountedRefreshCalls += 1; },
  },
});
mountedPanel.element = { querySelector: () => ({}) };
mountedPanel.mounted.regex = true;
await mountedPanel.ensureEmbedded('regex');
assert.equal(mountedShowCalls, 0);
assert.equal(mountedRefreshCalls, 1);
assert.equal(mountedRoot.style.display, 'flex');

let dirtyRefreshCalls = 0;
const dirtyRoot = { style: { display: 'none' } };
const dirtyPanel = new ExtensionsPanel({
  regexPanel: {
    element: dirtyRoot,
    hasUnsavedChanges: () => true,
    async refreshAll() { dirtyRefreshCalls += 1; },
  },
});
dirtyPanel.element = { querySelector: () => ({}) };
dirtyPanel.mounted.regex = true;
await dirtyPanel.ensureEmbedded('regex');
assert.equal(dirtyRefreshCalls, 0);
assert.equal(dirtyRoot.style.display, 'flex');

console.log('ok - extension interface keeps the reference typography, motion, SVG, and responsive visual contract');
