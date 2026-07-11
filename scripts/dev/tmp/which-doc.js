(() => {
  const iframe = document.querySelector('iframe');
  const srcdoc = iframe.srcdoc || '';
  return {
    srcdocLen: srcdoc.length,
    hasScriptTag: /<script/i.test(srcdoc),
    hasSeed: srcdoc.includes('CHATAPP_SEED_MESSAGES'),
    allowScriptsAttr: iframe.dataset.iframeAllowScripts,
    execution: iframe.closest('.chat-codeblock')?.dataset?.richRenderExecution,
    deferred: iframe.closest('.chat-codeblock')?.dataset?.richRenderDeferred,
    iframeKeys: Object.keys(iframe.dataset),
  };
})()
