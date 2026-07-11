import assert from 'node:assert/strict';

import {
  buildMaidSelectionPromptBlock,
  normalizeMaidSelectionItem,
  resolveMaidAnchoredViewportRect,
  resolveMaidUnanchoredViewportRect,
} from '../../src/scripts/ui/maid-selection-utils.js';
import { buildMaidModelPlannerMessages } from '../../src/scripts/agent/maid-model-planner.js';

{
  const item = normalizeMaidSelectionItem({
    type: 'text',
    text: '  她把最后一杯酒擦干净。  ',
    semanticSummary: '选中文字（位于 聊天消息）',
    messageId: 'msg-1',
    sessionId: '蒂法',
    regionId: 'region-text-1',
    viewportRect: { left: 12.5, top: 20, width: 180, height: 42 },
  });
  assert.equal(item.type, 'text');
  assert.equal(item.text, '她把最后一杯酒擦干净。');
  assert.equal(item.messageId, 'msg-1');
  assert.equal(item.regionId, 'region-text-1');
  assert.deepEqual(item.viewportRect, { left: 12.5, top: 20, width: 180, height: 42 });
  assert.equal(normalizeMaidSelectionItem({}), null, '空项应拒绝');
  const longText = normalizeMaidSelectionItem({ text: 'x'.repeat(5000) });
  assert.ok(longText.text.length <= 1201, '超长文本截断');
  console.log('ok - 选区项归一化与截断');
}

{
  const rect = { left: 20, top: 30, width: 160, height: 80 };
  assert.deepEqual(resolveMaidAnchoredViewportRect(
    rect,
    { left: 100, top: 200, width: 300, height: 120 },
    { dx: 5, dy: 8 },
  ), { left: 105, top: 208, width: 160, height: 80 });
  assert.equal(resolveMaidAnchoredViewportRect(
    rect,
    { left: 0, top: 0, width: 0, height: 0 },
    { dx: 5, dy: 8 },
  ), null, '仍 connected 但已隐藏的锚点应判 stale');
  assert.deepEqual(resolveMaidUnanchoredViewportRect(rect, 4, 4), rect);
  assert.equal(
    resolveMaidUnanchoredViewportRect(rect, 4, 5),
    null,
    '没有稳定 DOM 锚点的选区在滚动或 resize 后应判 stale',
  );
  console.log('ok - 选区锚点跟随并拒绝隐藏元素');
}

{
  const block = buildMaidSelectionPromptBlock([
    {
      type: 'text',
      text: '这段正文',
      semanticSummary: '选中文字（位于 聊天消息）',
      messageId: 'm1',
      sessionId: '蒂法',
      regionId: 'region-1',
      viewportRect: { left: 20, top: 30, width: 200, height: 50 },
    },
    { type: 'element', semanticSummary: 'Agent Center 卡片', text: '格式检查 已开启' },
  ]);
  assert.match(block, /<user_selection>/);
  assert.match(block, /1\. \[选中文字\]/);
  assert.match(block, /2\. \[界面元素\] Agent Center 卡片/);
  assert.match(block, /消息ID: m1/);
  assert.match(block, /区域ID: region-1/);
  assert.match(block, /ui\.capture_region/);
  assert.match(block, /内容: 这段正文/);
  assert.equal(buildMaidSelectionPromptBlock([]), '', '空选区返回空串');
  assert.equal(buildMaidSelectionPromptBlock(null), '', 'null 安全');
  console.log('ok - 注入块组装');
}

{
  const messages = buildMaidModelPlannerMessages({
    input: '帮我优化这段',
    context: {
      sessionId: '蒂法',
      userSelection: [
        { type: 'text', text: '夜色渐深', semanticSummary: '选中文字', messageId: 'm9' },
      ],
    },
  });
  const userContent = typeof messages[1].content === 'string'
    ? messages[1].content
    : messages[1].content.map(part => part?.text || '').join('\n');
  assert.match(userContent, /<user_selection>/, 'planner user 消息应包含选区块');
  assert.match(userContent, /夜色渐深/);

  const noSelection = buildMaidModelPlannerMessages({ input: '你好', context: { sessionId: 'x' } });
  const plainContent = typeof noSelection[1].content === 'string'
    ? noSelection[1].content
    : noSelection[1].content.map(part => part?.text || '').join('\n');
  assert.doesNotMatch(plainContent, /<user_selection>/, '无选区不应有块');
  console.log('ok - planner 消息注入选区块');
}

{
  const { filterRectCoveredElements } = await import('../../src/scripts/ui/maid-selection-utils.js');
  const makeEl = (rect, children = []) => {
    const el = {
      getBoundingClientRect: () => ({ ...rect, right: rect.left + rect.width, bottom: rect.top + rect.height }),
      contains: other => children.includes(other),
    };
    return el;
  };
  const child = makeEl({ left: 10, top: 10, width: 80, height: 20 });
  const parent = makeEl({ left: 0, top: 0, width: 100, height: 40 }, [child]);
  const outside = makeEl({ left: 500, top: 500, width: 50, height: 50 });
  const half = makeEl({ left: 80, top: 0, width: 100, height: 40 });
  const rect = { left: 0, top: 0, width: 120, height: 50 };
  const covered = filterRectCoveredElements([parent, child, outside, half], rect);
  assert.ok(covered.includes(parent), '父容器应命中');
  assert.ok(!covered.includes(child), '父子同命中时子应去重');
  assert.ok(!covered.includes(outside), '矩形外不命中');
  assert.ok(!covered.includes(half), '覆盖不足 60% 不命中');
  console.log('ok - 矩形覆盖判定与祖先去重');
}

console.log('maid-selection-utils-tests passed');
