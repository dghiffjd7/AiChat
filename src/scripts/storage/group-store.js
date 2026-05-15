/**
 * Group store for contact organization
 * - 保存联系人分组信息
 * - 支持拖拽排序、折叠状态等
 */

import { logger } from '../utils/logger.js';
import { makeScopedKey, normalizeScopeId } from './store-scope.js';

const safeInvoke = async (cmd, args) => {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const invoker = g?.__TAURI__?.core?.invoke || g?.__TAURI__?.invoke || g?.__TAURI_INVOKE__ || g?.__TAURI_INTERNALS__?.invoke;
    if (typeof invoker !== 'function') {
        throw new Error('Tauri invoke not available');
    }
    return invoker(cmd, args);
};

const BASE_STORE_KEY = 'contact_groups_v1';
const LEGACY_MIGRATION_KEY = `${BASE_STORE_KEY}__scoped_migrated`;

const isLegacyMigrated = () => {
    try {
        return localStorage.getItem(LEGACY_MIGRATION_KEY) === '1';
    } catch {
        return false;
    }
};

const markLegacyMigrated = () => {
    try {
        localStorage.setItem(LEGACY_MIGRATION_KEY, '1');
    } catch {}
};

const readLocalState = (key) => {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : null;
    } catch {
        return null;
    }
};

export class GroupStore {
    constructor({ scopeId = '' } = {}) {
        this.scopeId = normalizeScopeId(scopeId);
        this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
        this._scopeToken = 0;
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
    }

    _load() {
        const data = readLocalState(this.storeKey);
        if (data) {
            if (this.scopeId) markLegacyMigrated();
            return data;
        }
        if (this.scopeId && !isLegacyMigrated()) {
            const legacy = readLocalState(BASE_STORE_KEY);
            if (legacy) {
                markLegacyMigrated();
                return legacy;
            }
        }
        return { groups: [] };
    }

    async _hydrateFromDisk() {
        const token = this._scopeToken;
        const storeKey = this.storeKey;
        const scopeId = this.scopeId;
        try {
            let kv = await safeInvoke('load_kv', { name: storeKey });
            if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
            if (!kv && this.scopeId && !isLegacyMigrated()) {
                const legacy = await safeInvoke('load_kv', { name: BASE_STORE_KEY });
                if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
                if (legacy && Array.isArray(legacy.groups)) {
                    kv = legacy;
                    markLegacyMigrated();
                    try {
                        await safeInvoke('save_kv', { name: storeKey, data: legacy });
                    } catch (err) {
                        logger.debug('group store legacy migrate failed (可能非 Tauri)', err);
                    }
                }
            }
            if (kv && Array.isArray(kv.groups)) {
                if (token !== this._scopeToken || storeKey !== this.storeKey || scopeId !== this.scopeId) return;
                this.state = kv;
                if (this.scopeId) markLegacyMigrated();
                try {
                    localStorage.setItem(storeKey, JSON.stringify(this.state));
                } catch (err) {
                    logger.warn('group store hydrate -> localStorage failed', err);
                }
                logger.debug('group store hydrated from disk');
            }
        } catch (err) {
            logger.debug('group store disk load skipped (可能非 Tauri)', err);
        }
    }

    _persist() {
        safeInvoke('save_kv', { name: this.storeKey, data: this.state }).catch((err) => {
            logger.debug('group store save_kv failed (可能非 Tauri)', err);
        });
        try {
            localStorage.setItem(this.storeKey, JSON.stringify(this.state));
        } catch (err) {
            logger.warn('group store persist -> localStorage failed', err);
        }
    }

    async setScope(scopeId = '') {
        const nextScope = normalizeScopeId(scopeId);
        if (nextScope === this.scopeId) return this.ready;
        this._scopeToken += 1;
        this.scopeId = nextScope;
        this.storeKey = makeScopedKey(BASE_STORE_KEY, this.scopeId);
        this.state = this._load();
        this.ready = this._hydrateFromDisk();
        return this.ready;
    }

    /**
     * 获取所有分组（按 order 排序）
     */
    listGroups() {
        const groups = this.state.groups || [];
        return groups.sort((a, b) => (a.order || 0) - (b.order || 0));
    }

    /**
     * 根据 ID 获取分组
     */
    getGroup(groupId) {
        return (this.state.groups || []).find(g => g.id === groupId) || null;
    }

