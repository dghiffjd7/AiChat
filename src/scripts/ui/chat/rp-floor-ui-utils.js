export const createRpFloorUiRuntime = ({
  documentLike,
  getUiMode,
  getRpFloorLabel,
  buildRpFloorAssignments,
} = {}) => ({
  createFloorMarker(message, { getFloorCount, setFloorCount } = {}) {
    if (getUiMode?.() !== 'rp') return null;
    const role = message?.role;
    if (role === 'system') return null;

    let floor = null;
    if (message?.meta?.isGreeting) {
      setFloorCount?.(0);
      floor = 0;
    } else if (role === 'user') {
      const nextFloor = (Number(getFloorCount?.()) || 0) + 1;
      setFloorCount?.(nextFloor);
      floor = nextFloor;
    } else {
      const currentFloor = Number(getFloorCount?.()) || 0;
      if (!message.meta) message.meta = {};
      message.meta.floor = currentFloor;
      return null;
    }

    if (!message.meta) message.meta = {};
    message.meta.floor = floor;

    const marker = documentLike.createElement('div');
    marker.className = 'rp-floor-marker';
    marker.dataset.floor = String(floor);
    const label = documentLike.createElement('span');
    label.className = 'rp-floor-label';
    label.textContent = getRpFloorLabel?.(floor) || String(floor);
    marker.appendChild(label);
    return marker;
  },
  refreshAllFloorMarkers(scrollEl, { setFloorCount } = {}) {
    if (!scrollEl) return;
    scrollEl.querySelectorAll?.('.rp-floor-marker').forEach(element => element.remove?.());
    if (getUiMode?.() !== 'rp') return;

    const wrappers = Array.from(scrollEl.querySelectorAll?.('.QQ_chat_mymsg, .QQ_chat_charmsg') || []);
    const assignments = buildRpFloorAssignments?.(wrappers.map(wrapper => wrapper.__chatappMessage)) || [];
    let latestFloor = -1;

    wrappers.forEach((wrapper, index) => {
      const message = wrapper.__chatappMessage;
      const assignment = assignments[index] || { floor: null, marker: false };
      const floor = Number.isFinite(Number(assignment.floor)) ? Number(assignment.floor) : null;

      if (floor != null) {
        if (!message.meta) message.meta = {};
        message.meta.floor = floor;
        wrapper.dataset.rpFloor = String(floor);
        latestFloor = floor;
      } else {
        if (message?.meta && typeof message.meta === 'object') delete message.meta.floor;
        delete wrapper.dataset.rpFloor;
      }

      if (assignment.marker && floor != null && wrapper.parentNode) {
        const marker = documentLike.createElement('div');
        marker.className = 'rp-floor-marker';
        marker.dataset.floor = String(floor);
        const label = documentLike.createElement('span');
        label.className = 'rp-floor-label';
        label.textContent = getRpFloorLabel?.(floor) || String(floor);
        marker.appendChild(label);
        wrapper.parentNode.insertBefore?.(marker, wrapper);
      }
    });

    setFloorCount?.(Math.max(latestFloor, 0));
  },
});
