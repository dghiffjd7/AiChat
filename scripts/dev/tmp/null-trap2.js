(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  win.eval(`
    if (!window.__qsTrap) {
      window.__nullSel = [];
      const origQS = Document.prototype.querySelector;
      Document.prototype.querySelector = function(sel) {
        const r = origQS.call(this, sel);
        if (r === null) { window.__nullSel.push('doc:' + String(sel).slice(0, 60)); if (window.__nullSel.length > 40) window.__nullSel.shift(); }
        return r;
      };
      const origEQS = Element.prototype.querySelector;
      Element.prototype.querySelector = function(sel) {
        const r = origEQS.call(this, sel);
        if (r === null) { window.__nullSel.push('el:' + String(sel).slice(0, 60)); if (window.__nullSel.length > 40) window.__nullSel.shift(); }
        return r;
      };
      window.__qsTrap = true;
    }
    window.__nullSel.length = 0;
  `);
  try { doc.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch {}
  await new Promise(r => setTimeout(r, 2000));
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const lastStack = (errs[errs.length - 1]?.stack || '').slice(0, 300);
  return { nullSelectors: JSON.parse(win.eval('JSON.stringify(window.__nullSel)')), lastStack };
})()
