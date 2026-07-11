(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const te = errs.filter(e => /addEventListener/.test(e.message || '')).slice(-1)[0] || {};
  return { line: te.line, col: te.col, stack: (te.stack || '').slice(0, 600) };
})()
