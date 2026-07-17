(() => {
  const inspector = document.querySelector('#prompt-lineage-inspector');
  const panel = inspector?.querySelector('.lineage-map-detail-card');
  const panelRect = panel?.getBoundingClientRect();
  const overflow = panel && panelRect
    ? Array.from(panel.querySelectorAll('*')).map(element => {
      const rect = element.getBoundingClientRect();
      return {
        tag: element.tagName,
        className: String(element.className || ''),
        left: Math.round(rect.left * 10) / 10,
        right: Math.round(rect.right * 10) / 10,
        width: Math.round(rect.width * 10) / 10,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    }).filter(item => item.right > panelRect.right + 0.5 || item.left < panelRect.left - 0.5 || item.scrollWidth > item.clientWidth + 1)
    : [];
  return {
    inspector: inspector ? { clientWidth: inspector.clientWidth, scrollWidth: inspector.scrollWidth } : null,
    panel: panel ? { clientWidth: panel.clientWidth, scrollWidth: panel.scrollWidth, left: panelRect.left, right: panelRect.right } : null,
    overflow,
    atRing: document.elementsFromPoint(1088, 251).slice(0, 8).map(element => ({ tag: element.tagName, id: element.id, className: String(element.className || '') })),
  };
})()
