(async () => {
  const bridge = window.appBridge;
  const scriptRuntime = bridge.getScriptRuntime?.();
  const chatStore = bridge.getChatStore?.() || window.chatStore;
  const sid = String(chatStore.getCurrent() || '');
  if (sid !== '脚本测试室') return { error: 'unexpected session ' + sid };
  window.__ps_gen = { rpc: [], toasts: [], msgCountBefore: (chatStore.getMessages(sid) || []).length };
  const origRpc = scriptRuntime.processRpc.bind(scriptRuntime);
  scriptRuntime.processRpc = async (method, params) => {
    try {
      window.__ps_gen.rpc.push({ m: String(method || ''), t: Date.now() });
      if (window.__ps_gen.rpc.length > 500) window.__ps_gen.rpc.shift();
    } catch {}
    return origRpc(method, params);
  };
  const t = window.toastr || {};
  ['warning', 'error', 'info', 'success'].forEach((k) => {
    const orig = t[k]?.bind(t);
    if (orig) t[k] = (msg, ...rest) => { window.__ps_gen.toasts.push(`${k}: ${String(msg).slice(0, 120)}`); return orig(msg, ...rest); };
  });
  const input = document.querySelector('#composer-input');
  const btn = document.querySelector('#send-button');
  input.focus();
  input.value = '三件套生成链路验证：请用一句话简短回复即可';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  btn.click();
  await new Promise(r => setTimeout(r, 800));
  return {
    sent: true,
    msgCountBefore: window.__ps_gen.msgCountBefore,
    inputCleared: input.value === '',
  };
})()
