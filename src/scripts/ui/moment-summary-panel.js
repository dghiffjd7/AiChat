import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';

export class MomentSummaryPanel {
    constructor({ store, onRunCompaction } = {}) {
        this.store = store;
        this.onRunCompaction = typeof onRunCompaction === 'function' ? onRunCompaction : null;
        this.overlay = null;
        this.panel = null;
        this.summariesList = null;
        this.compactedList = null;
        this.summaryBatchMode = false;
        this.summarySelectedKeys = new Set();
        this.summaryEditOverlay = null;
        this.summaryEditPanel = null;
        this.summaryEditTextarea = null;
        this.summaryEditSave = null;
        this.summaryEditCancel = null;
        this.__summaryEditOnSave = null;
        this.__compactedRawReady = false;
        this.summaryCompacting = false;
        this._onUpdate = () => {
            if (!this.panel || this.panel.style.display === 'none') return;
            this.renderSummaries();
            this.renderCompactedSummary();
        };
        window.addEventListener('moment-summaries-updated', this._onUpdate);
    }

    ensure() {
        if (this.panel) return;
        this.overlay = document.createElement('div');
        this.overlay.className = 'app-themed-overlay moment-summary-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.className = 'app-themed-panel moment-summary-panel-shell';
        this.panel.style.cssText = `
            display:none;
            position:fixed;
            z-index:22001;
            left:50%;
            top:50%;
            transform:translate(-50%, -50%);
            width:96vw;
            max-width:760px;
            height:86vh;
            background:var(--app-surface-card);
            border-radius:14px;
            box-shadow: 0 10px 24px rgba(0,0,0,0.18);
            overflow:hidden;
            display:flex;
            flex-direction:column;
        `;
        this.panel.addEventListener('click', (e) => e.stopPropagation());

        this.panel.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; padding:12px 14px; border-bottom:1px solid var(--app-border-default); background:var(--app-surface-subtle);">
                <div style="font-weight:900;">动态摘要</div>
                <button id="moment-summary-close" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:6px 10px; cursor:pointer;">关闭</button>
            </div>
            <div style="padding:12px 14px; overflow:auto; flex:1;">
                <div>
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                        <div style="font-size:12px; color:var(--app-text-muted);">摘要列表</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button id="moment-summaries-batch" type="button" title="批量操作" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; font-size:16px;">☑</button>
                            <button id="moment-summaries-clear" type="button" title="清空" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                        </div>
                    </div>
                    <div id="moment-summaries-batchbar" style="display:none; align-items:center; justify-content:flex-end; gap:8px; margin:6px 0 8px;">
                        <button id="moment-summaries-batch-edit" type="button" title="批量编辑" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px;">✎</button>
                        <button id="moment-summaries-batch-delete" type="button" title="批量删除" style="width:34px; height:30px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px;">🗑</button>
                        <button id="moment-summaries-batch-cancel" type="button" title="退出批量" style="width:34px; height:30px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:18px;">×</button>
                    </div>
                    <div id="moment-summaries-list" style="max-height:200px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-card); padding:0;"></div>
                </div>

                <div style="margin-top:14px;">
                    <div style="display:flex; align-items:center; justify-content:space-between; gap:10px; margin-bottom:6px;">
                        <div style="font-size:12px; color:var(--app-text-muted);">大总结（自动生成）</div>
                        <div style="display:flex; align-items:center; gap:8px;">
                            <button id="moment-compacted-raw" type="button" title="查看原始回复" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">📄</button>
                            <button id="moment-compacted-edit" type="button" title="编辑" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">✎</button>
                            <button id="moment-compacted-run" type="button" title="手动生成/刷新" style="width:32px; height:28px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:var(--app-text-primary); font-size:16px; line-height:1;">↻</button>
                            <button id="moment-compacted-clear" type="button" title="删除" style="width:32px; height:28px; border:1px solid #fecaca; border-radius:10px; background:var(--app-surface-card); cursor:pointer; color:#b91c1c; font-size:16px; line-height:1;">🗑</button>
                        </div>
                    </div>
                    <div id="moment-compacted-summary" style="max-height:240px; overflow-y:auto; border:1px solid var(--app-border-subtle); border-radius:8px; background:var(--app-surface-card); padding:0;"></div>
                </div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);

        this.summariesList = this.panel.querySelector('#moment-summaries-list');
        this.compactedList = this.panel.querySelector('#moment-compacted-summary');
        const batchBar = this.panel.querySelector('#moment-summaries-batchbar');

