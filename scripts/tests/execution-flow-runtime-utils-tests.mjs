import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

import {
  EXEC_FLOW_STATUS_META,
  projectMaidRunToTraceView,
  resolveExecutionFlowActiveKind,
  resolveExecFlowPlacement,
} from '../../src/scripts/ui/chat/execution-flow-runtime-utils.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

{
  const view = projectMaidRunToTraceView({
    id: 'run_1',
    kind: 'maid_assistant',
    status: 'running',
    title: '整理房间',
    metadata: { goal: '把猫从键盘上请走' },
    steps: [
      { id: 's1', status: 'succeeded', summary: '查找会话', input: { toolName: 'app.session.search' } },
      { id: 's2', status: 'running', summary: '', input: { toolName: 'ui.click_element' } },
    ],
  });
  assert.equal(view.title, '把猫从键盘上请走', '标题优先取 metadata.goal');
  assert.equal(view.steps.length, 2);
  assert.equal(view.steps[0].seq, 1);
  assert.equal(view.steps[1].title, 'ui.click_element', 'summary 为空回退工具名');
  assert.equal(view.stepDone, 1);
  assert.equal(view.stepTotal, 2);
  assert.equal(view.terminal, false);
  assert.equal(view.tone, 'accent');
  console.log('ok - 女仆 run 投影（进行中）');
}

{
  const view = projectMaidRunToTraceView({
    id: 'run_2',
    status: 'failed',
    summary: '女仆执行失败。',
    metadata: { goal: 'x', failureCode: 'timeout' },
    steps: [{ id: 's1', status: 'failed', summary: '发送邮件', errorMessage: '超时' }],
  });
  assert.equal(view.terminal, true);
  assert.equal(view.tone, 'danger');
  assert.equal(view.doneSummary, '女仆执行失败。');
  assert.equal(view.failureCode, 'timeout');
  assert.equal(view.steps[0].error, '超时');
  assert.equal(projectMaidRunToTraceView(null), null);
  console.log('ok - 女仆 run 投影（失败终态与空值）');
}

{
  assert.deepEqual(
    Object.keys(EXEC_FLOW_STATUS_META).sort(),
    ['cancelled', 'failed', 'queued', 'running', 'skipped', 'succeeded', 'waiting_permission'].sort(),
    '状态语义覆盖 agent 七态',
  );
  console.log('ok - 状态语义表');
}

{
  // 球在上半屏 → 面板放下方；下方被指令条气泡占用 → 翻到上方；越界被 clamp
  const base = {
    ballRect: { left: 200, top: 100, width: 26, height: 26 },
    viewport: { w: 400, h: 800 },
    panelSize: { width: 332, height: 240 },
  };
  let placed = resolveExecFlowPlacement(base);
  assert.equal(placed.side, 'bottom');
  assert.ok(placed.top > 100, '面板在球下方');
  assert.ok(placed.left >= 12 && placed.left + placed.width <= 400 - 12, '水平 clamp 在视口内');

  placed = resolveExecFlowPlacement({ ...base, occupiedSide: 'bottom' });
  assert.equal(placed.side, 'top', '指令条占用下方时翻到上方');

  placed = resolveExecFlowPlacement({
    ...base,
    ballRect: { left: 380, top: 780, width: 26, height: 26 },
  });
  assert.ok(placed.top + base.panelSize.height <= 800 - 12 + 1, '底部越界被 clamp');
  console.log('ok - 面板贴球定位与避让');
}

{
  const maid = { visible: true, terminal: false, runId: 'maid-1', startedAt: 100, updatedAt: 999 };
  const creative = { visible: true, terminal: false, runId: 'creative-1', startedAt: 200, updatedAt: 220 };
  assert.equal(
    resolveExecutionFlowActiveKind({ maid, creative, preferredKind: 'maid', preferLatestActive: true }),
    'creative',
    '双活跃且新 run 到达时应选择最近启动者，旧 run 的较新更新时间不得抢位',
  );
  assert.equal(
    resolveExecutionFlowActiveKind({ maid, creative, preferredKind: 'maid' }),
    'maid',
    '手动选择在没有新 run 时应保持',
  );
  assert.equal(
    resolveExecutionFlowActiveKind({ maid: { ...maid, terminal: true }, creative, preferredKind: 'maid' }),
    'creative',
    '终态投影不得压住仍活跃的投影',
  );
  assert.equal(
    resolveExecutionFlowActiveKind({
      maid: { ...maid, terminal: true },
      creative: { ...creative, terminal: true },
      preferredKind: 'maid',
    }),
    'maid',
    '两者均结束时保留用户当前选择供回看',
  );
  assert.equal(resolveExecutionFlowActiveKind({ maid: null, creative: null }), '', '无可见投影时隐藏容器');
  console.log('ok - 双投影按活跃状态、启动时间与手动选择仲裁');
}

