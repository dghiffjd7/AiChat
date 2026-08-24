import { VoiceClient } from '../api/voice-client.js';
import { appConfirm } from './app-confirm.js';
import { getVoiceProviderOptions } from './voice-config-utils.js';
import { PcmStreamPlayer } from './chat/voice-interaction-runtime.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}[char]));
const trim = value => String(value ?? '').trim();
const PROFILE_SEPARATOR = '::';

const ensureStyle = (documentLike) => {
  if (!documentLike?.head || documentLike.getElementById('voice-registry-panel-style')) return;
  const style = documentLike.createElement('style');
  style.id = 'voice-registry-panel-style';
  style.textContent = `
.voice-registry-overlay{position:fixed;inset:0;z-index:24500;background:var(--app-surface-overlay);backdrop-filter:blur(7px);display:none;align-items:center;justify-content:center;padding:18px;box-sizing:border-box}
.voice-registry-overlay.is-open{display:flex}
.voice-registry-modal{width:min(720px,100%);max-height:min(820px,calc(100dvh - 36px));display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--app-border-default);border-radius:var(--app-radius-lg);background:var(--app-surface-panel);box-shadow:var(--app-shadow-md);color:var(--app-text-primary)}
.voice-registry-header,.voice-registry-footer{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:16px 18px;border-bottom:1px solid var(--app-border-subtle)}
.voice-registry-footer{border-top:1px solid var(--app-border-subtle);border-bottom:0;justify-content:flex-end}
.voice-registry-heading strong{display:block;font-size:18px}.voice-registry-heading small{display:block;margin-top:3px;color:var(--app-text-secondary)}
.voice-registry-close,.voice-registry-button{border:1px solid var(--app-border-default);border-radius:10px;background:var(--app-surface-card);color:var(--app-text-primary);cursor:pointer;padding:8px 12px;font:inherit}
.voice-registry-close{width:36px;height:36px;padding:0;font-size:22px}.voice-registry-button.is-primary{border-color:var(--app-accent-primary);background:var(--app-accent-primary);color:var(--app-text-inverse);font-weight:700}.voice-registry-button.is-danger{color:var(--app-danger-text,#b91c1c)}
.voice-registry-body{overflow:auto;padding:16px 18px}.voice-registry-toolbar{display:flex;justify-content:flex-end;margin-bottom:12px}.voice-registry-list{display:grid;gap:10px}
.voice-registry-card{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;padding:13px 14px;border:1px solid var(--app-border-default);border-radius:14px;background:var(--app-surface-card)}
.voice-registry-card.is-invalid{border-style:dashed}.voice-registry-card-title{font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.voice-registry-card-meta{margin-top:4px;color:var(--app-text-secondary);font-size:12px}.voice-registry-card-status{color:var(--app-warning-text);font-size:12px}.voice-registry-card-actions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.voice-registry-card-actions button{padding:6px 9px}
.voice-registry-empty{padding:34px 16px;text-align:center;border:1px dashed var(--app-border-default);border-radius:14px;color:var(--app-text-secondary)}
.voice-registry-editor{display:grid;gap:14px}.voice-registry-field{display:grid;gap:6px}.voice-registry-field label{font-size:13px;font-weight:750}.voice-registry-field input,.voice-registry-field select{width:100%;box-sizing:border-box;border:1px solid var(--app-border-default);border-radius:10px;background:var(--app-surface-input);color:var(--app-text-primary);padding:10px 11px;font:inherit}.voice-registry-help,.voice-registry-status{color:var(--app-text-secondary);font-size:12px;line-height:1.5}.voice-registry-status.is-error{color:var(--app-danger-text,#b91c1c)}
@media(max-width:600px){.voice-registry-overlay{padding:10px}.voice-registry-modal{max-height:calc(100dvh - 20px)}.voice-registry-card{grid-template-columns:1fr}.voice-registry-card-actions{justify-content:flex-start}}
`;
  documentLike.head.appendChild(style);
};

export const listVoiceTtsProfiles = ({ sharedManager, ttsManager } = {}) => {
  const allowed = new Set(getVoiceProviderOptions({ mode: 'split', capability: 'tts' }).map(item => item.value));
  const collect = (manager, scope, scopeLabel) => (manager?.getProfiles?.() || [])
    .filter(profile => allowed.has(trim(profile?.provider).toLowerCase()))
    .map(profile => ({
      scope,
      scopeLabel,
      profileId: trim(profile.id),
      name: trim(profile.name) || '未命名设置档',
      provider: trim(profile.provider).toLowerCase(),
      model: scope === 'voice_shared' ? trim(profile.ttsModel) : trim(profile.model),
      voiceId: trim(profile.ttsVoice),
    }))
    .filter(item => item.profileId);
  return [
    ...collect(sharedManager, 'voice_shared', '共用连接'),
    ...collect(ttsManager, 'voice_tts', 'TTS 连接'),
  ];
};

