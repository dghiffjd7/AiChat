/**
 * Contact group renderer - renders contacts with groups
 * - 渲染分组
 * - 支持折叠/展开
 * - 拖拽放置区
 */

import { logger } from '../utils/logger.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';

export class ContactGroupRenderer {
    constructor({ groupStore, contactsStore, renderContactFn, dragManager, onGroupChanged } = {}) {
        this.groupStore = groupStore;
        this.contactsStore = contactsStore;
        this.renderContactFn = renderContactFn || this.defaultRenderContact.bind(this);
        this.dragManager = dragManager;
        this.onGroupChanged = typeof onGroupChanged === 'function' ? onGroupChanged : null;
        this.batchAddOverlay = null;
        this.batchAddPanel = null;
        this.batchAddTitle = null;
        this.batchAddSearch = null;
        this.batchAddList = null;
        this.batchAddConfirm = null;
        this.batchAddGroupId = '';
        this.batchAddSelected = new Set();
        this.suppressToggleOnce = false;
    }

    /**
     * 渲染所有分组和未分组联系人到指定容器
     */
    render(containerEl) {
        if (!containerEl) {
            logger.error('ContactGroupRenderer: containerEl is null');
            return;
        }

        containerEl.innerHTML = '';

        const groups = this.groupStore?.listGroups?.() || [];
        const allContacts = (this.contactsStore?.listContacts?.() || []).filter(c => c && !c.isGroup);
        const tree = this.buildGroupTree(groups);

        // 1. 渲染分组（含嵌套）
        (tree.roots || []).forEach(group => {
            const groupEl = this.renderGroup(group, allContacts, tree, 0);
            containerEl.appendChild(groupEl);
        });

        // 2. 渲染未分组联系人
        const ungroupedContacts = allContacts.filter(c => {
            const isInGroup = this.groupStore?.isContactInAnyGroup?.(c.id);
            return !isInGroup;
        });

        const ungroupedEl = this.renderUngroupedSection(ungroupedContacts);
        containerEl.appendChild(ungroupedEl);

        // 3. 启用拖拽
        if (this.dragManager) {
            setTimeout(() => {
                this.dragManager.enableDragForContacts('.contact-item');
            }, 50);
        }
    }

    /**
     * 渲染单个分组
     */
    renderGroup(group, allContacts, tree, depth = 0) {
        const div = document.createElement('div');
        div.className = 'contact-group-container';
        div.setAttribute('data-group-id', group.id);
        div.setAttribute('data-depth', String(depth));
        if (depth > 0) div.style.marginLeft = `${depth * 12}px`;

        const isCollapsed = group.collapsed || false;
        const contactsInGroup = allContacts.filter(c => (group.contacts || []).includes(c.id));
        const childGroups = tree?.byParent?.get?.(group.id) || [];
        const countLabel = childGroups.length ? `${contactsInGroup.length} · ${childGroups.length}组` : `${contactsInGroup.length}`;

        div.innerHTML = `
            <div class="contact-group-header" data-group-id="${group.id}">
                <span class="group-toggle ${isCollapsed ? 'collapsed' : ''}">▼</span>
                <span class="group-name-label">${this.escapeHtml(group.name)}</span>
                <span class="group-contact-count">${countLabel}</span>
            </div>
            <div class="contact-group-content ${isCollapsed ? 'collapsed' : 'expanded'}"></div>
            <div class="drop-zone" data-group-id="${group.id}"></div>
        `;

        // 渲染子分组与联系人
        const contentEl = div.querySelector('.contact-group-content');
        childGroups.forEach(child => {
            const childEl = this.renderGroup(child, allContacts, tree, depth + 1);
            contentEl.appendChild(childEl);
        });
        contactsInGroup.forEach(contact => {
            const contactEl = this.renderContactFn(contact);
            contactEl.classList.add('contact-item');
            contactEl.setAttribute('data-contact-id', contact.id);
            contactEl.draggable = true;
            contentEl.appendChild(contactEl);
        });

        // 绑定折叠/展开事件
        const headerEl = div.querySelector('.contact-group-header');
        headerEl.onclick = () => {
            if (this.suppressToggleOnce) {
                this.suppressToggleOnce = false;
                return;
            }
            this.toggleGroup(group.id);
        };
        const nameEl = div.querySelector('.group-name-label');
        if (nameEl) this.bindGroupNameLongPress(nameEl, group.id);

        return div;
    }

