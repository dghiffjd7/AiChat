/**
 * 世界书管理面板（简易版）
 * - 查看已保存的世界书列表（localStorage）
 * - 从 ST JSON 文本导入并保存为简化格式
 */

import { convertSTWorld } from '../storage/worldinfo.js';
import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';
import { logger } from '../utils/logger.js';
import { WorldEditorModal } from './world-editor.js';
import { appConfirm } from './app-confirm.js';

export class WorldPanel {
    constructor({ contactsStore = null, getSessionId = null } = {}) {
        this.overlay = null;
        this.panel = null;
        this.listEl = null;
        this.libraryOverlay = null;
        this.libraryModal = null;
        this.libraryListEl = null;
        this.libraryToggleBtn = null;
        this.librarySearchEl = null;
        this.librarySortEl = null;
        this.libraryResetBtn = null;
        this.librarySortDirBtn = null;
        this.globalSettingsEl = null;
        this.globalSettingsBody = null;
        this.globalSettingsToggle = null;
        this.globalScanInput = null;
        this.globalStrategySelect = null;
        this.globalContextInput = null;
        this.globalIncludeNames = null;
        this.globalBudgetInput = null;
        this.globalMinActivationsInput = null;
        this.globalMaxDepthInput = null;
        this.globalMaxRecursionInput = null;
        this.globalRecursiveScan = null;
        this.globalCaseSensitive = null;
        this.globalMatchWholeWords = null;
        this.globalUseGroupScoring = null;
        this.globalOverflowWarning = null;
        this.globalSettingsOpen = false;
        this.fileInput = null;
        this.fileBtn = null;
        this.fileNameEl = null;
        this.scope = 'session'; // session | global
        this.contactsStore = contactsStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : null;
        this.librarySearchTerm = '';
        this.librarySort = 'time';
        this.librarySortDir = 'desc';
        this.editor = new WorldEditorModal({
            onSaved: async () => {
                await this.refreshList();
            }
        });
    }

    async show({ scope = 'session' } = {}) {
        this.scope = scope === 'global' ? 'global' : 'session';
        if (!this.panel) {
            this.createUI();
        }
        await this.refreshList();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'block';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
        this.libraryOverlay?.classList.remove('is-active');
    }

