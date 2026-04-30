const roundCoord = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 1000) / 1000;
};

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const sanitizeCount = (value, fallback) => {
  const num = Math.trunc(Number(value));
  return Number.isFinite(num) && num >= 1 ? num : fallback;
};

const sanitizeRotation = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  return clamp(roundCoord(num), -180, 180);
};

const computeMinGap = (limit, count, requestedMinGap = 4) => {
  const safeLimit = Math.max(1, Number(limit) || 0);
  const safeCount = Math.max(2, Math.trunc(Number(count) || 0));
  const adaptive = Math.floor(safeLimit / safeCount);
  return Math.max(1, Math.min(requestedMinGap, adaptive || requestedMinGap));
};

const normalizeGuideCoords = (coords, limit, requestedMinGap = 4) => {
  const safeLimit = Math.max(1, Number(limit) || 0);
  const list = Array.isArray(coords)
    ? coords.map((value) => Number(value)).filter((value) => Number.isFinite(value))
    : [];
  if (list.length < 2) return [0, safeLimit];
  const minGap = computeMinGap(safeLimit, list.length, requestedMinGap);
  const out = list.slice().sort((a, b) => a - b);
  out[0] = clamp(out[0], 0, Math.max(0, safeLimit - minGap * (out.length - 1)));
  for (let i = 1; i < out.length; i += 1) {
    const min = out[i - 1] + minGap;
    const max = safeLimit - minGap * (out.length - 1 - i);
    out[i] = clamp(out[i], min, max);
  }
  return out.map(roundCoord);
};

const buildAxisGuides = (length, count, margin, gap) => {
  const safeLength = Math.max(1, Number(length) || 0);
  const safeCount = sanitizeCount(count, 1);
  const safeMargin = clamp(Number(margin) || 0, 0, safeLength / 2);
  const safeGap = Math.max(0, Number(gap) || 0);
  const usable = Math.max(1, safeLength - safeMargin * 2 - safeGap * (safeCount - 1));
  const cell = usable / safeCount;
  const guides = [safeMargin];
  let cursor = safeMargin;
  for (let i = 0; i < safeCount - 1; i += 1) {
    cursor += cell;
    guides.push(cursor + safeGap / 2);
    cursor += safeGap;
  }
  guides.push(safeLength - safeMargin);
  return normalizeGuideCoords(guides, safeLength);
};

export const buildGuideStateFromSettings = ({
  width,
  height,
  rows,
  cols,
  margin,
  gap,
  rotation = 0,
} = {}) => {
  const safeWidth = Math.max(1, Math.round(Number(width) || 0));
  const safeHeight = Math.max(1, Math.round(Number(height) || 0));
  return {
    enabled: true,
    width: safeWidth,
    height: safeHeight,
    rotation: sanitizeRotation(rotation),
    xGuides: buildAxisGuides(safeWidth, cols, margin, gap),
    yGuides: buildAxisGuides(safeHeight, rows, margin, gap),
  };
};

export const normalizeGuideState = (raw, { width, height } = {}) => {
  if (!raw || typeof raw !== 'object') return null;
  const safeWidth = Math.max(1, Math.round(Number(raw.width || width) || 0));
  const safeHeight = Math.max(1, Math.round(Number(raw.height || height) || 0));
  if (!safeWidth || !safeHeight) return null;
  const xGuides = normalizeGuideCoords(raw.xGuides, safeWidth);
  const yGuides = normalizeGuideCoords(raw.yGuides, safeHeight);
  if (xGuides.length < 2 || yGuides.length < 2) return null;
  return {
    enabled: raw.enabled !== false,
    width: safeWidth,
    height: safeHeight,
    rotation: sanitizeRotation(raw.rotation),
    xGuides,
    yGuides,
  };
};

export const moveGuideInState = (state, axis, index, nextValue, requestedMinGap = 4) => {
  const normalized = normalizeGuideState(state);
  if (!normalized) return null;
  const key = axis === 'y' ? 'yGuides' : 'xGuides';
  const limit = key === 'xGuides' ? normalized.width : normalized.height;
  const guides = normalized[key].slice();
  const safeIndex = Math.trunc(Number(index));
  if (!Number.isFinite(safeIndex) || safeIndex < 0 || safeIndex >= guides.length) return normalized;
  const minGap = computeMinGap(limit, guides.length, requestedMinGap);
  const min = safeIndex > 0 ? guides[safeIndex - 1] + minGap : 0;
  const max = safeIndex < guides.length - 1 ? guides[safeIndex + 1] - minGap : limit;
  guides[safeIndex] = roundCoord(clamp(Number(nextValue) || 0, min, max));
  return { ...normalized, [key]: guides };
};

export const buildGuideRects = (state) => {
  const normalized = normalizeGuideState(state);
  if (!normalized) return [];
  const rects = [];
  for (let row = 0; row < normalized.yGuides.length - 1; row += 1) {
    const top = clamp(Math.floor(normalized.yGuides[row]), 0, normalized.height);
    const bottom = clamp(Math.ceil(normalized.yGuides[row + 1]), 0, normalized.height);
    if (bottom <= top) continue;
    for (let col = 0; col < normalized.xGuides.length - 1; col += 1) {
      const left = clamp(Math.floor(normalized.xGuides[col]), 0, normalized.width);
      const right = clamp(Math.ceil(normalized.xGuides[col + 1]), 0, normalized.width);
      if (right <= left) continue;
      rects.push({
        row,
        col,
        x: left,
        y: top,
        width: right - left,
        height: bottom - top,
      });
    }
  }
  return rects;
};

export const guideStateSignature = (state) => {
  const normalized = normalizeGuideState(state);
  if (!normalized) return 'guide:none';
  return [
    normalized.width,
    normalized.height,
    normalized.rotation,
    normalized.xGuides.join(','),
    normalized.yGuides.join(','),
  ].join('|');
};
