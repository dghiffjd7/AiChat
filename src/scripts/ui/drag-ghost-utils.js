// 拖拽悬浮幽灵：克隆被拖元素为 fixed 定位的“悬浮卡”跟随指针，原元素留在流中作为落点占位。
// 预设区块排序与联系人拖拽共用。reduced-motion（APP 设定或系统偏好）时跳过动画、只保留跟随。

const prefersReducedMotion = (doc) => {
  try {
    if (doc?.body?.dataset?.reducedMotion === 'on') return true;
    const win = doc?.defaultView || (typeof window !== 'undefined' ? window : null);
    if (win?.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return true;
  } catch {}
  return false;
};

export const createDragGhost = (el, event, { scale = 1.045 } = {}) => {
  const doc = el?.ownerDocument;
  if (!doc?.body || !el?.getBoundingClientRect) return null;
  const rect = el.getBoundingClientRect();
  const ghost = el.cloneNode(true);
  ghost.classList.add('drag-ghost');
  ghost.style.cssText += `;position:fixed;left:${rect.left}px;top:${rect.top}px;width:${rect.width}px;height:${rect.height}px;margin:0;z-index:100001;pointer-events:none;box-sizing:border-box;opacity:0.96;`;
  doc.body.appendChild(ghost);
  const reduced = prefersReducedMotion(doc);
  const grabDx = (event?.clientX ?? rect.left) - rect.left;
  const grabDy = (event?.clientY ?? rect.top) - rect.top;
  // 起手抬升：放大 + 加深阴影，明显“浮起来”
  if (!reduced && typeof ghost.animate === 'function') {
    ghost.animate([
      { transform: 'scale(1)', boxShadow: '0 2px 8px rgba(15, 23, 42, 0.14)' },
      { transform: `scale(${scale})`, boxShadow: '0 18px 42px rgba(15, 23, 42, 0.32)' },
    ], { duration: 140, fill: 'forwards', easing: 'ease-out' });
  } else {
    ghost.style.transform = `scale(${scale})`;
    ghost.style.boxShadow = '0 18px 42px rgba(15, 23, 42, 0.32)';
  }
  let removed = false;
  const move = (ev) => {
    if (removed) return;
    ghost.style.left = `${ev.clientX - grabDx}px`;
    ghost.style.top = `${ev.clientY - grabDy}px`;
  };
  const destroy = () => {
    if (removed) return;
    removed = true;
    try { ghost.remove(); } catch {}
  };
  // 松手：幽灵滑落到目标矩形处再消失（reduced-motion 时立即）
  const settle = (targetRect, done) => {
    if (removed) { done?.(); return; }
    if (reduced || !targetRect || typeof ghost.animate !== 'function') {
      destroy();
      done?.();
      return;
    }
    const cur = ghost.getBoundingClientRect();
    const anim = ghost.animate([
      { transform: `translate(0, 0) scale(${scale})`, opacity: 0.96 },
      { transform: `translate(${targetRect.left - cur.left}px, ${targetRect.top - cur.top}px) scale(1)`, opacity: 1 },
    ], { duration: 150, easing: 'ease-in-out' });
    const finish = () => { destroy(); done?.(); };
    anim.onfinish = finish;
    anim.oncancel = finish;
  };
  return { ghost, move, settle, destroy };
};