{
  const [appSource, flowSource, cssSource] = await Promise.all([
    readFile(path.join(projectRoot, 'src/scripts/ui/app.js'), 'utf8'),
    readFile(path.join(projectRoot, 'src/scripts/ui/chat/execution-flow-runtime-utils.js'), 'utf8'),
    readFile(path.join(projectRoot, 'src/assets/css/qq-legacy.css'), 'utf8'),
  ]);
  assert.match(appSource, /createCreativeExecutionLaneRuntime\(\{[\s\S]*inputContainer:\s*null,[\s\S]*onStateChange:\s*snapshot\s*=>\s*executionFlowRuntime\?\.adoptCreativeState/,
    '创意泳道不得再挂到输入框，应把状态投影给共享容器');
  assert.match(appSource, /executionFlowRuntime\.attachCreativeLane\?\.\(creativeExecutionLaneRuntime\)/,
    '共享执行流容器应接管创意泳道 DOM 宿主');
  assert.match(flowSource, /class="exec-flow-creative-host"/,
    '共享容器应提供创意泳道插槽');
  assert.match(flowSource, /data-ef-switch="\$\{kind\}"/,
    '双投影同时可见时应提供 chip 切换入口');
  assert.match(flowSource, /startDrag\(event,\s*\{\s*suppressLongPress:\s*true,\s*suppressClick:\s*true\s*\}\)/,
    '执行流标题转发拖拽时应消费静止单击，避免误触模式切换');
  assert.doesNotMatch(cssSource, /\.creative-execution-root\s*\{[\s\S]*?bottom:\s*calc\(100% \+ 6px\)/,
    '创意泳道不得继续定位在输入框上方');
  assert.match(cssSource, /\.creative-execution-chip\s*\{[\s\S]*?border-radius:\s*999px;/,
    '创意泳道缩略态应与女仆投影使用同型 chip');
  assert.match(cssSource, /\.cel-row-flow[\s\S]*repeating-linear-gradient[\s\S]*@keyframes cel-flow-dash/,
    '展开泳道应有状态渐变与流动虚线');
  assert.match(cssSource, /\.cel-card\.is-running::after[\s\S]*animation:\s*cel-card-sheen/,
    '运行中的泳道卡应有低强度横向扫光');
  assert.match(cssSource, /\.cel-row\[data-cel-flow-status='running'\]:not\(:last-child\) \.cel-row-flow::after[\s\S]*animation:\s*cel-flow-particle/,
    '运行中的连接线应有沿线移动的微光点');
  assert.match(cssSource, /@keyframes cel-card-sheen/);
  assert.match(cssSource, /@keyframes cel-flow-particle/);
  console.log('ok - Phase 2 接线、旧定位移除与新视觉契约');
}

// —— onMaidTrace 消费语义：指令条承载女仆流时面板不自开；未消费则面板兜底 ——
{
  const { createExecutionFlowRuntime } = await import('../../src/scripts/ui/chat/execution-flow-runtime-utils.js');
  const fakeRun = {
    id: 'run_x',
    kind: 'maid_assistant',
    status: 'running',
    metadata: { goal: '测试' },
    steps: [{ id: 's1', status: 'running', summary: '步骤', input: { toolName: 't' } }],
  };
  const makeRt = (onMaidTrace) => {
    const listeners = [];
    const rt = createExecutionFlowRuntime({
      documentRef: null,
      agentTaskRuntime: {
        onEvent: (fn) => {
          listeners.push(fn);
          return () => {};
        },
        getRun: () => fakeRun,
      },
      onMaidTrace,
    });
    rt.bind();
    return { rt, emit: event => listeners[0]?.(event) };
  };

  const traces = [];
  const consumed = makeRt((view) => {
    traces.push(view);
    return true;
  });
  consumed.emit({ runId: 'run_x' });
  assert.equal(traces.length, 1, '视图送达指令条');
  assert.equal(traces[0].steps[0].glyph, '行', '投影含铭牌字段');
  assert.equal(consumed.rt.getState().visible, false, '已消费 → 面板不自开');

  const fallback = makeRt(() => false);
  fallback.emit({ runId: 'run_x' });
  assert.equal(fallback.rt.getState().visible, true, '未消费 → 面板兜底自开');
  assert.equal(fallback.rt.getState().expanded, true);
  console.log('ok - onMaidTrace 消费语义（指令条优先、面板兜底）');
}

console.log('execution-flow-runtime-utils tests passed');
