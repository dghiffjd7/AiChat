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
assert.match(source, /pp-nav-item-sub">\$\{escapeHtml\(this\.getSectionBadge\(sec\)/, '预设名称徽标必须转义后再写入 HTML');
assert.match(source, /escapeHtml\(boundItems\.map\(\(i\) => i\.name\)\.join\('、'\)\)/, '绑定会话名称必须转义后再写入 HTML');
assert.match(source, /isPreviewHistoryIncluded\(\)/, '聊天记录按钮与占位提示必须共用实际生效状态');
assert.match(source, /const presetMaximizeSvg = `<svg class="pp-maximize-icon"/, '预设放大按钮应使用独立 SVG');
assert.match(source, /class="pp-maximize-expand"[\s\S]*class="pp-maximize-restore"/, '放大 SVG 应同时提供放大与还原状态');
assert.match(source, /id="preset-maximize"[^>]*aria-label="放大预设面板"[^>]*aria-pressed="false"[^>]*>\$\{presetMaximizeSvg\}<\/button>/, '放大按钮应渲染 SVG 并声明初始状态');
assert.doesNotMatch(source, /id="preset-maximize"[^>]*>⛶<\/button>/, '放大按钮不应退回字体符号');
assert.match(source, /\.pp-maximize-icon-main\s*\{[\s\S]*stroke:\s*currentColor;/, '放大图标主线应继承主题文字颜色');
assert.match(source, /\.pp-maximize-icon-accent\s*\{[\s\S]*stroke:\s*var\(--app-accent-primary\)/, '放大图标点缀应继承主题强调色');
assert.match(source, /#preset-maximize\.is-on \.pp-maximize-expand[\s\S]*#preset-maximize\.is-on \.pp-maximize-restore/, '放大与还原图形应随状态切换');
assert.match(source, /maxBtn\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/, '放大状态应同步给辅助技术');

const previewHandleButtons = Array.from(source.matchAll(
    /<button[^>]*class="(?:pp-preview-edge|pp-pane-handle[^\"]*|pp-editor-handle)"[^>]*>([\s\S]*?)<\/button>/g,
));
assert.equal(previewHandleButtons.length, 5, '展开、拉满、收合与返回编辑应共用五个预览把手入口');
previewHandleButtons.forEach((match) => {
    assert.match(match[1], /\$\{previewPullHandleSvg\}/, '预览把手入口应使用统一的椭圆提环 SVG');
});
assert.match(source, /const previewPullHandleSvg = `<svg class="pp-pull-handle-svg"/);
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle,\s*\n\.pp-editor-handle\s*\{[\s\S]*width:\s*28px;[\s\S]*height:\s*56px;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/, '提环按钮应无外框，并承载稍微收窄的 SVG');
assert.match(source, /\.pp-pull-handle-svg\s*\{[\s\S]*width:\s*56px;\s*height:\s*28px;/, '提环应保留沿边长度并稍微缩短环顶到底部的距离');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle,\s*\n\.pp-editor-handle\s*\{[\s\S]*opacity:\s*0\.5;/, '提环平时应保持半透明');
assert.match(source, /\.pp-preview-edge\.is-opaque,[\s\S]*\.pp-editor-handle\.is-opaque\s*\{\s*opacity:\s*1;/, '互动中的提环应完全不透明');
assert.match(source, /handle\.classList\.add\('is-opaque'\)[\s\S]*setTimeout\([\s\S]*handle\.classList\.remove\('is-opaque'\)[\s\S]*},\s*3000\);/, '提环应在最后一次互动三秒后恢复半透明');
assert.match(source, /addEventListener\('pointerenter',[\s\S]*addEventListener\('click',[\s\S]*addEventListener\('focus'/, '鼠标进入、点击与键盘聚焦都应触发提环显现');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle-expand\s*\{\s*--pp-pull-rotation:\s*-90deg;/, '向左拉的提环应朝左');
assert.match(source, /\.pp-pane-handle-collapse,\s*\n\.pp-editor-handle\s*\{\s*--pp-pull-rotation:\s*90deg;/, '向右拉的提环应朝右');
assert.match(source, /transform:\s*rotate\(var\(--pp-pull-rotation\)\);/);
assert.doesNotMatch(source, /\.pp-preview-edge::after|\.pp-pane-handle::after|\.pp-editor-handle::after/, '提环与边缘之间不应再绘制连接线');
assert.match(source, /\.pp-pane-handle\s*\{\s*left:\s*54%;/, '分栏提环应定位在共同分隔线上');
assert.match(source, /\.pp-pane-handle-expand\s*\{[\s\S]*--pp-handle-x:\s*-100%;/, '左向提环应从编辑侧以环底贴住分隔线');
assert.match(source, /\.pp-pane-handle-collapse\s*\{[\s\S]*--pp-handle-x:\s*0%;/, '右向提环应从预览侧以环底贴住分隔线');
assert.match(source, /\.pp-pane-handle-expand\s*\{[^}]*top:\s*calc\(50% - 34px\);[^}]*\}[\s\S]*\.pp-pane-handle-collapse\s*\{[^}]*top:\s*calc\(50% \+ 34px\);/, '放大后的分栏提环应保持间距且不得重叠');
assert.match(source, /#preset-panel\[data-preview-motion="opening-split"\] \.pp-pane-handle-collapse\s*\{[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;/, '展开动画落位前不得提前显示第二个提环');
assert.match(source, /previewMotion\s*=\s*'opening-split'[\s\S]*left:\s*'100%'[\s\S]*top:\s*'50%'[\s\S]*left:\s*'54%'[\s\S]*top:\s*'calc\(50% - 34px\)'/, '第一个提环应从原边缘跟随预览分隔线移动到落点');
assert.match(source, /const fadeHandleHandoff[\s\S]*\{ opacity:\s*0 \}[\s\S]*\{ opacity:\s*incomingOpacity \}/, '提环交接应从透明淡入目标透明度');
assert.match(source, /const revealSecondHandle[\s\S]*incoming:\s*collapseHandle[\s\S]*incomingOpacity:\s*0\.5[\s\S]*leadHandleAnimation\.onfinish\s*=\s*revealSecondHandle/, '第一个提环落位后才应淡入第二个提环');
for (const motion of ['opening-split', 'expanding-full', 'returning-split', 'closing-split', 'opening-full', 'closing-full']) {
    assert.match(source, new RegExp(`startPreviewMotion\\('${motion}'(?:,|\\))`), `预览状态路径 ${motion} 应启用提环跟随动画`);
}
assert.match(source, /startPreviewMotion\('expanding-full'\)[\s\S]*left:\s*'54%'[\s\S]*left:\s*'0%'/, '分栏展开全屏时提环应跟随左边界移动');
assert.match(source, /startPreviewMotion\('returning-split'[\s\S]*left:\s*'0%'[\s\S]*left:\s*'54%'/, '全屏回到分栏时提环应跟随边界返回');
assert.match(source, /startPreviewMotion\('closing-split'\)[\s\S]*left:\s*'54%'[\s\S]*left:\s*'100%'/, '分栏收合时提环应跟随边界回到右缘');
assert.match(source, /startPreviewMotion\('opening-full'\)[\s\S]*right:\s*'0%'[\s\S]*right:\s*'100%'/, '手机全屏展开时提环应跟随边界由右向左移动');
assert.match(source, /startPreviewMotion\('closing-full'[\s\S]*left:\s*'0%'[\s\S]*left:\s*'100%'/, '手机全屏收合时提环应跟随边界返回右缘');
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
