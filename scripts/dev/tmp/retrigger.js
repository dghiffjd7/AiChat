(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const errsBefore = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').length;
  try { doc.dispatchEvent(new win.Event('DOMContentLoaded', { bubbles: true })); } catch (e) { return { err: String(e).slice(0, 100) }; }
  await new Promise(r => setTimeout(r, 2500));
  const errsAfter = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  // 试试 WORLD_MAP_DATA 现在有没有
  let mapState = 'n/a';
  try { mapState = win.eval('typeof WORLD_MAP_DATA !== "undefined" ? Object.keys(WORLD_MAP_DATA || {}).join(",").slice(0, 80) : "undeclared"'); } catch (e) { mapState = 'ERR'; }
  return {
    newErrs: errsAfter.slice(errsBefore).map(e => (e.message || '').slice(0, 100)),
    mapState,
  };
})()
