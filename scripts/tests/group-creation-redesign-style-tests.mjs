import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/assets/css/group-creation-redesign.css', import.meta.url), 'utf8');
const contactCss = fs.readFileSync(new URL('../../src/assets/css/contact-groups.css', import.meta.url), 'utf8');
const createPanel = fs.readFileSync(new URL('../../src/scripts/ui/group-chat-panels.js', import.meta.url), 'utf8');
const groupPanel = fs.readFileSync(new URL('../../src/scripts/ui/group-panel.js', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');

assert.match(html, /group-creation-redesign\.css/);
assert.match(html, /id="quick-menu"[\s\S]*?quick-menu-icon[\s\S]*?quick-menu-description/);
assert.match(html, /topbar-plus-glyph/);
assert.match(css, /@keyframes\s+quick-create-menu-item-in/);
assert.match(css, /#quick-menu\.is-open/);
assert.match(css, /\.topbar-plus-btn\.is-open\s+\.topbar-plus-glyph/);
// 加号需与顶栏 ⚙ 同级安静：次级文字色、无投影、hover 走 surface token，不用硬编码蓝
assert.match(
  css,
  /\.qq-message-topbar\s+\.topbar-plus-btn\s*\{[\s\S]*?background:\s*var\(--app-surface-card\)[\s\S]*?color:\s*var\(--app-text-secondary\)/,
);
assert.doesNotMatch(
  css,
  /\.qq-message-topbar\s+\.topbar-plus-btn\s*\{[^}]*box-shadow/,
);
assert.doesNotMatch(
  css,
  /\.qq-message-topbar\s+\.topbar-plus-btn[^{]*\{[^}]*rgba\(25,\s*154,\s*255/,
);
assert.match(html, /topbar-plus-glyph"[^>]*>\s*<svg/);
assert.doesNotMatch(html, /topbar-plus-glyph"[^>]*>＋/);
assert.doesNotMatch(
  css,
  /\.qq-message-topbar\s+\.topbar-plus-btn\s*\{[\s\S]*?background:\s*#0f172a/,
);
// 已选成员区在滚动 flex 列里不得被压缩裁切
assert.match(
  css,
  /\.group-selected-section\s*\{[^}]*flex:\s*0 0 auto/,
);
// 选中同步只追加新 chip，避免移动既有节点重放入场动画
assert.match(
  createPanel,
  /if \(!chip\.isConnected\) \{[\s\S]{0,400}?chips\.appendChild\(chip\);/,
);
assert.match(css, /\.group-redesign-overlay[\s\S]*?backdrop-filter:\s*blur\(7px\)/);
assert.match(css, /\.group-redesign-panel\.is-open/);
assert.match(css, /\.group-avatar-collage\[data-layout='trio'\][\s\S]*?grid-row:\s*span 2/);
assert.match(
  contactCss,
  /\.contact-avatar\.group-avatar-collage\s+\.group-avatar-collage-cell\s*\{[^}]*width:\s*auto[^}]*height:\s*auto[^}]*align-self:\s*stretch[^}]*justify-self:\s*stretch/s,
);
// 联系人页 .contact-item img 的通用圆角会把拼图小格切成一颗颗圆球，
// 小格必须保持方形、由容器统一裁切，与聊天列表观感一致
assert.match(
  contactCss,
  /\.contact-avatar\.group-avatar-collage\s+\.group-avatar-collage-cell\s*\{[^}]*border-radius:\s*0/s,
);
assert.doesNotMatch(
  contactCss,
  /\.contact-avatar\.group-avatar-collage\[data-layout='trio'\][\s\S]*?\.group-avatar-collage-cell\[data-collage-lead='true'\]/s,
);
assert.match(
  css,
  /\.group-create-member-row\s*\{[\s\S]*?min-height:\s*63px[\s\S]*?flex:\s*0 0 auto[\s\S]*?gap:\s*12px[\s\S]*?padding:\s*10px 12px/,
);
assert.match(css, /\.group-create-member-name\s*\{[\s\S]*?font-weight:\s*500[\s\S]*?line-height:\s*21px/);
assert.match(css, /\.group-create-member-description\s*\{[\s\S]*?margin-top:\s*2px/);
assert.match(css, /\.group-create-member-description\s*\{[\s\S]*?line-height:\s*18px/);
assert.match(css, /\.group-create-footer\s*\{[\s\S]*?padding:\s*16px 28px/);
assert.match(css, /\.group-create-member-row\.is-selected/);
assert.match(css, /\.group-panel-shell\s*\{[\s\S]*?height:\s*auto/);
assert.match(css, /@keyframes\s+group-redesign-shake/);
assert.match(css, /body\[data-theme-mode='dark'\][\s\S]*?\.group-redesign-panel/);
assert.match(css, /body\[data-theme-mode='dark'\]\s+#group-create-panel[^\s,]*\s+#group-create\.group-redesign-primary[\s\S]*?background:[^;]+!important/);
assert.match(css, /body\[data-theme-mode='dark'\]\s+#group-create-panel[^\s,]*\s+\.group-create-input-shell input[\s\S]*?background:\s*transparent\s*!important/);
assert.match(css, /body\[data-theme-mode='dark'\]\s+#group-panel[^\s,]*\s+\.group-color-choices\s+\.group-color-choice\s*\{[\s\S]*?var\(--group-choice-color\)\s*!important/);
assert.match(groupPanel, /this\.panel\.id\s*=\s*'group-panel'/);
assert.match(css, /body\[data-reduced-motion='on'\][\s\S]*?#quick-menu/);
assert.match(css, /@media\s*\(prefers-reduced-motion:\s*reduce\)/);

assert.match(createPanel, /createContactAvatarElement/);
assert.match(createPanel, /group-selected-chips/);
assert.match(createPanel, /group-create-member-check/);
assert.match(groupPanel, /group-color-choice/);
assert.match(groupPanel, /group-manager-card/);
assert.match(groupPanel, /group-manager-inline-delete/);
assert.match(app, /createContactAvatarElement/);

console.log('ok - group creation and contact grouping surfaces carry the reference visual and motion contract');