    /**
     * 渲染未分组区域
     */
    renderUngroupedSection(ungroupedContacts) {
        const div = document.createElement('div');
        div.className = 'contact-ungrouped-section';

        div.innerHTML = `
            <div class="contact-ungrouped-header">未分组联系人</div>
            <div class="contact-ungrouped-content"></div>
            <div class="drop-zone" data-group-id="ungrouped"></div>
        `;

        const contentEl = div.querySelector('.contact-ungrouped-content');
        if (ungroupedContacts.length === 0) {
            const empty = document.createElement('div');
            empty.textContent = '暂无未分组联系人';
            empty.style.cssText = 'padding:8px 16px; font-size:12px; color:#94a3b8;';
            contentEl.appendChild(empty);
        } else {
            ungroupedContacts.forEach(contact => {
                const contactEl = this.renderContactFn(contact);
                contactEl.classList.add('contact-item');
                contactEl.setAttribute('data-contact-id', contact.id);
                contactEl.draggable = true;
                contentEl.appendChild(contactEl);
            });
        }

        return div;
    }

    /**
     * 默认的联系人渲染函数
     */
    defaultRenderContact(contact) {
        const div = document.createElement('div');
        div.className = 'contact-item';
        div.dataset.session = contact.id;
        div.dataset.name = contact.name || contact.id;

        const name = contact.name || contact.id;
        const tags = Array.isArray(contact?.libraryTags) && contact.libraryTags.length
            ? contact.libraryTags
            : Array.isArray(contact?.labels)
                ? contact.labels
                : [];
        const avatar = resolveLineAvatar({
            avatar: contact.avatar || FEATHER_DEFAULT,
            name,
            tags,
            size: 96,
        });

        div.innerHTML = `
            <img src="${avatar}" alt="" class="contact-avatar">
            <div class="contact-info">
                <div class="contact-name">${this.escapeHtml(name)}</div>
                <div class="contact-desc"></div>
            </div>
            <div class="contact-time"></div>
        `;

        return div;
    }

