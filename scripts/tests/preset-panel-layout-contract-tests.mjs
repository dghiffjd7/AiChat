import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
    buildReasoningEffortComboboxOptions,
    filterReasoningEffortOptions,
    resolveReasoningEffortInput,
} from '../../src/scripts/ui/reasoning-effort-combobox-utils.js';

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
assert.match(source, /setPreviewDiscoveryGuide\(guide = null\)/, '预设面板应支持注入独立的一次性预览发现引导');
assert.match(source, /currentPage !== 'detail'[\s\S]*?guide\.hide/, '一次性标记只应出现在预设二级页');
assert.match(source, /openPreview\(\)[\s\S]*?previewDiscoveryGuide\?\.complete\?\.\(\)/, '实际展开请求预览后才应永久完成发现引导');
assert.match(source, /hide\(\)[\s\S]*?previewDiscoveryGuide\?\.hide\?\.\(\)/, '仅关闭预设面板不得消耗一次性引导');
assert.match(source, /buildModeCard\('moments', '动态任务'\)/);
assert.match(sessionConfigSource, /renderModeCard\(wrap, 'moments', '动态任务默认'/);
assert.match(presetStoreSource, /PRESET_BINDING_MODES = \['chat', 'rp', 'moments'\]/);
assert.doesNotMatch(source, /\.pp-pages\s*\{[\s\S]*width:\s*300%;/);
assert.doesNotMatch(source, /translateX\(-33\.333333%\)/);
assert.match(source, /@media \(max-width: 520px\), \(max-height: 720px\)/);
assert.match(source, /--pp-footer-height:\s*50px;/);
assert.match(
    source,
    /top:\s*calc\(var\(--app-visual-offset-top,\s*0px\)\s*\+\s*10px\s*\+\s*env\(safe-area-inset-top,\s*0px\)\)/,
    '预设面板的默认位置必须跟随 visual viewport 的顶部偏移',
);
assert.match(
    source,
    /top:\s*calc\(var\(--app-visual-offset-top,\s*0px\)\s*\+\s*var\(--pp-panel-margin\)\s*\+\s*env\(safe-area-inset-top,\s*0px\)\)\s*!important/,
    '小屏幕覆盖也必须跟随 visual viewport 偏移',
);
assert.match(
    source,
    /#preset-panel\[data-maximized="1"\]\s*\{[\s\S]*?top:\s*calc\(var\(--app-visual-offset-top,\s*0px\)\s*\+\s*env\(safe-area-inset-top,\s*0px\)\)\s*!important;[\s\S]*?bottom:\s*auto\s*!important;[\s\S]*?height:\s*calc\(var\(--app-visual-height,\s*100dvh\)/,
    '放大状态不得用 layout viewport 的 bottom:0 把底部按钮推出可视区',
);
assert.match(source, /\.pp-header-title\s*\{[\s\S]*white-space:\s*nowrap;/);
assert.match(source, /\.pp-manager-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(4, minmax\(0, 1fr\)\);/);
assert.match(source, /class="pp-block-title">\$\{escapeHtml\(title\)\}/, '导入的区块标题必须转义后再写入 HTML');
assert.match(source, /pp-nav-item-sub">\$\{escapeHtml\(this\.getSectionBadge\(sec\)/, '预设名称徽标必须转义后再写入 HTML');
assert.match(source, /const sessionSummary = boundItems\.length[\s\S]*boundItems\.map\(\(i\) => i\.name\)\.join\('、'\)/, '绑定摘要必须包含实际会话名称');
assert.match(source, /class="pp-binding-card-sub">\$\{escapeHtml\(sessionSummary\)\}/, '绑定会话摘要必须转义后再写入 HTML');
assert.match(source, /includeHistory:\s*false/, '预设预览固定折叠聊天记录（面板从通用设定打开，无会话历史语境）');
assert.match(source, /pp-prev-history-chip/, '聊天记录占位提示必须保留在实际展开位置');
assert.match(source, /const presetMaximizeSvg = `<svg class="pp-maximize-icon"/, '预设放大按钮应使用独立 SVG');
assert.match(source, /class="pp-maximize-expand"[\s\S]*class="pp-maximize-restore"/, '放大 SVG 应同时提供放大与还原状态');
assert.match(source, /id="preset-maximize"[^>]*aria-label="放大预设面板"[^>]*aria-pressed="false"[^>]*>\$\{presetMaximizeSvg\}<\/button>/, '放大按钮应渲染 SVG 并声明初始状态');
assert.doesNotMatch(source, /id="preset-maximize"[^>]*>⛶<\/button>/, '放大按钮不应退回字体符号');
assert.match(source, /\.pp-maximize-icon-main\s*\{[\s\S]*stroke:\s*currentColor;/, '放大图标主线应继承主题文字颜色');
assert.match(source, /\.pp-maximize-icon-accent\s*\{[\s\S]*stroke:\s*var\(--app-accent-primary\)/, '放大图标点缀应继承主题强调色');
assert.match(source, /#preset-maximize\.is-on \.pp-maximize-expand[\s\S]*#preset-maximize\.is-on \.pp-maximize-restore/, '放大与还原图形应随状态切换');
assert.match(source, /maxBtn\.setAttribute\('aria-pressed', on \? 'true' : 'false'\)/, '放大状态应同步给辅助技术');
assert.match(source, /renderSyspromptEditor\(p\)[\s\S]*renderPhoneFormatPlacementEditor\(p\)/, '系统提示词页应提供可到达的文本格式位置编辑入口');
assert.match(source, /scopeCard\.className = 'pp-scope-card'/, '适用范围必须使用自己的完整卡片结构，不能套用需要 header\/body 的通用 pp-block');
assert.doesNotMatch(source, /scopeCard\.className = 'pp-block'/, '适用范围不得再被 pp-block 的 overflow hidden 裁切');
assert.match(source, /normalizePresetAppScope\([\s\S]*?p\.app_scope,[\s\S]*?PRESET_APP_SCOPES\.creative,[\s\S]*?\)/, '适用范围缺值时应默认创意写作');
assert.match(source, /current\.app_scope = normalizePresetAppScope\(appScope, PRESET_APP_SCOPES\.creative\)/, '每个预设保存时应独立规范化适用范围');
assert.match(source, /\.pp-scope-card\s*\{[^}]*padding:\s*14px 16px;/, '桌面适用范围卡应保留完整内边距');
assert.match(source, /\.pp-scope-card\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\)\s+minmax\(220px,\s*300px\);/, '桌面适用范围卡应使用稳定两栏布局');
assert.match(source, /@media \(max-width: 520px\), \(max-height: 720px\)[\s\S]*\.pp-scope-card\s*\{[\s\S]*grid-template-columns:\s*minmax\(0,\s*1fr\);/, '窄屏适用范围卡应切换为不裁字的单栏布局');
for (const id of ['intro', 'chat', 'moment', 'footer']) {
    assert.match(source, new RegExp(`phone-format-${id}-position`), `文本格式位置入口应包含 ${id} 独立锚位`);
    assert.match(source, new RegExp(`phone-format-${id}-depth`), `文本格式位置入口应包含 ${id} 条件深度`);
}
assert.match(source, /仅传统文本模式生效，FC\/JSON 请求不包含这些内容/, '位置编辑入口必须说明结构化路径隔离');
assert.match(
    source,
    /this\.blockTitleEl\.textContent\s*=\s*translateUiText\(\{[\s\S]*dialogue:\s*'私聊格式提示词',[\s\S]*group:\s*'群聊格式提示词',[\s\S]*\}\[cardId\]\s*\|\|\s*item\.label\);/,
    '私聊与群聊注入编辑器标题必须主动翻译，不能依赖已被 data-i18n-skip 跳过的 DOM 后处理',
);
assert.match(
    source,
    /this\.blockTitleEl\.textContent\s*=\s*translateUiText\(isGuide\s*\?\s*'记忆表格 · 写表指导'\s*:\s*'记忆表格 · 表格记忆'\);/,
    '同一标题节点上的记忆注入编辑器也必须主动翻译',
);

const previewHandleButtons = Array.from(source.matchAll(
    /<button[^>]*class="(?:pp-preview-edge|pp-pane-handle[^\"]*|pp-editor-handle)"[^>]*>([\s\S]*?)<\/button>/g,
));
assert.equal(previewHandleButtons.length, 5, '展开、拉满、收合与返回编辑应共用五个预览把手入口');
previewHandleButtons.forEach((match) => {
    assert.equal(match[1].trim(), '', '预览把手入口应只保留透明热区，不再渲染 U 形提环');
});
assert.doesNotMatch(source, /previewPullHandleSvg|pp-pull-handle-(?:svg|depth|rail|glint|anchor)/, '移除 U 形提环后不得遗留 SVG 模板或专用样式');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle,\s*\n\.pp-editor-handle\s*\{[\s\S]*width:\s*24px;[\s\S]*border:\s*0;[\s\S]*background:\s*transparent;[\s\S]*box-shadow:\s*none;/, '预设锚条按钮应保留无外框透明热区');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-editor-handle\s*\{\s*height:\s*112px;/, 'closed/full 单锚条的热区应完整覆盖 92px 视觉标记');
assert.match(source, /\.pp-preview-edge,\s*\n\.pp-pane-handle,\s*\n\.pp-editor-handle\s*\{[\s\S]*opacity:\s*var\(--pull-handle-rest-opacity\);/, '预设提环应消费共享静息透明度');
assert.match(source, /\.pp-preview-edge\.is-opaque,[\s\S]*\.pp-editor-handle\.is-opaque\s*\{\s*opacity:\s*1;/, '互动中的提环应完全不透明');
assert.match(source, /handle\.classList\.add\('is-opaque'\)[\s\S]*setTimeout\([\s\S]*handle\.classList\.remove\('is-opaque'\)[\s\S]*},\s*3000\);/, '提环应在最后一次互动三秒后恢复半透明');
assert.match(source, /addEventListener\('pointerenter',[\s\S]*addEventListener\('click',[\s\S]*addEventListener\('focus'/, '鼠标进入、点击与键盘聚焦都应触发提环显现');
assert.match(source, /\.pp-preview-edge::after,[\s\S]*\.pp-editor-handle::after\s*\{[\s\S]*linear-gradient/, '提环应以轻量渐变锚定所在边缘');
assert.match(source, /\.pp-preview-edge::after,[\s\S]*\.pp-editor-handle::after\s*\{[\s\S]*width:\s*3px;[\s\S]*height:\s*var\(--pp-edge-marker-height\);[\s\S]*opacity:\s*var\(--pull-handle-anchor-rest-opacity\);[\s\S]*filter:\s*var\(--pull-handle-rest-filter\);/, '预设入口应消费共享锚条与静息光晕规格');
assert.match(source, /\.pp-preview-edge:(?:hover|focus-visible)::after[\s\S]*?\.pp-editor-handle:(?:hover|focus-visible)::after[\s\S]*?width:\s*4px;[\s\S]*?opacity:\s*1;[\s\S]*?filter:\s*var\(--pull-handle-hover-filter\);/s, '预设锚条应随 hover/focus 加粗并醒来');
assert.match(source, /--pp-handle-nudge-hover:\s*-2px[\s\S]*--pp-handle-nudge-hover:\s*2px/, '提环应按拉动方向提供轻微位移反馈');
assert.match(source, /:where\(body\[data-theme-mode='dark'\] #preset-panel\) :is\(\.pp-preview-edge, \.pp-pane-handle, \.pp-editor-handle\)/, '深色静息覆盖应降低特异性，不能压过 hover/focus');
assert.match(source, /\.pp-pane-handle\s*\{\s*left:\s*54%;/, '分栏提环应定位在共同分隔线上');
assert.match(source, /\.pp-pane-handle\s*\{[^}]*height:\s*56px;[^}]*--pp-edge-marker-height:\s*52px;/, '分栏双向锚条应保持独立热区、缩短并留出明确间隔');
assert.match(source, /\.pp-pane-handle-expand\s*\{[\s\S]*--pp-handle-x:\s*-100%;/, '左向提环应从编辑侧以环底贴住分隔线');
assert.match(source, /\.pp-pane-handle-collapse\s*\{[\s\S]*--pp-handle-x:\s*0%;/, '右向提环应从预览侧以环底贴住分隔线');
assert.match(source, /\.pp-pane-handle-expand\s*\{[^}]*top:\s*calc\(50% - 34px\);[^}]*\}[\s\S]*\.pp-pane-handle-collapse\s*\{[^}]*top:\s*calc\(50% \+ 34px\);/, '放大后的分栏提环应保持间距且不得重叠');
assert.match(source, /body\[data-reduced-motion='on'\] \.pp-preview-edge::after,[\s\S]*\.pp-editor-handle::after[\s\S]*transition:\s*none\s*!important;/, '预设锚条应服从应用减弱动效设置');
assert.match(source, /#preset-panel\[data-preview-motion="opening-split"\] \.pp-pane-handle-collapse\s*\{[\s\S]*opacity:\s*0;[\s\S]*pointer-events:\s*none;/, '展开动画落位前不得提前显示第二个提环');
assert.match(source, /previewMotion\s*=\s*'opening-split'[\s\S]*left:\s*'100%'[\s\S]*top:\s*'50%'[\s\S]*left:\s*'54%'[\s\S]*top:\s*'calc\(50% - 34px\)'/, '第一个提环应从原边缘跟随预览分隔线移动到落点');
assert.match(source, /const fadeHandleHandoff[\s\S]*\{ opacity:\s*0 \}[\s\S]*\{ opacity:\s*incomingOpacity \}/, '提环交接应从透明淡入目标透明度');
assert.match(source, /const pullHandleRestOpacity[\s\S]*getPropertyValue\('--pull-handle-rest-opacity'\)[\s\S]*const revealSecondHandle[\s\S]*incoming:\s*collapseHandle[\s\S]*incomingOpacity:\s*pullHandleRestOpacity[\s\S]*leadHandleAnimation\.onfinish\s*=\s*revealSecondHandle/, '第一个提环落位后应淡入共享静息透明度');
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

const reasoningOptions = [
    { value: 'auto', label: '自动' },
    { value: 'minimal', label: '极低' },
    { value: 'low', label: '低' },
    { value: 'medium', label: '中' },
    { value: 'high', label: '高' },
];
assert.deepEqual(filterReasoningEffortOptions(reasoningOptions, '最低').map(item => item.value), ['minimal'], '推理强度应支持中文别名筛选');
assert.deepEqual(filterReasoningEffortOptions(reasoningOptions, 'mini').map(item => item.value), ['minimal'], '推理强度应支持 API 原始值筛选');
assert.deepEqual(resolveReasoningEffortInput(reasoningOptions, '极低'), { type: 'existing', value: 'minimal' }, '已知中文标签应解析为 API 英文值');
assert.deepEqual(resolveReasoningEffortInput(reasoningOptions, 'ultra_low'), { type: 'create', value: 'ultra_low' }, '合法的未知 API 英文值应允许新增');
assert.equal(resolveReasoningEffortInput(reasoningOptions, '超低').type, 'invalid', '未知中文不得作为 API 原始值发送');
const reasoningOptionsWithCustom = buildReasoningEffortComboboxOptions(reasoningOptions, 'ultra_low');
assert.equal(reasoningOptionsWithCustom.at(-1)?.custom, true, '已保存的自定义值应重新出现在选项中');
assert.match(reasoningOptionsWithCustom.at(-1)?.label || '', /自定义.*未验证/, '自定义值必须标记为未验证');
assert.match(source, /bindReasoningEffortCombobox\s*\(/, '推理强度应绑定专用可编辑 combobox');
assert.match(source, /setAttribute\('role', 'combobox'\)/, '推理强度输入框应声明 combobox 语义');
assert.match(source, /新增：/, '推理强度下拉应提供自定义值新增入口');
assert.match(source, /\.pp-reasoning-effort-combobox\s*\{/, '推理强度可编辑下拉应具有独立布局样式');
assert.doesNotMatch(source, /API 值：\$\{option\.value\}/, '推理强度选项应直接显示英文值，不添加“API 值”前缀');
assert.match(source, /async onSave\(\)[\s\S]*?showStatus\('保存中…', 'info'\)/, '保存动作应立即显示进行中反馈');
assert.match(source, /async onSave\(\)[\s\S]*?store\.upsertMany\(toSave\)/, '保存动作应把多预设编辑合并为一次持久化');
assert.doesNotMatch(
    source.match(/async onSave\(\) \{[\s\S]*?\n    async onNewForStoreType/)?.[0] || '',
    /for \(const item of toSave\)[\s\S]*?store\.upsert\(/,
    '保存动作不得逐项触发整库持久化',
);

console.log('ok - preset panel pages are stacked and compact on small viewports');

{
  // 适用范围门控（仅创意写作预设不参与聊天注入预览）的源码契约
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/scripts/ui/preset-panel.js', import.meta.url), 'utf8');
  assert.match(source, /getInjectScopeEligibility\(\)\s*\{/);
  assert.match(source, /is-scope-locked/);
  assert.match(source, /getInjectEffectiveDisplayState\(\)/);
  assert.match(source, /if \(!this\.getInjectScopeEligibility\(\)\.chatCapable\) return;/, 'chip 点击必须有作用域守卫');
  assert.match(source, /改为「聊天模式」或「全部」后即可预览聊天注入/, '点击提示必须可行动且无术语');
  const effectiveUses = (source.match(/getInjectEffectiveDisplayState\(\)/g) || []).length;
  assert.ok(effectiveUses >= 4, `chip/卡/预览模式/预览骨架均须消费门控后的展示态（实际 ${effectiveUses} 处）`);
  assert.match(source, /scopeSelect\.addEventListener\('change'/, '适用范围切换须实时联动');
  // 位置卡必须自带内边距（pp-block 本体无 padding）
  assert.match(source, /margin-top:12px; padding:12px 14px;/, '文本协议聊天格式位置卡须有内边距');
  console.log('ok - inject chip scope gating and placement card padding contracts hold');
}

{
  // 三级页全局「保存」必须一并提交打开中的注入编辑器（否则报保存成功但改动静默丢弃）
  const { readFileSync } = await import('node:fs');
  const source = readFileSync(new URL('../../src/scripts/ui/preset-panel.js', import.meta.url), 'utf8');
  assert.match(source, /this\.injectEditorCommit = onSave;/, '注入编辑器须注册提交函数');
  assert.match(
    source,
    /if \(typeof this\.injectEditorCommit === 'function' && this\.injectEditorDirty\) \{\s*await this\.injectEditorCommit\(\);/,
    '全局保存须按 dirty 状态提交注入编辑器',
  );
  assert.equal((source.match(/this\.injectEditorCommit = null;/g) || []).length >= 2, true, '普通区块编辑与注入编辑切换须清理提交函数');
  // 方案 A：注入编辑器无内部保存按钮，全局「保存」是唯一入口
  assert.doesNotMatch(source, /mkSaveBtn/, '注入编辑器不得再有内部保存按钮');
  assert.match(source, /const injectCount = this\.injectEditorDirty \? 1 : 0;/, '注入编辑器 dirty 须参与未保存计数');
  assert.match(source, /host\.oninput = markInjectDirty;/, '输入变化须置 dirty');
  assert.match(source, /系统注入 · 随右下角保存生效/, '副标题须说明单一保存入口');
  console.log('ok - panel-level save is the single entry that commits the system-inject editor');
}