        this.panel.querySelector('#moment-summary-close').onclick = () => this.hide();
        this.panel.querySelector('#moment-summaries-clear').onclick = async () => {
            const ok = await appConfirm({
                title: '清空摘要',
                message: '确定要清空所有动态摘要吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.store?.clearSummaries?.(); } catch {}
            this.summarySelectedKeys = new Set();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        };
        this.panel.querySelector('#moment-summaries-batch').onclick = () => {
            this.setSummaryBatchMode(!this.summaryBatchMode);
        };
        this.panel.querySelector('#moment-summaries-batch-cancel').onclick = () => this.setSummaryBatchMode(false);
        this.panel.querySelector('#moment-summaries-batch-delete').onclick = () => this.deleteSelectedSummaries();
        this.panel.querySelector('#moment-summaries-batch-edit').onclick = () => this.editSelectedSummaries();

        this.panel.querySelector('#moment-compacted-raw').onclick = () => this.openCompactedRaw();
        this.panel.querySelector('#moment-compacted-edit').onclick = () => this.editCompactedSummary();
        this.panel.querySelector('#moment-compacted-run').onclick = () => this.runCompactedSummary();
        this.panel.querySelector('#moment-compacted-clear').onclick = async () => {
            const ok = await appConfirm({
                title: '清空大总结',
                message: '确定要清空动态大总结吗？',
                danger: true,
            });
            if (!ok) return;
            try { this.store?.clearCompactedSummary?.(); } catch {}
            this.renderCompactedSummary();
        };

        if (batchBar) batchBar.style.display = 'none';
    }

    show() {
        this.ensure();
        if (!this.panel || !this.overlay) return;
        this.renderSummaries();
        this.renderCompactedSummary();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
    }

    hide() {
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
        this.setSummaryBatchMode(false);
    }

    setSummaryBatchMode(next) {
        const enable = Boolean(next);
        this.summaryBatchMode = enable;
        if (!enable) this.summarySelectedKeys = new Set();
        const bar = this.panel?.querySelector('#moment-summaries-batchbar');
        if (bar) bar.style.display = enable ? 'flex' : 'none';
        this.renderSummaries();
    }

    ensureSummaryEditModal() {
        if (this.summaryEditPanel) return;
        this.summaryEditOverlay = document.createElement('div');
        this.summaryEditOverlay.className = 'app-themed-overlay moment-summary-inline-overlay';
        this.summaryEditOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:23000;';
        this.summaryEditOverlay.addEventListener('click', () => this.closeSummaryEditModal());

        this.summaryEditPanel = document.createElement('div');
        this.summaryEditPanel.className = 'app-themed-panel moment-summary-inline-panel';
        this.summaryEditPanel.style.cssText = `
            display:none;
            position:fixed;
            z-index:23001;
            left:50%;
            top:50%;
            transform:translate(-50%, -50%);
            width:92vw;
            max-width:640px;
            background:var(--app-surface-card);
            border-radius:12px;
            padding:12px;
            box-shadow: 0 12px 24px rgba(0,0,0,0.18);
        `;
        this.summaryEditPanel.addEventListener('click', (e) => e.stopPropagation());
        this.summaryEditPanel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; margin-bottom:8px;">
                <div style="font-weight:800;">编辑摘要</div>
                <button data-role="close" style="margin-left:auto; border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:8px; padding:4px 8px;">关闭</button>
            </div>
            <textarea data-role="textarea" style="width:100%; min-height:180px; border:1px solid var(--app-border-default); border-radius:10px; padding:10px; font-size:13px; line-height:1.4; resize:vertical;"></textarea>
            <div style="display:flex; justify-content:flex-end; gap:10px; margin-top:10px;">
                <button data-role="cancel" style="padding:8px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer;">取消</button>
                <button data-role="save" style="padding:8px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700;">保存</button>
            </div>
        `;

        document.body.appendChild(this.summaryEditOverlay);
        document.body.appendChild(this.summaryEditPanel);
        this.summaryEditTextarea = this.summaryEditPanel.querySelector('[data-role="textarea"]');
        this.summaryEditSave = this.summaryEditPanel.querySelector('[data-role="save"]');
        this.summaryEditCancel = this.summaryEditPanel.querySelector('[data-role="cancel"]');
        this.summaryEditPanel.querySelector('[data-role="close"]').onclick = () => this.closeSummaryEditModal();
        this.summaryEditCancel.onclick = () => this.closeSummaryEditModal();
    }

    openSummaryEditModal(value, onSave) {
        this.ensureSummaryEditModal();
        this.__summaryEditOnSave = typeof onSave === 'function' ? onSave : null;
        if (this.summaryEditTextarea) this.summaryEditTextarea.value = String(value || '');
        if (this.summaryEditSave) {
            this.summaryEditSave.disabled = false;
            this.summaryEditSave.onclick = () => {
                const v = String(this.summaryEditTextarea?.value || '');
                try { this.__summaryEditOnSave?.(v); } catch {}
            };
        }
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'block';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'block';
        setTimeout(() => {
            try { this.summaryEditTextarea?.focus?.(); } catch {}
        }, 0);
    }

    closeSummaryEditModal() {
        if (this.summaryEditOverlay) this.summaryEditOverlay.style.display = 'none';
        if (this.summaryEditPanel) this.summaryEditPanel.style.display = 'none';
        this.__summaryEditOnSave = null;
    }

    parseEditedSummaryLines(text) {
        const raw = String(text || '');
        const lines = raw.split(/\r?\n/).map(s => String(s).trim());
        const bullet = lines
            .filter(l => l.startsWith('- '))
            .map(l => l.slice(2).trim())
            .filter(Boolean);
        if (bullet.length) return bullet;
        return lines.filter(Boolean);
    }

    async deleteSelectedSummaries() {
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        const ok = await appConfirm({
            title: '删除摘要',
            message: `确定要删除所选摘要（${keys.length}条）吗？`,
            danger: true,
        });
        if (!ok) return;
        const items = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        try { this.store?.deleteSummaryItems?.(items); } catch {}
        this.setSummaryBatchMode(false);
        this.renderSummaries();
    }

    editSelectedSummaries() {
        const keys = [...this.summarySelectedKeys];
        if (!keys.length) {
            window.toastr?.info?.('未选择任何摘要');
            return;
        }
        const entries = keys.map((k) => {
            const [atStr, ...rest] = String(k).split('|');
            return { at: Number(atStr || 0) || 0, text: rest.join('|') };
        });
        const initial = entries.map(e => `- ${e.text}`).join('\n');
        this.openSummaryEditModal(initial, (nextRaw) => {
            const lines = this.parseEditedSummaryLines(nextRaw);
            if (lines.length !== entries.length) {
                window.toastr?.error?.(`行数不匹配：需要 ${entries.length} 行，实际 ${lines.length} 行`);
                return;
            }
            const updates = entries.map((e, i) => ({ at: e.at, fromText: e.text, toText: lines[i] }));
            try { this.store?.updateSummaryItems?.(updates); } catch {}
            this.closeSummaryEditModal();
            this.setSummaryBatchMode(false);
            this.renderSummaries();
        });
    }

    async runCompactedSummary() {
        if (this.summaryCompacting) return;
        if (typeof this.onRunCompaction !== 'function') {
            window.toastr?.error?.('大总结生成器尚未初始化，请稍后再试');
            return;
        }
        this.summaryCompacting = true;
        try {
            window.toastr?.info?.('正在生成大总结…');
            const ok = await this.onRunCompaction({ force: true });
            if (!ok) window.toastr?.error?.('大总结解析失败：未输出 <summary>…</summary> 或内容格式不符合要求，请重试');
            this.renderSummaries();
            this.renderCompactedSummary();
        } catch (err) {
            logger.warn('手动生成动态大总结失败', err);
            window.toastr?.error?.('生成失败');
        } finally {
            this.summaryCompacting = false;
        }
    }

    ensureCompactedRawModal() {
        if (this.__compactedRawReady) return;
        this.__compactedRawReady = true;
        const overlay = document.createElement('div');
        overlay.className = 'app-themed-overlay moment-summary-inline-overlay';
        overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:23000;';
        const panel = document.createElement('div');
        panel.className = 'app-themed-panel moment-summary-inline-panel';
        panel.style.cssText = `
            display:none;
            position:fixed;
            z-index:23001;
            left:50%;
            top:50%;
            transform:translate(-50%, -50%);
            width:92vw;
            max-width:720px;
            height:80vh;
            background:var(--app-surface-card);
            border-radius:12px;
            overflow:hidden;
            display:flex;
            flex-direction:column;
        `;
        panel.addEventListener('click', (e) => e.stopPropagation());
        panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid var(--app-border-default);">
                <div style="font-weight:900;">动态大总结原始回复</div>
                <button data-role="close" style="margin-left:auto; border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:8px; padding:4px 8px;">关闭</button>
            </div>
            <div style="flex:1; min-height:0; overflow:auto; -webkit-overflow-scrolling:touch; padding:10px;">
                <textarea data-role="text" readonly style="
                    width:100%;
                    height:100%;
                    min-height: 100%;
                    resize:none;
                    border:1px solid rgba(0,0,0,0.10);
                    border-radius:12px;
                    padding:12px;
                    font-size:13px;
                    line-height:1.4;
                    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace;
                    white-space: pre;
                    box-sizing:border-box;
                    outline:none;
                "></textarea>
            </div>
        `;
        overlay.appendChild(panel);
        overlay.addEventListener('click', () => {
            overlay.style.display = 'none';
            panel.style.display = 'none';
        });
        document.body.appendChild(overlay);
        document.body.appendChild(panel);

        this.__compactedRawOverlay = overlay;
        this.__compactedRawPanel = panel;
        this.__compactedRawText = panel.querySelector('[data-role="text"]');
        panel.querySelector('[data-role="close"]').onclick = () => {
            overlay.style.display = 'none';
            panel.style.display = 'none';
        };
    }

    openCompactedRaw() {
        this.ensureCompactedRawModal();
        const raw = String(this.store?.getCompactedSummaryRaw?.() || '').trim();
        if (!raw) {
            window.toastr?.warning?.('暂无原始回复');
            return;
        }
        if (this.__compactedRawText) this.__compactedRawText.value = raw;
        if (this.__compactedRawOverlay) this.__compactedRawOverlay.style.display = 'block';
        if (this.__compactedRawPanel) this.__compactedRawPanel.style.display = 'flex';
    }

    editCompactedSummary() {
        const current = this.store?.getCompactedSummary?.();
        const text = String(current?.text || '').trim();
        if (!text) {
            window.toastr?.info?.('暂无大总结');
            return;
        }
        this.openSummaryEditModal(text, (nextRaw) => {
            const next = String(nextRaw || '').trim();
            if (!next) {
                window.toastr?.warning?.('内容为空');
                return;
            }
            try { this.store?.setCompactedSummary?.(next, { at: Date.now() }); } catch {}
            this.closeSummaryEditModal();
            this.renderCompactedSummary();
            try { window.dispatchEvent(new CustomEvent('moment-summaries-updated')); } catch {}
        });
    }

    renderSummaries() {
        if (!this.summariesList || !this.store) return;
        const list = this.store.getSummaries() || [];
        const summaries = Array.isArray(list) ? list.slice().reverse() : [];
        this.summariesList.innerHTML = '';
        if (!summaries.length) {
            this.summariesList.innerHTML = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无摘要</div>';
            return;
        }
        summaries.slice(0, 60).forEach((it) => {
            const text = String((typeof it === 'string') ? it : it?.text || '').trim();
            if (!text) return;
            const at = (typeof it === 'object' && it && it.at) ? Number(it.at) : 0;
            const time = at ? new Date(at).toLocaleString() : '';
            const key = `${Number(at || 0) || 0}|${text}`;
            const row = document.createElement('div');
            if (this.summaryBatchMode) {
                const selected = this.summarySelectedKeys.has(key);
                row.style.cssText = `padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); display:flex; gap:10px; align-items:flex-start; cursor:pointer; background:${selected ? 'rgba(59,130,246,0.06)' : 'var(--app-surface-card)'};`;
                row.innerHTML = `
                    <div style="width:20px; height:20px; border-radius:999px; border:2px solid ${selected ? '#2563eb' : 'rgba(0,0,0,0.20)'}; margin-top:2px; display:flex; align-items:center; justify-content:center; color:var(--app-text-inverse); font-weight:900; font-size:12px; background:${selected ? '#2563eb' : 'transparent'}; box-sizing:border-box;">${selected ? '✓' : ''}</div>
                    <div style="flex:1; min-width:0;">
                        <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                        ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
                    </div>
                `;
                row.addEventListener('click', () => {
                    if (this.summarySelectedKeys.has(key)) this.summarySelectedKeys.delete(key);
                    else this.summarySelectedKeys.add(key);
                    this.renderSummaries();
                });
            } else {
                row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06);';
                row.innerHTML = `
                    <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap; word-break:break-word;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
                    ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
                `;
                row.addEventListener('click', async () => {
                    try {
                        await navigator.clipboard?.writeText?.(text);
                        window.toastr?.success?.('已复制摘要');
                    } catch {}
                });
            }
            this.summariesList.appendChild(row);
        });
    }

    renderCompactedSummary() {
        if (!this.compactedList || !this.store) return;
        const cs = this.store.getCompactedSummary?.();
        this.compactedList.innerHTML = '';
        const text = String(cs?.text || '').trim();
        if (!text) {
            this.compactedList.innerHTML = '<div style="padding:12px; color:var(--app-text-muted); text-align:center; font-size:12px;">暂无大总结</div>';
            return;
        }
        const at = Number(cs?.at || 0) || 0;
        const time = at ? new Date(at).toLocaleString() : '';
        const row = document.createElement('div');
        row.style.cssText = 'padding:10px 10px; border-bottom:1px solid rgba(0,0,0,0.06); cursor:pointer;';
        row.innerHTML = `
            <div style="color:var(--app-text-primary); font-size:13px; line-height:1.35; white-space:pre-wrap;">${text.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</div>
            ${time ? `<div style="color:var(--app-text-muted); font-size:11px; margin-top:6px;">${time}</div>` : ''}
        `;
        row.addEventListener('click', async () => {
            try {
                await navigator.clipboard?.writeText?.(text);
                window.toastr?.success?.('已复制大总结');
            } catch {}
        });
        this.compactedList.appendChild(row);
    }
}
