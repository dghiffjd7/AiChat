(async () => {
  const iframe = document.querySelector('iframe');
  const doc = iframe.contentDocument;
  const win = iframe.contentWindow;
  const overlay = doc.getElementById('map-management-overlay');
  const list = doc.getElementById('map-list') || doc.querySelector('[id^="map-list"]');
  const listInfo = list ? { id: list.id, children: list.children.length, text: (list.innerText || '').slice(0, 120) } : null;
  // 触发一遍流程：点选择出生地卡片
  const card = [...doc.querySelectorAll('[id$="location-btn"], .finalize-action-card')].find(el => /选择出生地/.test(el.textContent || ''));
  if (card) {
    const r = card.getBoundingClientRect();
    for (const t of ['pointerdown', 'mousedown', 'pointerup', 'mouseup', 'click']) {
      const Ev = t.startsWith('pointer') ? win.PointerEvent : win.MouseEvent;
      card.dispatchEvent(new Ev(t, { bubbles: true, cancelable: true, clientX: r.left + 10, clientY: r.top + 10, button: 0 }));
    }
  }
  await new Promise(r => setTimeout(r, 1500));
  const list2 = doc.getElementById('map-list') || doc.querySelector('[id^="map-list"]');
  const overlayVisible = overlay ? win.getComputedStyle(overlay).display : 'n/a';
  const errsNow = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').slice(-2).map(e => ({ m: (e.message || '').slice(0, 80), ex: (e.excerpt || '').slice(0, 150) }));
  return {
    cardFound: !!card, cardId: card?.id,
    overlayVisibleAfter: overlay ? win.getComputedStyle(overlay).display : 'n/a',
    listAfter: list2 ? { children: list2.children.length, text: (list2.innerText || '').slice(0, 150) } : null,
    errsNow,
  };
})()