    /**
     * 切换分组折叠状态
     */
    toggleGroup(groupId) {
        try {
            const isCollapsed = this.groupStore?.toggleCollapsed?.(groupId);
            if (isCollapsed === null) return;

            const groupEl = document.querySelector(`.contact-group-container[data-group-id="${groupId}"]`);
            if (!groupEl) return;

            const toggle = groupEl.querySelector('.group-toggle');
            const content = groupEl.querySelector('.contact-group-content');

            if (isCollapsed) {
                toggle?.classList.add('collapsed');
                content?.classList.remove('expanded');
                content?.classList.add('collapsed');
            } else {
                toggle?.classList.remove('collapsed');
                content?.classList.remove('collapsed');
                content?.classList.add('expanded');
            }

            logger.debug(`分组 ${groupId} 折叠状态: ${isCollapsed}`);
        } catch (err) {
            logger.error('切换分组折叠状态失败', err);
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
        return { byParent, roots: byParent.get('') || [] };
    }

    bindGroupNameLongPress(el, groupId) {
        let timer = null;
        let startX = 0;
        let startY = 0;
        const clear = () => {
            if (timer) clearTimeout(timer);
            timer = null;
        };
        el.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            startX = e.clientX;
            startY = e.clientY;
            clear();
            timer = setTimeout(() => {
                this.suppressToggleOnce = true;
                this.openBatchAddModal(groupId);
            }, 520);
        });
        el.addEventListener('pointerup', clear);
        el.addEventListener('pointercancel', clear);
        el.addEventListener('pointerleave', clear);
        el.addEventListener('pointermove', (e) => {
            if (!timer) return;
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;
            if (Math.hypot(dx, dy) > 8) clear();
        });
    }

    openBatchAddModal(groupId) {
        const group = this.groupStore?.getGroup?.(groupId);
        if (!group) return;
        this.ensureBatchAddModal();
        this.batchAddGroupId = groupId;
        this.batchAddSelected.clear();
        if (this.batchAddSearch) this.batchAddSearch.value = '';
        if (this.batchAddTitle) this.batchAddTitle.textContent = `添加联系人到分组「${group.name}」`;
        this.renderBatchAddList();
        if (this.batchAddOverlay) this.batchAddOverlay.style.display = 'block';
        if (this.batchAddPanel) this.batchAddPanel.style.display = 'flex';
    }

    closeBatchAddModal() {
        if (this.batchAddOverlay) this.batchAddOverlay.style.display = 'none';
        if (this.batchAddPanel) this.batchAddPanel.style.display = 'none';
    }

    ensureBatchAddModal() {
        if (this.batchAddPanel) return;
        this.batchAddOverlay = document.createElement('div');
        this.batchAddOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.45); z-index:22000;';
        this.batchAddOverlay.addEventListener('click', () => this.closeBatchAddModal());

        this.batchAddPanel = document.createElement('div');
        this.batchAddPanel.style.cssText = `
            display:none; position:fixed;
            top: calc(18px + env(safe-area-inset-top, 0px));
            left: calc(18px + env(safe-area-inset-left, 0px));
            right: calc(18px + env(safe-area-inset-right, 0px));
            height: calc(100vh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            height: calc(100dvh - 36px - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px));
            background:#fff; border-radius:14px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index:23000;
            overflow:hidden;
            flex-direction:column;
        `;
        this.batchAddPanel.addEventListener('click', (e) => e.stopPropagation());
        this.batchAddPanel.innerHTML = `
            <div style="padding:14px 16px; border-bottom:1px solid rgba(0,0,0,0.06); background:linear-gradient(135deg, rgba(25,154,255,0.10), rgba(0,102,204,0.08)); display:flex; align-items:center; justify-content:space-between; gap:10px;">
                <div style="min-width:0;">
                    <div id="contact-group-add-title" style="font-weight:900; color:#0f172a;">添加联系人</div>
                    <div style="color:#64748b; font-size:12px;">长按分组名称快速批量加入</div>
                </div>
                <button id="contact-group-add-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
            </div>

            <div style="padding:14px 16px; overflow:auto; flex:1; min-height:0; -webkit-overflow-scrolling:touch;">
                <input id="contact-group-add-search" style="width:100%; padding:10px 12px; border:1px solid #e2e8f0; border-radius:10px; font-size:14px; box-sizing:border-box;" placeholder="搜索联系人...">
                <div id="contact-group-add-list" style="margin-top:10px; display:flex; flex-direction:column; gap:8px;"></div>
            </div>

            <div style="padding:14px 16px; border-top:1px solid rgba(0,0,0,0.06); background:rgba(248,250,252,0.92); display:flex; gap:10px;">
                <button id="contact-group-add-cancel" style="flex:1; padding:10px 14px; border:1px solid #e2e8f0; border-radius:10px; background:#fff; cursor:pointer;">取消</button>
                <button id="contact-group-add-confirm" style="flex:1; padding:10px 14px; border:none; border-radius:10px; background:#019aff; color:#fff; cursor:pointer; font-weight:800;">添加</button>
            </div>
        `;

        document.body.appendChild(this.batchAddOverlay);
        document.body.appendChild(this.batchAddPanel);

        this.batchAddTitle = this.batchAddPanel.querySelector('#contact-group-add-title');
        this.batchAddSearch = this.batchAddPanel.querySelector('#contact-group-add-search');
        this.batchAddList = this.batchAddPanel.querySelector('#contact-group-add-list');
        this.batchAddConfirm = this.batchAddPanel.querySelector('#contact-group-add-confirm');

        this.batchAddPanel.querySelector('#contact-group-add-close').onclick = () => this.closeBatchAddModal();
        this.batchAddPanel.querySelector('#contact-group-add-cancel').onclick = () => this.closeBatchAddModal();
        this.batchAddSearch.addEventListener('input', () => this.renderBatchAddList());
        this.batchAddConfirm.onclick = () => {
            const picks = [...this.batchAddSelected];
            if (!picks.length) {
                window.toastr?.info?.('未选择任何联系人');
                return;
            }
            const groupId = this.batchAddGroupId;
            picks.forEach(id => {
                try {
                    this.groupStore?.moveContact?.(id, groupId);
                } catch (err) {
                    logger.warn('移动联系人失败', err);
                }
            });
            window.toastr?.success?.(`已加入 ${picks.length} 位联系人`);
            this.closeBatchAddModal();
            this.onGroupChanged?.({ type: 'batch-add', groupId, count: picks.length });
        };
    }

    renderBatchAddList() {
        const listEl = this.batchAddList;
        if (!listEl) return;
        const q = String(this.batchAddSearch?.value || '').trim().toLowerCase().replace(/\s+/g, '');
        const group = this.groupStore?.getGroup?.(this.batchAddGroupId);
        const inGroup = new Set(group?.contacts || []);
        const allContacts = (this.contactsStore?.listContacts?.() || []).filter(c => c && !c.isGroup);
        const filtered = q
            ? allContacts.filter(c => String(c?.name || c?.id || '').toLowerCase().replace(/\s+/g, '').includes(q))
            : allContacts;

        listEl.innerHTML = '';
        if (!filtered.length) {
            const empty = document.createElement('div');
            empty.textContent = '暂无可添加联系人';
            empty.style.cssText = 'color:#94a3b8; font-size:13px; padding:10px 6px;';
            listEl.appendChild(empty);
            return;
        }

        filtered.forEach((c) => {
            const id = String(c?.id || '').trim();
            if (!id) return;
            const already = inGroup.has(id);
            const selected = this.batchAddSelected.has(id);
            const row = document.createElement('button');
            row.type = 'button';
            row.disabled = already;
            row.style.cssText = `
                display:flex; align-items:center; gap:10px;
                padding:10px 10px;
                border:1px solid ${selected ? '#93c5fd' : '#e2e8f0'};
                background:${selected ? 'rgba(59,130,246,0.08)' : '#fff'};
                border-radius:12px;
                cursor:${already ? 'not-allowed' : 'pointer'};
                text-align:left;
                opacity:${already ? '0.6' : '1'};
            `;
            const img = document.createElement('img');
            const nameText = c?.name || id;
            const tags = Array.isArray(c?.libraryTags) && c.libraryTags.length
                ? c.libraryTags
                : Array.isArray(c?.labels)
                    ? c.labels
                    : [];
            img.src = resolveLineAvatar({
                avatar: c?.avatar || FEATHER_DEFAULT,
                name: nameText,
                tags,
                size: 96,
            });
            img.alt = '';
            img.style.cssText = 'width:36px; height:36px; border-radius:50%; object-fit:cover;';
            const name = document.createElement('div');
            name.textContent = c?.name || id;
            name.style.cssText = 'font-weight:700; color:#0f172a; flex:1; min-width:0; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;';
            const tag = document.createElement('div');
            tag.textContent = already ? '已在分组' : (selected ? '已选' : '');
            tag.style.cssText = 'font-size:12px; color:#2563eb;';
            row.appendChild(img);
            row.appendChild(name);
            row.appendChild(tag);
            if (!already) {
                row.onclick = () => {
                    if (this.batchAddSelected.has(id)) this.batchAddSelected.delete(id);
                    else this.batchAddSelected.add(id);
                    this.renderBatchAddList();
                };
            }
            listEl.appendChild(row);
        });

        if (this.batchAddConfirm) {
            const count = this.batchAddSelected.size;
            this.batchAddConfirm.textContent = count ? `添加 (${count})` : '添加';
        }
    }

    /**
     * 转义 HTML
     */
    escapeHtml(str) {
        const div = document.createElement('div');
        div.textContent = str || '';
        return div.innerHTML;
    }
}
