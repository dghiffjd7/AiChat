export const normalizeSummaryItems = (list = []) => {
  const summaries = Array.isArray(list) ? list.slice().reverse() : [];
  return summaries
    .slice(0, 50)
    .map((it) => {
      const text = String((typeof it === 'string') ? it : it?.text || '').trim();
      if (!text) return null;
      const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
      const safeAt = Number(at || 0) || 0;
      return {
        text,
        at: safeAt,
        time: safeAt ? new Date(safeAt).toLocaleString() : '',
        key: `${safeAt}|${text}`,
      };
    })
    .filter(Boolean);
};

export const buildSelectedSummaryEntries = (keys = []) => (
  Array.isArray(keys) ? keys : []
).map((key) => {
  const [atStr, ...rest] = String(key).split('|');
  return { at: Number(atStr || 0) || 0, text: rest.join('|') };
});

export const parseEditedSummaryLines = (text) => {
  const raw = String(text || '');
  const lines = raw.split(/\r?\n/).map((s) => String(s).trim());
  const bullet = lines
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim())
    .filter(Boolean);
  if (bullet.length) return bullet;
  return lines.filter(Boolean);
};

export const resolveCompactedSummaryViewModel = (compactedSummary = null) => {
  const text = String(compactedSummary?.text || '').trim();
  if (!text) return null;
  const at = Number(compactedSummary?.at || 0) || 0;
  return {
    text,
    at,
    time: at ? new Date(at).toLocaleString() : '',
  };
};

export const renderSummaryList = ({
  container = null,
  items = [],
  batchMode = false,
  selectedKeys = new Set(),
  onToggleSelected = null,
  onCopyText = null,
  emptyHtml = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无摘要</div>',
  normalRowStyle = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);',
} = {}) => {
  if (!container) return;
  container.innerHTML = '';
  if (!Array.isArray(items) || !items.length) {
    container.innerHTML = emptyHtml;
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('div');
    if (batchMode) {
      const selected = selectedKeys?.has?.(item.key);
      row.style.cssText = `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:10px; align-items:flex-start; cursor:pointer; background:${selected ? 'rgba(59,130,246,0.06)' : 'var(--app-surface-card)'};`;
      row.innerHTML = `
        <div style="width:20px; height:20px; border-radius:999px; border:2px solid ${selected ? '#2563eb' : 'rgba(0,0,0,0.20)'}; margin-top:2px; display:flex; align-items:center; justify-content:center; color:var(--app-text-inverse); font-weight:900; font-size:12px; background:${selected ? '#2563eb' : 'transparent'}; box-sizing:border-box;">${selected ? '✓' : ''}</div>
        <div style="flex:1; min-width:0;">
            <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${item.time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${item.time}</div>` : ''}
        </div>
      `;
      row.addEventListener('click', () => {
        onToggleSelected?.(item.key);
      });
    } else {
      row.style.cssText = normalRowStyle;
      row.innerHTML = `
        <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${item.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
        ${item.time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${item.time}</div>` : ''}
      `;
      row.addEventListener('click', async () => {
        try {
          await onCopyText?.(item.text);
        } catch {}
      });
    }
    container.appendChild(row);
  });
};

export const renderCompactedSummary = ({
  container = null,
  compactedSummary = null,
  onCopyText = null,
  emptyHtml = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无大总结</div>',
  rowStyle = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;',
} = {}) => {
  if (!container) return;
  container.innerHTML = '';
  const model = resolveCompactedSummaryViewModel(compactedSummary);
  if (!model) {
    container.innerHTML = emptyHtml;
    return;
  }
  const row = document.createElement('div');
  row.style.cssText = rowStyle;
  row.innerHTML = `
    <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap;">${model.text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
    ${model.time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${model.time}</div>` : ''}
  `;
  row.addEventListener('click', async () => {
    try {
      await onCopyText?.(model.text);
    } catch {}
  });
  container.appendChild(row);
};
