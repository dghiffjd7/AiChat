// 烟测：执行流面板 Phase 1（女仆实时投影）。用真实 agentTaskRuntime 驱动假 run，跑完摘除。
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const rt = stores.agentTaskRuntime;
  const flow = stores.executionFlowRuntime;
  const runStore = stores.agentRunStore;
  if (!rt || !flow) return { error: 'runtime not exposed', hasRt: Boolean(rt), hasFlow: Boolean(flow) };
  const out = {};

  const run = rt.startRun({
    kind: 'maid_assistant',
    source: 'smoke-probe',
    title: '【烟测】执行流面板',
    summary: '【烟测】执行流面板',
    metadata: { goal: '【烟测】验证执行流面板实时投影' },
  });
  await sleep(400);
  const root = document.querySelector('.exec-flow-root');
  out.visibleOnStart = Boolean(root?.classList.contains('is-visible'));
  out.expandedOnStart = Boolean(root?.classList.contains('is-expanded'));
  out.headerTitle = root?.querySelector('[data-ef-title]')?.textContent || '';

  const step1 = rt.startStep(run.id, { type: 'tool', summary: '查找会话', input: { toolName: 'app.session.search' } });
  await sleep(300);
  out.cardsAfterStep1 = root?.querySelectorAll('.exec-step').length ?? -1; // plan + step1
  rt.finishStep(run.id, step1.id, { status: 'succeeded', summary: '查找会话' });
  const step2 = rt.startStep(run.id, { type: 'tool', summary: '点击目标', input: { toolName: 'ui.click_element' } });
  await sleep(300);
  out.cardsAfterStep2 = root?.querySelectorAll('.exec-step').length ?? -1;
  out.runningToneCards = root?.querySelectorAll('.exec-step[data-tone="accent"]').length ?? -1;

  // 拖球 → 面板跟随
  const before = root?.getBoundingClientRect();
  const ball = document.getElementById('mode-switch') || document.querySelector('.mode-switch');
  const btn = ball?.querySelector('button') || ball;
  const br = ball.getBoundingClientRect();
  const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 11, pointerType: 'mouse', button: 0, buttons: 1, clientX: x, clientY: y,
  }));
  fire(btn, 'pointerdown', br.left + 13, br.top + 13);
  for (let i = 1; i <= 5; i += 1) { fire(btn, 'pointermove', br.left + 13, br.top + 13 - i * 14); await sleep(16); }
  fire(btn, 'pointerup', br.left + 13, br.top + 13 - 70);
  await sleep(300);
  const after = root?.getBoundingClientRect();
  out.panelFollowedBall = Math.abs((after?.top ?? 0) - (before?.top ?? 0)) > 20;

  // 收起为 chip → 再展开
  root?.querySelector('.exec-flow-panel [data-ef-toggle]')?.click();
  await sleep(150);
  out.collapsedToChip = !root?.classList.contains('is-expanded') && Boolean(root?.classList.contains('is-visible'));
  out.chipText = root?.querySelector('[data-ef-chip-title]')?.textContent || '';
  out.chipProgress = root?.querySelector('[data-ef-chip-progress]')?.textContent || '';
  root?.querySelector('.exec-flow-chip')?.click();
  await sleep(150);
  out.reExpanded = Boolean(root?.classList.contains('is-expanded'));

  // 终态
  rt.finishStep(run.id, step2.id, { status: 'failed', errorMessage: '目标不可见' });
  rt.finishRun(run.id, { status: 'failed', summary: '女仆执行失败。', errorMessage: '目标不可见', metadata: { goal: '【烟测】验证执行流面板实时投影', failureCode: 'tool_error' } });
  await sleep(400);
  out.doneCardTone = root?.querySelectorAll('.exec-step[data-tone="danger"]').length ?? -1;
  out.statusText = root?.querySelector('[data-ef-status]')?.textContent || '';

  // 关闭 + 摘除烟测 run
  root?.querySelector('[data-ef-close]')?.click();
  await sleep(150);
  out.closed = !root?.classList.contains('is-visible');
  let removed = false;
  try {
    if (runStore?.state && Array.isArray(runStore.state.runs)) {
      const beforeLen = runStore.state.runs.length;
      runStore.state.runs = runStore.state.runs.filter(item => item.id !== run.id);
      removed = runStore.state.runs.length < beforeLen;
      runStore.flush?.();
    }
  } catch {}
  out.smokeRunRemoved = removed;
  out.runId = run.id;
  return out;
})()