export const resolveVoiceRecordDisplayStatus = (record, { sharedManager, ttsManager } = {}) => {
  const scope = trim(record?.configRef?.scope);
  const manager = scope === 'voice_shared' ? sharedManager : scope === 'voice_tts' ? ttsManager : null;
  const profile = manager?.getProfileById?.(record?.configRef?.profileId);
  if (!profile) return { valid: false, reason: '设置档已删除', profile: null };
  if (trim(profile.provider).toLowerCase() !== trim(record?.providerSnapshot).toLowerCase()) {
    return { valid: false, reason: '设置档服务商已改变', profile };
  }
  return { valid: true, reason: '', profile };
};

export class VoiceRegistryPanel {
  constructor({
    store,
    sharedManager,
    ttsManager,
    getPreferredScope = () => 'voice_shared',
    documentLike = globalThis.document,
    toast = globalThis.window?.toastr || {},
    voiceClient = new VoiceClient(),
    playerFactory = options => new PcmStreamPlayer(options),
  } = {}) {
    this.store = store;
    this.sharedManager = sharedManager;
    this.ttsManager = ttsManager;
    this.getPreferredScope = getPreferredScope;
    this.document = documentLike;
    this.toast = toast;
    this.voiceClient = voiceClient;
    this.playerFactory = playerFactory;
    this.overlay = null;
    this.body = null;
    this.footer = null;
    this.editingId = '';
    this.previewController = null;
    this.previewPlayer = null;
    this.unsubscribe = this.store?.subscribe?.(() => this.render());
  }

  async ensureReady() {
    await Promise.all([
      this.store?.ready,
      this.sharedManager?.ensureStores?.(),
      this.ttsManager?.ensureStores?.(),
    ].filter(Boolean));
  }

  create() {
    if (this.overlay || !this.document?.body) return;
    ensureStyle(this.document);
    const overlay = this.document.createElement('div');
    overlay.className = 'voice-registry-overlay';
    overlay.innerHTML = `
      <section class="voice-registry-modal" role="dialog" aria-modal="true" aria-labelledby="voice-registry-title">
        <header class="voice-registry-header">
          <div class="voice-registry-heading"><strong id="voice-registry-title">人物声音库</strong><small>声音只引用本机 TTS 设置档，不保存 API Key</small></div>
          <button type="button" class="voice-registry-close" data-action="close" aria-label="关闭">×</button>
        </header>
        <div class="voice-registry-body"></div>
        <footer class="voice-registry-footer"></footer>
      </section>`;
    overlay.addEventListener('click', event => {
      if (event.target === overlay || event.target?.closest?.('[data-action="close"]')) this.hide();
    });
    this.document.body.appendChild(overlay);
    this.overlay = overlay;
    this.body = overlay.querySelector('.voice-registry-body');
    this.footer = overlay.querySelector('.voice-registry-footer');
  }

  async show() {
    await this.ensureReady();
    this.create();
    this.editingId = '';
    this.render();
    this.overlay?.classList?.add('is-open');
  }

  async hide() {
    await this.stopPreview();
    this.editingId = '';
    this.overlay?.classList?.remove('is-open');
  }

  render() {
    if (!this.body || !this.footer) return;
    if (this.editingId || this.editingId === '__new__') this.renderEditor();
    else this.renderList();
  }

