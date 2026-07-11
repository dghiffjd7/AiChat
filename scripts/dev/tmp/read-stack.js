(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const e = errs[errs.length - 1] || {};
  return { msg: e.message, stack: e.stack };
})()
