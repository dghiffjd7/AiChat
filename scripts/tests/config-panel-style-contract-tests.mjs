import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const configSource = await readFile(path.join(root, 'src/scripts/ui/config-panel.js'), 'utf8');
const imageParamsSource = await readFile(path.join(root, 'src/scripts/ui/image-generation-params-panel.js'), 'utf8');
const themeSource = await readFile(path.join(root, 'src/assets/css/theme.css'), 'utf8');

assert.match(configSource, /id = 'config-overlay'[\s\S]*?z-index:\s*23000;/);
assert.match(configSource, /id = 'config-panel'[\s\S]*?z-index:\s*23010;/);
assert.match(configSource, /class="config-modal" style="[^"]*background-color:\s*rgb\(255,\s*255,\s*255\);[^"]*opacity:\s*1;[^"]*border:\s*1px solid var\(--app-border-default\);/);
assert.doesNotMatch(configSource, /class="config-modal" style="[^"]*background:\s*#fff/i);
assert.match(themeSource, /body\[data-theme-mode='dark'\] #config-panel > \.config-modal \{[\s\S]*?background:\s*#1f232b !important;[\s\S]*?opacity:\s*1 !important;[\s\S]*?\}/);

console.log('ok - config panel modal remains opaque above agent center');

assert.match(configSource, /id="config-main-page"/);
assert.match(configSource, /id="config-image-params-page" style="display:none;"/);
assert.match(configSource, /showImageParamsPage\(\)/);
assert.match(configSource, /showEmbedded\(\{[\s\S]*container:\s*paramsPage/);
assert.doesNotMatch(configSource, /open-image-generation-params'\)\?\.addEventListener\('click', \(\) => \{\s*this\.imageGenerationParamsPanel\.show\(\);/);
assert.match(imageParamsSource, /z-index:23120;/);
assert.match(imageParamsSource, /z-index:23130;/);

console.log('ok - image generation params opens as config panel secondary page and stays above config in fallback modal mode');
