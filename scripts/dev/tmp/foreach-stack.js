(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const fe = errs.filter(e => /forEach/.test(e.message || ''));
  return fe.slice(-2).map(e => ({ msg: e.message, line: e.line, stack: (e.stack || '').slice(0, 500) }));
})()
