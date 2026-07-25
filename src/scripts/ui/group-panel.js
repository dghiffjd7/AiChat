/**
 * Contact grouping manager
 * - Create nested contact groups
 * - Rename, move and delete groups
 * - Keep the redesign view separate from the persisted GroupStore model
 */

import { logger } from '../utils/logger.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import {
    CONTACT_GROUP_COLORS,
    normalizeContactGroupColor,
    resolveContactGroupColor,
} from '../storage/contact-group-color-utils.js';
import {
    bindCustomSelectButton,
    closeCustomSelectMenu,
    openCustomSelectMenu,
    refreshCustomSelectButton,
} from './custom-select.js';
import { createGroupPanelMotionRuntime } from './group-panel-motion-runtime-utils.js';

export class GroupPanel {
    constructor({ groupStore, contactsStore = null, onGroupChanged } = {}) {
        this.groupStore = groupStore;
        this.contactsStore = contactsStore;
        this.onGroupChanged = typeof onGroupChanged === 'function' ? onGroupChanged : null;
        this.overlay = null;
        this.panel = null;
        this.motion = null;
        this.nameInput = null;
        this.parentSelect = null;
        this.parentSelectButton = null;
        this.selectedColor = 'sky';
        this.editingGroupId = '';
        this.deletingGroupId = '';
    }

    show() {
        if (!this.panel) this.createUI();
        this.editingGroupId = '';
        this.deletingGroupId = '';
        this.selectedColor = 'sky';
        this.syncColorChoices();
        this.clearCreateError();
        this.refresh();
        this.motion?.show();
        setTimeout(() => this.nameInput?.focus?.(), 100);
    }

    hide() {
        closeCustomSelectMenu();
        this.motion?.hide();
    }

