const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const trim = value => String(value ?? '').trim();

const ensureStyle = (documentLike) => {
  if (!documentLike?.head || documentLike.getElementById('voice-picker-modal-style')) return;
  const style = documentLike.createElement('style');
  style.id = 'voice-picker-modal-style';
  style.textContent = `
.voice-picker-overlay{position:fixed;inset:0;z-index:24700;display:flex;align-items:center;justify-content:center;padding:16px;box-sizing:border-box;background:var(--app-surface-overlay);backdrop-filter:blur(7px)}
.voice-picker-modal{width:min(460px,100%);max-height:min(680px,calc(100dvh - 32px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--app-border-default);border-radius:var(--app-radius-lg);background:var(--app-surface-panel);box-shadow:var(--app-shadow-md);color:var(--app-text-primary)}
.voice-picker-header{display:flex;align-items:center;justify-content:space-between;padding:15px 17px;border-bottom:1px solid var(--app-border-subtle)}.voice-picker-header strong{font-size:17px}.voice-picker-close{width:34px;height:34px;border:0;border-radius:10px;background:var(--app-surface-subtle);color:var(--app-text-primary);font-size:21px;cursor:pointer}
.voice-picker-list{display:grid;gap:8px;overflow:auto;padding:14px 16px}.voice-picker-option{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;padding:11px 12px;border:1px solid var(--app-border-default);border-radius:13px;background:var(--app-surface-card);cursor:pointer}.voice-picker-option:has(input:checked){border-color:var(--app-accent-primary);box-shadow:0 0 0 2px color-mix(in srgb,var(--app-accent-primary) 15%,transparent)}.voice-picker-option input{accent-color:var(--app-accent-primary)}.voice-picker-option-title{font-weight:750}.voice-picker-option-meta{margin-top:3px;color:var(--app-text-secondary);font-size:12px}.voice-picker-option.is-invalid{opacity:.72;border-style:dashed}
.voice-picker-persist{display:flex;align-items:center;gap:9px;margin:0 16px 12px;padding:10px 12px;border-radius:12px;background:var(--app-surface-subtle);font-size:13px}.voice-picker-persist input{accent-color:var(--app-accent-primary)}
.voice-picker-footer{display:flex;justify-content:flex-end;gap:8px;padding:13px 16px;border-top:1px solid var(--app-border-subtle)}.voice-picker-footer button{border:1px solid var(--app-border-default);border-radius:10px;padding:8px 14px;background:var(--app-surface-card);color:var(--app-text-primary);font:inherit;cursor:pointer}.voice-picker-footer .is-primary{border-color:var(--app-accent-primary);background:var(--app-accent-primary);color:var(--app-text-inverse);font-weight:700}
`;
  documentLike.head.appendChild(style);
};

export class VoicePickerModal {
  constructor({
    store,
    describeRecord = () => ({ valid: true, profileName: '' }),
    ensureReady = async () => {},
    documentLike = globalThis.document,
  } = {}) {
    this.store = store;
    this.describeRecord = describeRecord;
    this.ensureReady = ensureReady;
    this.document = documentLike;
    this.overlay = null;
    this.resolveResult = null;
  }

  close(result = null) {
    this.overlay?.remove?.();
    this.overlay = null;
    const resolve = this.resolveResult;
    this.resolveResult = null;
    resolve?.(result);
  }

  async show({
    title = '选择声音',
    selectedVoiceRef = '',
    allowPersist = false,
    persistDefault = true,
  } = {}) {
    await Promise.all([this.store?.ready, this.ensureReady?.()].filter(Boolean));
    if (this.resolveResult) this.close(null);
    ensureStyle(this.document);
    const voices = this.store?.list?.() || [];
    const selected = trim(selectedVoiceRef);
    const missingSelected = selected && !voices.some(record => record.id === selected);
    const options = [
      { id: '', label: '默认（全局）', meta: '使用语音设置页目前的默认声音', valid: true },
      ...voices.map(record => {
        const status = this.describeRecord(record) || {};
        return {
          id: record.id,
          label: record.label,
          meta: status.valid === false
            ? `失效 · ${status.reason || '设置档不可用'}`
            : `${record.providerSnapshot || '未知服务商'}${status.profileName ? ` · ${status.profileName}` : ''} · ${record.voiceId}`,
          valid: status.valid !== false,
        };
      }),
      ...(missingSelected ? [{ id: selected, label: '当前绑定（已失效）', meta: '保存后会继续回退全局声音', valid: false }] : []),
    ];
    const overlay = this.document.createElement('div');
    overlay.className = 'voice-picker-overlay';
    overlay.innerHTML = `<section class="voice-picker-modal" role="dialog" aria-modal="true" aria-labelledby="voice-picker-title">
      <header class="voice-picker-header"><strong id="voice-picker-title">${escapeHtml(title)}</strong><button type="button" class="voice-picker-close" data-action="cancel" aria-label="关闭">×</button></header>
      <div class="voice-picker-list">${options.map(option => `<label class="voice-picker-option${option.valid ? '' : ' is-invalid'}">
        <input type="radio" name="voice-picker-value" value="${escapeHtml(option.id)}"${option.id === selected ? ' checked' : ''}>
        <span><span class="voice-picker-option-title">${escapeHtml(option.label)}</span><span class="voice-picker-option-meta">${escapeHtml(option.meta)}</span></span>
      </label>`).join('')}</div>
      ${allowPersist ? `<label class="voice-picker-persist"><input type="checkbox" data-role="persist"${persistDefault ? ' checked' : ''}><span>设为该角色默认声音</span></label>` : ''}
      <footer class="voice-picker-footer"><button type="button" data-action="cancel">取消</button><button type="button" class="is-primary" data-action="confirm">确定</button></footer>
    </section>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target?.closest?.('[data-action="cancel"]')) this.close(null);
    });
    overlay.querySelector('[data-action="confirm"]')?.addEventListener('click', () => {
      const input = overlay.querySelector('input[name="voice-picker-value"]:checked');
      this.close({
        voiceRef: trim(input?.value),
        setDefault: allowPersist && overlay.querySelector('[data-role="persist"]')?.checked === true,
      });
    });
    this.document.body.appendChild(overlay);
    this.overlay = overlay;
    return new Promise(resolve => { this.resolveResult = resolve; });
  }
}
