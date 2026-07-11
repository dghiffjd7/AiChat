(() => {
  const shadow = document.getElementById('chatapp-script-virtual-ui-root')?.shadowRoot;
  if (!shadow) return { err: 'no shadow' };
  const surface = shadow.querySelector('.chatapp-script-ui-surface');
  const texts = [...(surface?.querySelectorAll('*') || [])].map(el => el.textContent?.trim()).filter(t => t && t.length < 60);
  return {
    surfaceChildren: surface?.children?.length || 0,
    visibleTexts: [...new Set(texts)].slice(0, 12),
    surfaceHtmlSize: (surface?.innerHTML || '').length,
  };
})()
