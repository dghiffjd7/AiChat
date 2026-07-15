import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const source = await readFile(path.join(root, 'src/scripts/ui/preset-panel.js'), 'utf8');
const sessionConfigSource = await readFile(path.join(root, 'src/scripts/ui/session-config-panel.js'), 'utf8');
const presetStoreSource = await readFile(path.join(root, 'src/scripts/storage/preset-store.js'), 'utf8');

assert.match(source, /\.pp-pages\s*\{[\s\S]*position:\s*relative;[\s\S]*width:\s*100%;/);
assert.match(source, /\.pp-page\s*\{[\s\S]*position:\s*absolute;[\s\S]*inset:\s*0;/);
assert.match(source, /\.pp-pages\[data-view="detail"\]\s+\.pp-page\[data-panel-page="detail"\]/);
assert.match(source, /data-panel-page="root"/);
assert.match(source, /data-panel-page="detail"/);
assert.match(source, /data-panel-page="bindings"/);
assert.match(source, /buildModeCard\('moments', '动态任务'\)/);
assert.match(sessionConfigSource, /renderModeCard\(wrap, 'moments', '动态任务默认'/);
assert.match(presetStoreSource, /PRESET_BINDING_MODES = \['chat', 'rp', 'moments'\]/);
assert.doesNotMatch(source, /\.pp-pages\s*\{[\s\S]*width:\s*300%;/);
assert.doesNotMatch(source, /translateX\(-33\.333333%\)/);
assert.match(source, /@media \(max-width: 520px\), \(max-height: 720px\)/);
assert.match(source, /--pp-footer-height:\s*50px;/);
assert.match(source, /\.pp-header-title\s*\{[\s\S]*white-space:\s*nowrap;/);
assert.match(source, /\.pp-manager-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(source, /class="pp-block-title">\$\{escapeHtml\(title\)\}/, '导入的区块标题必须转义后再写入 HTML');

const previewHandleButtons = Array.from(source.matchAll(
    /<button[^>]*class="(?:pp-preview-edge|pp-pane-handle[^\"]*|pp-editor-handle)"[^>]*>([\s\S]*?)<\/button>/g,
));
assert.equal(previewHandleButtons.length, 5, '展开、拉满、收合与返回编辑应共用五个预览把手入口');
previewHandleButtons.forEach((match) => {
    assert.match(match[1], /\$\{previewPullHandleSvg\}/, '预览把手入口应使用统一的椭圆提环 SVG');
});
assert.match(source, /const previewPullHandleSvg = `<svg class="pp-pull-handle-svg"/);
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle,\s*\n\.pp-editor-handle\s*\{[\s\S]*width:\s*14px;[\s\S]*height:\s*24px;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/, '提环按钮应无外框，仅保留 SVG');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle-expand\s*\{\s*--pp-pull-rotation:\s*-90deg;/, '向左拉的提环应朝左');
assert.match(source, /\.pp-pane-handle-collapse,\s*\n\.pp-editor-handle\s*\{\s*--pp-pull-rotation:\s*90deg;/, '向右拉的提环应朝右');
assert.match(source, /transform:\s*rotate\(var\(--pp-pull-rotation\)\);/);
assert.doesNotMatch(source, /\.pp-preview-edge::after|\.pp-pane-handle::after|\.pp-editor-handle::after/, '提环与边缘之间不应再绘制连接线');
assert.match(source, /\.pp-pane-handle\s*\{\s*left:\s*54%;/, '分栏提环应定位在共同分隔线上');
assert.match(source, /\.pp-pane-handle-expand\s*\{[\s\S]*--pp-handle-x:\s*-100%;/, '左向提环应从编辑侧以环底贴住分隔线');
assert.match(source, /\.pp-pane-handle-collapse\s*\{[\s\S]*--pp-handle-x:\s*0%;/, '右向提环应从预览侧以环底贴住分隔线');
assert.match(source, /<\/aside>\s*<button[^>]*id="preset-preview-expand"/, '分栏提环应位于预览 pane 外，避免被裁切');

assert.match(source, /const diffAcceptSvg = `<svg class="pp-diff-icon"/);
assert.match(source, /const diffRejectSvg = `<svg class="pp-diff-icon"/);
assert.ok((source.match(/\$\{diffAcceptSvg\}/g) || []).length >= 2, '区块与 hunk 接受操作都应复用 SVG');
assert.ok((source.match(/\$\{diffRejectSvg\}/g) || []).length >= 2, '区块与 hunk 舍弃操作都应复用 SVG');
assert.doesNotMatch(source, /class="pp-diff-(?:accept|reject)"[^>]*>[✔×]<\/button>/, '编辑快捷操作不应退回字体字形');
assert.doesNotMatch(source.match(/const diffAcceptSvg = `([\s\S]*?)`;/)?.[1] || '', /<circle|pp-diff-icon-ring/, '接受图标不应再带内框');
assert.doesNotMatch(source.match(/const diffRejectSvg = `([\s\S]*?)`;/)?.[1] || '', /<circle|pp-diff-icon-ring/, '舍弃图标不应再带内框');
assert.match(source, /\.pp-diff-accept, \.pp-diff-reject\s*\{[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/, '编辑图标按钮应保持无外框透明背景');

console.log('ok - preset panel pages are stacked and compact on small viewports');
