const DEFAULT_PAGE_BACKGROUND = Object.freeze({ r: 15, g: 23, b: 42, a: 1 });
const HIGHLIGHT_ATTR = 'data-theme-dark-audit-highlight';
const HIGHLIGHT_STYLE_ID = 'theme-dark-audit-highlight-style';
const MIN_TEXT_CONTRAST = 4.5;
const MIN_CONTROL_CONTRAST = 3;
const LIGHT_BACKGROUND_LUMINANCE = 0.78;
const MIN_SURFACE_ALPHA = 0.72;
const SURFACE_KEYWORD_RE = /(card|panel|modal|dialog|sheet|editor|list|row|item|section|content|box|wrap|entry|node|tab|input|toolbar|header|footer)/i;
const INTERACTIVE_ROLE_RE = /^(button|tab|switch|checkbox|radio|menuitem|option|textbox|combobox)$/i;
const SKIP_SELECTOR = [
  'script',
  'style',
  'link',
  'meta',
  'head',
  'title',
  '#debug-panel',
  '#debug-toggle',
  '[id^="debug-"]',
  '[data-debug-panel-root="true"]',
  '[data-theme-dark-audit-root="true"]',
].join(', ');

const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const round = (value, digits = 3) => {
  const next = Number(value);
  if (!Number.isFinite(next)) return 0;
  const factor = 10 ** digits;
  return Math.round(next * factor) / factor;
};

const clampByte = (value) => clamp(Math.round(Number(value) || 0), 0, 255);
const clampAlpha = (value) => clamp(Number(value) || 0, 0, 1);

const srgbChannelToLinear = (value) => {
  const channel = clamp((Number(value) || 0) / 255, 0, 1);
  return channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;
};

const normalizeWhitespace = (value = '') => String(value || '').replace(/\s+/g, ' ').trim();

const isFiniteRect = (rect) => Boolean(rect)
  && Number.isFinite(rect.width)
  && Number.isFinite(rect.height)
  && Number.isFinite(rect.top)
  && Number.isFinite(rect.left);

const isElementNode = (value) => typeof Element !== 'undefined' && value instanceof Element;

export function parseCssColor(value = '') {
  const raw = String(value || '').trim().toLowerCase();
  if (!raw || raw === 'transparent' || raw === 'initial' || raw === 'inherit') return null;

  if (raw === 'white') return { r: 255, g: 255, b: 255, a: 1 };
  if (raw === 'black') return { r: 0, g: 0, b: 0, a: 1 };

  const hex = raw.match(/^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    const token = hex[1];
    if (token.length === 3 || token.length === 4) {
      const [r, g, b, a = 'f'] = token.split('');
      return {
        r: clampByte(parseInt(`${r}${r}`, 16)),
        g: clampByte(parseInt(`${g}${g}`, 16)),
        b: clampByte(parseInt(`${b}${b}`, 16)),
        a: clampAlpha(parseInt(`${a}${a}`, 16) / 255),
      };
    }
    if (token.length === 6 || token.length === 8) {
      return {
        r: clampByte(parseInt(token.slice(0, 2), 16)),
        g: clampByte(parseInt(token.slice(2, 4), 16)),
        b: clampByte(parseInt(token.slice(4, 6), 16)),
        a: clampAlpha(token.length === 8 ? parseInt(token.slice(6, 8), 16) / 255 : 1),
      };
    }
  }

  const rgb = raw.match(/^rgba?\((.+)\)$/i);
  if (rgb) {
    const parts = rgb[1]
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    if (parts.length >= 3) {
      return {
        r: clampByte(parts[0]),
        g: clampByte(parts[1]),
        b: clampByte(parts[2]),
        a: clampAlpha(parts.length >= 4 ? parts[3] : 1),
      };
    }
  }

  return null;
}

export function colorToString(color) {
  if (!color) return 'n/a';
  const alpha = round(color.a == null ? 1 : color.a, 2);
  return `rgba(${clampByte(color.r)}, ${clampByte(color.g)}, ${clampByte(color.b)}, ${alpha})`;
}

