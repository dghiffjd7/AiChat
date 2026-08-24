(async () => {
  const panel = window.appBridge?.debugUiRegistry?.panels?.personaPanel;
  panel?.hideGalleryDetailOverlay?.();
  panel?.hideGallery?.();

  // 1. 正在运行的 CSS/WAAPI 动画
  const animations = (document.getAnimations?.() || []).map(animation => {
    const effect = animation.effect;
    const target = effect?.target;
    return {
      type: animation.constructor.name,
      name: animation.animationName || animation.id || '',
      state: animation.playState,
      iterations: effect?.getTiming?.().iterations ?? null,
      target: target ? `${target.tagName.toLowerCase()}${target.id ? `#${target.id}` : ''}.${String(target.className || '').split(/\s+/).slice(0, 2).join('.')}` : '',
      visible: target ? (target.offsetParent !== null || getComputedStyle(target).position === 'fixed') : false,
    };
  });

  // 2. 3 秒内 App 侧 rAF 调度次数
  const origRaf = window.requestAnimationFrame.bind(window);
  let rafCount = 0;
  window.requestAnimationFrame = cb => { rafCount += 1; return origRaf(cb); };
  await new Promise(resolve => setTimeout(resolve, 3000));
  window.requestAnimationFrame = origRaf;

  // 3. 可见的 backdrop-filter 元素
  const blurEls = [];
  document.querySelectorAll('*').forEach(el => {
    const style = getComputedStyle(el);
    const bf = style.backdropFilter || style.webkitBackdropFilter || '';
    if (bf && bf !== 'none' && el.offsetParent !== null) {
      blurEls.push(`${el.tagName.toLowerCase()}.${String(el.className || '').split(/\s+/).slice(0, 2).join('.')}`);
    }
  });

  return {
    runningAnimations: animations.filter(a => a.state === 'running'),
    animationTotal: animations.length,
    rafCallsIn3s: rafCount,
    visibleBackdropFilterEls: blurEls.slice(0, 20),
    blurCount: blurEls.length,
  };
})()
