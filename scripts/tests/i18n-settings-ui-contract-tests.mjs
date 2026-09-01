import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const panel = await fs.readFile('src/scripts/ui/general-settings-panel.js', 'utf8');
const app = await fs.readFile('src/scripts/ui/app.js', 'utf8');
const personaPanel = await fs.readFile('src/scripts/ui/persona-panel.js', 'utf8');
const userPanel = await fs.readFile('src/scripts/ui/user-panel.js', 'utf8');
const sessionPanel = await fs.readFile('src/scripts/ui/session-panel.js', 'utf8');
const groupPanels = await fs.readFile('src/scripts/ui/group-chat-panels.js', 'utf8');
const worldPanel = await fs.readFile('src/scripts/ui/world-panel.js', 'utf8');
const worldEditor = await fs.readFile('src/scripts/ui/world-editor.js', 'utf8');
const memoryTableEditor = await fs.readFile('src/scripts/ui/memory-table-editor.js', 'utf8');
const memoryTemplatePanel = await fs.readFile('src/scripts/ui/memory-template-panel.js', 'utf8');
const regexPanel = await fs.readFile('src/scripts/ui/regex-panel.js', 'utf8');
const presetPanel = await fs.readFile('src/scripts/ui/preset-panel.js', 'utf8');
const variablePanel = await fs.readFile('src/scripts/ui/variable-panel.js', 'utf8');
const variableManagerPages = await fs.readFile('src/scripts/ui/variable-manager-pages.js', 'utf8');
const messageWrapper = await fs.readFile('src/scripts/ui/chat/message-wrapper-ui-utils.js', 'utf8');
const groupAvatar = await fs.readFile('src/scripts/ui/group-avatar-view-utils.js', 'utf8');
const englishBase = JSON.parse(await fs.readFile('scripts/i18n/en.base.json', 'utf8'));
const commands = await fs.readFile('src-tauri/src/commands.rs', 'utf8');
const lib = await fs.readFile('src-tauri/src/lib.rs', 'utf8');

assert.match(panel, /id="general-language-select"/);
assert.match(panel, /class="world-app-select-btn"/);
assert.match(panel, /appSettings\.update\(\{ locale, languageSetupCompleted: true \}\)/);
assert.match(panel, /restartNow = await appConfirm/);
assert.match(app, /await appSettings\.hydrate\(kvChannel\);[\s\S]*await bootstrapAppLanguage\(\{ appSettings \}\);[\s\S]*await themeManager\.init\(\)/);
assert.match(app, /class="persona-switcher-name" data-i18n-skip/);
assert.match(app, /class="persona-switcher-subtitle" data-i18n-skip/);
assert.match(app, /class="contact-desc" data-i18n-skip/);
assert.match(personaPanel, /data-i18n-skip[^>]*>\$\{cardName\}/);
assert.match(personaPanel, /const subtitleSkipAttribute = p\.description \? ' data-i18n-skip' : ''/);
assert.match(personaPanel, /<div\$\{subtitleSkipAttribute\}[^>]*>\$\{subtitle\}/);
assert.match(userPanel, /data-i18n-skip[^>]*>\$\{user\.name \|\| '我'\}/);
assert.match(sessionPanel, /<span data-i18n-skip>\$\{displayNameHtml\}<\/span>/);
assert.match(sessionPanel, /meta\.setAttribute\('data-i18n-skip', ''\)/);
assert.match(groupPanels, /memberName\.setAttribute\('data-i18n-skip', ''\)/);
assert.match(worldPanel, /indicator\.textContent = indicatorText/);
assert.match(worldPanel, /indicatorText = t\('全局当前：\{value\}'/);
assert.match(worldPanel, /meta\.setAttribute\('data-i18n-skip', ''\)/);
assert.match(groupAvatar, /element\.setAttribute\?\.\('data-i18n-skip', ''\)/);
assert.match(regexPanel, /titleEl\.dataset\.i18nSkip = ''/);
assert.match(presetPanel, /class="pp-block-title" data-i18n-skip>\$\{escapeHtml\(translateUiText\(title\)\)\}/);
assert.match(variableManagerPages, /icon\.dataset\.i18nSkip = ''/);
assert.match(variableManagerPages, /variable-template-icon[\s\S]*?<svg viewBox=/);
assert.doesNotMatch(variableManagerPages, /Array\.from\(String\(template\.name/);
assert.match(variablePanel, /elements\.meta\.dataset\.i18nSkip = ''/);
assert.match(memoryTemplatePanel, /summary\.dataset\.i18nSkip = ''/);
assert.match(memoryTableEditor, /title\.textContent = translateUiText\(table\.name/);
assert.match(memoryTableEditor, /columnHeader\.dataset\.i18nSkip = ''/);
assert.match(worldPanel, /nameEl\.setAttribute\('data-i18n-skip', ''\)/);
assert.match(worldEditor, /titleEl\.dataset\.i18nSkip = ''/);
assert.match(worldEditor, /subEl\.dataset\.i18nSkip = ''/);
assert.match(messageWrapper, /bubble\.dataset\.i18nSkip = ''/);
[
  '角色卡',
  '当前用户',
  '点击切换用户',
  '管理用户',
  '当前会话使用此角色卡',
  '当前全局角色卡',
  '管理角色卡',
].forEach(source => assert.ok(englishBase[source], `missing persona-switcher English text: ${source}`));
assert.match(commands, /pub fn restart_app\(app: AppHandle\)/);
assert.match(commands, /restart_not_supported_on_mobile/);
assert.match(lib, /commands::restart_app/);

console.log('i18n-settings-ui-contract-tests passed');
