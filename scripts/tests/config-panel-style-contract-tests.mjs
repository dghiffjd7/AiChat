import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root = process.cwd();
const configSource = await readFile(path.join(root, 'src/scripts/ui/config-panel.js'), 'utf8');
const imageParamsSource = await readFile(path.join(root, 'src/scripts/ui/image-generation-params-panel.js'), 'utf8');
const apiConfigSource = await readFile(path.join(root, 'src/assets/css/api-config.css'), 'utf8');
const secondarySource = await readFile(path.join(root, 'src/assets/css/api-config-secondary.css'), 'utf8');
const indexSource = await readFile(path.join(root, 'src/index.html'), 'utf8');

assert.match(configSource, /id = 'config-overlay'[\s\S]*?className = 'api-config-overlay'/);
assert.match(configSource, /id = 'config-panel'[\s\S]*?className = 'api-config-panel'/);
assert.match(configSource, /class="config-modal api-config-modal"/);
assert.match(configSource, /id="config-close"[\s\S]*?aria-label="关闭 API 配置"/);
assert.match(configSource, /querySelector\('#config-close'\)[\s\S]*?this\.hide\(\)/);
assert.match(indexSource, /theme\.css[\s\S]*?api-config\.css/);

assert.match(apiConfigSource, /#config-overlay\.api-config-overlay\s*\{/);
assert.match(apiConfigSource, /backdrop-filter:\s*blur\(3px\)/);
assert.match(apiConfigSource, /#config-panel\.api-config-panel\s*>\s*\.api-config-modal\s*\{[\s\S]*?border-radius:\s*20px/);
assert.match(apiConfigSource, /@keyframes api-config-modal-in\s*\{[\s\S]*?translateY\(14px\)\s+scale\(0\.982\)/);
assert.match(apiConfigSource, /animation:\s*api-config-modal-in 0\.3s cubic-bezier\(0\.22,\s*1\.2,\s*0\.36,\s*1\)/);
assert.match(apiConfigSource, /\.api-config-tabs\s*\{/);
assert.match(apiConfigSource, /\.api-config-tab\.is-active\s*\{/);
assert.match(apiConfigSource, /\.api-config-accordion-content\s*\{[\s\S]*?grid-template-rows:\s*0fr/);
assert.match(apiConfigSource, /\.api-config-accordion\.is-expanded[\s\S]*?grid-template-rows:\s*1fr/);
assert.match(apiConfigSource, /\.api-config-model-chip\.is-match/);
assert.match(apiConfigSource, /@media \(prefers-reduced-motion:\s*reduce\)/);
assert.match(apiConfigSource, /body\[data-reduced-motion='on'\][\s\S]*?\.api-config-modal/);
assert.doesNotMatch(apiConfigSource, /#[0-9a-fA-F]{3,8}\b/, 'API 配置专用样式应全部使用主题 token，不新增硬编码色值');

console.log('ok - config panel carries the reference modal hierarchy, motion, and theme-safe styling');

assert.match(configSource, /id="config-main-page"/);
assert.match(configSource, /id="config-image-params-page" style="display:none;"/);
assert.match(configSource, /showImageParamsPage\(\)/);
assert.match(configSource, /showEmbedded\(\{[\s\S]*container:\s*paramsPage/);
assert.doesNotMatch(configSource, /open-image-generation-params'\)\?\.addEventListener\('click', \(\) => \{\s*this\.imageGenerationParamsPanel\.show\(\);/);
assert.match(secondarySource, /#image-generation-params-overlay\s*\{[\s\S]*?z-index:\s*23120/);
assert.match(secondarySource, /\.igp-panel-modal\s*\{[\s\S]*?z-index:\s*23130/);

console.log('ok - image generation params opens as config panel secondary page and stays above config in fallback modal mode');
