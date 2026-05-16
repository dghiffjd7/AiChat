import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'src/scripts/ui/preset-panel.js'), 'utf8');

assert.match(source, /\.pp-pages\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*100%;/);
assert.match(source, /\.pp-page\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;/);
assert.match(source, /\.pp-pages\[data-view="detail"\]\s+\.pp-page\[data-panel-page="detail"\]/);
assert.match(source, /data-panel-page="root"/);
assert.match(source, /data-panel-page="detail"/);
assert.match(source, /data-panel-page="bindings"/);
assert.doesNotMatch(source, /\.pp-pages\s*\{[\s\S]*width:\s*300%;/);
assert.doesNotMatch(source, /translateX\(-33\.333333%\)/);

console.log('ok - preset panel pages are stacked so scrollbars do not slide during view changes');
