/**
 * Name badges utilities
 * - Parse parentheses badge from a name string
 * - Normalize badge arrays
 * - Build safe HTML for "name + badges" presentation
 */

const PAREN_BADGE_RE = /^(.*?)[\s\u3000]*[（(]([^()（）]+)[）)]\s*$/;

export const escapeHtml = (value) => {
  const raw = String(value ?? '');
  if (!raw) return '';
  return raw
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

export const parseNameBadge = (name) => {
  const raw = String(name ?? '').trim();
  if (!raw) return { baseName: '', badge: '' };
  const match = raw.match(PAREN_BADGE_RE);
  if (!match) return { baseName: raw, badge: '' };
  const baseName = String(match[1] ?? '').trim() || raw;
  const badge = String(match[2] ?? '').trim();
  return { baseName, badge };
};

export const normalizeBadgeList = (badges, { max = 6 } = {}) => {
  const list = Array.isArray(badges) ? badges : badges ? [badges] : [];
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const text = String(item ?? '').trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
    if (out.length >= max) break;
  }
  return out;
};

const badgeToneClass = (badgeText) => {
  const text = String(badgeText ?? '');
  if (!text) return 'tone-gray';
  // Version / state / route like badges -> purple/blue
  if (/(重制|重製|版|ver|v\d|nt|线|線|态|態|全盛|觉醒|覺醒|终|終|成年|幼年|形态|形態|模式|mode)/i.test(text)) {
    return 'tone-purple';
  }
  // Contains digits / latin letters -> cyan-ish
  if (/[a-zA-Z0-9]/.test(text)) {
    return 'tone-cyan';
  }
  // Default
  return 'tone-emerald';
};

export const buildBadgesHtml = (badges) => {
  const list = normalizeBadgeList(badges);
  if (!list.length) return '';
  return list
    .map((badge) => {
      const tone = badgeToneClass(badge);
      return `<span class="name-badge ${tone}">${escapeHtml(badge)}</span>`;
    })
    .join('');
};

/**
 * Build HTML for name + badges.
 * When badges exist and the name has a parentheses badge,
 * we strip the parentheses part from the base name.
 */
export const buildNameWithBadgesHtml = (name, badges) => {
  const list = normalizeBadgeList(badges);
  const parsed = parseNameBadge(name);
  const shouldStripParen = list.length > 0 && parsed.badge;
  const base = shouldStripParen ? parsed.baseName : String(name ?? '');
  const badgesHtml = buildBadgesHtml(list);
  const baseHtml = escapeHtml(base);
  if (!badgesHtml) return baseHtml;
  return `<span class="name-with-badges"><span class="name-text">${baseHtml}</span>${badgesHtml}</span>`;
};

export const getContactBadges = (contact) => {
  const labels = contact?.labels;
  return normalizeBadgeList(Array.isArray(labels) ? labels : []);
};

export const getAutoBadgeFromName = (name) => {
  const parsed = parseNameBadge(name);
  return parsed.badge ? [parsed.badge] : [];
};