export function compositeColors(foreground, background) {
  const fg = foreground || { r: 0, g: 0, b: 0, a: 0 };
  const bg = background || { r: 0, g: 0, b: 0, a: 0 };
  const fgAlpha = clampAlpha(fg.a == null ? 1 : fg.a);
  const bgAlpha = clampAlpha(bg.a == null ? 1 : bg.a);
  const outAlpha = fgAlpha + bgAlpha * (1 - fgAlpha);
  if (outAlpha <= 0) return { r: 0, g: 0, b: 0, a: 0 };
  return {
    r: clampByte(((fg.r || 0) * fgAlpha + (bg.r || 0) * bgAlpha * (1 - fgAlpha)) / outAlpha),
    g: clampByte(((fg.g || 0) * fgAlpha + (bg.g || 0) * bgAlpha * (1 - fgAlpha)) / outAlpha),
    b: clampByte(((fg.b || 0) * fgAlpha + (bg.b || 0) * bgAlpha * (1 - fgAlpha)) / outAlpha),
    a: clampAlpha(outAlpha),
  };
}

export function relativeLuminance(color) {
  if (!color) return 0;
  const r = srgbChannelToLinear(color.r);
  const g = srgbChannelToLinear(color.g);
  const b = srgbChannelToLinear(color.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(foreground, background) {
  if (!foreground || !background) return 0;
  const fg = compositeColors(foreground, background);
  const bg = compositeColors(background, DEFAULT_PAGE_BACKGROUND);
  const l1 = relativeLuminance(fg);
  const l2 = relativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

export function extractColorsFromBackgroundImage(value = '') {
  const source = String(value || '');
  if (!source || source === 'none') return [];
  const matches = [];
  const rgbRegex = /rgba?\(([^)]+)\)/gi;
  const hexRegex = /#([0-9a-f]{8}|[0-9a-f]{6}|[0-9a-f]{4}|[0-9a-f]{3})/gi;

  let match = rgbRegex.exec(source);
  while (match) {
    const parsed = parseCssColor(match[0]);
    if (parsed) matches.push(parsed);
    match = rgbRegex.exec(source);
  }

  match = hexRegex.exec(source);
  while (match) {
    const parsed = parseCssColor(match[0]);
    if (parsed) matches.push(parsed);
    match = hexRegex.exec(source);
  }

  return matches;
}

export function averageColors(colors = []) {
  const list = (Array.isArray(colors) ? colors : []).filter(Boolean);
  if (!list.length) return null;
  const total = list.reduce((acc, item) => {
    acc.r += clampByte(item.r);
    acc.g += clampByte(item.g);
    acc.b += clampByte(item.b);
    acc.a += clampAlpha(item.a == null ? 1 : item.a);
    return acc;
  }, { r: 0, g: 0, b: 0, a: 0 });
  return {
    r: clampByte(total.r / list.length),
    g: clampByte(total.g / list.length),
    b: clampByte(total.b / list.length),
    a: clampAlpha(total.a / list.length),
  };
}

const escapeHtml = (value = '') => String(value || '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const buildViewportRect = () => ({
  width: Number(window?.innerWidth || document?.documentElement?.clientWidth || 0),
  height: Number(window?.innerHeight || document?.documentElement?.clientHeight || 0),
});

const rectIntersectsViewport = (rect, viewport) => isFiniteRect(rect)
  && rect.width >= 2
  && rect.height >= 2
  && rect.bottom >= 0
  && rect.right >= 0
  && rect.top <= viewport.height
  && rect.left <= viewport.width;

const isVisuallyHidden = (element, style) => {
  if (!element || !style) return true;
  if (style.display === 'none' || style.visibility === 'hidden') return true;
  if (Number(style.opacity || 1) <= 0.02) return true;
  if (element.hasAttribute('hidden')) return true;
  return false;
};

const isMediaLikeElement = (element) => /^(img|video|canvas|svg|picture|iframe)$/i.test(element?.tagName || '');

const looksLikeSurfaceHost = (element) => {
  const source = [
    element?.tagName || '',
    element?.id || '',
    element?.className || '',
    element?.getAttribute?.('role') || '',
  ].join(' ');
  return SURFACE_KEYWORD_RE.test(source);
};

const isInteractiveElement = (element) => {
  const tagName = String(element?.tagName || '').toLowerCase();
  if (/^(button|input|select|textarea|summary|label|option)$/.test(tagName)) return true;
  const role = String(element?.getAttribute?.('role') || '').trim().toLowerCase();
  if (INTERACTIVE_ROLE_RE.test(role)) return true;
  if (element?.tabIndex >= 0) return true;
  return false;
};

const getOwnSurfaceColor = (element, style) => {
  const direct = parseCssColor(style?.backgroundColor || '');
  if (direct && clampAlpha(direct.a) > 0.02) return direct;
  const gradient = averageColors(extractColorsFromBackgroundImage(style?.backgroundImage || ''));
  if (gradient && clampAlpha(gradient.a) > 0.02) return gradient;
  return null;
};

const getPageBackground = () => {
  const htmlStyle = document?.documentElement ? window.getComputedStyle(document.documentElement) : null;
  const bodyStyle = document?.body ? window.getComputedStyle(document.body) : null;
  const htmlBg = getOwnSurfaceColor(document.documentElement, htmlStyle);
  const bodyBg = getOwnSurfaceColor(document.body, bodyStyle);
  return compositeColors(bodyBg, compositeColors(htmlBg, DEFAULT_PAGE_BACKGROUND));
};

const buildBackgroundResolver = (pageBackground) => {
  const cache = new WeakMap();
  return (element) => {
    if (!isElementNode(element)) return pageBackground;
    if (cache.has(element)) return cache.get(element);
    const layers = [];
    let current = element;
    while (isElementNode(current)) {
      const surface = getOwnSurfaceColor(current, window.getComputedStyle(current));
      if (surface && clampAlpha(surface.a) > 0.02) layers.push(surface);
      current = current.parentElement;
    }
    let resolved = pageBackground;
    for (let i = layers.length - 1; i >= 0; i -= 1) {
      resolved = compositeColors(layers[i], resolved);
    }
    cache.set(element, resolved);
    return resolved;
  };
};

const getDirectTextSnippet = (element) => {
  if (!element) return '';
  const chunks = [];
  element.childNodes?.forEach?.((node) => {
    if (node?.nodeType === Node.TEXT_NODE) {
      const text = normalizeWhitespace(node.textContent);
      if (text) chunks.push(text);
    }
  });
  return normalizeWhitespace(chunks.join(' ')).slice(0, 80);
};

const getElementTextSnippet = (element) => {
  if (!element) return '';
  const direct = getDirectTextSnippet(element);
  if (direct) return direct;
  if (/^(input|textarea|select)$/i.test(element.tagName || '')) {
    const value = normalizeWhitespace(element.value || element.placeholder || element.getAttribute('aria-label') || '');
    if (value) return value.slice(0, 80);
  }
  const fallback = normalizeWhitespace(
    element.getAttribute?.('aria-label')
    || element.getAttribute?.('title')
    || element.innerText
    || '',
  );
  return fallback.slice(0, 80);
};

const describeElement = (element) => {
  if (!element) return '<unknown>';
  const tag = String(element.tagName || 'node').toLowerCase();
  const id = element.id ? `#${element.id}` : '';
  const classes = typeof element.className === 'string'
    ? element.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).map((name) => `.${name}`).join('')
    : '';
  const role = element.getAttribute?.('role') ? `[role="${element.getAttribute('role')}"]` : '';
  return `${tag}${id}${classes}${role}`;
};

