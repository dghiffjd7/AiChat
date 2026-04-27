import { PresetStore } from '../storage/preset-store.js';
import { getReasoningCapability } from '../api/model-capabilities.js';
import { logger } from '../utils/logger.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;',
})[ch] || ch);

const SC_PANEL_CSS = `
.pp-binding-stack { display:block; }
.pp-binding-stack > * + * { margin-top:12px; }
.pp-binding-card {
    border:1px solid var(--app-border-default); border-radius:16px;
    background:var(--app-surface-card); box-shadow:0 4px 18px rgba(15,23,42,0.04); padding:12px;
}
.pp-binding-card-head { display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.pp-binding-card-title { font-size:14px; font-weight:800; color:var(--app-text-primary); line-height:1.35; }
.pp-binding-card-sub { margin-top:4px; font-size:12px; color:var(--app-text-muted); line-height:1.5; }
.pp-binding-btn {
    appearance:none; -webkit-appearance:none; min-height:34px; padding:8px 12px;
    border-radius:10px; border:1px solid #dbe2ea; background:var(--app-surface-card);
    color:var(--app-text-secondary); font-size:12px; font-weight:700; cursor:pointer;
}
.pp-binding-btn.is-primary { background:#eff6ff; border-color:#bfdbfe; color:#1d4ed8; }
.pp-binding-btn.is-muted { background:var(--app-surface-subtle); color:var(--app-text-muted); }
.pp-binding-btn:disabled { opacity:0.45; cursor:not-allowed; }
.pp-binding-list { margin-top:10px; }
.pp-binding-list > * + * { margin-top:8px; }
.pp-binding-item {
    border:1px solid var(--app-border-default); border-radius:14px;
    background:var(--app-surface-subtle); padding:10px 12px;
    display:flex; align-items:center; justify-content:space-between; gap:10px;
}
.pp-binding-item-main { min-width:0; display:flex; flex-direction:column; gap:4px; }
.pp-binding-item-title {
    font-size:13px; font-weight:700; color:var(--app-text-primary);
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.pp-binding-item-sub {
    font-size:12px; color:var(--app-text-muted); line-height:1.45;
    white-space:nowrap; overflow:hidden; text-overflow:ellipsis;
}
.pp-binding-empty {
    padding:12px; border:1px dashed var(--app-border-strong); border-radius:14px;
    background:var(--app-surface-subtle); font-size:12px; color:var(--app-text-muted); line-height:1.5;
}
.pp-binding-filter {
    display:block; width:100%; box-sizing:border-box; margin-top:10px;
    padding:8px 10px; border:1px solid var(--app-border-default); border-radius:10px;
    background:var(--app-surface-subtle); color:var(--app-text-primary);
    font-size:13px; outline:none;
}
.pp-binding-filter::placeholder { color:var(--app-text-muted); }
.pp-binding-filter:focus { border-color:var(--app-accent-primary); }
`;

export class SessionConfigPanel {
    constructor() {
        this.store = window.appBridge?.presets || new PresetStore();
        this.overlay = null;
        this.panel = null;
        this.scrollEl = null;
        this.editorEl = null;
        this.focusSessionId = null;
        this.runtimeContext = {
            chatStore: null,
            contactsStore: null,
            personaStore: null,
            getUiMode: null,
        };
        this.customSelectMenuEl = null;
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
    }