    /**
     * 创建新分组
     */
    createGroup(name, parentId = '') {
        if (!name || !name.trim()) {
            throw new Error('分组名称不能为空');
        }
        const trimmed = name.trim();
        // 检查重名
        if ((this.state.groups || []).some(g => g.name === trimmed)) {
            throw new Error('分组名称已存在');
        }
        const nextParentId = String(parentId || '').trim();
        if (nextParentId && !this.getGroup(nextParentId)) {
            throw new Error('上级分组不存在');
        }
        const newGroup = {
            id: 'group_' + Date.now(),
            name: trimmed,
            contacts: [],
            parentId: nextParentId || '',
            collapsed: false,
            order: (this.state.groups || []).length,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        this.state.groups = this.state.groups || [];
        this.state.groups.push(newGroup);
        this._persist();
        logger.info('新建分组:', newGroup.name);
        return newGroup;
    }

    /**
     * 更新分组
     */
    updateGroup(groupId, updates) {
        const group = this.getGroup(groupId);
        if (!group) {
            throw new Error('分组不存在');
        }
        // 检查重名（如果修改了名称）
        if (updates.name && updates.name !== group.name) {
            const trimmed = updates.name.trim();
            if ((this.state.groups || []).some(g => g.id !== groupId && g.name === trimmed)) {
                throw new Error('分组名称已存在');
            }
            group.name = trimmed;
        }
        if (typeof updates.collapsed === 'boolean') {
            group.collapsed = updates.collapsed;
        }
        if (typeof updates.order === 'number') {
            group.order = updates.order;
        }
        if (Array.isArray(updates.contacts)) {
            group.contacts = updates.contacts;
        }
        if (Object.prototype.hasOwnProperty.call(updates, 'parentId')) {
            const nextParentId = String(updates.parentId || '').trim();
            if (nextParentId) {
                if (nextParentId === groupId) throw new Error('不能设置自身为上级分组');
                const parent = this.getGroup(nextParentId);
                if (!parent) throw new Error('上级分组不存在');
                let cursor = nextParentId;
                while (cursor) {
                    if (cursor === groupId) throw new Error('不可设置子分组为上级');
                    cursor = String(this.getGroup(cursor)?.parentId || '').trim();
                }
            }
            group.parentId = nextParentId || '';
        }
        group.updatedAt = Date.now();
        this._persist();
        logger.info('更新分组:', group.name);
        return group;
    }

    /**
     * 删除分组
     */
    deleteGroup(groupId) {
        const group = this.getGroup(groupId);
        if (!group) return false;
        const parentId = String(group.parentId || '').trim();
        (this.state.groups || []).forEach((g) => {
            if (String(g.parentId || '').trim() === groupId) {
                g.parentId = parentId || '';
                g.updatedAt = Date.now();
            }
        });
        this.state.groups = (this.state.groups || []).filter(g => g.id !== groupId);
        this._persist();
        logger.info('删除分组:', group.name);
        return true;
    }

    /**
     * 添加联系人到分组
     */
    addContactToGroup(groupId, contactId) {
        const group = this.getGroup(groupId);
        if (!group) {
            throw new Error('分组不存在');
        }
        if (!group.contacts.includes(contactId)) {
            group.contacts.push(contactId);
            group.updatedAt = Date.now();
            this._persist();
            logger.info(`添加联系人 ${contactId} 到分组 ${group.name}`);
        }
        return group;
    }

    /**
     * 从分组中移除联系人
     */
    removeContactFromGroup(groupId, contactId) {
        const group = this.getGroup(groupId);
        if (!group) return false;
        const before = group.contacts.length;
        group.contacts = group.contacts.filter(cid => cid !== contactId);
        if (group.contacts.length !== before) {
            group.updatedAt = Date.now();
            this._persist();
            logger.info(`从分组 ${group.name} 移除联系人 ${contactId}`);
            return true;
        }
        return false;
    }

    /**
     * 移动联系人（从一个分组到另一个分组或未分组）
     */
    moveContact(contactId, toGroupId) {
        // 先从所有分组中移除
        (this.state.groups || []).forEach(g => {
            g.contacts = g.contacts.filter(cid => cid !== contactId);
        });
        // 如果目标不是 ungrouped，添加到目标分组
        if (toGroupId && toGroupId !== 'ungrouped') {
            this.addContactToGroup(toGroupId, contactId);
        } else {
            this._persist();
        }
    }

    /**
     * 检查联系人是否在任何分组中
     */
    isContactInAnyGroup(contactId) {
        return (this.state.groups || []).some(g => g.contacts.includes(contactId));
    }

    /**
     * 获取联系人所在的分组
     */
    getGroupByContact(contactId) {
        return (this.state.groups || []).find(g => g.contacts.includes(contactId)) || null;
    }

    /**
     * 切换分组折叠状态
     */
    toggleCollapsed(groupId) {
        const group = this.getGroup(groupId);
        if (group) {
            group.collapsed = !group.collapsed;
            group.updatedAt = Date.now();
            this._persist();
            return group.collapsed;
        }
        return null;
    }

    /**
     * 重新排序分组
     */
    reorderGroups(groupIds) {
        groupIds.forEach((id, index) => {
            const group = this.getGroup(id);
            if (group) {
                group.order = index;
                group.updatedAt = Date.now();
            }
        });
        this._persist();
    }
}