const shouldSkipElement = (element) => {
  if (!isElementNode(element)) return true;
  if (element.matches(SKIP_SELECTOR)) return true;
  if (element.closest(SKIP_SELECTOR)) return true;
  return false;
};

const buildIssue = ({
  element,
  category,
  severity,
  rect,
  background,
  foreground = null,
  ownSurface = null,
  contrast = null,
  textSnippet = '',
}) => ({
  element,
  category,
  severity,
  descriptor: describeElement(element),
  textSnippet,
  rect: rect ? {
    top: round(rect.top, 1),
    left: round(rect.left, 1),
    width: round(rect.width, 1),
    height: round(rect.height, 1),
  } : null,
  background,
  ownSurface,
  foreground,
  contrast: Number.isFinite(contrast) ? round(contrast, 2) : null,
  backgroundLuminance: round(relativeLuminance(background), 3),
});

const summarizeIssues = (issues = []) => {
  const byCategory = {};
  (Array.isArray(issues) ? issues : []).forEach((item) => {
    const key = String(item?.category || 'unknown');
    byCategory[key] = (byCategory[key] || 0) + 1;
  });
  return {
    total: Array.isArray(issues) ? issues.length : 0,
    byCategory,
  };
};

const formatRect = (rect) => rect
  ? `${round(rect.width, 0)}x${round(rect.height, 0)} @ ${round(rect.left, 0)},${round(rect.top, 0)}`
  : 'n/a';

