export const CREATIVE_READING_SIZES = Object.freeze(['compact', 'standard', 'relaxed']);
export const CREATIVE_NARRATIVE_FONTS = Object.freeze(['serif', 'sans']);

export const normalizeCreativeReadingSize = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CREATIVE_READING_SIZES.includes(normalized) ? normalized : 'standard';
};

export const normalizeCreativeNarrativeFont = (value = '') => {
  const normalized = String(value || '').trim().toLowerCase();
  return CREATIVE_NARRATIVE_FONTS.includes(normalized) ? normalized : 'serif';
};

export const normalizeCreativeDialogueHighlight = value => value !== false;

export const applyCreativeReadingSize = ({
  bodyEl = null,
  menuEl = null,
  optionButtons = [],
  value = 'standard',
} = {}) => {
  const normalized = normalizeCreativeReadingSize(value);
  if (bodyEl?.dataset) bodyEl.dataset.rpReadingSize = normalized;
  if (menuEl?.dataset) menuEl.dataset.rpReadingSize = normalized;
  optionButtons.forEach((button) => {
    const active = normalizeCreativeReadingSize(button?.dataset?.rpReadingSize) === normalized;
    button?.classList?.toggle?.('is-active', active);
    button?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
  });
  return normalized;
};

export const applyCreativeNarrativeFont = ({
  bodyEl = null,
  menuEl = null,
  optionButtons = [],
  value = 'serif',
} = {}) => {
  const normalized = normalizeCreativeNarrativeFont(value);
  if (bodyEl?.dataset) bodyEl.dataset.rpNarrativeFont = normalized;
  if (menuEl?.dataset) menuEl.dataset.rpNarrativeFont = normalized;
  optionButtons.forEach((button) => {
    const active = normalizeCreativeNarrativeFont(button?.dataset?.rpNarrativeFont) === normalized;
    button?.classList?.toggle?.('is-active', active);
    button?.setAttribute?.('aria-pressed', active ? 'true' : 'false');
  });
  return normalized;
};

export const applyCreativeDialogueHighlight = ({
  bodyEl = null,
  menuEl = null,
  toggleEl = null,
  value = true,
} = {}) => {
  const enabled = normalizeCreativeDialogueHighlight(value);
  if (bodyEl?.dataset) bodyEl.dataset.rpDialogueHighlight = enabled ? 'on' : 'off';
  if (menuEl?.dataset) menuEl.dataset.rpDialogueHighlight = enabled ? 'on' : 'off';
  if (toggleEl) toggleEl.checked = enabled;
  return enabled;
};

export const bindCreativeReadingSettings = ({
  bodyEl = null,
  buttonEl = null,
  menuEl = null,
  readSetting = () => 'standard',
  writeSetting = () => {},
  readNarrativeFont = () => 'serif',
  writeNarrativeFont = () => {},
  readDialogueHighlight = () => true,
  writeDialogueHighlight = () => {},
  onDialogueHighlightChanged = () => {},
  toggleSheetAt = () => {},
} = {}) => {
  const optionButtons = Array.from(menuEl?.querySelectorAll?.('[data-rp-reading-size]') || []);
  const fontOptionButtons = Array.from(menuEl?.querySelectorAll?.('[data-rp-narrative-font]') || []);
  const dialogueHighlightToggle = menuEl?.querySelector?.('[data-rp-dialogue-highlight]') || null;
  const sync = (value = readSetting()) => applyCreativeReadingSize({
    bodyEl,
    menuEl,
    optionButtons,
    value,
  });
  const syncNarrativeFont = (value = readNarrativeFont()) => applyCreativeNarrativeFont({
    bodyEl,
    menuEl,
    optionButtons: fontOptionButtons,
    value,
  });
  const syncDialogueHighlight = (value = readDialogueHighlight()) => applyCreativeDialogueHighlight({
    bodyEl,
    menuEl,
    toggleEl: dialogueHighlightToggle,
    value,
  });

  const handleButtonClick = (event) => {
    event.stopPropagation?.();
    toggleSheetAt(menuEl, event.currentTarget || buttonEl, {
      alignRight: true,
      kind: 'reading',
    });
    buttonEl?.classList?.toggle?.('is-active', !menuEl?.classList?.contains?.('hidden'));
  };

  const handleMenuClick = (event) => {
    event.stopPropagation?.();
    const option = event.target?.closest?.('button[data-rp-reading-size]');
    if (option) {
      const normalized = sync(option.dataset.rpReadingSize);
      writeSetting(normalized);
      return;
    }
    const fontOption = event.target?.closest?.('button[data-rp-narrative-font]');
    if (!fontOption) return;
    const normalized = syncNarrativeFont(fontOption.dataset.rpNarrativeFont);
    writeNarrativeFont(normalized);
  };

  const handleDialogueHighlightChange = (event) => {
    const enabled = syncDialogueHighlight(event?.currentTarget?.checked !== false);
    writeDialogueHighlight(enabled);
    onDialogueHighlightChanged(enabled);
  };

  buttonEl?.addEventListener?.('click', handleButtonClick);
  menuEl?.addEventListener?.('click', handleMenuClick);
  dialogueHighlightToggle?.addEventListener?.('change', handleDialogueHighlightChange);
  sync();
  syncNarrativeFont();
  syncDialogueHighlight();

  return {
    sync,
    syncNarrativeFont,
    syncDialogueHighlight,
    destroy() {
      buttonEl?.removeEventListener?.('click', handleButtonClick);
      menuEl?.removeEventListener?.('click', handleMenuClick);
      dialogueHighlightToggle?.removeEventListener?.('change', handleDialogueHighlightChange);
    },
  };
};
