(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const sid = String(chatStore.getCurrent() || '');
  if (sid !== '脚本测试室') return { error: 'unexpected session ' + sid };
  // instrument RPC + worker dispatch
  window.__ps_gen = { rpc: [], toasts: [] };
  const origRpc = scriptRuntime.processRpc.bind(scriptRuntime);
  scriptRuntime.processRpc = async (method, params) => {
    try {
      let brief = '';
      try { brief = JSON.stringify(params ?? '').slice(0, 150); } catch {}
      window.__ps_gen.rpc.push({ m: String(method || ''), b: brief, t: Date.now() });
      if (window.__ps_gen.rpc.length > 400) window.__ps_gen.rpc.shift();
    } catch {}
    return origRpc(method, params);
  };
  const t = window.toastr || {};
  ['warning', 'error', 'info', 'success'].forEach((k) => {
    const orig = t[k]?.bind(t);
    if (orig) t[k] = (msg, ...rest) => { window.__ps_gen.toasts.push(`${k}: ${String(msg).slice(0, 120)}`); return orig(msg, ...rest); };
  });
  const msgCountBefore = (chatStore.getMessages(sid) || []).length;
  window.__ps_gen.msgCountBefore = msgCountBefore;
  // real UI path: composer + send button
  const input = document.querySelector('#composer-input');
  const sendBtn = document.querySelector('#send-btn, #send_but, button[aria-label*="发送"], .send-btn');
  if (!input || !sendBtn) return { error: 'ui not found', hasInput: !!input, hasBtn: !!sendBtn };
  input.value = '三件套生成链路验证：请用一句话简短回复即可';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  sendBtn.click();
  return { sent: true, msgCountBefore };
})()
