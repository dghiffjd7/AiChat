const clampByte = value => Math.max(0, Math.min(255, Number(value) || 0));
const clampAlpha = value => Math.max(0, Math.min(1, Number(value)));

export const parseThemeColor = (value = '') => {
  const raw = String(value || '').trim();
  if (!raw) return null;
  if (raw.startsWith('#')) {
    let hex = raw.slice(1);
    if (hex.length === 3 || hex.length === 4) hex = [...hex].map(char => `${char}${char}`).join('');
    if (hex.length !== 6 && hex.length !== 8) return null;
    const channels = [0, 2, 4].map(index => Number.parseInt(hex.slice(index, index + 2), 16));
    if (!channels.every(Number.isFinite)) return null;
    return {
      rgb: channels,
      alpha: hex.length === 8 ? Number.parseInt(hex.slice(6, 8), 16) / 255 : 1,
    };
  }
  const match = raw.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+)%?)?\s*\)$/i);
  if (!match) return null;
  const rgb = [match[1], match[2], match[3]].map(clampByte);
  const alpha = match[4] == null
    ? 1
    : clampAlpha(Number(match[4]) / (match[0].includes('%') ? 100 : 1));
  return { rgb, alpha };
};

export const compositeThemeColor = (foreground, background) => {
  const front = typeof foreground === 'string' ? parseThemeColor(foreground) : foreground;
  const back = typeof background === 'string' ? parseThemeColor(background) : background;
  if (!front || !back) return null;
  const backAlpha = clampAlpha(back.alpha ?? 1);
  const frontAlpha = clampAlpha(front.alpha ?? 1);
  const outputAlpha = frontAlpha + backAlpha * (1 - frontAlpha);
  if (outputAlpha <= 0) return { rgb: [0, 0, 0], alpha: 0 };
  return {
    rgb: front.rgb.map((channel, index) => (
      channel * frontAlpha + back.rgb[index] * backAlpha * (1 - frontAlpha)
    ) / outputAlpha),
    alpha: outputAlpha,
  };
};

const linearChannel = channel => {
  const value = clampByte(channel) / 255;
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
};

export const themeContrastRatio = (foreground, background) => {
  const front = typeof foreground === 'string' ? parseThemeColor(foreground) : foreground;
  const back = typeof background === 'string' ? parseThemeColor(background) : background;
  if (!front || !back) return 0;
  const luminance = color => (
    0.2126 * linearChannel(color.rgb[0])
    + 0.7152 * linearChannel(color.rgb[1])
    + 0.0722 * linearChannel(color.rgb[2])
  );
  const first = luminance(front);
  const second = luminance(back);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
};

const opaqueSurface = (value, underneath) => {
  const color = parseThemeColor(value);
  const base = parseThemeColor(underneath);
  if (!color || !base) return null;
  return compositeThemeColor(color, { ...base, alpha: 1 });
};

export const resolveRpDialogueTextColor = (tokens = {}, {
  mode = '',
  bubbleColor = '',
  primaryTextColor = '',
} = {}) => {
  const surface = tokens?.surface || {};
  const text = tokens?.text || {};
  const accent = tokens?.accent || {};
  const bubble = tokens?.bubble || {};
  const darkMode = String(mode || '').trim().toLowerCase() === 'dark';
  const baseCanvas = darkMode ? '#000000' : '#ffffff';
  const page = opaqueSurface(surface.page || baseCanvas, baseCanvas) || parseThemeColor(baseCanvas);
  let background = null;
  if (darkMode) {
    const resolvedBubble = parseThemeColor(bubbleColor || bubble.assistantAlt || bubble.assistant || surface.card);
    if (resolvedBubble) {
      background = compositeThemeColor({
        ...resolvedBubble,
        alpha: clampAlpha((resolvedBubble.alpha ?? 1) * 0.78),
      }, page);
    }
  } else {
    background = opaqueSurface(surface.card || bubble.assistant || surface.page, page);
  }
  background ||= page;

  const candidates = [
    { color: text.dialogue, source: 'dialogue' },
    { color: accent.strong || accent.primary, source: 'accent' },
    { color: primaryTextColor || text.primary, source: 'primary' },
  ];
  for (const candidate of candidates) {
    if (!parseThemeColor(candidate.color)) continue;
    const ratio = themeContrastRatio(candidate.color, background);
    if (ratio >= 4.5) return { ...candidate, background, contrast: ratio };
  }

  const emergency = ['#000000', '#ffffff']
    .map(color => ({ color, contrast: themeContrastRatio(color, background) }))
    .sort((left, right) => right.contrast - left.contrast)[0];
  return { ...emergency, source: 'emergency', background };
};
