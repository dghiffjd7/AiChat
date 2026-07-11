(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const e = errs.filter(x => /addEventListener/.test(x.message || '')).slice(-1)[0] || {};
  return { line: e.line, col: e.col, metaHit: e.metaHit, excerpt: e.excerpt, label: (e.label || '').slice(0, 60) };
})()
