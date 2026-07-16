import assert from 'node:assert/strict';

import {
  applyInjectChipTap,
  buildInjectCardDefs,
  buildPresetInjectChipStates,
  buildPreviewInjectFlags,
  describeInjectFeatureBlocker,
  describeInjectPlacement,
  describeMemoryChipBlocker,
  describeMemoryPlacement,
  isInjectFeatureEnabled,
  isMemoryChatInjectActive,
  PRESET_INJECT_ITEMS,
  readInjectItemConfig,
  resolveInjectCardAnchor,
} from '../../src/scripts/ui/preset-prompt-inject-utils.js';

const CHAT_SETTINGS = { memoryEnabled: true, memoryStorageMode: 'table', memoryTableEnabledChat: true, autoImagePromptEnabled: true };
const FULL_SYSP = { dialogue_enabled: true, group_enabled: true, moment_create_enabled: true, auto_image_prompt_enabled: true };

{
  const ids = PRESET_INJECT_ITEMS.map(i => i.id);
  assert.deepEqual(ids, ['memory', 'dialogue', 'group', 'image', 'moment'], 'chip 顺序固定（聊天记录不设 chip，预览固定占位）');
  console.log('ok - chip 定义顺序');
}

/* chip 只管展示态：on 由 added/previewScenario 决定，与功能开关无关 */
{
  const states = buildPresetInjectChipStates({
    sysp: FULL_SYSP,
    settingsState: CHAT_SETTINGS,
    added: ['memory'],
    previewScenario: 'private',
  });
  const byId = Object.fromEntries(states.map(s => [s.id, s]));
  assert.equal(byId.memory.on, true);
  assert.equal(byId.dialogue.on, true, '预览场景=私聊 → 私聊 chip 亮');
  assert.equal(byId.group.on, false);
  assert.equal(byId.image.on, false, '功能开着但未加入 → 不亮');
  assert.equal(byId.moment.on, false);
  assert.equal(byId.memory.warnText, '', '功能启用时无警示');
  console.log('ok - chip 展示态与功能开关解耦');
}

/* 加入项功能未启用 → 警示；未加入不警示 */
{
  const settingsOff = { ...CHAT_SETTINGS, autoImagePromptEnabled: false, memoryTableEnabledChat: false };
  const syspOff = { dialogue_enabled: false, group_enabled: true, moment_create_enabled: false, auto_image_prompt_enabled: true };
  const states = buildPresetInjectChipStates({
    sysp: syspOff,
    settingsState: settingsOff,
    added: ['memory', 'image'],
    previewScenario: 'private',
  });
  const byId = Object.fromEntries(states.map(s => [s.id, s]));
  assert.ok(byId.memory.warnText.length > 0, '记忆聊天位关闭 → 警示');
  assert.ok(byId.image.warnText.includes('总开关'), '生图总开关关闭 → 警示');
  assert.ok(byId.dialogue.warnText.includes('停用'), '私聊被 Agent Center 停用 → 警示');
  const momentStates = buildPresetInjectChipStates({ sysp: syspOff, settingsState: settingsOff, added: ['moment'], previewScenario: '' });
  assert.ok(momentStates.find(s => s.id === 'moment').warnText.length > 0, '动态发布未启用 → 警示');
  const notAdded = buildPresetInjectChipStates({ sysp: syspOff, settingsState: settingsOff, added: [], previewScenario: '' });
  assert.ok(notAdded.every(s => !s.warnText), '未加入的项不警示');
  console.log('ok - 功能未启用警示只挂在已加入项');
}

