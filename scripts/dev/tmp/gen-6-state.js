(() => {
  const sendBtn = document.querySelector('button.is-generating');
  const reg = window.appBridge?.debugUiRegistry;
  const probe = window.__maidModelProbe;
  return {
    generating: !!sendBtn,
    lastReqCaptured: (window.__lastReqMessages || []).length,
    typingVisible: !!document.querySelector('.typing-indicator, [class*="typing"]'),
    consoleErrs: (window.__scriptAuditLog || []).length,
  };
})()
