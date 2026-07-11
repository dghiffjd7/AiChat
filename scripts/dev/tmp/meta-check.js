(() => {
  const iframe = document.querySelector('iframe');
  const srcdoc = iframe?.srcdoc || '';
  const doc = iframe?.contentDocument;
  return {
    hasResizeMeta: srcdoc.includes('chatapp-resize'),
    hasHeightMeta: srcdoc.includes('chatapp-height'),
    metaInDom: !!doc?.querySelector('meta[name="chatapp-resize"]'),
    metaHeightVal: doc?.querySelector('meta[name="chatapp-height"]')?.getAttribute('content') || null,
    srcdocHead: srcdoc.slice(0, 400).replace(/\n/g, ' '),
  };
})()