  renderList() {
    const voices = this.store?.list?.() || [];
    this.body.innerHTML = `
      <div class="voice-registry-toolbar"><button type="button" class="voice-registry-button is-primary" data-action="add">＋ 新增声音</button></div>
      <div class="voice-registry-list">
        ${voices.length ? voices.map(record => {
          const status = resolveVoiceRecordDisplayStatus(record, {
            sharedManager: this.sharedManager,
            ttsManager: this.ttsManager,
          });
          const profileName = trim(status.profile?.name) || '未知设置档';
          return `<article class="voice-registry-card${status.valid ? '' : ' is-invalid'}" data-voice-id="${escapeHtml(record.id)}">
            <div><div class="voice-registry-card-title">${escapeHtml(record.label)}</div>
            <div class="voice-registry-card-meta">${escapeHtml(record.providerSnapshot || '未知服务商')} · ${escapeHtml(profileName)} · ${escapeHtml(record.voiceId)}</div>
            ${status.valid ? '' : `<div class="voice-registry-card-status">失效：${escapeHtml(status.reason)}</div>`}</div>
            <div class="voice-registry-card-actions">
              <button type="button" class="voice-registry-button" data-action="preview"${status.valid ? '' : ' disabled'}>试听</button>
              <button type="button" class="voice-registry-button" data-action="edit">编辑</button>
              <button type="button" class="voice-registry-button is-danger" data-action="delete">删除</button>
            </div></article>`;
        }).join('') : '<div class="voice-registry-empty">尚未建立人物声音。新增后即可绑定到联系人或创意写作角色。</div>'}
      </div>`;
    this.footer.innerHTML = '<button type="button" class="voice-registry-button" data-action="close">关闭</button>';
    this.body.querySelector('[data-action="add"]')?.addEventListener('click', () => {
      this.editingId = '__new__';
      this.render();
    });
    this.body.querySelectorAll('.voice-registry-card').forEach(card => {
      const id = trim(card.dataset.voiceId);
      card.querySelector('[data-action="edit"]')?.addEventListener('click', () => {
        this.editingId = id;
        this.render();
      });
      card.querySelector('[data-action="preview"]')?.addEventListener('click', () => void this.preview(id));
      card.querySelector('[data-action="delete"]')?.addEventListener('click', () => void this.remove(id));
    });
    this.footer.querySelector('[data-action="close"]')?.addEventListener('click', () => this.hide());
  }

  getInitialProfile(profiles) {
    const preferred = trim(this.getPreferredScope?.());
    return profiles.find(item => item.scope === preferred) || profiles[0] || null;
  }

  renderEditor() {
    const profiles = listVoiceTtsProfiles({ sharedManager: this.sharedManager, ttsManager: this.ttsManager });
    const existing = this.editingId === '__new__' ? null : this.store?.get?.(this.editingId);
    const initialProfile = existing
      ? profiles.find(item => item.scope === existing.configRef.scope && item.profileId === existing.configRef.profileId)
      : this.getInitialProfile(profiles);
    const profileValue = initialProfile ? `${initialProfile.scope}${PROFILE_SEPARATOR}${initialProfile.profileId}` : '';
    const initialVoice = trim(existing?.voiceId) || trim(initialProfile?.voiceId);
    this.body.innerHTML = `<form class="voice-registry-editor">
      <div class="voice-registry-field"><label for="voice-registry-label">显示名称</label><input id="voice-registry-label" maxlength="80" value="${escapeHtml(existing?.label || initialVoice)}" placeholder="例如：Serena／武藏"></div>
      <div class="voice-registry-field"><label for="voice-registry-profile">TTS 连线设置档</label><select id="voice-registry-profile"${profiles.length ? '' : ' disabled'}>
        ${profiles.length ? profiles.map(item => `<option value="${escapeHtml(`${item.scope}${PROFILE_SEPARATOR}${item.profileId}`)}"${`${item.scope}${PROFILE_SEPARATOR}${item.profileId}` === profileValue ? ' selected' : ''}>${escapeHtml(`${item.scopeLabel} · ${item.name} · ${item.provider}`)}</option>`).join('') : '<option value="">请先建立可用的 TTS 设置档</option>'}
      </select></div>
      <div class="voice-registry-field"><label for="voice-registry-voice-id">Voice / Speaker ID</label><input id="voice-registry-voice-id" value="${escapeHtml(initialVoice)}" placeholder="Serena、marin 或克隆音 ID"></div>
      <div class="voice-registry-field"><label for="voice-registry-model">模型覆盖（可选）</label><input id="voice-registry-model" value="${escapeHtml(existing?.modelOverride || '')}" placeholder="留空则跟随设置档"><small class="voice-registry-help">不同克隆音需要独立 TTS 模型时才填写。</small></div>
      <div class="voice-registry-status" role="status"></div>
    </form>`;
    this.footer.innerHTML = '<button type="button" class="voice-registry-button" data-action="cancel">取消</button><button type="button" class="voice-registry-button" data-action="preview-draft">试听</button><button type="button" class="voice-registry-button is-primary" data-action="save">保存</button>';
    const profileSelect = this.body.querySelector('#voice-registry-profile');
    profileSelect?.addEventListener('change', () => {
      const profile = this.resolveSelectedProfile(profiles);
      const voiceInput = this.body.querySelector('#voice-registry-voice-id');
      if (voiceInput && !trim(voiceInput.value)) voiceInput.value = profile?.voiceId || '';
    });
    this.footer.querySelector('[data-action="cancel"]')?.addEventListener('click', () => {
      this.editingId = '';
      this.render();
    });
    this.footer.querySelector('[data-action="save"]')?.addEventListener('click', () => void this.saveEditor(profiles));
    this.footer.querySelector('[data-action="preview-draft"]')?.addEventListener('click', () => void this.previewDraft(profiles));
  }

