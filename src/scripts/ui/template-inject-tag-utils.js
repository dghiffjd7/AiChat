export const parseTemplateInjectTags = (comment = '') => {
  const raw = String(comment || '');
  if (!raw.includes('[')) return [];
  const out = [];
  const re = /\[(GENERATE|RENDER)\s*:\s*([^\]]+)\]/gi;
  let m;
  while ((m = re.exec(raw))) {
    const stage = String(m[1] || '').toLowerCase();
    const body = String(m[2] || '').trim();
    if (!body) continue;
    const parts = body.split(':').map(s => s.trim()).filter(Boolean);
    if (!parts.length) continue;
    if (stage === 'generate') {
      if (parts[0].toUpperCase() === 'REGEX') {
        const pattern = parts.slice(1).join(':').trim();
        if (!pattern) continue;
        out.push({ stage, type: 'regex', pattern, mode: 'before' });
        continue;
      }
      if (parts.length >= 2 && /^\d+$/.test(parts[0])) {
        const index = Number(parts[0]);
        const modeRaw = String(parts[1] || '').trim().toLowerCase();
        if (modeRaw === 'before' || modeRaw === 'after') {
          out.push({ stage, type: 'index', index, mode: modeRaw });
        }
        continue;
      }
      const mode = String(parts[0] || '').trim().toLowerCase();
      if (mode === 'before' || mode === 'after') {
        out.push({ stage, type: 'edge', mode });
      }
      continue;
    }
    if (stage === 'render') {
      const mode = String(parts[0] || '').trim().toLowerCase();
      if (mode === 'before' || mode === 'after') {
        out.push({ stage, type: 'edge', mode });
      }
    }
  }
  return out;
};

export const buildTemplateInjectRegex = (pattern = '') => {
  const raw = String(pattern || '').trim();
  if (!raw) return null;
  if (raw.startsWith('/') && raw.lastIndexOf('/') > 0) {
    const last = raw.lastIndexOf('/');
    const body = raw.slice(1, last);
    const flags = raw.slice(last + 1) || 'i';
    try {
      return new RegExp(body, flags);
    } catch {
      return null;
    }
  }
  try {
    return new RegExp(raw, 'i');
  } catch {
    return null;
  }
};
