(async () => {
  if (!window.__blobHooked) {
    window.__blobDocs = [];
    const orig = URL.createObjectURL.bind(URL);
    URL.createObjectURL = (blob) => {
      const url = orig(blob);
      try {
        if (blob && blob.size > 100000 && /javascript|html/.test(blob.type || '')) {
          blob.text().then(t => { window.__blobDocs.push({ url, size: blob.size, type: blob.type, text: t }); if (window.__blobDocs.length > 4) window.__blobDocs.shift(); });
        }
      } catch {}
      return url;
    };
    window.__blobHooked = true;
  }
  // 触发重渲染：切会话往返
  const stores = window.appBridge.debugUiRegistry.stores;
  const ui = window.appBridge;
  const ev = new CustomEvent('regex-changed');
  window.dispatchEvent(ev);
  return { hooked: true };
})()
