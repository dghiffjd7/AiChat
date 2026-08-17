import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/assets/css/social-desktop-redesign.css', import.meta.url), 'utf8');
const mainCss = fs.readFileSync(new URL('../../src/assets/css/main.css', import.meta.url), 'utf8');
const theme = fs.readFileSync(new URL('../../src/assets/css/theme.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');
const chatListHandleMarkup = html.match(/<button[^>]*id="chat-list-collapse-handle"[^>]*>([\s\S]*?)<\/button>/)?.[1] || '';

const collectBalancedCssBlocks = (source, marker) => {
  const flags = marker.flags.includes('g') ? marker.flags : `${marker.flags}g`;
  const pattern = new RegExp(marker.source, flags);
  const blocks = [];
  let match = null;
  while ((match = pattern.exec(source))) {
    const open = source.indexOf('{', match.index);
    if (open < 0) break;
    let depth = 0;
    let close = -1;
    for (let index = open; index < source.length; index += 1) {
      if (source[index] === '{') depth += 1;
      if (source[index] !== '}') continue;
      depth -= 1;
      if (depth === 0) {
        close = index;
        break;
      }
    }
    assert.ok(close > open, `CSS block must close: ${match[0]}`);
    blocks.push({ start: match.index, end: close + 1, body: source.slice(open + 1, close) });
    pattern.lastIndex = close + 1;
  }
  return blocks;
};

const desktopMediaBlocks = collectBalancedCssBlocks(css, /@media\s*\(min-width:\s*900px\)\s*/);
const desktopCss = desktopMediaBlocks.map(block => block.body).join('\n');
let cssOutsideDesktop = css;
for (const block of desktopMediaBlocks.slice().reverse()) {
  cssOutsideDesktop = `${cssOutsideDesktop.slice(0, block.start)}${cssOutsideDesktop.slice(block.end)}`;
}
const darkThemeBlock = collectBalancedCssBlocks(theme, /body\[data-theme-mode='dark'\]\s*/)[0]?.body || '';
const mobilePageMedia = collectBalancedCssBlocks(mainCss, /@media\s*\(max-width:\s*899px\)\s*/)
  .map(block => block.body)
  .join('\n');
const mobilePageFadeIn = collectBalancedCssBlocks(mainCss, /@keyframes\s+mobilePageFadeIn\s*/)[0]?.body || '';
const mobilePageFadeOut = collectBalancedCssBlocks(mainCss, /@keyframes\s+mobilePageFadeOut\s*/)[0]?.body || '';

assert.match(html, /id="desktop-chat-placeholder"/);
assert.match(html, /id="chat-list-collapse-handle"/);
assert.doesNotMatch(chatListHandleMarkup, /<svg|desktop-chat-list-handle-svg/, '聊天收合入口应只保留透明热区，不再渲染 U 形提环');
assert.match(html, /id="contact-detail"/);
assert.match(html, /social-desktop-redesign\.css/);
assert.match(html, /<button[^>]+class="desktop-rail-brand"[^>]+aria-label="切换当前用户或角色卡"/s);
assert.match(html, /class="chat-room-presence-dot"/);
assert.match(html, /id="current-chat-avatar-button"/);
assert.match(css, /@media\s*\(min-width:\s*900px\)/);
assert.match(mobilePageFadeIn, /from\s*\{\s*opacity:\s*0;?\s*\}[\s\S]*to\s*\{\s*opacity:\s*1;?\s*\}/, '手机版分页进入应只做淡入');
assert.match(mobilePageFadeOut, /from\s*\{\s*opacity:\s*1;?\s*\}[\s\S]*to\s*\{\s*opacity:\s*0;?\s*\}/, '手机版分页离开应只做淡出');
assert.doesNotMatch(`${mobilePageFadeIn}\n${mobilePageFadeOut}`, /transform\s*:/, '手机版分页不得再平移含滚动层的整页');
assert.match(mobilePageMedia, /\.page\.active\[data-page-dir=['"]forward['"]\],[\s\S]*mobilePageFadeIn/, '手机版前后方向应共用稳定淡入');
assert.match(mobilePageMedia, /\.page\.page-exiting\[data-page-dir=['"]forward['"]\],[\s\S]*mobilePageFadeOut/, '手机版离场页应原地淡出');
assert.match(
  cssOutsideDesktop,
  /#contacts-page\.page-exiting\s*\{[^}]*position:\s*absolute;/s,
  '手机版联系人离场页必须脱离文档流，避免把进入页挤到下半屏',
);
assert.ok(desktopMediaBlocks.length >= 1, '桌面规则必须存在于 min-width: 900px 媒体块');
assert.match(cssOutsideDesktop, /\.desktop-chat-list-handle\s*\{[^}]*display:\s*none;/s, '移动端默认必须隐藏锚条热区');
assert.doesNotMatch(
  cssOutsideDesktop,
  /#chat-page[^{}]*>\s*\.desktop-chat-list-handle\s*\{[^}]*(?:display:\s*block|position:\s*absolute|left:\s*calc)/s,
  '令锚条显形与定位的规则不得逃出桌面媒体块',
);
assert.match(
  desktopCss,
  /#chat-page\s*>\s*\.desktop-chat-list-handle\s*\{[^}]*position:\s*absolute;[^}]*display:\s*block;/s,
  '桌面媒体块内才允许锚条热区显形与定位',
);
assert.match(css, /body\[data-ui-mode=['"]chat['"]\]\s+#app\s*\{[^}]*grid-template-columns:\s*84px\s+minmax\(0,\s*1fr\)/s);
assert.match(css, /#chat-page\.active[\s\S]*?--chat-list-column-width:\s*320px;[\s\S]*?grid-template-columns:\s*minmax\(0,\s*var\(--chat-list-column-width\)\)\s+minmax\(0,\s*1fr\)/);
assert.match(css, /#chat-page\[data-chat-list-collapsed='true'\]\s*\{[^}]*--chat-list-column-width:\s*0px/s);
assert.match(css, /#chat-page\[data-chat-list-collapsed='true'\]\s*>\s*:is\([\s\S]*?#chat-list[\s\S]*?visibility:\s*hidden\s*!important/s);
assert.match(css, /#chat-page\s*>\s*\.desktop-chat-list-handle\s*\{[\s\S]*--chat-list-marker-offset:\s*-12px;[\s\S]*--chat-list-marker-box-x:\s*-100%;[\s\S]*--chat-list-marker-line-x:\s*100%;[\s\S]*left:\s*calc\(var\(--chat-list-column-width\) \+ var\(--chat-list-marker-offset\)\)[\s\S]*width:\s*24px;[\s\S]*height:\s*112px;/, '展开态锚条应与滚动条保持 12px 间距，透明热区只向列表内延伸');
assert.match(css, /#chat-page\[data-chat-list-collapsed='true'\]\s*>\s*\.desktop-chat-list-handle\s*\{[\s\S]*--chat-list-marker-offset:\s*6px;[\s\S]*--chat-list-marker-box-x:\s*0%;[\s\S]*--chat-list-marker-line-x:\s*0%;/, '收合态锚条及透明热区应位于聊天区左缘内侧');
assert.match(css, /\.desktop-chat-list-handle::after\s*\{[\s\S]*linear-gradient/);
assert.match(theme, /--pull-handle-rest-opacity:\s*0\.62;/, '预设提环应保留统一静息透明度');
assert.match(theme, /--chat-list-edge-marker-rest-opacity:\s*0\.42;/, '聊天边缘锚条静息时应只留下微弱定位痕迹');
assert.match(theme, /--chat-list-edge-marker-room-opacity:\s*0\.3;/, '进房后的收合锚条应进一步避让聊天内容');
assert.match(theme, /--pull-handle-anchor-height:\s*92px;/, '边缘锚条应保留既有高度');
assert.match(theme, /--pull-handle-rest-filter:[^;]*color-mix\(/, '静息光晕应统一使用 color-mix');
assert.match(theme, /--pull-handle-hover-filter:[^;]*color-mix\(/, '互动光晕应统一使用 color-mix');
assert.match(darkThemeBlock, /--pull-handle-rest-filter:[^;]*color-mix\(/, '深色主题必须保留独立的静息光晕覆盖');
assert.match(darkThemeBlock, /--pull-handle-anchor-color:[^;]*color-mix\(/, '深色主题必须直接覆盖锚条颜色');
assert.match(css, /\.desktop-chat-list-handle::after\s*\{[\s\S]*?height:\s*var\(--pull-handle-anchor-height\)[\s\S]*?opacity:\s*var\(--chat-list-edge-marker-rest-opacity\)[\s\S]*?filter:\s*var\(--pull-handle-rest-filter\)/, '聊天锚条应消费独立静息透明度与共享光晕');
assert.match(css, /\.desktop-chat-list-handle:(?:hover|focus-visible)::after[\s\S]*?width:\s*4px;[\s\S]*?opacity:\s*1;[\s\S]*?filter:\s*var\(--pull-handle-hover-filter\)/s, '锚条应随 hover/focus 醒来');
assert.match(css, /\.desktop-chat-list-handle::before\s*\{[\s\S]*?background:\s*var\(--app-danger-text\)[\s\S]*?opacity:\s*0;/, '透明热区应以伪元素预留未读点');
assert.match(css, /data-chat-list-collapsed='true'\]\[data-chat-list-has-unread='true'\][\s\S]*?desktop-chat-list-handle::before[\s\S]*?opacity:\s*1;/, '收合态应以危险色小点保留未读信号');
assert.match(css, /#chat-page\.chat-room-active\[data-chat-list-collapsed='true'\][\s\S]*?desktop-chat-list-handle::after[\s\S]*?opacity:\s*var\(--chat-list-edge-marker-room-opacity\)/, '进房且收合时应进一步降低锚条静息透明度');
assert.match(css, /#chat-page\.chat-room-active\[data-chat-list-collapsed='true'\][\s\S]*?\.desktop-chat-list-handle:(?:hover|focus-visible)::after[\s\S]*?opacity:\s*1/s, '进房后的锚条仍应在互动时完全显现');
assert.doesNotMatch(css, /desktop-chat-list-handle-(?:svg|depth|rail|glint|anchor)/, '移除 U 形提环后不得遗留聊天 SVG 专用样式');
assert.match(css, /prefers-reduced-motion:[\s\S]*desktop-chat-list-handle::before[\s\S]*desktop-chat-list-handle::after/s, '边缘锚条与未读点应服从系统减弱动效');
assert.match(css, /\.is-session-switching\s+\.msgcontent/);
assert.match(css, /\.contact-detail-stat-icon\s*\{[^}]*width:\s*17px[^}]*stroke:\s*currentColor/s);
assert.match(css, /\.contact-detail-persona-row\s*\{[^}]*grid-template-columns:\s*62px\s+minmax\(0,\s*1fr\)/s);
assert.match(css, /\.chat-room-presence-dot\s*\{[^}]*width:\s*6px[^}]*height:\s*6px/s);
assert.doesNotMatch(css, /\.chat-room-presence\s*>\s*span\s*\{/);
assert.match(css, /#message-topbar\s+\.user-avatar-btn[\s\S]*?display:\s*none/);
assert.match(app, /querySelectorAll\(['"]\.desktop-rail-brand,\s*\.qq-message-topbar \.user-avatar-btn['"]\)/);
assert.match(app, /createChatListCollapseRuntime\(\{[\s\S]*chat-list-collapse-handle/);
assert.match(app, /const unreadTotal = ids\.reduce\([\s\S]*chatStore\.getUnreadCount\(id\)[\s\S]*chatListCollapseRuntime\?\.setUnreadCount\?\.\(unreadTotal\)/, '聊天列表刷新应把可见会话未读总数同步给提环');
assert.match(css, /\.moment-comment-composer\.is-open\s*\{[^}]*display:\s*grid/s);
assert.match(css, /body\[data-reduced-motion=['"]on['"]\]\s+\.moment-comment-composer/);
assert.match(css, /body\[data-reduced-motion=['"]on['"]\]\[data-ui-mode=['"]chat['"]\]\s+#chat-room\.is-session-switching\s+\.msgcontent/);
assert.match(css, /@media\s*\(max-width:\s*899px\)/);
assert.doesNotMatch(css, /backdrop-filter/);

console.log('ok - social desktop redesign keeps the split shell desktop-only and compositor-friendly');