    setRuntimeContext(ctx = {}) {
        if (ctx.chatStore) this.runtimeContext.chatStore = ctx.chatStore;
        if (ctx.contactsStore) this.runtimeContext.contactsStore = ctx.contactsStore;
        if (ctx.personaStore) this.runtimeContext.personaStore = ctx.personaStore;
        if (typeof ctx.getUiMode === 'function') this.runtimeContext.getUiMode = ctx.getUiMode;
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'session-config-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.id = 'session-config-panel';
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            bottom: calc(10px + env(safe-area-inset-bottom, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            box-sizing: border-box;
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 21000; flex-direction: column; overflow: hidden;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <style>${SC_PANEL_CSS}</style>
            <div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-bottom:1px solid var(--app-border-default);">
                <div style="min-width:0; flex:1;">
                    <div style="font-size:16px; font-weight:800; color:var(--app-text-primary);">会话配置管理</div>
                    <div style="font-size:12px; color:var(--app-text-muted); margin-top:2px;">为各会话设定预设、连线配置与推理覆盖</div>
                </div>
                <button id="sc-close" style="border:none; background:none; font-size:22px; color:var(--app-text-muted); cursor:pointer; padding:4px 8px; line-height:1;">&times;</button>
            </div>
            <div id="sc-scroll" style="flex:1; min-height:0; overflow-y:auto; -webkit-overflow-scrolling:touch; padding:12px 14px 24px;">
                <div id="sc-editor"></div>
            </div>
        `;

        this.panel.querySelector('#sc-close').addEventListener('click', () => this.hide());
        this.scrollEl = this.panel.querySelector('#sc-scroll');
        this.editorEl = this.panel.querySelector('#sc-editor');

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
    }

    show(options = {}) {
        if (!this.panel) this.createUI();
        this.focusSessionId = options.sessionId || null;
        this.render();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';

        if (this.focusSessionId) {
            requestAnimationFrame(() => {
                const el = this.editorEl.querySelector(`[data-session-id="${this.focusSessionId}"]`);
                if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
            });
        }
    }

    hide() {
        this.closeCustomSelectMenu();
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    /* ── data ── */

    getSessionEntries() {
        const { chatStore, contactsStore, personaStore } = this.runtimeContext;
        const sessionIds = Array.isArray(chatStore?.listSessions?.()) ? chatStore.listSessions() : [];
        return sessionIds.map((sid) => {
            const sessionId = String(sid || '').trim();
            if (!sessionId) return null;
            const isRp = sessionId.startsWith('rp:');
            const contact = contactsStore?.getContact?.(sessionId) || null;
            const personaId = isRp ? sessionId.slice(3) : '';
            const persona = personaId ? personaStore?.get?.(personaId) : null;
            const name = isRp
                ? String(persona?.name || persona?.title || personaId || sessionId).trim() || sessionId
                : String(contact?.name || sessionId).trim() || sessionId;
            const meta = isRp ? '创意写作' : (contact?.isGroup ? '群聊' : '聊天室');
            return { id: sessionId, name, meta, group: isRp ? 'rp' : 'chat' };
        }).filter(Boolean);
    }

    getProfiles() {
        return window.appBridge?.config?.getProfiles?.() || [];
    }

    getPresetList() {
        const presets = Object.values(this.store.getState()?.presets?.openai || {});
        return presets.map((p) => ({ value: p.id || '', label: p.name || p.id || '' }));
    }

    getPresetName(presetId) {
        const p = this.store.getState()?.presets?.openai?.[presetId];
        return String(p?.name || '').trim() || presetId || '';
    }

    /* ── render ── */

    render() {
        this.editorEl.innerHTML = '';
        const wrap = document.createElement('div');
        wrap.className = 'pp-binding-stack';

        const profiles = this.getProfiles();
        const presetList = this.getPresetList();

        this.renderModeCard(wrap, 'chat', '聊天默认', profiles, presetList);
        this.renderModeCard(wrap, 'rp', '创意写作默认', profiles, presetList);
        this.renderSessionGroup(wrap, 'chat', '聊天对话会话', '还没有聊天室或群聊。', profiles, presetList);
        this.renderSessionGroup(wrap, 'rp', '创意写作会话', '还没有创意写作会话。', profiles, presetList);

        this.editorEl.appendChild(wrap);
    }

    renderModeCard(wrap, mode, title, profiles, presetList) {
        const card = document.createElement('div');
        card.className = 'pp-binding-card';

        const head = document.createElement('div');
        head.className = 'pp-binding-card-head';
        head.innerHTML = `<div>
            <div class="pp-binding-card-title">${escapeHtml(title)}</div>
            <div class="pp-binding-card-sub">未在会话级覆盖时，此模式下所有会话使用此配置。</div>
        </div>`;
        card.appendChild(head);

        const itemWrap = document.createElement('div');
        itemWrap.style.cssText = 'margin-top:10px; border:1px solid var(--app-border-default); border-radius:14px; background:var(--app-surface-subtle); overflow:hidden;';

        const boundPresetId = this.store.getModeBindingId('openai', mode) || '';
        const globalPresetId = this.store.getActiveId('openai');
        const presetOptions = [{ value: '', label: '跟随全局' }, ...presetList];
        const presetSub = boundPresetId
            ? `已绑定：${this.getPresetName(boundPresetId)}`
            : `跟随全局${globalPresetId ? `（${this.getPresetName(globalPresetId)}）` : ''}`;

        const row = document.createElement('div');
        row.className = 'pp-binding-item';
        row.innerHTML = `
            <div class="pp-binding-item-main">
                <div class="pp-binding-item-title">预设</div>
                <div class="pp-binding-item-sub">${escapeHtml(presetSub)}</div>
            </div>
        `;
        const presetBtn = document.createElement('button');
        presetBtn.type = 'button';
        presetBtn.className = `pp-binding-btn ${boundPresetId ? 'is-muted' : 'is-primary'}`;
        presetBtn.textContent = boundPresetId ? '更改预设' : '绑定预设';
        presetBtn.addEventListener('click', () => {
            this.openSelectMenu(presetBtn, presetOptions, boundPresetId, (val) => {
                this.runTask(() => val
                    ? this.store.setModeBinding('openai', mode, val)
                    : this.store.clearModeBinding('openai', mode));
            });
        });
        row.appendChild(presetBtn);
        itemWrap.appendChild(row);

        const extras = document.createElement('div');
        extras.style.cssText = 'padding:8px 12px 10px; border-top:1px dashed var(--app-border-default); display:flex; flex-direction:column; gap:8px;';
        this.renderProfileRow(extras, profiles, {
            getId: () => this.store.getModeProfileId('openai', mode) || '',
            onSelect: (val) => val
                ? this.store.setModeProfile('openai', mode, val)
                : this.store.clearModeProfile('openai', mode),
        });

        const currentProfileId = this.store.getModeProfileId('openai', mode) || '';
        if (currentProfileId) {
            this.renderReasoningControls(extras, currentProfileId, {
                uiMode: mode,
                getReasoning: () => this.store.getModeReasoning('openai', mode),
                setReasoning: (r) => this.store.setModeReasoning('openai', mode, r),
                clearReasoning: () => this.store.clearModeReasoning('openai', mode),
            });
        }

        itemWrap.appendChild(extras);
        card.appendChild(itemWrap);
        wrap.appendChild(card);
    }

    renderSessionGroup(wrap, group, title, emptyText, profiles, presetList) {
        const card = document.createElement('div');
        card.className = 'pp-binding-card';

        const head = document.createElement('div');
        head.className = 'pp-binding-card-head';
        head.innerHTML = `<div>
            <div class="pp-binding-card-title">${escapeHtml(title)}</div>
            <div class="pp-binding-card-sub">会话级绑定优先于模式默认；不设置时会继续回退。</div>
        </div>`;
        card.appendChild(head);

        const entries = this.getSessionEntries().filter((e) => e.group === group);
        if (!entries.length) {
            const empty = document.createElement('div');
            empty.className = 'pp-binding-empty';
            empty.textContent = emptyText;
            card.appendChild(empty);
            wrap.appendChild(card);
            return;
        }

        const list = document.createElement('div');
        list.className = 'pp-binding-list';
        list.style.cssText = 'max-height:45vh; overflow-y:auto; -webkit-overflow-scrolling:touch; overscroll-behavior:contain;';
        entries.forEach((entry) => this.renderSessionItem(list, entry, profiles, presetList));
        card.appendChild(list);
        wrap.appendChild(card);
    }

    renderSessionItem(list, entry, profiles, presetList) {
        const itemWrap = document.createElement('div');
        itemWrap.dataset.sessionId = entry.id;
        itemWrap.style.cssText = 'border:1px solid var(--app-border-default); border-radius:14px; background:var(--app-surface-subtle); overflow:hidden;';

        const boundPresetId = this.store.getSessionBindingId('openai', entry.id) || '';
        const resolved = this.store.getResolvedActive('openai', {
            sessionId: entry.id,
            uiMode: entry.group === 'rp' ? 'rp' : 'chat',
        });
        const resolvedName = String(resolved?.preset?.name || '').trim();
        const subtitle = boundPresetId
            ? `${entry.meta} · 已绑定：${this.getPresetName(boundPresetId)}`
            : `${entry.meta} · 当前使用：${resolvedName || '未设置'}`;

        const presetOptions = [{ value: '', label: '跟随默认' }, ...presetList];

        const row = document.createElement('div');
        row.className = 'pp-binding-item';
        row.innerHTML = `
            <div class="pp-binding-item-main">
                <div class="pp-binding-item-title">${escapeHtml(entry.name)}</div>
                <div class="pp-binding-item-sub">${escapeHtml(subtitle)}</div>
            </div>
        `;
        const presetBtn = document.createElement('button');
        presetBtn.type = 'button';
        presetBtn.className = `pp-binding-btn ${boundPresetId ? 'is-muted' : 'is-primary'}`;
        presetBtn.textContent = boundPresetId ? '更改预设' : '绑定预设';
        presetBtn.addEventListener('click', () => {
            this.openSelectMenu(presetBtn, presetOptions, boundPresetId, (val) => {
                this.runTask(() => val
                    ? this.store.setSessionBinding('openai', entry.id, val)
                    : this.store.clearSessionBinding('openai', entry.id));
            });
        });
        row.appendChild(presetBtn);
        itemWrap.appendChild(row);

        const extras = document.createElement('div');
        extras.style.cssText = 'padding:8px 12px 10px; border-top:1px dashed var(--app-border-default); display:flex; flex-direction:column; gap:8px;';

        this.renderProfileRow(extras, profiles, {
            getId: () => this.store.getSessionProfileId('openai', entry.id) || '',
            onSelect: (val) => val
                ? this.store.setSessionProfile('openai', entry.id, val)
                : this.store.clearSessionProfile('openai', entry.id),
        });

        const currentProfileId = this.store.getSessionProfileId('openai', entry.id) || '';
        if (currentProfileId) {
            this.renderReasoningControls(extras, currentProfileId, {
                sessionId: entry.id,
                uiMode: entry.group === 'rp' ? 'rp' : 'chat',
                getReasoning: () => this.store.getSessionReasoning('openai', entry.id),
                setReasoning: (r) => this.store.setSessionReasoning('openai', entry.id, r),
                clearReasoning: () => this.store.clearSessionReasoning('openai', entry.id),
            });
        }

        itemWrap.appendChild(extras);
        list.appendChild(itemWrap);
    }

    /* ── shared field renderers ── */

    renderProfileRow(container, profiles, { getId, onSelect }) {
        const currentProfileId = getId();
        const profileOptions = [
            { value: '', label: '跟随全局' },
            ...profiles.map((p) => ({ value: p.id, label: p.name || p.id })),
        ];
        const profileCurrent = profileOptions.find((o) => o.value === currentProfileId) || profileOptions[0];

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const label = document.createElement('span');
        label.style.cssText = 'font-size:12px; color:var(--app-text-muted); white-space:nowrap; flex-shrink:0;';
        label.textContent = '连线配置';
        row.appendChild(label);

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-app-select-btn';
        btn.style.cssText = 'flex:1; min-width:0; min-height:32px; padding:5px 10px; font-size:12px;';
        btn.innerHTML = `
            <span class="pp-custom-select-label">${escapeHtml(profileCurrent.label)}</span>
            <span class="world-app-select-btn-chevron">▾</span>
        `;
        btn.addEventListener('click', () => {
            this.openSelectMenu(btn, profileOptions, currentProfileId, (val) => {
                this.runTask(() => onSelect(val));
            });
        });
        row.appendChild(btn);
        container.appendChild(row);
    }

    renderReasoningControls(container, profileId, ctx) {
        const profile = window.appBridge?.config?.getProfileById?.(profileId);
        if (!profile) return;
        const cap = getReasoningCapability({ provider: profile.provider, model: profile.model });
        if (!cap.supported || !cap.requestControl) return;

        const resolveCtx = {};
        if (ctx.sessionId) resolveCtx.sessionId = ctx.sessionId;
        if (ctx.uiMode) resolveCtx.uiMode = ctx.uiMode;
        const resolvedPreset = this.store.getResolvedActive('openai', resolveCtx)?.preset || {};
        const globalEnabled = resolvedPreset.request_reasoning === true;
        const currentR = ctx.getReasoning();

        const row = document.createElement('div');
        row.style.cssText = 'display:flex; align-items:center; gap:8px;';
        const rl = document.createElement('span');
        rl.style.cssText = 'font-size:12px; color:var(--app-text-muted); white-space:nowrap; flex-shrink:0;';
        rl.textContent = '推理请求';
        row.appendChild(rl);

        const controlWrap = document.createElement('div');
        controlWrap.style.cssText = 'flex:1; display:flex; align-items:center; gap:8px;';

        if (!globalEnabled) {
            const cbLabel = document.createElement('label');
            cbLabel.style.cssText = 'display:flex; align-items:center; gap:6px; font-size:12px; color:var(--app-text-primary); cursor:pointer;';
            const cb = document.createElement('input');
            cb.type = 'checkbox';
            cb.checked = currentR?.request_reasoning === true;
            cbLabel.appendChild(cb);
            cbLabel.appendChild(document.createTextNode('启用'));
            controlWrap.appendChild(cbLabel);

            if (cap.effortControl && currentR?.request_reasoning === true) {
                this.appendEffortButton(controlWrap, cap, currentR?.reasoning_effort || 'high', (v) =>
                    ctx.setReasoning({ request_reasoning: true, reasoning_effort: v }));
            }

            cb.addEventListener('change', () => {
                this.runTask(() => cb.checked
                    ? ctx.setReasoning({ request_reasoning: true, reasoning_effort: currentR?.reasoning_effort || 'high' })
                    : ctx.clearReasoning());
            });
        } else if (cap.effortControl) {
            const effortVal = currentR?.reasoning_effort || resolvedPreset.reasoning_effort || 'high';
            this.appendEffortButton(controlWrap, cap, effortVal, (v) =>
                ctx.setReasoning({ request_reasoning: true, reasoning_effort: v }));

            if (currentR) {
                const resetBtn = document.createElement('button');
                resetBtn.type = 'button';
                resetBtn.className = 'pp-binding-btn is-muted';
                resetBtn.style.cssText = 'padding:3px 8px; min-height:26px; font-size:11px;';
                resetBtn.textContent = '重置';
                resetBtn.addEventListener('click', () => {
                    this.runTask(() => ctx.clearReasoning());
                });
                controlWrap.appendChild(resetBtn);
            }
        }

        row.appendChild(controlWrap);
        container.appendChild(row);
    }

    appendEffortButton(container, cap, effortVal, onEffortChange) {
        const effortOptions = cap.effortOptions.map((o) => ({ value: o.value, label: o.label }));
        const effortCur = effortOptions.find((o) => o.value === effortVal) || effortOptions[0];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'world-app-select-btn';
        btn.style.cssText = 'flex:1; min-width:0; min-height:28px; padding:4px 10px; font-size:12px;';
        btn.innerHTML = `
            <span class="pp-custom-select-label">${escapeHtml(effortCur?.label || effortVal)}</span>
            <span class="world-app-select-btn-chevron">▾</span>
        `;
        btn.addEventListener('click', () => {
            this.openSelectMenu(btn, effortOptions, effortVal, (v) => {
                this.runTask(() => onEffortChange(v));
            });
        });
        container.appendChild(btn);
    }

    /* ── task ── */

    async runTask(fn) {
        try {
            await fn();
            this.render();
            window.dispatchEvent(new CustomEvent('preset-changed'));
        } catch (err) {
            logger.warn('session-config task failed', err);
            window.toastr?.error?.('操作失败');
        }
    }

    /* ── custom select menu ── */

    ensureSelectMenu() {
        if (this.customSelectMenuEl) return this.customSelectMenuEl;
        const menu = document.createElement('div');
        menu.className = 'world-app-select-menu';
        menu.style.display = 'none';
        menu.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(menu);
        this.customSelectMenuEl = menu;
        return menu;
    }

    closeCustomSelectMenu() {
        if (typeof this.customSelectMenuCleanup === 'function') {
            try { this.customSelectMenuCleanup(); } catch {}
        }
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        if (this.customSelectMenuEl) {
            this.customSelectMenuEl.style.display = 'none';
            this.customSelectMenuEl.innerHTML = '';
        }
    }

    openSelectMenu(anchorEl, options, currentValue, onSelect) {
        if (!anchorEl) return;
        if (this.customSelectMenuAnchor === anchorEl &&
            this.customSelectMenuEl?.style.display !== 'none') {
            this.closeCustomSelectMenu();
            return;
        }
        const menu = this.ensureSelectMenu();
        const current = String(currentValue ?? '').trim();
        menu.innerHTML = options.map((opt) => {
            const value = String(opt?.value ?? '');
            const label = escapeHtml(String(opt?.label ?? value));
            const selected = value === current;
            return `
                <button type="button" class="world-app-select-item ${selected ? 'is-selected' : ''}" data-value="${value.replace(/"/g, '&quot;')}">
                    <span class="world-app-select-item-label">${label}</span>
                    <span class="world-app-select-item-check">${selected ? '✓' : ''}</span>
                </button>
            `;
        }).join('');

        menu.querySelectorAll('.world-app-select-item').forEach((item) => {
            item.addEventListener('click', () => {
                if (typeof onSelect === 'function') onSelect(String(item.dataset.value ?? ''));
                this.closeCustomSelectMenu();
            });
        });

        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.minWidth = `${Math.max(170, Math.round(anchorEl.getBoundingClientRect().width))}px`;
        menu.style.left = '0px';
        menu.style.top = '0px';

        const anchorRect = anchorEl.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = anchorRect.left;
        let top = anchorRect.bottom + gap;
        if (left + menuRect.width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuRect.width - 8);
        }
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, anchorRect.top - menuRect.height - gap);
        }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
        menu.style.visibility = 'visible';

        const onDocClick = (ev) => {
            if (!ev?.target) return;
            if (menu.contains(ev.target) || anchorEl.contains(ev.target)) return;
            this.closeCustomSelectMenu();
        };
        const onResize = () => this.closeCustomSelectMenu();
        const onScroll = (ev) => {
            if (ev?.target && (menu.contains(ev.target) || anchorEl.contains(ev.target))) return;
            this.closeCustomSelectMenu();
        };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('touchstart', onDocClick, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        this.customSelectMenuCleanup = () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('touchstart', onDocClick, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
        this.customSelectMenuAnchor = anchorEl;
    }
}
