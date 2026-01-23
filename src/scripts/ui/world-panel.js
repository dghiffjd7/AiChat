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
        this.fileInput = null;
        this.fileBtn = null;
        this.fileNameEl = null;
        this.scope = 'session'; // session | global
        this.contactsStore = contactsStore;
        this.getSessionId = typeof getSessionId === 'function' ? getSessionId : null;
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
            const indicator = this.panel?.querySelector('#world-current');
            if (indicator) {
                indicator.textContent = this.scope === 'global'
                    ? `全局当前：${currentId || '未启用'}`
                    : (isGroupSession ? `群聊 ${contact?.name || sessionId}：按成员绑定世界书` : `会话 ${sessionId} 当前：${currentId || '未启用'}`);
            }
            const names = await window.appBridge.listWorlds?.();
            const visibleNames = (names || []).filter((name) => name !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
            if (!visibleNames.length) {
                const li = document.createElement('li');
                li.textContent = '（暂无世界书）';
                li.style.color = '#888';
                this.listEl.appendChild(li);
                return;
            }

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
                    const rawBound = window.appBridge?.getWorldForSession?.(memberId) || '';
                    const bound = rawBound === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID ? '' : rawBound;

                    const row = document.createElement('div');
                    row.style.cssText = 'display:flex; align-items:center; gap:10px; padding:10px; border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:#fff;';
                    row.innerHTML = `
                        <img src="${avatar}" alt="" style="width:34px; height:34px; border-radius:50%; object-fit:cover;">
                        <div style="flex:1; min-width:0;">
                            <div style="font-weight:800; color:#0f172a; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${name}</div>
                            <div style="color:${bound ? '#0f172a' : '#94a3b8'}; font-size:12px; margin-top:2px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                                ${bound ? `已绑定：${bound}` : '未绑定世界书'}
                            </div>
                        </div>
                    `;

                    const btnWrap = document.createElement('div');
                    btnWrap.style.cssText = 'display:flex; gap:6px; align-items:center;';
                    const pickBtn = document.createElement('button');
                    pickBtn.textContent = bound ? '更换' : '绑定';
                    pickBtn.style.cssText = 'padding:6px 10px;border:1px solid #ddd;border-radius:10px;background:#fff;cursor:pointer;';
                    pickBtn.onclick = () => {
                        const options = visibleNames.slice().sort((a, b) => String(a).localeCompare(String(b)));
                        const hint = options.slice(0, 40).join('\n');
                        const raw = prompt(`为「${name}」选择要绑定的世界书名称（输入名称即可）：\n\n（部分列表）\n${hint}\n\n也可直接输入完整名称`, bound || '');
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
                    offBtn.disabled = !bound;
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

            visibleNames.forEach((name) => {
                const li = document.createElement('li');
                li.style.display = 'flex';
                li.style.alignItems = 'center';
                li.style.justifyContent = 'space-between';
                li.style.padding = '6px 8px';
                li.style.borderBottom = '1px solid #f0f0f0';
                li.style.cursor = 'pointer';
                li.title = '双击编辑世界书';
                if (name === currentId) {
                    li.style.background = '#f8fafc';
                    li.style.border = '1px solid #e2e8f0';
                }

                const title = document.createElement('span');
                title.textContent = name;
                title.style.fontWeight = '600';
                title.style.cursor = 'pointer';
                title.ondblclick = async (e) => {
                    e.stopPropagation();
                    await this.openEditor(name);
                };

                li.ondblclick = async (e) => {
                    if (e.target?.tagName === 'BUTTON') return;
                    e.stopPropagation();
                    await this.openEditor(name);
                };

                const actions = document.createElement('div');
                actions.style.display = 'flex';
                actions.style.gap = '6px';

                const activate = document.createElement('button');
                if (isGroupSession && this.scope === 'session') {
                    activate.textContent = '（群聊）';
                    activate.disabled = true;
                    activate.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:not-allowed;opacity:0.7;';
                } else {
                    activate.textContent = name === currentId ? '当前' : '启用';
                    activate.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
                    if (name === currentId) {
                        activate.disabled = true;
                        activate.style.opacity = '0.7';
                    }
                    activate.onclick = async () => {
                        if (this.scope === 'global') {
                            await window.appBridge.setGlobalWorld(name);
                        } else {
                            await window.appBridge.setCurrentWorld(name);
                        }
                        const data = await window.appBridge.getWorldInfo(name);
                        logger.info('Activated world', name, data);
                        window.toastr?.success(`已启用世界书：${name}`);
                        window.dispatchEvent(new CustomEvent('worldinfo-changed', { detail: { worldId: name } }));
                        await this.refreshList();
                    };
                }

                const deactivate = document.createElement('button');
                deactivate.textContent = '停用';
                deactivate.style.cssText = 'padding:4px 8px;border:1px solid #fecaca;border-radius:6px;background:#fee2e2;color:#b91c1c;cursor:pointer;';
                if (this.scope === 'global') {
                    deactivate.disabled = !currentId;
                } else {
                    deactivate.disabled = !currentId || isGroupSession;
                }
                deactivate.style.opacity = deactivate.disabled ? '0.6' : '1';
                deactivate.onclick = async () => {
                    if (deactivate.disabled) return;
                    if (this.scope === 'global') {
                        await window.appBridge.setGlobalWorld('');
                    } else {
                        window.appBridge?.bindWorldToSession?.(sessionId, '', { silent: false });
                    }
                    window.toastr?.success('已停用世界书');
                    await this.refreshList();
                };

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

                const exportBtn = document.createElement('button');
                exportBtn.textContent = '导出';
                exportBtn.style.cssText = 'padding:4px 8px;border:1px solid #ddd;border-radius:6px;background:#f5f5f5;cursor:pointer;';
                exportBtn.onclick = async () => {
                    const data = await window.appBridge.getWorldInfo(name);
                    const text = JSON.stringify(data || {}, null, 2);
                    if (navigator.clipboard?.writeText) {
                        await navigator.clipboard.writeText(text);
                        window.toastr?.success('已复制到剪贴板');
                    } else {
                        // 退化：下载文件
                        const blob = new Blob([text], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `${name}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                        window.toastr?.success('已触发下载');
                    }
                };

                actions.appendChild(activate);
                actions.appendChild(deactivate);
                actions.appendChild(exportBtn);
                actions.appendChild(deleteBtn);
                li.appendChild(title);
                li.appendChild(actions);
                this.listEl.appendChild(li);
            });
        } catch (err) {
            logger.error('刷新世界书列表失败', err);
        }
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
            <div style="display:flex; gap:12px; flex-wrap: wrap;">
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div style="font-weight:700; margin-bottom:6px;">已保存</div>
                    <ul id="world-list" style="list-style:none; padding:8px; border:1px solid #eee; border-radius:8px; max-height:220px; overflow:auto; margin:0;"></ul>
                    <div style="display:flex; gap:8px; margin-top:8px;">
                        <button id="world-new" style="flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#019aff; color:#fff; font-weight:700;">新增</button>
                        <button id="world-export-current" style="flex:1; padding:8px 10px; border:1px solid #ddd; border-radius:8px; background:#f5f5f5;">导出当前</button>
                    </div>
                </div>
                <div style="flex:1 1 45%; min-width: 200px;">
                    <div style="font-weight:700; margin-bottom:6px;">导入 ST JSON</div>
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
        this.fileInput = this.panel.querySelector('#world-file');
        this.fileBtn = this.panel.querySelector('#world-file-btn');
        this.fileNameEl = this.panel.querySelector('#world-file-name');

        this.panel.querySelector('#world-close').onclick = () => this.hide();
        this.panel.querySelector('#world-import').onclick = () => this.onImport();
        this.panel.querySelector('#world-new').onclick = () => this.onNewWorld();
        this.panel.querySelector('#world-export-current').onclick = () => this.onExportCurrent();
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

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);
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
            ? (window.appBridge.globalWorldId || '未启用')
            : (window.appBridge.currentWorldId || '未启用');
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

        const text = JSON.stringify(payload, null, 2);
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(text);
            window.toastr?.success(`已复制：${current}`);
        } else {
            const blob = new Blob([text], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `${current}.json`;
            a.click();
            URL.revokeObjectURL(url);
            window.toastr?.success(`已触发下载：${current}.json`);
        }
    }

}
