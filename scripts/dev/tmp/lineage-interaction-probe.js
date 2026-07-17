(async () => {
  document.querySelector('[data-action="lineage-overview"]')?.click?.();
  await new Promise(resolve => setTimeout(resolve, 1200));

  const graph = document.querySelector('#prompt-lineage-graph');
  graph?.querySelector('[data-lineage-map-category="contacts"]')?.click?.();
  await new Promise(resolve => setTimeout(resolve, 900));

  const canvas = document.querySelector('#prompt-lineage-canvas');
  const item = canvas?.querySelector('.lineage-map-node.is-item[data-lineage-node-id]');
  item?.click?.();
  await new Promise(resolve => setTimeout(resolve, 1000));

  const zoomBefore = document.querySelector('#prompt-lineage-zoom-value')?.textContent || '';
  graph?.querySelector('[data-lineage-camera-action="zoom-in"]')?.click?.();
  await new Promise(resolve => setTimeout(resolve, 120));
  const zoomAfter = document.querySelector('#prompt-lineage-zoom-value')?.textContent || '';

  const edgeHit = document.querySelector('.lineage-map-link-hit');
  const edgeRect = edgeHit?.getBoundingClientRect?.();
  if (edgeHit && edgeRect) {
    edgeHit.dispatchEvent(new PointerEvent('pointermove', {
      bubbles: true,
      clientX: edgeRect.left + edgeRect.width / 2,
      clientY: edgeRect.top + edgeRect.height / 2,
    }));
  }

  const inspector = document.querySelector('#prompt-lineage-inspector');
  const selected = document.querySelector('#prompt-lineage-canvas .is-selected');
  const tooltip = document.querySelector('#prompt-lineage-edge-tooltip');
  return {
    itemClicked: item?.dataset?.lineageNodeId || '',
    expandedContacts: Boolean(graph?.querySelector('[data-lineage-map-category="contacts"][data-lineage-expanded="true"]')),
    nodeCount: document.querySelectorAll('#prompt-lineage-canvas .lineage-map-node').length,
    selectedId: selected?.getAttribute?.('data-lineage-node-id') || selected?.getAttribute?.('data-lineage-edge-id') || '',
    inspectorVisible: Boolean(inspector && !inspector.classList.contains('is-empty')),
    inspectorTitle: inspector?.querySelector('.lineage-detail-heading strong')?.textContent || '',
    relationCount: inspector?.querySelectorAll('[data-lineage-jump-node-id]').length || 0,
    zoomBefore,
    zoomAfter,
    tooltipVisible: Boolean(tooltip && !tooltip.hidden),
    tooltipText: tooltip?.textContent || '',
    minimapViewport: document.querySelector('.lineage-minimap-viewport')?.getAttribute('width') || '',
    transform: document.querySelector('#prompt-lineage-canvas')?.style?.transform || '',
  };
})()