/* 功能启用判定与阻断文案 */
{
  assert.equal(isMemoryChatInjectActive(CHAT_SETTINGS), true);
  assert.equal(isMemoryChatInjectActive({ ...CHAT_SETTINGS, memoryTableEnabledChat: false }), false);
  assert.equal(isInjectFeatureEnabled('image', { sysp: FULL_SYSP, settingsState: CHAT_SETTINGS }), true);
  assert.equal(isInjectFeatureEnabled('image', { sysp: FULL_SYSP, settingsState: { ...CHAT_SETTINGS, autoImagePromptEnabled: false } }), false);
  assert.equal(isInjectFeatureEnabled('dialogue', { sysp: {}, settingsState: CHAT_SETTINGS }), true, '私聊无显式停用即视为启用');
  assert.equal(isInjectFeatureEnabled('dialogue', { sysp: { dialogue_enabled: false }, settingsState: CHAT_SETTINGS }), false);
  assert.ok(describeMemoryChipBlocker({ ...CHAT_SETTINGS, memoryEnabled: false }).includes('通用设定'));
  assert.equal(describeMemoryChipBlocker(CHAT_SETTINGS), '');
  assert.equal(describeInjectFeatureBlocker('moment', { sysp: FULL_SYSP, settingsState: CHAT_SETTINGS }), '');
  assert.ok(describeInjectFeatureBlocker('moment', { sysp: {}, settingsState: CHAT_SETTINGS }).length > 0);
  console.log('ok - 功能启用判定与阻断文案');
}

/* 点击语义：展示态增删、预览场景择一、warn 态弹启用界面 */
{
  const mk = ({ added = [], scenario = '', sysp = FULL_SYSP, settingsState = CHAT_SETTINGS } = {}) =>
    buildPresetInjectChipStates({ sysp, settingsState, added, previewScenario: scenario });

  let r = applyInjectChipTap({ itemId: 'memory', chipStates: mk(), previewScenario: '' });
  assert.equal(r.action, 'add');
  r = applyInjectChipTap({ itemId: 'memory', chipStates: mk({ added: ['memory'] }), previewScenario: '' });
  assert.equal(r.action, 'remove');

  // 场景择一（纯预览层）：点私聊→设场景；再点私聊→清场景；私聊场景下点群聊→切场景
  r = applyInjectChipTap({ itemId: 'dialogue', chipStates: mk(), previewScenario: '' });
  assert.deepEqual([r.action, r.nextScenario], ['set-scenario', 'private']);
  r = applyInjectChipTap({ itemId: 'dialogue', chipStates: mk({ scenario: 'private' }), previewScenario: 'private' });
  assert.deepEqual([r.action, r.nextScenario], ['remove-scenario', '']);
  r = applyInjectChipTap({ itemId: 'group', chipStates: mk({ scenario: 'private' }), previewScenario: 'private' });
  assert.deepEqual([r.action, r.nextScenario], ['set-scenario', 'group']);

  // warn 态点击本体仍是移除（关闭优先；启用界面由 ! 角标在 panel 层分流）
  r = applyInjectChipTap({
    itemId: 'image',
    chipStates: mk({ added: ['image'], settingsState: { ...CHAT_SETTINGS, autoImagePromptEnabled: false } }),
    previewScenario: '',
  });
  assert.equal(r.action, 'remove');
  r = applyInjectChipTap({
    itemId: 'dialogue',
    chipStates: mk({ scenario: 'private', sysp: { ...FULL_SYSP, dialogue_enabled: false } }),
    previewScenario: 'private',
  });
  assert.equal(r.action, 'remove-scenario');

  console.log('ok - chip 点击语义（关闭优先/场景择一）');
}

/* 动态发布焦点预览：其他项隐藏、预览只组装发布决策、卡只留一张 */
{
  const states = buildPresetInjectChipStates({
    sysp: FULL_SYSP,
    settingsState: CHAT_SETTINGS,
    added: ['memory', 'moment'],
    previewScenario: 'private',
  });
  const byId = Object.fromEntries(states.map(s => [s.id, s]));
  assert.equal(byId.moment.hidden, false);
  assert.ok(['memory', 'dialogue', 'group', 'image'].every(id => byId[id].hidden), '焦点预览时其他 chip 隐藏');

  const flags = buildPreviewInjectFlags({ added: ['memory', 'moment'], previewScenario: 'private' });
  assert.deepEqual(
    [flags.previewChatFormat, flags.previewInjectMemory, flags.previewInjectImage, flags.previewInjectMomentCreate],
    [false, false, false, true],
    '焦点预览只组装发布决策',
  );

  const defs = buildInjectCardDefs({
    sysp: FULL_SYSP,
    settingsState: CHAT_SETTINGS,
    added: ['memory', 'moment'],
    previewScenario: 'private',
  });
  assert.deepEqual(defs.map(d => d.cardId), ['moment'], '焦点预览只留动态发布卡');

  // 退出焦点预览后恢复原展示态
  const backDefs = buildInjectCardDefs({
    sysp: FULL_SYSP,
    settingsState: CHAT_SETTINGS,
    added: ['memory'],
    previewScenario: 'private',
  });
  assert.ok(backDefs.map(d => d.cardId).includes('memory_data'), '退出后其他项恢复');
  console.log('ok - 动态发布焦点预览');
}

