(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  win.eval(`
    if (!window.__geTrap) {
      window.__nullIds = [];
      const orig = Document.prototype.getElementById;
      Document.prototype.getElementById = function(id) {
        const r = orig.call(this, id);
        if (r === null) { window.__nullIds.push(String(id)); if (window.__nullIds.length > 60) window.__nullIds.shift(); }
        return r;
      };
      window.__geTrap = true;
    }
    window.__nullIds.length = 0;
  `);
  try { doc.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  const nullIds = win.eval('JSON.stringify(window.__nullIds)');
  return { nullIds: JSON.parse(nullIds) };
})()
