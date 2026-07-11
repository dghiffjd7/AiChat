(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  return errs.filter(e => /addEventListener|replaceChild/.test(e.message || '')).map(e => ({
    at: e.at, msg: (e.message || '').slice(0, 70), line: e.line,
    stackFn: ((e.stack || '').match(/at (\w+)/) || [])[1] || '',
  }));
})()