/* 展示态 → 预览组装标志 */
{
  let f = buildPreviewInjectFlags({ added: [], previewScenario: '' });
  assert.deepEqual([f.previewUiMode, f.previewScenario, f.previewChatFormat], ['rp', '', false], '全空 → 创意组装');
  f = buildPreviewInjectFlags({ added: [], previewScenario: 'group' });
  assert.deepEqual([f.previewUiMode, f.previewScenario, f.previewChatFormat], ['chat', 'group', true]);
  f = buildPreviewInjectFlags({ added: ['memory'], previewScenario: '' });
  assert.deepEqual(
    [f.previewUiMode, f.previewScenario, f.previewChatFormat, f.previewInjectMemory, f.previewInjectImage],
    ['chat', 'private', false, true, false],
    '仅加记忆 → 按私聊场景组装但不带聊天格式、不带图片',
  );
  console.log('ok - 预览组装标志');
}

{
  assert.equal(describeInjectPlacement({ position: 0, depth: 0, role: 0 }), 'main 之后');
  assert.equal(describeInjectPlacement({ position: 1, depth: 3, role: 1 }), '聊天内 · 深度 3 · user');
  assert.equal(resolveInjectCardAnchor(2), 'before_main');
  assert.equal(describeMemoryPlacement('history_depth', 2), '历史深度 2');
  console.log('ok - 锚点/位置描述');
}

/* 注入卡定义：来自展示态；场景卡跟随预览场景；功能未启用标记 featureOff */
{
  const sysp = {
    ...FULL_SYSP,
    dialogue_position: 0, dialogue_depth: 1, dialogue_role: 0,
    moment_create_position: 2,
    auto_image_prompt_position: 4,
  };
  const defs = buildInjectCardDefs({
    sysp,
    settingsState: { ...CHAT_SETTINGS, autoImagePromptEnabled: false },
    added: ['memory', 'image'],
    previewScenario: 'private',
    memoryPlacement: { guidePosition: '', guideDepth: 0, dataPosition: 'before_latest_user', dataDepth: 0 },
  });
  const ids = defs.map(d => d.cardId);
  assert.deepEqual(ids.sort(), ['dialogue', 'image', 'memory_data', 'memory_guide'].sort());
  assert.equal(defs.find(d => d.cardId === 'image').featureOff, true, '生图总开关关 → 卡标记未启用');
  assert.equal(defs.find(d => d.cardId === 'dialogue').featureOff, false);

  const groupDefs = buildInjectCardDefs({ sysp, settingsState: CHAT_SETTINGS, added: [], previewScenario: 'group' });
  assert.deepEqual(groupDefs.map(d => d.cardId), ['group'], '群聊场景只出群聊卡');
  assert.equal(buildInjectCardDefs({ sysp, settingsState: CHAT_SETTINGS, added: [], previewScenario: '' }).length, 0, '默认全空无注入卡');
  console.log('ok - 注入卡定义（展示态驱动 + featureOff）');
}

{
  const cfg = readInjectItemConfig({ group_enabled: true, group_rules: 'G', group_position: 1, group_depth: 4, group_role: 2 }, 'group');
  assert.deepEqual(cfg, { enabled: true, rules: 'G', position: 1, depth: 4, role: 2 });
  assert.equal(readInjectItemConfig({}, 'image').position, 4, '生图默认位置取映射 defaults');
  assert.equal(readInjectItemConfig({}, 'memory'), null, '非 sysprompt 项返回 null');
  console.log('ok - 注入项配置读取');
}

console.log('preset-prompt-inject-utils tests passed');
