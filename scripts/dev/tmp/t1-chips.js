(() => {
  const chips = [...document.querySelectorAll('.agent-center-filter')].map(el => ({
    text: el.textContent.trim().slice(0, 20),
    active: el.classList.contains('is-active'),
    visible: (() => { const r = el.getBoundingClientRect(); return r.width > 0; })(),
  }));
  const items = [...document.querySelectorAll('.agent-center-item, .agent-center-run-item, [class*="agent-center"][class*="item"]')].length;
  return { chips, visibleListItems: items };
})()
