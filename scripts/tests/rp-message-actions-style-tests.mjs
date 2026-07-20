import assert from 'node:assert/strict';
import fs from 'node:fs';

const css = fs.readFileSync(new URL('../../src/assets/css/qq-legacy.css', import.meta.url), 'utf8');

assert.match(css, /\.QQ_chat_charmsg\.has-rp-message-chrome\s*>\s*\.QQ_chat_head\s*\{[^}]*32px[^}]*margin-top:\s*4px/s);
assert.match(css, /\.rp-message-header\s*\{[^}]*display:\s*flex/s);
assert.match(css, /\.QQ_chat_charmsg\.has-rp-message-chrome\s+\.QQ_chat_msgdiv\s*\{[^}]*4px 20px 20px 20px/s);
assert.match(css, /\.rp-message-actions\s*\{[^}]*opacity:\s*0/s);
assert.match(css, /@media\s*\(hover:\s*hover\)\s*and\s*\(pointer:\s*fine\)[\s\S]*\.has-rp-message-chrome:hover\s+\.rp-message-actions[\s\S]*opacity:\s*1/);
assert.match(css, /\.has-rp-message-chrome\.is-rp-actions-visible\s+\.rp-message-actions\s*\{[^}]*opacity:\s*1/s);

console.log('ok - rp assistant chrome keeps a compact avatar and compositor-only desktop/touch action reveal');
