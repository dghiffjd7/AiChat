import assert from 'node:assert/strict';
import fs from 'node:fs';

const html = fs.readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../../src/assets/css/social-desktop-redesign.css', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');

assert.match(html, /id="desktop-chat-placeholder"/);
assert.match(html, /id="contact-detail"/);
assert.match(html, /social-desktop-redesign\.css/);
assert.match(html, /<button[^>]+class="desktop-rail-brand"[^>]+aria-label="切换当前用户或角色卡"/s);
assert.match(html, /class="chat-room-presence-dot"/);
assert.match(html, /id="current-chat-avatar-button"/);
assert.match(css, /@media\s*\(min-width:\s*900px\)/);
assert.match(css, /body\[data-ui-mode=['"]chat['"]\]\s+#app\s*\{[^}]*grid-template-columns:\s*84px\s+minmax\(0,\s*1fr\)/s);
assert.match(css, /#chat-page\.active[\s\S]*?grid-template-columns:\s*minmax\(280px,\s*320px\)\s+minmax\(0,\s*1fr\)/);
assert.match(css, /\.is-session-switching\s+\.msgcontent/);
assert.match(css, /\.contact-detail-stat-icon\s*\{[^}]*width:\s*17px[^}]*stroke:\s*currentColor/s);
assert.match(css, /\.contact-detail-persona-row\s*\{[^}]*grid-template-columns:\s*62px\s+minmax\(0,\s*1fr\)/s);
assert.match(css, /\.chat-room-presence-dot\s*\{[^}]*width:\s*6px[^}]*height:\s*6px/s);
assert.doesNotMatch(css, /\.chat-room-presence\s*>\s*span\s*\{/);
assert.match(css, /#message-topbar\s+\.user-avatar-btn[\s\S]*?display:\s*none/);
assert.match(app, /querySelectorAll\(['"]\.desktop-rail-brand,\s*\.qq-message-topbar \.user-avatar-btn['"]\)/);
assert.match(css, /\.moment-comment-composer\.is-open\s*\{[^}]*display:\s*grid/s);
assert.match(css, /body\[data-reduced-motion=['"]on['"]\]\s+\.moment-comment-composer/);
assert.match(css, /body\[data-reduced-motion=['"]on['"]\]\[data-ui-mode=['"]chat['"]\]\s+#chat-room\.is-session-switching\s+\.msgcontent/);
assert.match(css, /@media\s*\(max-width:\s*899px\)/);
assert.doesNotMatch(css, /backdrop-filter/);

console.log('ok - social desktop redesign keeps the split shell desktop-only and compositor-friendly');
