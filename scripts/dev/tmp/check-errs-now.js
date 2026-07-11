(() => {
  const iframe = document.querySelector('iframe');
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  const probe = JSON.parse(localStorage.getItem('__chatapp_doc_probe') || '{}');
  return {
    iframeError: (iframe.dataset.iframeError || '').slice(0, 160),
    fallback: iframe.dataset.staticFallbackApplied,
    source: iframe.dataset.iframeSource,
    latestErr: errs.length ? { at: errs[errs.length-1].at, msg: errs[errs.length-1].message, line: errs[errs.length-1].line, excerpt: (errs[errs.length-1].excerpt || '').slice(0, 200) } : null,
    probeCtx: (probe.ctx || '').slice(60, 200),
    probeAt: probe.at,
  };
})()
