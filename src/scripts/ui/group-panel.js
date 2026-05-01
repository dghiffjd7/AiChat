/**
 * Group panel - manage contact groups
 * - 创建新分组
 * - 编辑/删除分组
 * - 显示分组列表
 */

import { logger } from '../utils/logger.js';
import { appConfirm } from './app-confirm.js';
import { bindCustomSelectButton, closeCustomSelectMenu, refreshCustomSelectButton } from './custom-select.js';

export class GroupPanel {
    constructor({ groupStore, onGroupChanged } = {}) {
        this.groupStore = groupStore;
        this.onGroupChanged = typeof onGroupChanged === 'function' ? onGroupChanged : null;
        this.overlay = null;
        this.panel = null;
        this.nameInput = null;
        this.parentSelect = null;
        this.parentSelectButton = null;
        this.parentPickerOverlay = null;
        this.parentPickerPanel = null;
        this.parentPickerTitle = null;
        this.parentPickerSelect = null;
        this.parentPickerSelectButton = null;
        this.parentPickerGroupId = '';
    }

    show() {
        if (!this.panel) this.createUI();
        this.refresh();
        this.overlay.style.display = 'block';
        this.panel.style.display = 'flex';
        setTimeout(() => {
            if (this.nameInput) this.nameInput.focus();
        }, 100);
    }

    hide() {
        closeCustomSelectMenu();
        if (this.overlay) this.overlay.style.display = 'none';
        if (this.panel) this.panel.style.display = 'none';
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'app-themed-overlay group-panel-overlay';
        this.overlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:20000;';
        this.overlay.onclick = () => this.hide();

        this.panel = document.createElement('div');
        this.panel.className = 'app-themed-panel group-panel-shell';
        this.panel.style.cssText = `
            display:none; position:fixed;
            top: calc(10px + env(safe-area-inset-top, 0px));
            left: calc(10px + env(safe-area-inset-left, 0px));
            right: calc(10px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 20px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:21000;
            overflow:hidden;
            display:flex; flex-direction:column;
        `;
        this.panel.onclick = (e) => e.stopPropagation();

        this.panel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div style="font-weight:800; color:var(--app-text-primary);">联系人分组</div>
                    <div style="color:var(--app-text-muted); font-size:12px;">管理你的联系人分组</div>
                </div>
                <button id="group-panel-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>

            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:var(--app-surface-subtle);">
                <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:8px;">新建分组</div>
                <div style="display:flex; gap:8px;">
                    <input id="group-name-input" type="text" placeholder="输入分组名称" maxlength="15" style="flex:1; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; font-size:14px;">
                    <button id="group-create-btn" style="padding:10px 18px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:700; white-space:nowrap;">创建</button>
                </div>
                <div style="margin-top:10px;">
                    <div style="font-size:12px; color:var(--app-text-muted); margin-bottom:6px;">上级分组（可选）</div>
                    <select id="group-parent-select" style="display:none;"></select>
                    <button type="button" id="group-parent-select-btn" class="world-app-select-btn" style="width:100%;">
                        <span class="pp-custom-select-label" data-custom-select-label>无上级</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>
            </div>

            <div style="flex:1; overflow:auto; -webkit-overflow-scrolling:touch; padding:14px 16px;">
                <div style="font-weight:700; color:var(--app-text-primary); margin-bottom:10px;">已有分组</div>
                <div id="group-list"></div>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);

        this.nameInput = this.panel.querySelector('#group-name-input');
        this.parentSelect = this.panel.querySelector('#group-parent-select');
        this.parentSelectButton = this.panel.querySelector('#group-parent-select-btn');
        bindCustomSelectButton({
            buttonEl: this.parentSelectButton,
            selectEl: this.parentSelect,
            fallback: '无上级',
        });

        this.panel.querySelector('#group-panel-close').onclick = () => this.hide();
        this.panel.querySelector('#group-create-btn').onclick = () => this.createGroup();