    buildToggle({ enabled, disabled = false, labelOn = '已启用', labelOff = '未启用', onClick } = {}) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'sticker-ai-toggle';
        btn.disabled = Boolean(disabled);
        btn.classList.toggle('is-enabled', Boolean(enabled) && !disabled);
        btn.classList.toggle('is-disabled', !enabled || disabled);
        btn.style.cursor = disabled ? 'not-allowed' : 'pointer';
        btn.style.opacity = disabled ? '0.7' : '1';
        btn.setAttribute('aria-pressed', enabled ? 'true' : 'false');
        btn.innerHTML = `<span class="sticker-ai-dot"></span><span>${enabled ? labelOn : labelOff}</span>`;
        btn.onclick = () => {
            if (btn.disabled) return;
            onClick?.();
        };
        return btn;
    }

    sanitizeExportName(name, fallback = 'worldbook') {
        const raw = String(name || '').trim();
        const safe = raw.replace(/[\\/:*?"<>|]+/g, '_').trim();
        return safe || fallback;
    }

    downloadJson(payload, filename) {
        const json = JSON.stringify(payload, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename || 'worldbook.json';
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);
    }

    async refreshList() {
        if (!this.listEl) return;
        this.listEl.innerHTML = '';
        try {
            const sessionId = this.getSessionId ? this.getSessionId() : (window.appBridge?.activeSessionId || 'default');
            const contact = this.contactsStore?.getContact?.(sessionId) || null;
            const isGroupSession = this.scope === 'session' && (Boolean(contact?.isGroup) || String(sessionId).startsWith('group:'));
            const rawCurrentId = this.scope === 'global'
                ? (window.appBridge.globalWorldId || '')
                : (window.appBridge.currentWorldId || '');
            const currentId = rawCurrentId === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID ? '' : rawCurrentId;
            const isSessionScope = this.scope === 'session' && !isGroupSession;
            const boundIds = isSessionScope
                ? (window.appBridge?.getWorldIdsForSession?.(sessionId) || [])
                : (currentId ? [currentId] : []);
            const listTitle = this.panel?.querySelector('#world-list-title');
            if (listTitle) listTitle.textContent = isSessionScope ? '已绑定' : (this.scope === 'global' ? '已启用' : '世界书列表');
            if (this.libraryToggleBtn) {
                this.libraryToggleBtn.style.display = (this.scope === 'session' || this.scope === 'global') ? '' : 'none';
            }
            if (this.globalSettingsEl) {
                this.globalSettingsEl.style.display = this.scope === 'global' ? '' : 'none';
            }
            if (this.scope === 'global') {
                const settings = window.appBridge?.getWorldGlobalSettings?.() || {};
                const scanDepth = Number.isFinite(Number(settings.scanDepth)) ? Number(settings.scanDepth) : '';
                if (this.globalScanInput) this.globalScanInput.value = scanDepth === '' ? '' : String(scanDepth);
                const contextPercent = Number.isFinite(Number(settings.contextPercent)) ? Number(settings.contextPercent) : '';
                if (this.globalContextInput) this.globalContextInput.value = contextPercent === '' ? '' : String(contextPercent);
                const budgetCap = Number.isFinite(Number(settings.budgetCap)) ? Number(settings.budgetCap) : '';
                if (this.globalBudgetInput) this.globalBudgetInput.value = budgetCap === '' ? '' : String(budgetCap);
                const minActivations = Number.isFinite(Number(settings.minActivations)) ? Number(settings.minActivations) : '';
                if (this.globalMinActivationsInput) this.globalMinActivationsInput.value = minActivations === '' ? '' : String(minActivations);
                const maxDepth = Number.isFinite(Number(settings.maxDepth)) ? Number(settings.maxDepth) : '';
                if (this.globalMaxDepthInput) this.globalMaxDepthInput.value = maxDepth === '' ? '' : String(maxDepth);
                const maxRecursion = Number.isFinite(Number(settings.maxRecursionSteps)) ? Number(settings.maxRecursionSteps) : '';
                if (this.globalMaxRecursionInput) this.globalMaxRecursionInput.value = maxRecursion === '' ? '' : String(maxRecursion);
                const strategy = String(settings.insertionStrategy || 'role_first');
                if (this.globalStrategySelect) this.globalStrategySelect.value = strategy;
                if (this.globalIncludeNames) this.globalIncludeNames.checked = settings.includeNames === true;
                if (this.globalRecursiveScan) this.globalRecursiveScan.checked = settings.recursiveScan !== false;
                if (this.globalCaseSensitive) this.globalCaseSensitive.checked = settings.caseSensitive === true;
                if (this.globalMatchWholeWords) this.globalMatchWholeWords.checked = settings.matchWholeWords === true;
                if (this.globalUseGroupScoring) this.globalUseGroupScoring.checked = settings.useGroupScoring === true;
                if (this.globalOverflowWarning) this.globalOverflowWarning.checked = settings.alertOnOverflow === true;
            }
            const indicator = this.panel?.querySelector('#world-current');
            if (indicator) {
                const boundLabel = boundIds.length ? boundIds.join(' + ') : '未启用';
                indicator.textContent = this.scope === 'global'
                    ? `全局当前：${currentId || '未启用'}`
                    : (isGroupSession ? `群聊 ${contact?.name || sessionId}：按成员绑定世界书` : `会话 ${sessionId} 当前：${boundLabel}`);
            }
            const names = await window.appBridge.listWorlds?.();
            const visibleNames = (names || []).filter((name) => name !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);

            const renderEmpty = (el, text) => {
                if (!el) return;
                const li = document.createElement('li');
                li.textContent = text;
                li.style.color = '#888';
                li.style.listStyle = 'none';
                li.style.padding = '6px 4px';
                el.appendChild(li);
            };

            const buildToggle = (opts) => this.buildToggle(opts);

            // Group chat: show per-member world bindings (do not rely on world name == member name)
            if (isGroupSession) {
                const members = Array.isArray(contact?.members) ? contact.members : [];
                const wrap = document.createElement('div');
                wrap.style.cssText = 'padding:10px 8px; border:1px solid #e2e8f0; border-radius:12px; background:#f8fafc; margin:0 0 10px 0;';
                const title = document.createElement('div');
                title.style.cssText = 'font-weight:800; color:#0f172a;';
                title.textContent = '群聊世界书（按成员绑定，自动合并 A+B+...）';
                const desc = document.createElement('div');
                desc.style.cssText = 'color:#64748b; font-size:12px; margin-top:4px;';
                desc.textContent = '提示：在某个成员的私聊里启用世界书，会自动绑定到该成员；群聊会自动使用所有成员已绑定的世界书。';
                wrap.appendChild(title);
                wrap.appendChild(desc);

                const list = document.createElement('div');
                list.style.cssText = 'margin-top:10px; display:flex; flex-direction:column; gap:8px;';

                const getMemberLabel = (mid) => {
                    const c = this.contactsStore?.getContact?.(mid);
                    return { name: c?.name || mid, avatar: c?.avatar || './assets/external/feather-default.png' };
                };

                const bindForMember = (memberId, worldId) => {
                    const sid = String(memberId || '').trim();
                    if (!sid) return;
                    window.appBridge?.bindWorldToSession?.(sid, worldId, { silent: true });
                    window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: window.appBridge?.currentWorldId } }));
                };

                members.forEach((mid) => {
                    const memberId = String(mid || '').trim();
                    if (!memberId) return;
                    const { name, avatar } = getMemberLabel(memberId);
                    const rawBound = window.appBridge?.getWorldIdsForSession?.(memberId) || [];
                    const bound = Array.isArray(rawBound)
                        ? rawBound.filter(id => id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID)
                        : [];

                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:#fff;';
                    row.innerHTML = `
                        <img src="${avatar}" alt="" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                            <div style="color:${bound.length ? '#0f172a' : '#94a3b8'}; font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${bound.length ? `已绑定：${bound.join(' + ')}` : '未绑定世界书'}
                            </div>
                        </div>
                    `;

                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
                    const pickBtn = document.createElement('button');
                    pickBtn.textContent = bound.length ? '更换' : '绑定';
                    pickBtn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;';
                    pickBtn.disabled = !visibleNames.length;
                    if (pickBtn.disabled) {
                        pickBtn.style.cursor = 'not-allowed';
                        pickBtn.style.opacity = '0.6';
                    }
                    pickBtn.onclick = () => {
                        if (!visibleNames.length) return;
                        const options = visibleNames.slice().sort((a, b) => String(a).localeCompare(String(b)));
                        const hint = options.slice(0, 40).join('\n');
                        const raw = prompt(`为「${name}」选择要绑定的世界书名称（输入名称即可）：\n\n（部分列表）\n${hint}\n\n也可直接输入完整名称`, bound.join(' + ') || '');
                        const next = String(raw || '').trim();
                        if (!next) return;
                        if (!options.includes(next)) {
                            window.toastr?.warning?.('未找到该世界书名称');
                            return;
                        }
                        bindForMember(memberId, next);
                        this.refreshList();
                    };
                    const offBtn = document.createElement('button');
                    offBtn.textContent = '停用';
                    offBtn.style.cssText = 'padding:6px 10px;border:1px solid #fecaca;border-radius:10px;background:#fee2e2;color:#b91c1c;cursor:pointer;';
                    offBtn.disabled = !bound.length;
                    offBtn.onclick = () => {
                        bindForMember(memberId, '');
                        this.refreshList();
                    };
                    btnWrap.appendChild(pickBtn);
                    btnWrap.appendChild(offBtn);
                    row.appendChild(btnWrap);
                    list.appendChild(row);
                });

                wrap.appendChild(list);
                const host = document.createElement('li');
                host.style.listStyle = 'none';
                host.appendChild(wrap);
                this.listEl.appendChild(host);
            }

            if (isSessionScope) {
                if (!boundIds.length) {
                    renderEmpty(this.listEl, '（未绑定世界书）');
                } else {
                    boundIds.forEach((worldId) => {
                        const li = document.createElement('li');
                        li.style.listStyle = 'none';
                        li.style.padding = '10px';
                        li.style.border = '1px solid #e2e8f0';
                        li.style.borderRadius = '12px';
                        li.style.background = '#f8fafc';
                        li.style.marginBottom = '8px';

                        const header = document.createElement('div');
                        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

                        const titleWrap = document.createElement('div');
                        titleWrap.style.cssText = 'display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;';
                        const title = document.createElement('div');
                        title.textContent = worldId;
                        title.style.fontWeight = '700';
                        title.style.color = '#0f172a';
                        title.style.whiteSpace = 'nowrap';
                        title.style.overflow = 'hidden';
                        title.style.textOverflow = 'ellipsis';
                        title.style.cursor = 'pointer';
                        const meta = document.createElement('div');
                        meta.style.cssText = 'font-size:12px; color:#64748b;';
                        meta.textContent = '点击标题展开条目';
                        titleWrap.appendChild(title);
                        titleWrap.appendChild(meta);

                        const actions = document.createElement('div');
                        actions.style.cssText = 'display:flex; align-items:center; gap:6px;';

                        const toggle = buildToggle({
                            enabled: true,
                            labelOn: '已启用',
                            labelOff: '未启用',
                            onClick: async () => {
                                const next = boundIds.filter(id => id !== worldId);
                                window.appBridge?.setSessionWorldIds?.(sessionId, next, { silent: false });
                                window.toastr?.success('已停用世界书');
                                await this.refreshList();
                            },
                        });

                        const editBtn = document.createElement('button');
                        editBtn.type = 'button';
                        editBtn.textContent = '编辑';
                        editBtn.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';
                        editBtn.onclick = async (e) => {
                            e.stopPropagation();
                            await this.openEditor(worldId);
                        };

                        const deleteBtn = document.createElement('button');
                        deleteBtn.textContent = '删除';
                        deleteBtn.style.cssText = 'padding:4px 8px;border:1px solid #fecaca;border-radius:6px;background:#fff;color:#b91c1c;cursor:pointer;';
                        deleteBtn.onclick = async () => {
                            const ok = await appConfirm({
                                title: '删除世界书',
                                message: `确定要删除世界书「${worldId}」吗？此操作不可恢复。`,
                                danger: true,
                            });
                            if (!ok) return;
                            await window.appBridge.deleteWorldInfo(worldId);
                            window.toastr?.success('已删除世界书');
                            await this.refreshList();
                        };

                        actions.appendChild(editBtn);
                        actions.appendChild(toggle);
                        actions.appendChild(deleteBtn);

                        header.appendChild(titleWrap);
                        header.appendChild(actions);

                        const entriesWrap = document.createElement('div');
                        entriesWrap.style.cssText = 'display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0;';
                        let entriesLoaded = false;

                        const renderEntries = async () => {
                            if (entriesLoaded) return;
                            entriesLoaded = true;
                            try {
                                const data = await window.appBridge.getWorldInfo(worldId);
                                const entries = Array.isArray(data?.entries) ? data.entries : [];
                                meta.textContent = data ? `共 ${entries.length} 条目` : '世界书不存在或已删除';
                                if (!entries.length) {
                                    const empty = document.createElement('div');
                                    empty.textContent = data ? '（无条目）' : '（无法读取条目）';
                                    empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:4px 0;';
                                    entriesWrap.appendChild(empty);
                                    return;
                                }
                                entries.forEach((entry, idx) => {
                                    const row = document.createElement('div');
                                    row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0;';
                                    const label = String(entry?.comment || entry?.title || entry?.id || `entry-${idx}`);
                                    const nameEl = document.createElement('div');
                                    nameEl.textContent = label;
                                    nameEl.style.cssText = `font-size:12px; color:${entry?.disable ? '#94a3b8' : '#0f172a'}; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`;

                                    const entryToggle = buildToggle({
                                        enabled: !entry?.disable,
                                        labelOn: '已启用',
                                        labelOff: '未启用',
                                        onClick: async () => {
                                            const latest = await window.appBridge.getWorldInfo(worldId);
                                            if (!latest || !Array.isArray(latest.entries)) {
                                                window.toastr?.warning?.('世界书不存在或已删除');
                                                return;
                                            }
                                            const nextEntries = latest.entries.map((item, i) => {
                                                if (i !== idx) return item;
                                                return { ...item, disable: !item?.disable };
                                            });
                                            await window.appBridge.saveWorldInfo(worldId, { ...latest, entries: nextEntries });
                                            entry.disable = !entry?.disable;
                                            nameEl.style.color = entry?.disable ? '#94a3b8' : '#0f172a';
                                            entryToggle.classList.toggle('is-enabled', !entry?.disable);
                                            entryToggle.classList.toggle('is-disabled', Boolean(entry?.disable));
                                            entryToggle.setAttribute('aria-pressed', entry?.disable ? 'false' : 'true');
                                            const labelEl = entryToggle.querySelector('span:last-child');
                                            if (labelEl) labelEl.textContent = entry?.disable ? '未启用' : '已启用';
                                            window.toastr?.success(entry?.disable ? '条目已停用' : '条目已启用');
                                        },
                                    });

                                    row.appendChild(nameEl);
                                    row.appendChild(entryToggle);
                                    entriesWrap.appendChild(row);
                                });
                            } catch (err) {
                                meta.textContent = '条目读取失败';
                                const empty = document.createElement('div');
                                empty.textContent = '（读取条目失败）';
                                empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:4px 0;';
                                entriesWrap.appendChild(empty);
                            }
                        };

                        const toggleEntries = async () => {
                            if (entriesWrap.style.display === 'none') {
                                await renderEntries();
                                entriesWrap.style.display = 'block';
                            } else {
                                entriesWrap.style.display = 'none';
                            }
                        };

                        li.appendChild(header);
                        li.appendChild(entriesWrap);
                        title.onclick = async (e) => {
                            e.stopPropagation();
                            await toggleEntries();
                        };
                        this.listEl.appendChild(li);
                    });
                }

                await this.renderLibraryList({ names: visibleNames, boundIds, sessionId });
                return;
            }

            if (this.scope === 'global') {
                const globalId = String(window.appBridge?.globalWorldId || '').trim();
                if (!globalId) {
                    renderEmpty(this.listEl, '（未启用）');
                } else {
                    const li = document.createElement('li');
                    li.style.listStyle = 'none';
                    li.style.padding = '10px';
                    li.style.border = '1px solid #e2e8f0';
                    li.style.borderRadius = '12px';
                    li.style.background = '#f8fafc';
                    li.style.marginBottom = '8px';

                    const header = document.createElement('div');
                    header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px;';

                    const titleWrap = document.createElement('div');
                    titleWrap.style.cssText = 'display:flex; flex-direction:column; gap:2px; min-width:0; flex:1;';
                    const title = document.createElement('div');
                    title.textContent = globalId;
                    title.style.fontWeight = '700';
                    title.style.color = '#0f172a';
                    title.style.whiteSpace = 'nowrap';
                    title.style.overflow = 'hidden';
                    title.style.textOverflow = 'ellipsis';
                    title.style.cursor = 'pointer';
                    const meta = document.createElement('div');
                    meta.style.cssText = 'font-size:12px; color:#64748b;';
                    meta.textContent = '点击标题展开条目';
                    titleWrap.appendChild(title);
                    titleWrap.appendChild(meta);

                    const actions = document.createElement('div');
                    actions.style.cssText = 'display:flex; align-items:center; gap:6px;';

                    const toggle = buildToggle({
                        enabled: true,
                        labelOn: '已启用',
                        labelOff: '未启用',
                        onClick: async () => {
                            await window.appBridge.setGlobalWorld('');
                            window.toastr?.success('已停用世界书');
                            await this.refreshList();
                        },
                    });

                    const editBtn = document.createElement('button');
                    editBtn.type = 'button';
                    editBtn.textContent = '编辑';
                    editBtn.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';
                    editBtn.onclick = async (e) => {
                        e.stopPropagation();
                        await this.openEditor(globalId);
                    };

                    const deleteBtn = document.createElement('button');
                    deleteBtn.textContent = '删除';
                    deleteBtn.style.cssText = 'padding:4px 8px;border:1px solid #fecaca;border-radius:6px;background:#fff;color:#b91c1c;cursor:pointer;';
                    deleteBtn.onclick = async () => {
                        const ok = await appConfirm({
                            title: '删除世界书',
                            message: `确定要删除世界书「${globalId}」吗？此操作不可恢复。`,
                            danger: true,
                        });
                        if (!ok) return;
                        await window.appBridge.deleteWorldInfo(globalId);
                        window.toastr?.success('已删除世界书');
                        await this.refreshList();
                    };

                    actions.appendChild(editBtn);
                    actions.appendChild(toggle);
                    actions.appendChild(deleteBtn);

                    header.appendChild(titleWrap);
                    header.appendChild(actions);

                    const entriesWrap = document.createElement('div');
                    entriesWrap.style.cssText = 'display:none; margin-top:8px; padding-top:8px; border-top:1px dashed #e2e8f0;';
                    let entriesLoaded = false;

                    const renderEntries = async () => {
                        if (entriesLoaded) return;
                        entriesLoaded = true;
                        try {
                            const data = await window.appBridge.getWorldInfo(globalId);
                            const entries = Array.isArray(data?.entries) ? data.entries : [];
                            meta.textContent = data ? `共 ${entries.length} 条目` : '世界书不存在或已删除';
                            if (!entries.length) {
                                const empty = document.createElement('div');
                                empty.textContent = data ? '（无条目）' : '（无法读取条目）';
                                empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:4px 0;';
                                entriesWrap.appendChild(empty);
                                return;
                            }
                            entries.forEach((entry, idx) => {
                                const row = document.createElement('div');
                                row.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:6px 0;';
                                const label = String(entry?.comment || entry?.title || entry?.id || `entry-${idx}`);
                                const nameEl = document.createElement('div');
                                nameEl.textContent = label;
                                nameEl.style.cssText = `font-size:12px; color:${entry?.disable ? '#94a3b8' : '#0f172a'}; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;`;

                                const entryToggle = buildToggle({
                                    enabled: !entry?.disable,
                                    labelOn: '已启用',
                                    labelOff: '未启用',
                                    onClick: async () => {
                                        const latest = await window.appBridge.getWorldInfo(globalId);
                                        if (!latest || !Array.isArray(latest.entries)) {
                                            window.toastr?.warning?.('世界书不存在或已删除');
                                            return;
                                        }
                                        const nextEntries = latest.entries.map((item, i) => {
                                            if (i !== idx) return item;
                                            return { ...item, disable: !item?.disable };
                                        });
                                        await window.appBridge.saveWorldInfo(globalId, { ...latest, entries: nextEntries });
                                        entry.disable = !entry?.disable;
                                        nameEl.style.color = entry?.disable ? '#94a3b8' : '#0f172a';
                                        entryToggle.classList.toggle('is-enabled', !entry?.disable);
                                        entryToggle.classList.toggle('is-disabled', Boolean(entry?.disable));
                                        entryToggle.setAttribute('aria-pressed', entry?.disable ? 'false' : 'true');
                                        const labelEl = entryToggle.querySelector('span:last-child');
                                        if (labelEl) labelEl.textContent = entry?.disable ? '未启用' : '已启用';
                                        window.toastr?.success(entry?.disable ? '条目已停用' : '条目已启用');
                                    },
                                });

                                row.appendChild(nameEl);
                                row.appendChild(entryToggle);
                                entriesWrap.appendChild(row);
                            });
                        } catch (err) {
                            meta.textContent = '条目读取失败';
                            const empty = document.createElement('div');
                            empty.textContent = '（读取条目失败）';
                            empty.style.cssText = 'font-size:12px; color:#94a3b8; padding:4px 0;';
                            entriesWrap.appendChild(empty);
                        }
                    };

                    const toggleEntries = async () => {
                        if (entriesWrap.style.display === 'none') {
                            await renderEntries();
                            entriesWrap.style.display = 'block';
                        } else {
                            entriesWrap.style.display = 'none';
                        }
                    };

                    li.appendChild(header);
                    li.appendChild(entriesWrap);
                    title.onclick = async (e) => {
                        e.stopPropagation();
                        await toggleEntries();
                    };
                    this.listEl.appendChild(li);
                }

                await this.renderLibraryList({ names: visibleNames, boundIds: globalId ? [globalId] : [], scope: 'global' });
                return;
            }

            if (!visibleNames.length) {
                renderEmpty(this.listEl, '（暂无世界书）');
                return;
            }

            visibleNames.forEach((name) => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.padding = '6px 8px';
                li.style.borderBottom = '1px solid #f0f0f0';
                li.style.cursor = 'pointer';
                li.title = '编辑世界书';
                if (name === currentId) {
                    li.style.background = '#f8fafc';
                    li.style.border = '1px solid #e2e8f0';
                }

                const title = document.createElement('span');
                title.textContent = name;
                title.style.fontWeight = '600';
                title.style.cursor = 'pointer';

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';

                const editBtn = document.createElement('button');
                editBtn.type = 'button';
                editBtn.textContent = '编辑';
                editBtn.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';
                editBtn.onclick = async (e) => {
                    e.stopPropagation();
                    await this.openEditor(name);
                };

                const disabledToggle = isGroupSession && this.scope === 'session';
                const toggle = buildToggle({
                    enabled: name === currentId,
                    disabled: disabledToggle,
                    labelOn: disabledToggle ? '群聊' : '已启用',
                    labelOff: disabledToggle ? '群聊' : '未启用',
                    onClick: async () => {
                        if (disabledToggle) return;
                        if (name === currentId) {
                            if (this.scope === 'global') {
                                await window.appBridge.setGlobalWorld('');
                            } else {
                                window.appBridge?.bindWorldToSession?.(sessionId, '', { silent: false });
                            }
                            window.toastr?.success('已停用世界书');
                        } else {
                            if (this.scope === 'global') {
                                await window.appBridge.setGlobalWorld(name);
                            } else {
                                await window.appBridge.setCurrentWorld(name);
                            }
                            const data = await window.appBridge.getWorldInfo(name);
                            logger.info('Activated world', name, data);
                            window.toastr?.success(`已启用世界书：${name}`);
                            window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: name } }));
                        }
                        await this.refreshList();
                    },
                });

                const deleteBtn = document.createElement('button');
                deleteBtn.textContent = '删除';
                deleteBtn.style.cssText = 'padding:4px 8px;border:1px solid #fecaca;border-radius:6px;background:#fff;color:#b91c1c;cursor:pointer;';
                deleteBtn.onclick = async () => {
                    const ok = await appConfirm({
                        title: '删除世界书',
                        message: `确定要删除世界书「${name}」吗？此操作不可恢复。`,
                        danger: true,
                    });
                    if (!ok) return;
                    await window.appBridge.deleteWorldInfo(name);
                    window.toastr?.success('已删除世界书');
                    await this.refreshList();
                };

                actions.appendChild(editBtn);
                actions.appendChild(toggle);
                actions.appendChild(deleteBtn);
                li.appendChild(title);
                li.appendChild(actions);
                this.listEl.appendChild(li);
            });
        } catch (err) {
            logger.error('刷新世界书列表失败', err);
        }
    }

    async renderLibraryList({ names = [], boundIds = [], sessionId = '', scope = 'session' } = {}) {
        if (!this.libraryListEl) return;
        const listEl = this.libraryListEl;
        listEl.innerHTML = '';
        if (this.librarySearchEl && this.librarySearchEl.value !== this.librarySearchTerm) {
            this.librarySearchEl.value = this.librarySearchTerm || '';
        }
        if (this.librarySortEl && this.librarySortEl.value !== this.librarySort) {
            this.librarySortEl.value = this.librarySort || 'time';
        }
        if (this.librarySortDirBtn) {
            const isAsc = this.librarySortDir === 'asc';
            const upFill = isAsc ? 'rgba(15,23,42,0.85)' : 'rgba(15,23,42,0.35)';
            const downFill = isAsc ? 'rgba(15,23,42,0.35)' : 'rgba(15,23,42,0.85)';
            this.librarySortDirBtn.innerHTML = `
                <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="display:block; transform: translateY(1px);">
                    <path d="M8 2L11 5H9V7H7V5H5L8 2Z" fill="${upFill}"></path>
                    <path d="M8 14L5 11H7V9H9V11H11L8 14Z" fill="${downFill}"></path>
                </svg>
            `;
            this.librarySortDirBtn.title = isAsc ? '升序' : '降序';
            this.librarySortDirBtn.setAttribute('aria-pressed', isAsc ? 'true' : 'false');
        }
        const renderEmpty = (text) => {
            const empty = document.createElement('div');
            empty.className = 'sticker-bind-empty';
            empty.textContent = text;
            listEl.appendChild(empty);
        };

        if (!Array.isArray(names) || !names.length) {
            renderEmpty('暂无世界书');
            return;
        }

        const keyword = String(this.librarySearchTerm || '').trim().toLowerCase();
        const sort = String(this.librarySort || 'time').trim() || 'time';
        const dir = this.librarySortDir === 'asc' ? 'asc' : 'desc';

        const boundSet = new Set(Array.isArray(boundIds) ? boundIds : []);
        const items = await Promise.all(
            names.map(async (name, index) => {
                let data = null;
                try {
                    data = await window.appBridge.getWorldInfo(name);
                } catch (err) {
                    data = null;
                }
                const entries = Array.isArray(data?.entries) ? data.entries : [];
                const updatedAt = Number(data?.updatedAt || data?.updated_at || data?.createdAt || data?.created_at || 0);
                return {
                    name,
                    index,
                    entriesCount: entries.length,
                    updatedAt,
                };
            }),
        );

        let filtered = keyword
            ? items.filter(item => String(item.name).toLowerCase().includes(keyword))
            : items.slice();

        const compareName = (a, b) => String(a.name).localeCompare(String(b.name), 'zh-Hans', { sensitivity: 'base' });
        if (sort === 'name') {
            filtered.sort((a, b) => (dir === 'asc' ? compareName(a, b) : compareName(b, a)));
        } else {
            filtered.sort((a, b) => {
                const ta = a.updatedAt || 0;
                const tb = b.updatedAt || 0;
                if (ta !== tb) return dir === 'asc' ? ta - tb : tb - ta;
                return compareName(a, b);
            });
        }

        if (!filtered.length) {
            renderEmpty('暂无匹配世界书');
            return;
        }

        filtered.forEach(item => {
            const row = document.createElement('div');
            row.className = 'sticker-bind-row';
            row.style.justifyContent = 'space-between';
            row.style.alignItems = 'center';
            if (boundSet.has(item.name)) {
                row.style.borderColor = 'rgba(25, 154, 255, 0.45)';
                row.style.background = 'rgba(25, 154, 255, 0.08)';
            }

            const info = document.createElement('div');
            info.className = 'sticker-bind-info';
            const title = document.createElement('div');
            title.className = 'sticker-bind-name';
            title.textContent = item.name;
            const meta = document.createElement('div');
            meta.className = 'sticker-bind-meta';
            const timeText = item.updatedAt ? new Date(item.updatedAt).toLocaleString('zh-CN', { hour12: false }) : '';
            meta.textContent = timeText ? `${item.entriesCount} 条目 · 更新：${timeText}` : `${item.entriesCount} 条目`;
            info.appendChild(title);
            info.appendChild(meta);

            const actions = document.createElement('div');
            actions.style.display = 'flex';
            actions.style.alignItems = 'center';
            actions.style.gap = '6px';

            const editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.textContent = '编辑';
            editBtn.style.cssText = 'padding:4px 8px;border:1px solid #e2e8f0;border-radius:999px;background:#fff;font-size:12px;cursor:pointer;';
            editBtn.onclick = async (e) => {
                e.stopPropagation();
                await this.openEditor(item.name);
            };

            const toggle = this.buildToggle({
                enabled: boundSet.has(item.name),
                labelOn: scope === 'global' ? '已启用' : '已绑定',
                labelOff: scope === 'global' ? '未启用' : '未绑定',
                onClick: async () => {
                    if (scope === 'global') {
                        if (boundSet.has(item.name)) {
                            await window.appBridge.setGlobalWorld('');
                            window.toastr?.success('已停用世界书');
                        } else {
                            await window.appBridge.setGlobalWorld(item.name);
                            const data = await window.appBridge.getWorldInfo(item.name);
                            logger.info('Activated world', item.name, data);
                            window.toastr?.success(`已启用世界书：${item.name}`);
                        }
                    } else {
                        const next = new Set(boundSet);
                        if (next.has(item.name)) {
                            next.delete(item.name);
                            window.toastr?.success('已停用世界书');
                        } else {
                            next.add(item.name);
                            const data = await window.appBridge.getWorldInfo(item.name);
                            logger.info('Activated world', item.name, data);
                            window.toastr?.success(`已启用世界书：${item.name}`);
                        }
                        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
                        window.appBridge?.setSessionWorldIds?.(sid, Array.from(next), { silent: false });
                    }
                    await this.refreshList();
                },
            });

            const deleteBtn = document.createElement('button');
            deleteBtn.textContent = '删除';
            deleteBtn.style.cssText = 'padding:4px 8px;border:1px solid #fecaca;border-radius:6px;background:#fff;color:#b91c1c;cursor:pointer;';
            deleteBtn.onclick = async () => {
                const ok = await appConfirm({
                    title: '删除世界书',
                    message: `确定要删除世界书「${item.name}」吗？此操作不可恢复。`,
                    danger: true,
                });
                if (!ok) return;
                await window.appBridge.deleteWorldInfo(item.name);
                window.toastr?.success('已删除世界书');
                await this.refreshList();
            };

            actions.appendChild(editBtn);
            actions.appendChild(toggle);
            actions.appendChild(deleteBtn);

            row.appendChild(info);
            row.appendChild(actions);
            listEl.appendChild(row);
        });
    }

    async openEditor(name) {
        try {
            const data = await window.appBridge.getWorldInfo(name);
            await this.editor.show(name, data);
        } catch (err) {
            logger.error('打开世界书编辑器失败', err);
            window.toastr?.error('打开编辑器失败');
        }
    }

    async onNewWorld() {
        try {
            const raw = prompt('新建世界书名称', '新世界书');
            const name = String(raw || '').trim();
            if (!name) return;
            const existing = await window.appBridge.listWorlds?.();
            if (Array.isArray(existing) && existing.includes(name)) {
                window.toastr?.warning('名称已存在，请换一个');
                return;
            }

            const blank = { name, entries: [] };
            await window.appBridge.saveWorldInfo(name, blank);

            if (this.scope === 'global') {
                await window.appBridge.setGlobalWorld(name);
            } else {
                await window.appBridge.setCurrentWorld(name);
            }

            window.toastr?.success(`已新建并启用：${name}`);
            window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: name } }));
            await this.refreshList();

            // Open editor immediately for convenience
            await this.openEditor(name);
        } catch (err) {
            logger.error('新建世界书失败', err);
            window.toastr?.error('新建世界书失败');
        }
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.id = 'world-overlay';
        this.overlay.style.cssText = `
            display: none;
            position: fixed;
            inset: 0;
            background: rgba(0,0,0,0.4);
            z-index: 20000;
        `;
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.id = 'world-panel';
        this.panel.style.cssText = `
            display: none;
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: #fff;
            border-radius: 12px;
            box-shadow: 0 10px 40px rgba(0,0,0,0.2);
            padding: 16px;
            width: min(520px, 92vw);
            max-height: 80vh;
            overflow: auto;
            z-index: 21000;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <h3 style="margin: 0 0 12px; color: #0f172a;">世界书管理</h3>
            <div id="world-current" style="margin: -4px 0 12px; color:#475569; font-size:13px;">当前：未启用</div>
            <div id="world-global-settings" style="display:none; margin: 0 0 12px; padding:10px; border:1px dashed #e2e8f0; border-radius:12px; background:#f8fafc;">
                <div id="world-global-settings-header" style="display:flex; align-items:center; justify-content:space-between; cursor:pointer;">
                    <div style="font-weight:700;">全局设置</div>
                    <div id="world-global-settings-toggle" style="font-size:12px; color:#64748b;">▼</div>
                </div>
                <div id="world-global-settings-body" style="display:none; margin-top:8px;">
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">扫描深度</span>
                        <input id="world-global-scan-depth" type="number" min="0" step="1" placeholder="默认2" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                        <span style="font-size:11px; color:#94a3b8;">0 = 不扫描历史</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">上下文百分比</span>
                        <input id="world-global-context-percent" type="number" min="0" max="100" step="1" placeholder="默认" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                        <span style="font-size:11px; color:#94a3b8;">%（用于世界书预算）</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">预算上限</span>
                        <input id="world-global-budget-cap" type="number" min="0" step="1" placeholder="0 = 不限制" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                        <span style="font-size:11px; color:#94a3b8;">tokens（优先级高于百分比）</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">最小启动次数</span>
                        <input id="world-global-min-activations" type="number" min="0" step="1" placeholder="0 = 关闭" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                        <span style="font-size:11px; color:#94a3b8;">自动加深扫描</span>
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">最大深度</span>
                        <input id="world-global-max-depth" type="number" min="0" step="1" placeholder="0 = 不限制" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">最大递归步数</span>
                        <input id="world-global-max-recursion" type="number" min="0" step="1" placeholder="0 = 不限制" style="width:120px; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                    </div>
                    <div style="display:flex; gap:8px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">插入策略</span>
                        <select id="world-global-strategy" style="border:1px solid #e2e8f0; border-radius:8px; padding:6px 8px; font-size:12px; background:#fff;">
                            <option value="role_first">角色世界书优先</option>
                            <option value="global_first">全局世界书优先</option>
                            <option value="even">平均混合</option>
                        </select>
                    </div>
                    <div style="display:flex; gap:12px; align-items:center; margin-top:8px; flex-wrap:wrap;">
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-include-names" type="checkbox">
                            包含说话人名称
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-recursive-scan" type="checkbox">
                            递归扫描
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-case-sensitive" type="checkbox">
                            区分大小写
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-full-match" type="checkbox">
                            完全配对
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-group-scoring" type="checkbox">
                            使用群组评分
                        </label>
                        <label style="display:flex; align-items:center; gap:6px; font-size:12px; color:#475569;">
                            <input id="world-global-overflow-warning" type="checkbox">
                            溢位时警告
                        </label>
                    </div>
                </div>
            </div>
            <div style="display:flex; gap:12px; flex-wrap: wrap;">
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div id="world-list-title" style="font-weight:700; margin-bottom:6px;">已绑定</div>
                    <ul id="world-list" style="list-style:none; padding:8px; border:1px solid #eee; border-radius:8px; max-height:220px; overflow:auto; margin:0;"></ul>
                    <div style="display:flex; gap:8px; margin-top:8px; flex-wrap: wrap;">
                        <button id="world-new" style="flex:1; min-width:120px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#019aff; color:#fff; font-weight:700;">新增</button>
                        <button id="world-library-toggle" style="flex:1; min-width:120px; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#f5f5f5;">世界书库</button>
                    </div>
                </div>
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div style="font-weight:700; margin-bottom:6px;">导入世界书</div>
                    <div style="display:flex; gap:8px; align-items:center; margin-bottom:8px;">
                        <button id="world-file-btn" type="button" style="padding:6px 10px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5; cursor:pointer;">选择文件</button>
                        <span id="world-file-name" style="font-size:12px; color:#64748b;">未选择文件</span>
                    </div>
                    <input id="world-file" type="file" accept=".json,application/json" style="display:none;">
                    <div style="color:#94a3b8; font-size:12px; margin:6px 0;">名称将取自 JSON 的 name 或文件名（无需手动填写）</div>
                    <div style="display:flex; gap:8px; margin-top:8px; justify-content:flex-end;">
                        <button id="world-import" style="padding:8px 14px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5;">导入</button>
                        <button id="world-close" style="padding:8px 14px; border-radius:8px; border:1px solid #ddd; background:#f5f5f5;">关闭</button>
                    </div>
                </div>
            </div>
        `;

        this.listEl = this.panel.querySelector('#world-list');
        this.libraryToggleBtn = this.panel.querySelector('#world-library-toggle');
        this.fileInput = this.panel.querySelector('#world-file');
        this.fileBtn = this.panel.querySelector('#world-file-btn');
        this.fileNameEl = this.panel.querySelector('#world-file-name');
        this.globalSettingsEl = this.panel.querySelector('#world-global-settings');
        this.globalSettingsBody = this.panel.querySelector('#world-global-settings-body');
        this.globalSettingsToggle = this.panel.querySelector('#world-global-settings-toggle');
        this.globalScanInput = this.panel.querySelector('#world-global-scan-depth');
        this.globalStrategySelect = this.panel.querySelector('#world-global-strategy');
        this.globalContextInput = this.panel.querySelector('#world-global-context-percent');
        this.globalIncludeNames = this.panel.querySelector('#world-global-include-names');
        this.globalBudgetInput = this.panel.querySelector('#world-global-budget-cap');
        this.globalMinActivationsInput = this.panel.querySelector('#world-global-min-activations');
        this.globalMaxDepthInput = this.panel.querySelector('#world-global-max-depth');
        this.globalMaxRecursionInput = this.panel.querySelector('#world-global-max-recursion');
        this.globalRecursiveScan = this.panel.querySelector('#world-global-recursive-scan');
        this.globalCaseSensitive = this.panel.querySelector('#world-global-case-sensitive');
        this.globalMatchWholeWords = this.panel.querySelector('#world-global-full-match');
        this.globalUseGroupScoring = this.panel.querySelector('#world-global-group-scoring');
        this.globalOverflowWarning = this.panel.querySelector('#world-global-overflow-warning');

        this.panel.querySelector('#world-close').onclick = () => this.hide();
        this.panel.querySelector('#world-import').onclick = () => this.onImport();
        this.panel.querySelector('#world-new').onclick = () => this.onNewWorld();
        const exportBtn = this.panel.querySelector('#world-export-current');
        if (exportBtn) exportBtn.onclick = () => this.onExportCurrent();
        if (this.libraryToggleBtn) {
            this.libraryToggleBtn.onclick = () => this.openLibraryModal();
        }
        if (this.fileBtn && this.fileInput) {
            this.fileBtn.onclick = () => this.fileInput?.click();
        }
        if (this.fileInput) {
            this.fileInput.onchange = () => {
                const name = this.fileInput?.files?.[0]?.name || '';
                if (this.fileNameEl) this.fileNameEl.textContent = name || '未选择文件';
            };
        }
        if (this.fileNameEl) this.fileNameEl.textContent = '未选择文件';

        if (this.globalScanInput) {
            this.globalScanInput.onchange = () => {
                const raw = String(this.globalScanInput.value || '').trim();
                const scanDepth = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                window.appBridge?.setWorldGlobalSettings?.({ scanDepth });
            };
        }
        if (this.globalContextInput) {
            this.globalContextInput.onchange = () => {
                const raw = String(this.globalContextInput.value || '').trim();
                const percent = raw === '' ? null : Math.max(0, Math.min(100, Math.trunc(Number(raw))));
                window.appBridge?.setWorldGlobalSettings?.({ contextPercent: percent });
            };
        }
        if (this.globalBudgetInput) {
            this.globalBudgetInput.onchange = () => {
                const raw = String(this.globalBudgetInput.value || '').trim();
                const budgetCap = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                window.appBridge?.setWorldGlobalSettings?.({ budgetCap });
            };
        }
        if (this.globalMinActivationsInput) {
            this.globalMinActivationsInput.onchange = () => {
                const raw = String(this.globalMinActivationsInput.value || '').trim();
                const minActivations = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                window.appBridge?.setWorldGlobalSettings?.({ minActivations });
            };
        }
        if (this.globalMaxDepthInput) {
            this.globalMaxDepthInput.onchange = () => {
                const raw = String(this.globalMaxDepthInput.value || '').trim();
                const maxDepth = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                window.appBridge?.setWorldGlobalSettings?.({ maxDepth });
            };
        }
        if (this.globalMaxRecursionInput) {
            this.globalMaxRecursionInput.onchange = () => {
                const raw = String(this.globalMaxRecursionInput.value || '').trim();
                const maxRecursionSteps = raw === '' ? null : Math.max(0, Math.trunc(Number(raw)));
                window.appBridge?.setWorldGlobalSettings?.({ maxRecursionSteps });
            };
        }
        if (this.globalStrategySelect) {
            this.globalStrategySelect.onchange = () => {
                const value = String(this.globalStrategySelect.value || 'role_first');
                window.appBridge?.setWorldGlobalSettings?.({ insertionStrategy: value });
            };
        }
        if (this.globalIncludeNames) {
            this.globalIncludeNames.onchange = () => {
                const enabled = Boolean(this.globalIncludeNames.checked);
                window.appBridge?.setWorldGlobalSettings?.({ includeNames: enabled });
            };
        }
        if (this.globalRecursiveScan) {
            this.globalRecursiveScan.onchange = () => {
                const enabled = Boolean(this.globalRecursiveScan.checked);
                window.appBridge?.setWorldGlobalSettings?.({ recursiveScan: enabled });
            };
        }
        if (this.globalCaseSensitive) {
            this.globalCaseSensitive.onchange = () => {
                const enabled = Boolean(this.globalCaseSensitive.checked);
                window.appBridge?.setWorldGlobalSettings?.({ caseSensitive: enabled });
            };
        }
        if (this.globalMatchWholeWords) {
            this.globalMatchWholeWords.onchange = () => {
                const enabled = Boolean(this.globalMatchWholeWords.checked);
                window.appBridge?.setWorldGlobalSettings?.({ matchWholeWords: enabled });
            };
        }
        if (this.globalUseGroupScoring) {
            this.globalUseGroupScoring.onchange = () => {
                const enabled = Boolean(this.globalUseGroupScoring.checked);
                window.appBridge?.setWorldGlobalSettings?.({ useGroupScoring: enabled });
            };
        }
        if (this.globalOverflowWarning) {
            this.globalOverflowWarning.onchange = () => {
                const enabled = Boolean(this.globalOverflowWarning.checked);
                window.appBridge?.setWorldGlobalSettings?.({ alertOnOverflow: enabled });
            };
        }
        const globalHeader = this.panel.querySelector('#world-global-settings-header');
        if (globalHeader && this.globalSettingsBody && this.globalSettingsToggle) {
            const toggleGlobalSettings = () => {
                this.globalSettingsOpen = !this.globalSettingsOpen;
                this.globalSettingsBody.style.display = this.globalSettingsOpen ? '' : 'none';
                this.globalSettingsToggle.textContent = this.globalSettingsOpen ? '▲' : '▼';
            };
            globalHeader.onclick = () => toggleGlobalSettings();
            this.globalSettingsBody.style.display = this.globalSettingsOpen ? '' : 'none';
            this.globalSettingsToggle.textContent = this.globalSettingsOpen ? '▲' : '▼';
        }

        this.libraryOverlay = document.createElement('div');
        this.libraryOverlay.className = 'sticker-bind-overlay world-library-overlay';
        this.libraryOverlay.innerHTML = `
            <div class="sticker-bind-modal world-library-modal">
                <div class="sticker-bind-header">
                    <div>
                        <div class="sticker-bind-title">世界书库</div>
                        <div class="sticker-bind-subtitle">选择要绑定的世界书</div>
                    </div>
                    <button type="button" class="sticker-bind-close" aria-label="关闭">×</button>
                </div>
                <div class="sticker-bind-search">
                    <div style="display:flex; gap:8px; align-items:center;">
                        <input type="text" id="world-library-search" placeholder="搜索世界书" style="flex:1;">
                        <button type="button" id="world-library-reset" style="border:1px solid rgba(148,163,184,0.45); background:#fff; border-radius:999px; padding:5px 10px; font-size:12px; cursor:pointer;">清除</button>
                    </div>
                </div>
                <div class="sticker-bind-toolbar" style="flex-wrap:wrap;">
                    <div style="display:flex; gap:8px; align-items:center; flex-wrap:wrap;">
                        <span style="font-size:12px; color:#475569;">排序</span>
                        <select id="world-library-sort" style="border:1px solid rgba(148,163,184,0.45); border-radius:10px; padding:5px 8px; font-size:12px; background:#fff;">
                            <option value="time">时间</option>
                            <option value="name">字母</option>
                        </select>
                        <button type="button" id="world-library-sort-dir" aria-label="切换排序方向" style="border:1px solid rgba(148,163,184,0.45); background:#fff; border-radius:999px; width:28px; height:28px; font-size:12px; cursor:pointer; display:flex; align-items:center; justify-content:center;">
                            <svg viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" style="display:block; transform: translateY(1px);">
                                <path d="M8 2L11 5H9V7H7V5H5L8 2Z" fill="rgba(15,23,42,0.35)"></path>
                                <path d="M8 14L5 11H7V9H9V11H11L8 14Z" fill="rgba(15,23,42,0.75)"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="sticker-bind-list" id="world-library-list"></div>
                <div class="sticker-bind-footer">
                    <button type="button" id="world-library-close">关闭</button>
                </div>
            </div>
        `;
        this.libraryModal = this.libraryOverlay.querySelector('.world-library-modal');
        this.libraryListEl = this.libraryOverlay.querySelector('#world-library-list');
        this.librarySearchEl = this.libraryOverlay.querySelector('#world-library-search');
        this.librarySortEl = this.libraryOverlay.querySelector('#world-library-sort');
        this.libraryResetBtn = this.libraryOverlay.querySelector('#world-library-reset');
        this.librarySortDirBtn = this.libraryOverlay.querySelector('#world-library-sort-dir');

        const closeLibrary = () => {
            this.libraryOverlay?.classList.remove('is-active');
        };

        const openLibrary = async () => {
            if (!this.libraryOverlay) return;
            this.libraryOverlay.classList.add('is-active');
            await this.refreshList();
        };

        this.openLibraryModal = openLibrary;
        this.closeLibraryModal = closeLibrary;

        this.libraryOverlay.addEventListener('click', () => closeLibrary());
        this.libraryModal?.addEventListener('click', (event) => event.stopPropagation());
        this.libraryOverlay.querySelector('.sticker-bind-close')?.addEventListener('click', () => closeLibrary());
        this.libraryOverlay.querySelector('#world-library-close')?.addEventListener('click', () => closeLibrary());
        this.librarySearchEl?.addEventListener('input', () => {
            this.librarySearchTerm = String(this.librarySearchEl?.value || '');
            this.refreshList();
        });
        this.librarySortEl?.addEventListener('change', () => {
            this.librarySort = String(this.librarySortEl?.value || 'time') || 'time';
            this.refreshList();
        });
        this.librarySortDirBtn?.addEventListener('click', () => {
            this.librarySortDir = this.librarySortDir === 'asc' ? 'desc' : 'asc';
            this.refreshList();
        });
        this.libraryResetBtn?.addEventListener('click', () => {
            this.librarySearchTerm = '';
            this.librarySort = 'time';
            this.librarySortDir = 'desc';
            if (this.librarySearchEl) this.librarySearchEl.value = '';
            if (this.librarySortEl) this.librarySortEl.value = 'time';
            this.refreshList();
        });

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
        document.body.appendChild(this.libraryOverlay);
    }

    async onImport() {
        let jsonText = '';
        let nameHint = '';

        const file = this.fileInput?.files?.[0];
        if (file) {
            nameHint = file.name.replace(/\\.json$/i, '');
            jsonText = await file.text();
        }

        if (!jsonText) {
            window.toastr?.warning('请选择 ST JSON 文件');
            return;
        }

        try {
            const json = JSON.parse(jsonText);
            const nameFromJson = json.name || json.title || '';
            const name = nameFromJson || nameHint || 'imported';
            const simplified = convertSTWorld(json, name);
            await window.appBridge.saveWorldInfo(name, simplified);

            // 若导入文件包含绑定的正则集合，则一并导入并绑定到该世界书
            const boundSets = json?.boundRegexSets || json?.bound_regex_sets || json?.bound_regex_sets_v1 || null;
            if (Array.isArray(boundSets) && boundSets.length) {
                try {
                    const ok = await appConfirm({
                        title: '导入正则',
                        message: `检测到世界书包含绑定的正规表达式（${boundSets.length} 组）。是否一并导入并绑定？\n取消：仅导入世界书，不导入正则。`,
                        confirmText: '一并导入',
                        cancelText: '仅导入世界书',
                    });
                    if (!ok) {
                        await this.refreshList();
                        window.toastr?.success(`导入成功：${name}`);
                        if (this.fileInput) this.fileInput.value = '';
                        if (this.fileNameEl) this.fileNameEl.textContent = '未选择文件';
                        return;
                    }

                    await window.appBridge?.regex?.ready;
                    const ruleSig = (r) => {
                        const findRegex = String(r?.findRegex || '').trim();
                        const replaceString = String(r?.replaceString ?? '');
                        const trim = Array.isArray(r?.trimStrings) ? r.trimStrings.map(String).join('\n') : '';
                        const placement = Array.isArray(r?.placement) ? r.placement.map(n => Number(n)).filter(Number.isFinite).sort((a, b) => a - b).join(',') : '';
                        const disabled = r?.disabled ? '1' : '0';
                        const markdownOnly = r?.markdownOnly ? '1' : '0';
                        const promptOnly = r?.promptOnly ? '1' : '0';
                        const runOnEdit = r?.runOnEdit ? '1' : '0';
                        const sub = String(Number(r?.substituteRegex ?? 0));
                        const minD = (r?.minDepth === null || r?.minDepth === undefined || r?.minDepth === '') ? '' : String(r?.minDepth);
                        const maxD = (r?.maxDepth === null || r?.maxDepth === undefined || r?.maxDepth === '') ? '' : String(r?.maxDepth);
                        if (!findRegex && !String(r?.pattern || '').trim()) {
                            // legacy fallback signature
                            const when = String(r?.when || 'both');
                            const pattern = String(r?.pattern || '').trim();
                            const flags = (r?.flags === undefined || r?.flags === null) ? 'g' : String(r?.flags);
                            const replacement = String(r?.replacement ?? '');
                            return `${when}\u0000${pattern}\u0000${flags}\u0000${replacement}`;
                        }
                        return [
                            findRegex, replaceString, trim, placement,
                            disabled, markdownOnly, promptOnly, runOnEdit, sub, minD, maxD
                        ].join('\u0000');
                    };

                    const existingSigs = new Set();
                    try {
                        const sets = window.appBridge?.regex?.listLocalSets?.() || [];
                        sets.forEach(s => (Array.isArray(s?.rules) ? s.rules : []).forEach(r => {
                            existingSigs.add(ruleSig(r));
                        }));
                    } catch {}

                    for (const s of boundSets) {
                        const rulesRaw = Array.isArray(s?.rules) ? s.rules : [];
                        const rules = [];
                        const localSeen = new Set();
                        for (const rr of rulesRaw) {
                            const sig = ruleSig(rr);
                            if (!sig || localSeen.has(sig) || existingSigs.has(sig)) continue;
                            localSeen.add(sig);
                            existingSigs.add(sig);
                            rules.push(rr);
                        }
                        if (!rules.length) continue;
                        const setName = String(s?.name || '正则').trim() || '正则';
                        await window.appBridge.regex.upsertLocalSet({
                            name: `${setName} (${name})`,
                            enabled: s?.enabled !== false,
                            bind: { type: 'world', worldId: name },
                            rules,
                        });
                    }
                    window.toastr?.success('已导入并绑定正则');
                    window.dispatchEvent(new CustomEvent('regex-changed'));
                } catch (err) {
                    logger.warn('导入绑定正则失败', err);
                }
            }

            await this.refreshList();
            window.toastr?.success(`导入成功：${name}`);
            if (this.fileInput) this.fileInput.value = '';
            if (this.fileNameEl) this.fileNameEl.textContent = '未选择文件';
        } catch (err) {
            logger.error('导入世界书失败', err);
            window.toastr?.error('导入失败，请检查 JSON', '错误');
        }
    }

    async onExportCurrent() {
        const current = this.scope === 'global'
            ? (window.appBridge.globalWorldId || '')
            : (window.appBridge.currentWorldId || '');
        if (!current || current === '未启用') {
            window.toastr?.warning('没有可导出的世界书');
            return;
        }
        const data = await window.appBridge.getWorldInfo(current);
        if (!data) {
            window.toastr?.warning('没有可导出的世界书');
            return;
        }
        const payload = { ...(data || {}), name: current };

        // 追加绑定正则集合（便于导入时自动带上）
        try {
            await window.appBridge?.regex?.ready;
            const sets = window.appBridge?.regex?.listLocalSets?.() || [];
            const bound = sets.filter(s => s?.bind?.type === 'world' && s.bind.worldId === current)
                .map(s => ({ name: s.name, enabled: s.enabled !== false, rules: s.rules || [] }));
            if (bound.length) payload.boundRegexSets = bound;
        } catch {}

        const filename = `${this.sanitizeExportName(current, 'worldbook')}.json`;
        this.downloadJson(payload, filename);
        window.toastr?.success(`已导出：${filename}`);
    }

}