  resolveSelectedProfile(profiles) {
    const value = trim(this.body?.querySelector?.('#voice-registry-profile')?.value);
    const separator = value.indexOf(PROFILE_SEPARATOR);
    if (separator < 0) return null;
    const scope = value.slice(0, separator);
    const profileId = value.slice(separator + PROFILE_SEPARATOR.length);
    return profiles.find(item => item.scope === scope && item.profileId === profileId) || null;
  }

  readEditorRecord(profiles) {
    const profile = this.resolveSelectedProfile(profiles);
    if (!profile) throw new Error('请先选择可用的 TTS 连线设置档');
    const voiceId = trim(this.body?.querySelector?.('#voice-registry-voice-id')?.value);
    if (!voiceId) throw new Error('请填写 Voice / Speaker ID');
    return {
      id: this.editingId === '__new__' ? '' : this.editingId,
      label: trim(this.body?.querySelector?.('#voice-registry-label')?.value) || voiceId,
      configRef: { scope: profile.scope, profileId: profile.profileId },
      providerSnapshot: profile.provider,
      voiceId,
      modelOverride: trim(this.body?.querySelector?.('#voice-registry-model')?.value),
    };
  }

  setStatus(message = '', error = false) {
    const element = this.body?.querySelector?.('.voice-registry-status');
    if (!element) return;
    element.textContent = String(message || '');
    element.classList.toggle('is-error', Boolean(error));
  }

  async saveEditor(profiles) {
    try {
      const saved = await this.store?.upsert?.(this.readEditorRecord(profiles));
      this.toast?.success?.(`已保存声音「${saved?.label || ''}」`);
      this.editingId = '';
      this.render();
    } catch (error) {
      this.setStatus(error?.message || '保存失败', true);
    }
  }

  async buildConfig(record) {
    const scope = trim(record?.configRef?.scope);
    const manager = scope === 'voice_shared' ? this.sharedManager : scope === 'voice_tts' ? this.ttsManager : null;
    const runtime = await manager?.getRuntimeConfigByProfileId?.(record?.configRef?.profileId);
    if (!runtime) throw new Error('引用的 TTS 设置档不存在');
    if (trim(runtime.provider).toLowerCase() !== trim(record.providerSnapshot).toLowerCase()) {
      throw new Error('设置档服务商已改变，请重新选择');
    }
    const modelOverride = trim(record.modelOverride);
    const config = { ...runtime, ttsVoice: trim(record.voiceId) };
    if (scope === 'voice_shared') {
      config.ttsModel = modelOverride || trim(runtime.ttsModel);
      config.model = config.ttsModel;
    } else config.model = modelOverride || trim(runtime.model);
    return config;
  }

  async stopPreview() {
    this.previewController?.abort?.();
    this.previewController = null;
    await this.previewPlayer?.stop?.();
    this.previewPlayer = null;
  }

  async playRecord(record) {
    await this.stopPreview();
    const config = await this.buildConfig(record);
    const controller = new AbortController();
    const player = this.playerFactory({ sampleRate: 24000 });
    this.previewController = controller;
    this.previewPlayer = player;
    await player.start();
    try {
      for await (const bytes of this.voiceClient.streamSpeech(config, {
        text: '你好，我是 Aria。很高兴认识你。',
        signal: controller.signal,
      })) player.push(bytes);
      await player.finish();
    } finally {
      await player.stop?.();
      if (this.previewController === controller) this.previewController = null;
      if (this.previewPlayer === player) this.previewPlayer = null;
    }
  }

  async preview(id) {
    try {
      await this.playRecord(this.store?.get?.(id));
    } catch (error) {
      if (error?.name !== 'AbortError') this.toast?.error?.(error?.message || '试听失败');
    }
  }

  async previewDraft(profiles) {
    try {
      this.setStatus('正在试听…');
      await this.playRecord(this.readEditorRecord(profiles));
      this.setStatus('试听完成');
    } catch (error) {
      if (error?.name !== 'AbortError') this.setStatus(error?.message || '试听失败', true);
    }
  }

  async remove(id) {
    const record = this.store?.get?.(id);
    if (!record) return;
    const ok = await appConfirm({
      title: '删除人物声音',
      message: `删除「${record.label}」？引用此声音的角色会自动回退默认声音。`,
      danger: true,
      confirmText: '删除',
    });
    if (!ok) return;
    try {
      await this.store.remove(id);
      this.toast?.success?.('已删除声音');
    } catch (error) {
      this.toast?.error?.(error?.message || '删除声音失败');
    }
  }
}
