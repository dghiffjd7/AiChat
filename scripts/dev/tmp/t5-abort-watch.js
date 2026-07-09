// T5: 监视回复生成，出现「停止生成」按钮 2 秒后模拟用户点击中止（只点一次）
(() => {
  if (window.__abortWatch) clearInterval(window.__abortWatch);
  window.__abortWatchLog = [];
  let armedAt = 0, clicked = false;
  window.__abortWatch = setInterval(() => {
    if (clicked) return;
    const btn = [...document.querySelectorAll('button.is-generating')].find(b => {
      const r = b.getBoundingClientRect();
      return r.width > 0 && getComputedStyle(b).display !== 'none';
    });
    if (!btn) { armedAt = 0; return; }
    if (!armedAt) { armedAt = Date.now(); window.__abortWatchLog.push(['armed', Date.now()]); return; }
    if (Date.now() - armedAt >= 2000) {
      btn.click(); clicked = true;
      window.__abortWatchLog.push(['clicked-stop', Date.now()]);
      clearInterval(window.__abortWatch);
    }
  }, 400);
  return { watching: true };
})()
