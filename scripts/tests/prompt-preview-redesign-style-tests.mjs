import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../src/assets/css/prompt-preview-redesign.css', import.meta.url), 'utf8');
const html = fs.readFileSync(new URL('../../src/index.html', import.meta.url), 'utf8');
const app = fs.readFileSync(new URL('../../src/scripts/ui/app.js', import.meta.url), 'utf8');

assert.match(html, /prompt-preview-redesign\.css/);
assert.match(css, /\.prompt-overview-usage-ring/);
assert.match(css, /\.prompt-document-line-number/);
assert.match(css, /\.prompt-full-wrap\.is-active/);
assert.match(css, /prefers-reduced-motion/);
assert.match(css, /var\(--app-surface-card\)/, '新版必须继续消费主应用主题 token');
assert.equal(app.includes('background:#1a1a2e'), false, '旧的深色请求参数面板不得残留');
assert.equal(app.includes('// Messages ('), false, '第一页不得再包含旧的完整消息渲染循环');
assert.match(app, /buildPromptOverviewView/);
assert.match(app, /buildFullPromptDocument/);
assert.equal(app.includes('/参考项目/'), false, '主工程不得运行时依赖参考项目');

console.log('ok - prompt preview redesign keeps white-theme tokens, responsive motion and a single full-prompt view');

