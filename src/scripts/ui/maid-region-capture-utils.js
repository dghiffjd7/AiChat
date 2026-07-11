const CAPTURE_CHROME_SELECTOR = [
  '[data-maid-selection-ui]',
  '.maid-command-input',
  '#maid-guide-step-bubble',
  '#maid-guide-step-pointer',
  '#toast-container',
].join(',');

const finite = value => Number.isFinite(Number(value));

export const normalizeMaidCaptureRect = (rect = null, viewport = {}) => {
  if (!rect || ![rect.left, rect.top, rect.width, rect.height].every(finite)) return null;
  const viewportWidth = Math.max(0, Number(viewport.width || 0));
  const viewportHeight = Math.max(0, Number(viewport.height || 0));
  if (viewportWidth <= 0 || viewportHeight <= 0) return null;
  const rawLeft = Number(rect.left);
  const rawTop = Number(rect.top);
  const rawRight = rawLeft + Number(rect.width);
  const rawBottom = rawTop + Number(rect.height);
  const left = Math.max(0, Math.min(viewportWidth, rawLeft));
  const top = Math.max(0, Math.min(viewportHeight, rawTop));
  const right = Math.max(0, Math.min(viewportWidth, rawRight));
  const bottom = Math.max(0, Math.min(viewportHeight, rawBottom));
  const width = right - left;
  const height = bottom - top;
  if (width < 1 || height < 1) return null;
  return { left, top, width, height };
};

const defaultWaitForPaint = (windowRef = null) => new Promise((resolve) => {
  const raf = windowRef?.requestAnimationFrame;
  if (typeof raf !== 'function') {
    setTimeout(resolve, 34);
    return;
  }
  raf(() => raf(resolve));
});

const hideCaptureChrome = (documentRef = null) => {
  const nodes = Array.from(documentRef?.querySelectorAll?.(CAPTURE_CHROME_SELECTOR) || []);
  return nodes.map((node) => {
    const previous = {
      value: node?.style?.getPropertyValue?.('visibility') || '',
      priority: node?.style?.getPropertyPriority?.('visibility') || '',
    };
    node?.style?.setProperty?.('visibility', 'hidden', 'important');
    return () => {
      if (!node?.style) return;
      if (previous.value) node.style.setProperty('visibility', previous.value, previous.priority);
      else node.style.removeProperty?.('visibility');
    };
  });
};

const suspendGuideTargetHighlight = (documentRef = null) => {
  const nodes = Array.from(documentRef?.querySelectorAll?.('.maid-guide-step-target') || []);
  return nodes.map((node) => {
    if (!node?.classList?.contains?.('maid-guide-step-target')) return () => {};
    node.classList.remove('maid-guide-step-target');
    return () => node.classList?.add?.('maid-guide-step-target');
  });
};

export const captureMaidViewportRegion = async ({
  rect = null,
  documentRef = globalThis?.document || null,
  windowRef = globalThis?.window || null,
  invokeCapture = null,
  waitForPaint = null,
  maxDimension = 1600,
} = {}) => {
  if (typeof invokeCapture !== 'function') throw new Error('当前环境没有可用的原生截图通道');
  const viewportWidth = Math.max(0, Number(windowRef?.innerWidth || 0));
  const viewportHeight = Math.max(0, Number(windowRef?.innerHeight || 0));
  const normalizedRect = normalizeMaidCaptureRect(rect, {
    width: viewportWidth,
    height: viewportHeight,
  });
  if (!normalizedRect) throw new Error('选区已不在当前可见视口，请重新圈选后再截图');
  const restore = [
    ...hideCaptureChrome(documentRef),
    ...suspendGuideTargetHighlight(documentRef),
  ];
  try {
    await (typeof waitForPaint === 'function' ? waitForPaint() : defaultWaitForPaint(windowRef));
    const result = await invokeCapture({
      ...normalizedRect,
      viewportWidth,
      viewportHeight,
      pixelRatio: Math.max(0.25, Number(windowRef?.devicePixelRatio || 1) || 1),
      maxDimension: Math.max(64, Math.min(4096, Math.trunc(Number(maxDimension || 0)) || 1600)),
    });
    const dataUrl = String(result?.dataUrl || result?.data_url || '').trim();
    if (!dataUrl.startsWith('data:image/')) throw new Error(String(result?.message || '原生截图没有返回有效图片'));
    return {
      dataUrl,
      mime: String(result?.mime || 'image/png').trim() || 'image/png',
      width: Math.max(0, Number(result?.width || 0) || 0),
      height: Math.max(0, Number(result?.height || 0) || 0),
      bytes: Math.max(0, Number(result?.bytes || 0) || 0),
    };
  } finally {
    restore.reverse().forEach((fn) => {
      try { fn(); } catch {}
    });
  }
};
