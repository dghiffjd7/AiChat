(async () => {
  const button = document.querySelector('[data-action="lineage-overview"]');
  button?.click?.();
  await new Promise(resolve => setTimeout(resolve, 1400));
  const graph = document.querySelector('#prompt-lineage-graph');
  const canvas = document.querySelector('#prompt-lineage-canvas');
  const firstNode = canvas?.querySelector('[data-lineage-node-id]');
  const firstEdge = canvas?.querySelector('.lineage-map-edge-group');
  const spinnerLike = Array.from(document.querySelectorAll('[class*="spin"], [class*="load"], [id*="spin"], [id*="load"]'))
    .filter(element => {
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      return style.display !== 'none' && style.visibility !== 'hidden' && rect.width > 0 && rect.height > 0;
    })
    .slice(0, 12)
    .map(element => ({ tag: element.tagName, id: element.id, className: String(element.className), rect: element.getBoundingClientRect().toJSON() }));
  const animations = document.getAnimations().map(animation => animation.animationName).filter(Boolean);
  return {
    hasButton: Boolean(button),
    hasPanel: Boolean(graph),
    visible: graph ? getComputedStyle(graph).display !== 'none' : false,
    classes: graph?.className || '',
    nodeCount: canvas?.querySelectorAll('.lineage-map-node').length || 0,
    edgeCount: canvas?.querySelectorAll('.lineage-map-edge-group').length || 0,
    hasMinimap: Boolean(document.querySelector('#prompt-lineage-minimap .lineage-minimap-svg')),
    dockCount: document.querySelectorAll('#prompt-lineage-dock [data-lineage-map-category]').length,
    search: Boolean(document.querySelector('#prompt-lineage-search')),
    zoomText: document.querySelector('#prompt-lineage-zoom-value')?.textContent || '',
    firstNodeAnimation: firstNode ? getComputedStyle(firstNode).animationName : '',
    firstEdgeAnimation: firstEdge ? getComputedStyle(firstEdge).animationName : '',
    ambientAnimations: animations.filter(name => /^lineage-/.test(name)).slice(0, 12),
    panelRect: graph ? { width: graph.clientWidth, height: graph.clientHeight } : null,
    spinnerLike,
    errors: window.__lineageProbeErrors || [],
  };
})()
