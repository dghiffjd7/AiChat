(() => {
  const chip = document.querySelector('.agent-status-chip');
  if (!chip) return { found: false };
  const mark = chip.querySelector('.agent-status-chip-mark');
  const count = chip.querySelector('.agent-status-chip-count');
  const style = getComputedStyle(mark);
  return {
    found: true,
    tone: chip.dataset.agentStatusTone,
    markText: mark?.textContent,
    markFont: style.fontFamily.slice(0, 40),
    markItalic: style.fontStyle,
    countVisible: count ? getComputedStyle(count).display !== 'none' : null,
    chipWidth: Math.round(chip.getBoundingClientRect().width),
    title: chip.title,
  };
})()
