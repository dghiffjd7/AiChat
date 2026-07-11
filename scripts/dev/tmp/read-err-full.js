(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const e = errs[errs.length - 1] || {};
  return { line: e.line, col: e.col, excerpt: e.excerpt, label: (e.label || '').slice(0, 80) };
})()
