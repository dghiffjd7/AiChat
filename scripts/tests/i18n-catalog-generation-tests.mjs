import assert from 'node:assert/strict';
import fs from 'node:fs/promises';

const readJson = async path => JSON.parse(await fs.readFile(path, 'utf8'));
const sourceEntries = await readJson('scripts/i18n/ui-source-catalog.json');
const english = await readJson('src/scripts/i18n/locales/en.json');
const traditional = await readJson('src/scripts/i18n/locales/zh-TW.json');
const pseudo = await readJson('src/scripts/i18n/locales/pseudo.json');

const sources = new Set(sourceEntries.map(entry => entry.source));
assert.ok(sources.has('提示词 {count}'), 'manual dynamic UI source keys must be extracted');
assert.ok(sources.has('检查私聊、群聊、动态等输出格式。'), 'Agent Center UI definitions must be extracted');
const auditedSurfaceTranslations = {
  '私聊格式提示词': 'Private Chat Format Prompt',
  '该提示词按位置/深度锚定注入，不参与区块拖拽排序；与 Agent Center 内对应编辑器为同一份数据。': 'This prompt is anchored by position and depth. It is not reordered with prompt blocks and shares the same data with the corresponding Agent Center editor.',
  '配置 · 修改后即时生效': 'Settings · Changes take effect immediately',
  '完整请求预览': 'Full Request Preview',
  '模型覆盖': 'Model Override',
  '上下文血缘图谱': 'Context Lineage Graph',
  '点击任意节点，追踪它的': 'Select any node to trace its',
  '用逗号或换行分隔': 'Separate with commas or line breaks',
  '逗号分隔多个组': 'Separate multiple groups with commas',
  '当前分页设置': 'Current Page Settings',
  '条目级变量门控': 'Entry-level Variable Gate',
  '条件链': 'Condition Chain',
  '会话配置管理': 'Session Configuration',
  '为各会话设定预设、连线配置与推理覆盖': 'Set presets, connection profiles, and reasoning overrides for each session',
  '这个人还没有留下个性签名。': 'This contact has not added a bio yet.',
  '相识天数': 'Days Known',
  '累计对话': 'Conversations',
  '人格设定': 'Profile Details',
  '问女仆...': 'Ask the maid...',
  '例如：外表冷淡、说话简短，但会在关键时刻保护同伴。': 'For example: Aloof and terse, but protective when it matters.',
  '评论': 'Comment',
  '浏览{count}次': '{count} views',
  '评论{count}条': '{count} comments',
  '发布动态': 'Create Post',
  'AI 生成贴图': 'AI Sticker Generator',
  '动图模式': 'Sprite Mode',
  '描述你想生成的图片，例如角色、场景、风格、构图、光线': 'Describe the image you want, including the character, scene, style, composition, and lighting',
  '相册': 'Gallery',
  '群聊格式提示词': 'Group Chat Format Prompt',
  '全局世界书（所有会话共享）': 'Global lorebooks (shared across all sessions)',
  '全局当前：{value}': 'Global Active: {value}',
  '条目门控': 'Entry Gate',
  '{count} 路输入': '{count} inputs',
  '当前值：{value}': 'Current value: {value}',
  '左侧变量未设置，当前按待完善处理。': 'The left-side variable is not set, so this condition is treated as incomplete.',
  '左侧：{status}': 'Left: {status}',
  '右侧：{status}': 'Right: {status}',
  '当前 {count} 条子条件都尚未产出可判断结果。': 'None of the {count} child conditions has produced an evaluable result yet.',
  'AND 需要全部命中，未命中输入：{ports}（另有 {count} 路待判断）。': 'AND requires every input to match. Unmatched inputs: {ports}; {count} more remain pending.',
  '待完善项（{count}）': 'Incomplete Items ({count})',
  '类型：{value}': 'Type: {value}',
  '变量 {name}': 'Variable {name}',
  '暂无本次注入审计记录': 'No injection audit is available for this request',
  '所有消息按实际发送顺序展开；行号仅用于浏览，不会进入请求。': 'Messages are shown in the order sent. Line numbers are for navigation only and are not included in the request.',
  '自动换行': 'Word Wrap',
  '本轮没有改变行为的结构化请求参数': 'No structured request parameters changed behavior for this request',
  '传输层 · 展开查看实际发送内容': 'Transport Layer · Expand to view the content actually sent',
  '暂无 Prompt 内容': 'No Prompt content',
  '群聊格式提示词已被停用，实际发送不会注入': 'The group-chat format prompt is disabled and will not be injected into the actual request',
  '当前没有匹配输入，因此按“有内容即参与”处理': 'No matching input is currently available, so this participates whenever it has content',
};
for (const [source, translated] of Object.entries(auditedSurfaceTranslations)) {
  assert.ok(sources.has(source), `audited UI source key must be extracted: ${source}`);
  assert.equal(english[source], translated, `English translation must cover audited UI source: ${source}`);
}
assert.equal(Object.keys(traditional).length, sources.size);
assert.equal(Object.keys(pseudo).length, sources.size);
assert.equal(traditional['⚙ 设置'], '⚙ 設定', '人工台湾术语必须在较长 UI 文案内覆盖 OpenCC 结果');
assert.equal(traditional['脚本选项'], '腳本選項');
assert.deepEqual(
  Object.keys(traditional),
  Object.keys(traditional).slice().sort((left, right) => left.localeCompare(right, 'zh-Hans-CN')),
  '生成目录键顺序必须稳定',
);

const sourceWithToken = sourceEntries.find(entry => /\{[a-zA-Z0-9_.-]+\}/.test(entry.source));
if (sourceWithToken) {
  const tokens = value => Array.from(value.matchAll(/\{[a-zA-Z0-9_.-]+\}/g), match => match[0]);
  assert.deepEqual(tokens(traditional[sourceWithToken.source]), tokens(sourceWithToken.source));
  assert.deepEqual(tokens(pseudo[sourceWithToken.source]), tokens(sourceWithToken.source));
}

for (const [source, value] of Object.entries(pseudo).slice(0, 100)) {
  assert.match(value, /^［.*］$/s, `伪本地化值缺少边界标记: ${source}`);
}

console.log('i18n-catalog-generation-tests passed');