export function formatDarkThemeAuditReport(report = {}) {
  const mode = String(report?.mode || 'unknown');
  const lines = [
    'Dark Theme DOM Audit',
    `mode: ${mode}`,
    `visible elements scanned: ${Number(report?.scannedElements || 0)}`,
    `issues: ${Number(report?.summary?.total || 0)}`,
  ];

  Object.entries(report?.summary?.byCategory || {})
    .sort((a, b) => a[0].localeCompare(b[0]))
    .forEach(([key, count]) => {
      lines.push(`- ${key}: ${count}`);
    });

  if (report?.message) {
    lines.push('');
    lines.push(report.message);
  }

  const issues = Array.isArray(report?.issues) ? report.issues : [];
  if (issues.length) {
    lines.push('');
    issues.forEach((issue, index) => {
      lines.push(`${String(index + 1).padStart(2, '0')}. [${issue.category}] ${issue.descriptor}`);
      lines.push(`    bg=${colorToString(issue.background)} | rect=${formatRect(issue.rect)}${issue.ownSurface ? ` | surface=${colorToString(issue.ownSurface)}` : ''}`);
      if (issue.foreground) {
        lines.push(`    fg=${colorToString(issue.foreground)}${issue.contrast != null ? ` | contrast=${issue.contrast}` : ''}`);
      }
      if (issue.textSnippet) {
        lines.push(`    text=${issue.textSnippet}`);
      }
    });
  }

  if (report?.truncated) {
    lines.push('');
    lines.push(`report truncated at ${Number(report?.issueLimit || 0)} issues`);
  }

  return lines.join('\n');
}

export function renderDarkThemeAuditIssueHtml(issue = {}, index = 0) {
  const contrast = issue?.contrast != null ? `对比 ${issue.contrast}` : '';
  const text = issue?.textSnippet ? escapeHtml(issue.textSnippet) : '<span style="opacity:0.72;">无可见文本</span>';
  return `
    <button type="button" data-theme-audit-index="${index}" style="
      width:100%;
      text-align:left;
      border:1px solid rgba(148,163,184,0.25);
      background:rgba(15,23,42,0.86);
      color:#e2e8f0;
      border-radius:12px;
      padding:10px 12px;
      cursor:pointer;
      display:flex;
      flex-direction:column;
      gap:6px;
    ">
      <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap;">
        <span style="font-weight:800; color:#f8fafc;">#${index + 1}</span>
        <span style="padding:2px 8px; border-radius:999px; font-size:11px; font-weight:700; background:${issue.category === 'light-background' ? 'rgba(239,68,68,0.18)' : issue.category === 'low-contrast-text' ? 'rgba(245,158,11,0.18)' : 'rgba(56,189,248,0.18)'}; color:${issue.category === 'light-background' ? '#fecaca' : issue.category === 'low-contrast-text' ? '#fde68a' : '#bae6fd'};">${escapeHtml(issue.category || 'issue')}</span>
        <span style="font-size:12px; color:#94a3b8;">${escapeHtml(issue.descriptor || '')}</span>
      </div>
      <div style="font-size:12px; color:#cbd5e1;">${escapeHtml(text)}</div>
      <div style="font-size:11px; color:#94a3b8;">${escapeHtml(colorToString(issue.background))}${contrast ? ` · ${escapeHtml(contrast)}` : ''} · ${escapeHtml(formatRect(issue.rect))}</div>
    </button>
  `;
}

export function clearDarkThemeAuditHighlights() {
  if (!document?.querySelectorAll) return 0;
  const elements = document.querySelectorAll(`[${HIGHLIGHT_ATTR}]`);
  elements.forEach((element) => element.removeAttribute(HIGHLIGHT_ATTR));
  return elements.length;
}

