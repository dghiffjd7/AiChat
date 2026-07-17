// 烟测：指令条打开时拖拽悬浮球（含运行中 textarea 禁用场景）；跑完复位
(async () => {
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const actions = window.appBridge?.debugUiRegistry?.actions || {};
  const out = {};
  const ball = document.getElementById('mode-switch') || document.querySelector('.mode-switch');
  if (!ball) return { error: 'no mode switch ball' };
  const ballRect0 = ball.getBoundingClientRect();
  out.ballBefore = { left: Math.round(ballRect0.left), top: Math.round(ballRect0.top) };

  await actions.openMaidCommandInput?.();
  await sleep(400);
  const pill = document.querySelector('.maid-command-input');
  if (!pill || !pill.classList.contains('is-open')) return { error: 'pill not open', out };
  const handle = pill.querySelector('.maid-command-input-drag');
  out.handlePresent = Boolean(handle);
  const pillRect0 = pill.getBoundingClientRect();
  out.pillBefore = { left: Math.round(pillRect0.left), top: Math.round(pillRect0.top) };

  const btn = ball.querySelector('button') || ball;
  const fire = (el, type, x, y) => el.dispatchEvent(new PointerEvent(type, {
    bubbles: true, cancelable: true, pointerId: 9, pointerType: 'mouse', button: 0, buttons: 1,
    clientX: x, clientY: y,
  }));
  const hr = handle.getBoundingClientRect();
  const sx = hr.left + hr.width / 2;
  const sy = hr.top + hr.height / 2;
  // 模拟运行中：textarea 禁用
  const ta = pill.querySelector('textarea');
  const taWasDisabled = ta?.disabled === true;
  if (ta) ta.disabled = true;

  fire(handle, 'pointerdown', sx, sy);
  await sleep(50);
  out.dragStateAfterDown = Boolean(ball.classList.contains('is-dragging'));
  for (let i = 1; i <= 6; i += 1) {
    fire(btn, 'pointermove', sx + i * 12, sy + i * 8);
    await sleep(16);
  }
  fire(btn, 'pointerup', sx + 72, sy + 48);
  await sleep(300);

  const ballRect1 = ball.getBoundingClientRect();
  const pillRect1 = pill.getBoundingClientRect();
  out.ballAfter = { left: Math.round(ballRect1.left), top: Math.round(ballRect1.top) };
  out.pillAfter = { left: Math.round(pillRect1.left), top: Math.round(pillRect1.top) };
  out.ballMoved = Math.abs(ballRect1.left - ballRect0.left) > 30;
  out.pillFollowed = Math.abs(pillRect1.left - pillRect0.left) > 30;

  // 禁用态 textarea 上按下也可拖（运行中整条可拖）
  const tr = ta.getBoundingClientRect();
  fire(ta, 'pointerdown', tr.left + 20, tr.top + 8);
  await sleep(50);
  out.dragFromDisabledTextarea = Boolean(ball.classList.contains('is-dragging'));
  fire(btn, 'pointerup', tr.left + 20, tr.top + 8);
  await sleep(100);

  if (ta && !taWasDisabled) ta.disabled = false;
  return out;
})()
