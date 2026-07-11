(async () => {
  const stores = window.appBridge.debugUiRegistry.stores;
  const sid = stores.chatStore.getCurrent();
  const msgs = stores.chatStore.getMessages(sid) || [];
  const first = msgs.find(m => m.role === 'assistant') || msgs[0];
  const content = String(first?.content || '');
  // 渲染层：楼层 DOM 里是转义文本还是真实节点
  const floor = document.querySelector('.rp-floor, [class*="rp-message"], [class*="message-content"]');
  const floorHtml = floor ? floor.innerHTML.slice(0, 300) : '';
  const renderedDivs = floor ? floor.querySelectorAll('div, style, details').length : 0;
  // 正则激活状态
  const regexStore = window.appBridge.getRegexStore?.();
  const state = regexStore.getState?.() || {};
  const fanren = Object.values(state?.local?.sets || {}).find(s => /凡人修仙/.test(s?.name || ''));
  const session = regexStore.getSession?.(sid);
  return {
    sid,
    msgCount: msgs.length,
    contentHead: content.slice(0, 200),
    contentHasRawHtml: /<div|<style|<details/i.test(content),
    floorHtmlHead: floorHtml,
    renderedDivs,
    fanrenSet: fanren ? { enabled: fanren.enabled, manualEnabled: fanren.manualEnabled, bind: fanren.bind, ruleCount: (fanren.rules || []).length } : null,
    sessionRegex: session ? JSON.stringify(session).slice(0, 200) : null,
  };
})()