const ensureHighlightStyle = () => {
  if (!document?.head) return;
  if (document.getElementById(HIGHLIGHT_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = HIGHLIGHT_STYLE_ID;
  style.textContent = `
    [${HIGHLIGHT_ATTR}] {
      outline: 2px solid #f59e0b !important;
      outline-offset: 2px !important;
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18) !important;
    }
    [${HIGHLIGHT_ATTR}="light-background"] {
      outline-color: #ef4444 !important;
      box-shadow: 0 0 0 4px rgba(239, 68, 68, 0.18) !important;
    }
    [${HIGHLIGHT_ATTR}="low-contrast-text"] {
      outline-color: #f59e0b !important;
      box-shadow: 0 0 0 4px rgba(245, 158, 11, 0.18) !important;
    }
    [${HIGHLIGHT_ATTR}="low-contrast-control"] {
      outline-color: #38bdf8 !important;
      box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.18) !important;
    }
  `;
  document.head.appendChild(style);
};

export function highlightDarkThemeAuditIssues(issues = [], { limit = 120 } = {}) {
  clearDarkThemeAuditHighlights();
  ensureHighlightStyle();
  let count = 0;
  (Array.isArray(issues) ? issues : []).forEach((issue) => {
    if (count >= limit) return;
    const element = issue?.element;
    if (!isElementNode(element) || !document.contains(element)) return;
    element.setAttribute(HIGHLIGHT_ATTR, String(issue.category || 'issue'));
    count += 1;
  });
  return count;
}

export function focusDarkThemeAuditIssue(issue) {
  const element = issue?.element;
  if (!isElementNode(element) || !document.contains(element)) return false;
  element.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' });
  return true;
}

export function runDarkThemeDomAudit({ root = document.body, issueLimit = 250 } = {}) {
  const mode = String(document?.body?.dataset?.themeMode || 'light').toLowerCase();
  const report = {
    mode,
    issueLimit,
    scannedElements: 0,
    issues: [],
    truncated: false,
    summary: { total: 0, byCategory: {} },
    generatedAt: new Date().toISOString(),
    message: '',
  };

  if (mode !== 'dark') {
    report.message = '当前不是 dark 模式，运行时审计已跳过。';
    return report;
  }

  if (!isElementNode(root)) {
    report.message = '未找到可扫描的根节点。';
    return report;
  }

  const viewport = buildViewportRect();
  const pageBackground = getPageBackground();
  const resolveBackground = buildBackgroundResolver(pageBackground);
  const seen = new Set();
  const nodes = [root, ...root.querySelectorAll('*')];

  for (const element of nodes) {
    if (report.issues.length >= issueLimit) {
      report.truncated = true;
      break;
    }
    if (shouldSkipElement(element)) continue;
    const style = window.getComputedStyle(element);
    if (isVisuallyHidden(element, style)) continue;
    const rect = element.getBoundingClientRect();
    if (!rectIntersectsViewport(rect, viewport)) continue;

    report.scannedElements += 1;

    const ownSurface = getOwnSurfaceColor(element, style);
    const background = resolveBackground(element);
    const textSnippet = getElementTextSnippet(element);
    const surfaceArea = rect.width * rect.height;
    const interactive = isInteractiveElement(element);

    if (
      ownSurface
      && ownSurface.a >= MIN_SURFACE_ALPHA
      && relativeLuminance(ownSurface) >= LIGHT_BACKGROUND_LUMINANCE
      && (surfaceArea >= 240 || interactive || looksLikeSurfaceHost(element))
      && !isMediaLikeElement(element)
    ) {
      const fingerprint = `light-background|${describeElement(element)}|${Math.round(rect.top)}|${Math.round(rect.left)}|${colorToString(ownSurface)}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        report.issues.push(buildIssue({
          element,
          category: 'light-background',
          severity: relativeLuminance(ownSurface) >= 0.9 ? 'error' : 'warn',
          rect,
          background,
          ownSurface,
          textSnippet,
        }));
      }
    }

    const foreground = parseCssColor(style.color || '');
    if (!foreground || foreground.a <= 0.05) continue;

    const contrast = contrastRatio(foreground, background);
    if (textSnippet && contrast < MIN_TEXT_CONTRAST && !isMediaLikeElement(element)) {
      const fingerprint = `low-contrast-text|${describeElement(element)}|${Math.round(rect.top)}|${Math.round(rect.left)}|${colorToString(foreground)}|${textSnippet}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        report.issues.push(buildIssue({
          element,
          category: 'low-contrast-text',
          severity: contrast < 3 ? 'error' : 'warn',
          rect,
          background,
          foreground,
          ownSurface,
          contrast,
          textSnippet,
        }));
      }
      continue;
    }

    if (!textSnippet && interactive && contrast < MIN_CONTROL_CONTRAST) {
      const fingerprint = `low-contrast-control|${describeElement(element)}|${Math.round(rect.top)}|${Math.round(rect.left)}|${colorToString(foreground)}`;
      if (!seen.has(fingerprint)) {
        seen.add(fingerprint);
        report.issues.push(buildIssue({
          element,
          category: 'low-contrast-control',
          severity: 'warn',
          rect,
          background,
          foreground,
          ownSurface,
          contrast,
          textSnippet,
        }));
      }
    }
  }

  report.summary = summarizeIssues(report.issues);
  if (!report.summary.total && !report.message) {
    report.message = '当前视口没有发现明显的白底或低对比元素。';
  }
  return report;
}