        this.nameInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                this.createGroup();
            } else if (e.key === 'Escape') {
                e.preventDefault();
                this.hide();
            }
        });
    }

    refresh() {
        const listEl = this.panel?.querySelector('#group-list');
        if (!listEl) return;

        const groups = this.groupStore?.listGroups?.() || [];

        if (groups.length === 0) {
            listEl.innerHTML = '<div style="color:var(--app-text-muted); text-align:center; padding:20px;">暂无分组</div>';
            this.refreshParentSelect();
            return;
        }

        const tree = this.buildGroupTree(groups);
        const items = [];
        const pushGroup = (group, depth) => {
            items.push(this.renderGroupItem(group, depth, tree));
            const children = tree.byParent.get(group.id) || [];
            children.forEach(child => pushGroup(child, depth + 1));
        };
        (tree.roots || []).forEach(g => pushGroup(g, 0));
        listEl.innerHTML = items.join('');

        // 绑定事件
        listEl.querySelectorAll('[data-group-edit]').forEach(btn => {
            btn.onclick = () => this.editGroup(btn.dataset.groupEdit);
        });
        listEl.querySelectorAll('[data-group-delete]').forEach(btn => {
            btn.onclick = () => this.deleteGroup(btn.dataset.groupDelete);
        });
        listEl.querySelectorAll('[data-group-parent]').forEach(btn => {
            btn.onclick = () => this.openParentPicker(btn.dataset.groupParent);
        });
        this.refreshParentSelect();
    }

    renderGroupItem(group, depth, tree) {
        const count = group.contacts?.length || 0;
        const indent = Math.min(depth * 14, 56);
        const parentId = String(group.parentId || '').trim();
        const parentName = parentId ? (tree.byId.get(parentId)?.name || parentId) : '';
        const parentLabel = parentName ? ` · 上级：${this.escapeHtml(parentName)}` : '';
        return `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; border:1px solid var(--app-border-default); border-radius:10px; margin-bottom:8px; background:var(--app-surface-subtle); margin-left:${indent}px;">
                <div style="flex:1; min-width:0;">
                    <div style="font-weight:600; color:var(--app-text-primary);">${this.escapeHtml(group.name)}</div>
                    <div style="font-size:12px; color:var(--app-text-muted);">${count} 个联系人${parentLabel}</div>
                </div>
                <button data-group-parent="${group.id}" style="padding:6px 12px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); cursor:pointer; font-size:12px;">上级</button>
                <button data-group-edit="${group.id}" style="padding:6px 12px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); cursor:pointer; font-size:12px;">重命名</button>
                <button data-group-delete="${group.id}" style="padding:6px 12px; border:1px solid #fca5a5; border-radius:8px; background:#fef2f2; color:#dc2626; cursor:pointer; font-size:12px;">删除</button>
            </div>
        `;
    }

    createGroup() {
        const name = this.nameInput?.value?.trim();
        if (!name) {
            window.toastr?.warning?.('请输入分组名称');
            return;
        }

        try {
            const parentId = String(this.parentSelect?.value || '').trim();
            const group = this.groupStore?.createGroup?.(name, parentId);
            window.toastr?.success?.(`分组「${group.name}」创建成功`);
            this.nameInput.value = '';
            if (this.parentSelect) this.parentSelect.value = '';
            this.refresh();
            this.onGroupChanged?.({ type: 'create', group });
        } catch (err) {
            logger.error('创建分组失败', err);
            window.toastr?.error?.(err.message || '创建分组失败');
        }
    }

    editGroup(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;

        const newName = prompt('输入新的分组名称', group.name);
        if (!newName || newName.trim() === '') return;
        if (newName.trim() === group.name) return;

        try {
            this.groupStore?.updateGroup?.(groupId, { name: newName.trim() });
            window.toastr?.success?.(`分组重命名为「${newName.trim()}」`);
            this.refresh();
            this.onGroupChanged?.({ type: 'update', group: this.groupStore.getGroup(groupId) });
        } catch (err) {
            logger.error('重命名分组失败', err);
            window.toastr?.error?.(err.message || '重命名失败');
        }
    }

    async deleteGroup(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;

        const count = group.contacts?.length || 0;
        const children = (this.groupStore?.listGroups?.() || []).filter(g => String(g.parentId || '').trim() === groupId);
        const childMsg = children.length > 0
            ? `\n${children.length} 个子分组将移动到上一级。`
            : '';
        const msg = count > 0
            ? `确定要删除分组「${group.name}」吗？\n分组中的 ${count} 个联系人将移动到未分组区域。${childMsg}`
            : `确定要删除分组「${group.name}」吗？${childMsg}`;

        const ok = await appConfirm({
            title: '删除分组',
            message: msg,
            danger: true,
        });
        if (!ok) return;

        try {
            this.groupStore?.deleteGroup?.(groupId);
            window.toastr?.success?.(`分组「${group.name}」已删除`);
            this.refresh();
            this.onGroupChanged?.({ type: 'delete', groupId });
        } catch (err) {
            logger.error('删除分组失败', err);
            window.toastr?.error?.('删除分组失败');
        }
    }

    buildGroupTree(groups) {
        const byParent = new Map();
        const byId = new Map();
        (groups || []).forEach(g => {
            if (g?.id) byId.set(g.id, g);
        });
        (groups || []).forEach(g => {
            if (!g?.id) return;
            const rawParent = String(g.parentId || '').trim();
            const parentId = rawParent && byId.has(rawParent) && rawParent !== g.id ? rawParent : '';
            if (!byParent.has(parentId)) byParent.set(parentId, []);
            byParent.get(parentId).push(g);
        });
        for (const list of byParent.values()) {
            list.sort((a, b) => (a.order || 0) - (b.order || 0));
        }
        return { byParent, byId, roots: byParent.get('') || [] };
    }

    refreshParentSelect() {
        if (!this.parentSelect) return;
        const groups = this.groupStore?.listGroups?.() || [];
        const tree = this.buildGroupTree(groups);
        const options = ['<option value="">无上级</option>'];
        const pushOption = (group, depth) => {
            const prefix = depth > 0 ? `${'—'.repeat(depth)} ` : '';
            options.push(`<option value="${group.id}">${prefix}${this.escapeHtml(group.name)}</option>`);
            const children = tree.byParent.get(group.id) || [];
            children.forEach(child => pushOption(child, depth + 1));
        };
        (tree.roots || []).forEach(g => pushOption(g, 0));
        this.parentSelect.innerHTML = options.join('');
        refreshCustomSelectButton(this.parentSelectButton, this.parentSelect, '无上级');
    }

    openParentPicker(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;
        this.ensureParentPicker();
        this.parentPickerGroupId = groupId;
        if (this.parentPickerTitle) {
            this.parentPickerTitle.textContent = `设置上级分组：${group.name}`;
        }
        this.populateParentPicker(groupId, String(group.parentId || '').trim());
        if (this.parentPickerOverlay) this.parentPickerOverlay.style.display = 'block';
        if (this.parentPickerPanel) this.parentPickerPanel.style.display = 'flex';
    }

    closeParentPicker() {
        closeCustomSelectMenu();
        if (this.parentPickerOverlay) this.parentPickerOverlay.style.display = 'none';
        if (this.parentPickerPanel) this.parentPickerPanel.style.display = 'none';
    }

    ensureParentPicker() {
        if (this.parentPickerPanel) return;
        this.parentPickerOverlay = document.createElement('div');
        this.parentPickerOverlay.className = 'app-themed-overlay group-parent-overlay';
        this.parentPickerOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.parentPickerOverlay.addEventListener('click', () => this.closeParentPicker());

        this.parentPickerPanel = document.createElement('div');
        this.parentPickerPanel.className = 'app-themed-panel group-parent-panel';
        this.parentPickerPanel.style.cssText = `
            display:none; position:fixed;
            top: calc(30px + env(safe-area-inset-top, 0px));
            left: calc(22px + env(safe-area-inset-left, 0px));
            right: calc(22px + env(safe-area-inset-right, 0px));
            background:var(--app-surface-card); border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:23000;
            overflow:hidden;
        `;
        this.parentPickerPanel.addEventListener('click', (e) => e.stopPropagation());
        this.parentPickerPanel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div id="group-parent-title" style="font-weight:800; color:var(--app-text-primary);">设置上级分组</div>
                    <div style="color:var(--app-text-muted); font-size:12px;">选择一个上级分组（可选）</div>
                </div>
                <button id="group-parent-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:var(--app-text-primary);">×</button>
            </div>
            <div style="padding:14px 16px;">
                <select id="group-parent-select-modal" style="display:none;"></select>
                <button type="button" id="group-parent-select-modal-btn" class="world-app-select-btn" style="width:100%;">
                    <span class="pp-custom-select-label" data-custom-select-label>无上级</span>
                    <span class="world-app-select-btn-chevron">▾</span>
                </button>
            </div>
            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="group-parent-cancel" style="flex:1; padding:10px 14px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-card); cursor:pointer;">取消</button>
                <button id="group-parent-confirm" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:var(--app-text-inverse); cursor:pointer; font-weight:800;">保存</button>
            </div>
        `;

        document.body.appendChild(this.parentPickerOverlay);
        document.body.appendChild(this.parentPickerPanel);

        this.parentPickerTitle = this.parentPickerPanel.querySelector('#group-parent-title');
        this.parentPickerSelect = this.parentPickerPanel.querySelector('#group-parent-select-modal');
        this.parentPickerSelectButton = this.parentPickerPanel.querySelector('#group-parent-select-modal-btn');
        bindCustomSelectButton({
            buttonEl: this.parentPickerSelectButton,
            selectEl: this.parentPickerSelect,
            fallback: '无上级',
        });

        this.parentPickerPanel.querySelector('#group-parent-close').onclick = () => this.closeParentPicker();
        this.parentPickerPanel.querySelector('#group-parent-cancel').onclick = () => this.closeParentPicker();
        this.parentPickerPanel.querySelector('#group-parent-confirm').onclick = () => {
            const groupId = this.parentPickerGroupId;
            if (!groupId) return;
            const nextParentId = String(this.parentPickerSelect?.value || '').trim();
            try {
                this.groupStore?.updateGroup?.(groupId, { parentId: nextParentId });
                window.toastr?.success?.('已更新上级分组');
                this.closeParentPicker();
                this.refresh();
                this.onGroupChanged?.({ type: 'update', group: this.groupStore.getGroup(groupId) });
            } catch (err) {
                logger.error('更新上级分组失败', err);
                window.toastr?.error?.(err.message || '更新失败');
            }
        };
    }

    populateParentPicker(groupId, currentParentId) {
        if (!this.parentPickerSelect) return;
        const groups = this.groupStore?.listGroups?.() || [];
        const tree = this.buildGroupTree(groups);
        const descendants = new Set();
        const queue = [groupId];
        while (queue.length) {
            const cur = queue.shift();
            const children = tree.byParent.get(cur) || [];
            children.forEach(child => {
                if (!descendants.has(child.id)) {
                    descendants.add(child.id);
                    queue.push(child.id);
                }
            });
        }
        const options = ['<option value="">无上级</option>'];
        const pushOption = (group, depth) => {
            if (group.id === groupId || descendants.has(group.id)) return;
            const prefix = depth > 0 ? `${'—'.repeat(depth)} ` : '';
            options.push(`<option value="${group.id}">${prefix}${this.escapeHtml(group.name)}</option>`);
            const children = tree.byParent.get(group.id) || [];
            children.forEach(child => pushOption(child, depth + 1));
        };
        (tree.roots || []).forEach(g => pushOption(g, 0));
        this.parentPickerSelect.innerHTML = options.join('');
        this.parentPickerSelect.value = currentParentId || '';
        refreshCustomSelectButton(this.parentPickerSelectButton, this.parentPickerSelect, '无上级');
    }

    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    }
}