    createUI() {
        this.overlay = document.createElement('div');
        this.overlay.className = 'app-themed-overlay group-redesign-overlay group-panel-overlay';
        this.overlay.style.display = 'none';
        this.overlay.addEventListener('click', () => this.hide());

        this.panel = document.createElement('div');
        this.panel.id = 'group-panel';
        this.panel.className = 'app-themed-panel group-redesign-panel group-panel-shell';
        this.panel.style.display = 'none';
        this.panel.setAttribute('role', 'dialog');
        this.panel.setAttribute('aria-modal', 'true');
        this.panel.setAttribute('aria-labelledby', 'group-panel-title');
        this.panel.addEventListener('click', (event) => event.stopPropagation());

        const colorChoices = Object.values(CONTACT_GROUP_COLORS)
            .map((color) => `
                <button
                    type="button"
                    class="group-color-choice${color.key === this.selectedColor ? ' is-selected' : ''}"
                    data-group-color="${color.key}"
                    title="${color.label}"
                    aria-label="标识色 ${color.label}"
                    aria-pressed="${color.key === this.selectedColor ? 'true' : 'false'}"
                    style="--group-choice-color:${color.value};"
                ></button>
            `)
            .join('');

        this.panel.innerHTML = `
            <header class="group-redesign-header group-manager-header">
                <span class="group-manager-header-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                        <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path>
                        <path d="M7 5V3h4l2 2M8 11h8M8 15h5"></path>
                    </svg>
                </span>
                <div class="group-redesign-heading">
                    <h2 id="group-panel-title">联系人分组</h2>
                    <p>把联系人收进不同的小格子，找人不再抓瞎</p>
                </div>
                <button id="group-panel-close" class="group-redesign-close" type="button" aria-label="关闭">
                    <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>
                </button>
            </header>

            <div class="group-manager-body">
                <section id="group-manager-create-card" class="group-manager-create-card">
                    <div class="group-manager-create-row">
                        <label class="group-manager-name-field">
                            <input id="group-name-input" type="text" placeholder="给分组起个名字，比如「饭搭子」" maxlength="16" autocomplete="off">
                            <span id="group-manager-name-count">0/16</span>
                        </label>
                        <button id="group-create-btn" class="group-redesign-primary group-manager-create-button" type="button">
                            <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 5v14M5 12h14"></path></svg>
                            创建分组
                        </button>
                    </div>
                    <div class="group-manager-options">
                        <div class="group-manager-option">
                            <span>标识色</span>
                            <div class="group-color-choices" role="group" aria-label="分组标识色">${colorChoices}</div>
                        </div>
                        <div class="group-manager-option group-manager-parent-option">
                            <span>上级分组</span>
                            <select id="group-parent-select" hidden></select>
                            <button type="button" id="group-parent-select-btn" class="world-app-select-btn group-parent-select-button">
                                <span class="pp-custom-select-label" data-custom-select-label>无上级</span>
                                <span class="world-app-select-btn-chevron" aria-hidden="true">⇅</span>
                            </button>
                        </div>
                    </div>
                    <div id="group-manager-create-error" class="group-manager-create-error" aria-live="polite"></div>
                </section>

                <section class="group-manager-existing">
                    <div class="group-manager-existing-heading">
                        <span>已有分组</span>
                        <span id="group-manager-total" class="group-manager-total">0</span>
                        <span class="group-manager-existing-note">支持多级分组 · 悬停卡片管理</span>
                    </div>
                    <div id="group-list" class="group-manager-list"></div>
                </section>
            </div>
        `;

        document.body.appendChild(this.overlay);
        document.body.appendChild(this.panel);

        this.motion = createGroupPanelMotionRuntime({
            overlayEl: this.overlay,
            panelEl: this.panel,
            isReducedMotion: () =>
                document.body?.dataset?.reducedMotion === 'on' ||
                window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches === true,
        });
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
        this.panel.querySelectorAll('[data-group-color]').forEach((button) => {
            button.addEventListener('click', () => {
                this.selectedColor = normalizeContactGroupColor(button.dataset.groupColor);
                this.syncColorChoices();
            });
        });
        this.nameInput.addEventListener('input', () => {
            const count = this.panel.querySelector('#group-manager-name-count');
            if (count) count.textContent = `${this.nameInput.value.length}/16`;
            this.clearCreateError();
        });
        this.nameInput.addEventListener('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                this.createGroup();
            } else if (event.key === 'Escape') {
                event.preventDefault();
                this.hide();
            }
        });
        window.addEventListener('keydown', (event) => {
            if (event.key !== 'Escape' || !this.motion?.isVisible?.()) return;
            const customSelectMenu = document.querySelector('.world-app-select-menu');
            if (customSelectMenu && getComputedStyle(customSelectMenu).display !== 'none') {
                event.preventDefault();
                closeCustomSelectMenu();
                return;
            }
            this.hide();
        });
    }

    syncColorChoices() {
        this.panel?.querySelectorAll?.('[data-group-color]').forEach((button) => {
            const selected = button.dataset.groupColor === this.selectedColor;
            button.classList.toggle('is-selected', selected);
            button.setAttribute('aria-pressed', selected ? 'true' : 'false');
        });
    }

    clearCreateError() {
        const error = this.panel?.querySelector?.('#group-manager-create-error');
        const card = this.panel?.querySelector?.('#group-manager-create-card');
        if (error) error.textContent = '';
        card?.classList?.remove?.('has-error');
    }

    showCreateError(message) {
        const error = this.panel?.querySelector?.('#group-manager-create-error');
        const card = this.panel?.querySelector?.('#group-manager-create-card');
        if (error) {
            error.innerHTML = `
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"></circle><path d="M12 7v6M12 17h.01"></path></svg>
                <span></span>
            `;
            error.lastElementChild.textContent = message;
        }
        if (card) {
            card.classList.remove('has-error', 'is-shaking');
            void card.offsetWidth;
            card.classList.add('has-error', 'is-shaking');
            setTimeout(() => card.classList.remove('is-shaking'), 420);
        }
    }

    refresh() {
        const listEl = this.panel?.querySelector('#group-list');
        if (!listEl) return;
        const groups = this.groupStore?.listGroups?.() || [];
        const total = this.panel.querySelector('#group-manager-total');
        if (total) total.textContent = String(groups.length);

        if (!groups.length) {
            listEl.innerHTML = `
                <div class="group-manager-empty">
                    <span><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path><path d="M12 11v5M9.5 13.5h5"></path></svg></span>
                    <strong>还没有分组</strong>
                    <p>在上方创建第一个，把联系人归归类</p>
                </div>
            `;
            this.refreshParentSelect();
            return;
        }

        const tree = this.buildGroupTree(groups);
        const items = [];
        const pushGroup = (group, depth) => {
            items.push(this.renderGroupItem(group, depth, tree));
            (tree.byParent.get(group.id) || []).forEach(child => pushGroup(child, depth + 1));
        };
        tree.roots.forEach(group => pushGroup(group, 0));
        listEl.innerHTML = items.join('');
        this.bindGroupItemActions(listEl);
        this.refreshParentSelect();
    }

    renderGroupItem(group, depth, tree) {
        const count = Array.isArray(group?.contacts) ? group.contacts.length : 0;
        const color = resolveContactGroupColor(group?.color);
        const parentId = String(group?.parentId || '').trim();
        const parentName = parentId ? (tree.byId.get(parentId)?.name || parentId) : '';
        const idAttr = this.escapeAttribute(group.id);
        const cardStyle = `--group-card-color:${color.value};--group-card-soft:${color.soft};--group-depth:${Math.min(depth, 4)};`;
        const folderIcon = `
            <span class="group-manager-folder" aria-hidden="true">
                <svg viewBox="0 0 24 24"><path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z"></path></svg>
            </span>
        `;

        if (this.editingGroupId === group.id) {
            return `
                <div class="group-manager-card is-editing" style="${cardStyle}" data-group-id="${idAttr}">
                    ${folderIcon}
                    <div class="group-manager-inline-edit">
                        <input data-group-rename-input="${idAttr}" maxlength="16" value="${this.escapeAttribute(group.name)}" aria-label="分组名称">
                        <button type="button" class="is-save" data-group-rename-save="${idAttr}" aria-label="保存">
                            <svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"></path></svg>
                        </button>
                        <button type="button" class="is-cancel" data-group-inline-cancel="${idAttr}" aria-label="取消">
                            <svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"></path></svg>
                        </button>
                    </div>
                </div>
            `;
        }

        if (this.deletingGroupId === group.id) {
            const childCount = (tree.byParent.get(group.id) || []).length;
            return `
                <div class="group-manager-card is-deleting" style="${cardStyle}" data-group-id="${idAttr}">
                    ${folderIcon}
                    <div class="group-manager-inline-delete">
                        <p>删除后 ${count} 位联系人将移入「未分组」${childCount ? `，${childCount} 个子分组移至上一级` : ''}</p>
                        <div>
                            <button type="button" data-group-inline-cancel="${idAttr}">手滑了</button>
                            <button type="button" class="is-danger" data-group-delete-confirm="${idAttr}">确认删除</button>
                        </div>
                    </div>
                </div>
            `;
        }

        return `
            <div class="group-manager-card" style="${cardStyle}" data-group-id="${idAttr}">
                ${folderIcon}
                <div class="group-manager-card-copy">
                    <strong>${this.escapeHtml(group.name)}</strong>
                    <span>${count} 位成员${parentName ? ` · 上级「${this.escapeHtml(parentName)}」` : ''}</span>
                </div>
                ${this.buildAvatarStack(group.contacts)}
                <div class="group-manager-card-actions">
                    <button type="button" data-group-edit="${idAttr}" aria-label="重命名" title="重命名">
                        <svg viewBox="0 0 24 24"><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"></path></svg>
                    </button>
                    <button type="button" class="is-parent" data-group-parent="${idAttr}" aria-label="设置上级分组" title="设置上级分组">
                        <svg viewBox="0 0 24 24"><path d="M6 3v12M18 9v12M6 9h12M3 15h6M15 21h6"></path></svg>
                    </button>
                    <button type="button" class="is-delete" data-group-delete="${idAttr}" aria-label="删除分组" title="删除分组">
                        <svg viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5"></path></svg>
                    </button>
                </div>
            </div>
        `;
    }

    buildAvatarStack(contactIds = []) {
        const contacts = (Array.isArray(contactIds) ? contactIds : [])
            .map(id => this.contactsStore?.getContact?.(id))
            .filter(Boolean);
        if (!contacts.length) return '';
        const shown = contacts.slice(0, 4);
        const images = shown.map((contact) => {
            const name = String(contact?.name || contact?.id || '联系人').trim();
            const tags = Array.isArray(contact?.libraryTags) && contact.libraryTags.length
                ? contact.libraryTags
                : Array.isArray(contact?.labels)
                    ? contact.labels
                    : [];
            const avatar = resolveLineAvatar({
                avatar: contact?.avatar || FEATHER_DEFAULT,
                name,
                tags,
                size: 64,
            });
            return `<img src="${this.escapeAttribute(avatar)}" alt="">`;
        }).join('');
        const rest = contacts.length - shown.length;
        return `<span class="group-manager-avatar-stack">${images}${rest > 0 ? `<i>+${rest}</i>` : ''}</span>`;
    }

    bindGroupItemActions(listEl) {
        listEl.querySelectorAll('[data-group-edit]').forEach((button) => {
            button.onclick = () => this.editGroup(button.dataset.groupEdit);
        });
        listEl.querySelectorAll('[data-group-delete]').forEach((button) => {
            button.onclick = () => {
                this.deletingGroupId = button.dataset.groupDelete;
                this.editingGroupId = '';
                this.refresh();
            };
        });
        listEl.querySelectorAll('[data-group-parent]').forEach((button) => {
            button.onclick = () => this.openParentPicker(button.dataset.groupParent, button);
        });
        listEl.querySelectorAll('[data-group-inline-cancel]').forEach((button) => {
            button.onclick = () => {
                this.editingGroupId = '';
                this.deletingGroupId = '';
                this.refresh();
            };
        });
        listEl.querySelectorAll('[data-group-rename-save]').forEach((button) => {
            button.onclick = () => this.saveRename(button.dataset.groupRenameSave);
        });
        listEl.querySelectorAll('[data-group-rename-input]').forEach((input) => {
            input.addEventListener('keydown', (event) => {
                if (event.key === 'Enter') this.saveRename(input.dataset.groupRenameInput);
                if (event.key === 'Escape') {
                    this.editingGroupId = '';
                    this.refresh();
                }
            });
        });
        listEl.querySelectorAll('[data-group-delete-confirm]').forEach((button) => {
            button.onclick = () => this.confirmDeleteGroup(button.dataset.groupDeleteConfirm);
        });
    }

    createGroup() {
        const name = this.nameInput?.value?.trim();
        const groups = this.groupStore?.listGroups?.() || [];
        if (!name) {
            this.showCreateError('先给分组写个名字吧');
            return false;
        }
        if (groups.some(group => String(group?.name || '').trim() === name)) {
            this.showCreateError('这个名字已经被占用啦，换一个试试');
            return false;
        }

        try {
            const parentId = String(this.parentSelect?.value || '').trim();
            const group = this.groupStore?.createGroup?.(name, parentId, this.selectedColor);
            window.toastr?.success?.(`分组「${group.name}」创建成功`);
            this.nameInput.value = '';
            const count = this.panel?.querySelector?.('#group-manager-name-count');
            if (count) count.textContent = '0/16';
            if (this.parentSelect) this.parentSelect.value = '';
            this.selectedColor = 'sky';
            this.syncColorChoices();
            this.clearCreateError();
            this.refresh();
            this.onGroupChanged?.({ type: 'create', group });
            return group;
        } catch (error) {
            logger.error('创建分组失败', error);
            this.showCreateError(error?.message || '创建分组失败');
            return false;
        }
    }

    editGroup(groupId) {
        if (!this.groupStore?.getGroup?.(groupId)) return;
        this.editingGroupId = groupId;
        this.deletingGroupId = '';
        this.refresh();
        const input = Array.from(this.panel?.querySelectorAll?.('[data-group-rename-input]') || [])
            .find(element => element.dataset.groupRenameInput === groupId);
        input?.focus?.();
        input?.select?.();
    }

    saveRename(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return false;
        const input = Array.from(this.panel?.querySelectorAll?.('[data-group-rename-input]') || [])
            .find(element => element.dataset.groupRenameInput === groupId);
        const name = String(input?.value || '').trim();
        if (!name || name === group.name) {
            this.editingGroupId = '';
            this.refresh();
            return false;
        }
        try {
            this.groupStore?.updateGroup?.(groupId, { name });
            window.toastr?.success?.(`分组重命名为「${name}」`);
            this.editingGroupId = '';
            this.refresh();
            this.onGroupChanged?.({ type: 'update', group: this.groupStore.getGroup(groupId) });
            return true;
        } catch (error) {
            logger.error('重命名分组失败', error);
            window.toastr?.error?.(error?.message || '重命名失败');
            input?.focus?.();
            return false;
        }
    }

    confirmDeleteGroup(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return false;
        try {
            this.groupStore?.deleteGroup?.(groupId);
            window.toastr?.success?.(`分组「${group.name}」已删除`);
            this.deletingGroupId = '';
            this.refresh();
            this.onGroupChanged?.({ type: 'delete', groupId });
            return true;
        } catch (error) {
            logger.error('删除分组失败', error);
            window.toastr?.error?.('删除分组失败');
            return false;
        }
    }

    buildGroupTree(groups) {
        const byParent = new Map();
        const byId = new Map();
        (groups || []).forEach(group => {
            if (group?.id) byId.set(group.id, group);
        });
        (groups || []).forEach(group => {
            if (!group?.id) return;
            const rawParent = String(group.parentId || '').trim();
            const parentId = rawParent && byId.has(rawParent) && rawParent !== group.id ? rawParent : '';
            if (!byParent.has(parentId)) byParent.set(parentId, []);
            byParent.get(parentId).push(group);
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
            options.push(`<option value="${this.escapeAttribute(group.id)}">${prefix}${this.escapeHtml(group.name)}</option>`);
            (tree.byParent.get(group.id) || []).forEach(child => pushOption(child, depth + 1));
        };
        tree.roots.forEach(group => pushOption(group, 0));
        this.parentSelect.innerHTML = options.join('');
        refreshCustomSelectButton(this.parentSelectButton, this.parentSelect, '无上级');
    }

    openParentPicker(groupId, anchorEl) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group || !anchorEl) return;
        const groups = this.groupStore?.listGroups?.() || [];
        const tree = this.buildGroupTree(groups);
        const excluded = new Set([groupId]);
        const queue = [groupId];
        while (queue.length) {
            const current = queue.shift();
            (tree.byParent.get(current) || []).forEach((child) => {
                if (excluded.has(child.id)) return;
                excluded.add(child.id);
                queue.push(child.id);
            });
        }
        const options = [{ value: '', label: '无上级' }];
        const pushOption = (candidate, depth) => {
            if (excluded.has(candidate.id)) return;
            options.push({
                value: candidate.id,
                label: `${depth ? `${'—'.repeat(depth)} ` : ''}${candidate.name}`,
            });
            (tree.byParent.get(candidate.id) || []).forEach(child => pushOption(child, depth + 1));
        };
        tree.roots.forEach(candidate => pushOption(candidate, 0));
        openCustomSelectMenu({
            anchorEl,
            options,
            currentValue: String(group.parentId || '').trim(),
            onSelect: (parentId) => {
                try {
                    this.groupStore?.updateGroup?.(groupId, { parentId });
                    window.toastr?.success?.('已更新上级分组');
                    this.refresh();
                    this.onGroupChanged?.({ type: 'update', group: this.groupStore.getGroup(groupId) });
                } catch (error) {
                    logger.error('更新上级分组失败', error);
                    window.toastr?.error?.(error?.message || '更新失败');
                }
            },
        });
    }

    escapeHtml(value) {
        return String(value ?? '').replace(/[&<>]/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
        })[character]);
    }

    escapeAttribute(value) {
        return String(value ?? '').replace(/[&<>"']/g, character => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;',
        })[character]);
    }
}
