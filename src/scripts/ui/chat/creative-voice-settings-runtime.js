const trim = value => String(value ?? '').trim();

export const normalizeCreativeVoiceSettings = (input = {}) => ({
  narrationVoiceRef: trim(input?.narrationVoiceRef),
  dialogueVoiceRef: trim(input?.dialogueVoiceRef),
});

export const buildCreativeVoiceSelectOptions = (voices = [], {
  slot = 'narration',
  selectedVoiceRef = '',
} = {}) => {
  const selected = trim(selectedVoiceRef);
  const defaultOption = slot === 'dialogue'
    ? { value: '', label: '沿用旁白声音', disabled: false }
    : { value: '', label: '默认（全局）', disabled: false };
  const options = [defaultOption];
  const seen = new Set(['']);
  (Array.isArray(voices) ? voices : []).forEach((voice) => {
    const value = trim(voice?.id);
    if (!value || seen.has(value)) return;
    seen.add(value);
    const label = trim(voice?.label) || trim(voice?.voiceId) || value;
    const meta = [trim(voice?.provider), trim(voice?.profileName)].filter(Boolean).join(' · ');
    const invalid = voice?.valid === false;
    options.push({
      value,
      label: `${label}${meta ? ` · ${meta}` : ''}${invalid ? '（失效）' : ''}`,
      disabled: false,
      invalid,
    });
  });
  if (selected && !seen.has(selected)) {
    options.push({ value: selected, label: '当前绑定（已失效）', disabled: false, invalid: true });
  }
  return options;
};

const fillSelect = (selectEl, options, selectedValue, documentLike) => {
  if (!selectEl) return;
  const doc = selectEl.ownerDocument || documentLike;
  selectEl.innerHTML = '';
  options.forEach((item) => {
    const option = doc?.createElement?.('option');
    if (!option) return;
    option.value = item.value;
    option.textContent = item.label;
    option.disabled = item.disabled === true;
    if (item.invalid) option.dataset.invalid = 'true';
    selectEl.appendChild?.(option);
  });
  selectEl.value = trim(selectedValue);
};

export const bindCreativeVoiceSettings = ({
  buttonEl = null,
  narrationSelectEl = null,
  dialogueSelectEl = null,
  readVoiceSettings = () => ({}),
  writeVoiceSettings = async () => {},
  listVoices = async () => [],
  subscribeVoices = () => () => {},
  onError = () => {},
  documentLike = globalThis.document,
} = {}) => {
  let syncVersion = 0;
  let saving = false;

  const sync = async () => {
    const version = ++syncVersion;
    const [settings, voices] = await Promise.all([
      Promise.resolve(readVoiceSettings()).then(normalizeCreativeVoiceSettings),
      Promise.resolve(listVoices()),
    ]);
    if (version !== syncVersion) return settings;
    fillSelect(narrationSelectEl, buildCreativeVoiceSelectOptions(voices, {
      slot: 'narration',
      selectedVoiceRef: settings.narrationVoiceRef,
    }), settings.narrationVoiceRef, documentLike);
    fillSelect(dialogueSelectEl, buildCreativeVoiceSelectOptions(voices, {
      slot: 'dialogue',
      selectedVoiceRef: settings.dialogueVoiceRef,
    }), settings.dialogueVoiceRef, documentLike);
    return settings;
  };

  const handleChange = async (event) => {
    if (saving) return;
    const slot = event?.currentTarget === dialogueSelectEl ? 'dialogueVoiceRef' : 'narrationVoiceRef';
    const current = normalizeCreativeVoiceSettings(readVoiceSettings());
    const next = { ...current, [slot]: trim(event?.currentTarget?.value) };
    saving = true;
    if (narrationSelectEl) narrationSelectEl.disabled = true;
    if (dialogueSelectEl) dialogueSelectEl.disabled = true;
    try {
      await writeVoiceSettings(next);
    } catch (error) {
      onError(error);
    } finally {
      saving = false;
      if (narrationSelectEl) narrationSelectEl.disabled = false;
      if (dialogueSelectEl) dialogueSelectEl.disabled = false;
      await sync();
    }
  };

  const handleOpen = () => { void sync().catch(onError); };
  buttonEl?.addEventListener?.('click', handleOpen);
  narrationSelectEl?.addEventListener?.('change', handleChange);
  dialogueSelectEl?.addEventListener?.('change', handleChange);
  const unsubscribe = subscribeVoices?.(() => { void sync().catch(onError); }) || (() => {});

  return {
    sync,
    destroy() {
      syncVersion += 1;
      buttonEl?.removeEventListener?.('click', handleOpen);
      narrationSelectEl?.removeEventListener?.('change', handleChange);
      dialogueSelectEl?.removeEventListener?.('change', handleChange);
      unsubscribe?.();
    },
  };
};
