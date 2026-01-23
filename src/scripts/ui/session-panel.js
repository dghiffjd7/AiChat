/**
 * Session list panel (basic)
 * - list sessions, create new, switch
 */

import { avatarDataUrlFromFile } from '../utils/image.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';
import { makeScopedKey, normalizeScopeId } from '../storage/store-scope.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { appConfirm } from './app-confirm.js';

const CONTACTS_STORE_KEY = 'contacts_store_v1';
const CHAT_STORE_KEY = 'chat_store_v1';
const WORLD_SESSION_MAP_KEY = 'world_session_map_v1';
const LEGACY_CONTACTS_MIGRATION_KEY = `${CONTACTS_STORE_KEY}__scoped_migrated`;
const SHARED_AVATAR_MAX = 200_000;

const readLocalState = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const hasMeaningfulData = (data) => {
  if (!data) return false;
  if (typeof data !== 'object') return true;
  return Object.keys(data).length > 0;
};

const isLegacyContactsMigrated = () => {
  try {
    return localStorage.getItem(LEGACY_CONTACTS_MIGRATION_KEY) === '1';
  } catch {
    return false;
  }
};

const isScopedDataMatch = (data, scopeId) => {
  try {
    const stored = String(data?.scopeId ?? '').trim();
    if (!stored) return true;
    return stored === String(scopeId || '').trim();
  } catch {
    return true;
  }
};

const trimAvatarData = (value) => {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return '';
  return raw.length > SHARED_AVATAR_MAX ? '' : raw;
};

export class SessionPanel {
  constructor(chatStore, contactsStore, ui, { onUpdated, personaStore, getPersonaScopeKey } = {}) {
    this.store = chatStore;
    this.contactsStore = contactsStore;
    this.ui = ui;
    this.overlay = null;
    this.panel = null;
    this.listEl = null;
    this.listElCurrent = null;
    this.listElShared = null;
    this.nameInput = null;
    this.onUpdated = typeof onUpdated === 'function' ? onUpdated : null;
    this.personaStore = personaStore || null;
    this.getPersonaScopeKey = typeof getPersonaScopeKey === 'function' ? getPersonaScopeKey : null;
    this.otherContacts = [];
    this.sharedLoading = false;
    this.sharedHardLoading = false;
    this.sharedChunkSize = 18;
    this.sharedRenderLimit = 0;
    this.sharedRenderedCount = 0;
    this.jumpToContactsOnClose = false;
    this.contactsReadyScope = '';
    this.contactsReadyPromise = null;
    this.contactsReadyResolved = false;
  }

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  show({ focusAdd = false } = {}) {
    if (!this.panel) this.createUI();
    this.refresh();
    try {
      document.activeElement?.blur?.();
    } catch {}
    this.overlay.style.display = 'flex';
    this.panel.style.display = 'flex';
    if (focusAdd) {
      setTimeout(() => this.nameInput?.focus(), 0);
    }
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.panel) this.panel.style.display = 'none';
    if (this.jumpToContactsOnClose) {
      this.jumpToContactsOnClose = false;
      window.dispatchEvent(new CustomEvent('session-panel-closed', { detail: { jumpToContacts: true } }));
    }
  }

  refresh() {
    if (!this.listElCurrent || !this.listElShared) return;
    this.ensureContactsReady();
    this.listElCurrent.innerHTML = '';
    let contacts = this.contactsStore?.listContacts?.() || [];
    if (!contacts.length && this.contactsReadyResolved) {
      const sessions = this.store?.listSessions?.() || [];
      if (sessions.length) {
        contacts = sessions.map(id => this.contactsStore?.getContact?.(id) || { id, name: id, isGroup: String(id).startsWith('group:') });
      }
    }
    const currentId = this.store.getCurrent();
    if (!contacts.length) {
      const empty = document.createElement('div');
      empty.className = 'sticker-bind-empty';
      empty.textContent = this.contactsReadyResolved ? '暂无好友/群组' : '载入中...';
      this.listElCurrent.appendChild(empty);
    } else {
      contacts.forEach(c => {
        const id = c.id;
        const row = document.createElement('div');
        row.className = 'sticker-bind-row session-row';
        if (id === currentId) row.classList.add('is-current');
        row.addEventListener('click', () => this.switchTo(id));

        const avatar = document.createElement('img');
        avatar.className = 'sticker-bind-avatar';
        avatar.alt = '';
        avatar.src = c.avatar || './assets/external/feather-default.png';

        const info = document.createElement('div');
        info.className = 'sticker-bind-info';
        const name = document.createElement('div');
        name.className = 'sticker-bind-name';
        const last = this.store.getLastMessage(id);
        const snippet = last ? (last.content || '').slice(0, 32) : '新会话';
        const time = last && last.timestamp ? this.formatTime(last.timestamp) : '';
        const isGroup = Boolean(c.isGroup) || id.startsWith('group:');
        const membersCount = isGroup && Array.isArray(c.members) ? c.members.length : 0;
        const unread = this.store.getUnreadCount(id);
        const unreadBadge =
          unread > 0
            ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:#fff; font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
            : '';
        const badge = isGroup
          ? `<span style="padding:2px 6px; border-radius:8px; background:#e0f2fe; color:#0369a1; font-size:11px; margin-left:4px;">群</span>`
          : '';
        const currentTag =
          id === currentId ? `<span style="color:#059669; font-size:11px; margin-left:6px;">当前</span>` : '';
        const baseName = c.name || id;
        const displayName = isGroup ? `${baseName}(${membersCount})` : baseName;
        name.innerHTML = `${displayName}${unreadBadge}${badge}${currentTag}`;
        const meta = document.createElement('div');
        meta.className = 'sticker-bind-meta';
        meta.textContent = `${snippet}${time ? ` · ${time}` : ''}`;
        info.appendChild(name);
        info.appendChild(meta);

        const actions = document.createElement('div');
        actions.className = 'session-row-actions';

        const delBtn = document.createElement('button');
        delBtn.textContent = '删除';
        delBtn.className = 'session-row-delete';
        delBtn.onclick = (event) => {
          event.stopPropagation();
          this.remove(id);
        };

        row.appendChild(avatar);
        row.appendChild(info);
        actions.appendChild(delBtn);
        row.appendChild(actions);
        this.listElCurrent.appendChild(row);
      });
    }

    this.sharedLoading = true;
    this.renderSharedList();
    this.loadOtherPersonaContacts();
  }

  ensureContactsReady() {
    const scope = String(this.contactsStore?.scopeId || '');
    if (scope !== this.contactsReadyScope) {
      this.contactsReadyScope = scope;
      this.contactsReadyPromise = null;
      this.contactsReadyResolved = false;
    }
    const ready = this.contactsStore?.ready;
    if (!ready || typeof ready.then !== 'function') {
      this.contactsReadyResolved = true;
      return;
    }
    if (this.contactsReadyPromise) return;
    this.contactsReadyPromise = Promise.resolve(ready)
      .then(() => {
        this.contactsReadyResolved = true;
        if (this.overlay?.style.display === 'flex') this.refresh();
      })
      .catch(() => {
        this.contactsReadyResolved = true;
      });
  }

  switchTo(id) {
    this.store.setCurrent(id);
    window.dispatchEvent(new CustomEvent('session-changed', { detail: { id } }));
    this.refresh();
    this.onUpdated?.();
    logger.info('Switched session', id);
  }

  rename(id) {
    const currentName = this.contactsStore?.getContact?.(id)?.name || id;
    const next = prompt('输入新好友名称（同时作为聊天室 ID）', currentName);
    if (!next || next === id) return;
    const nextId = next.trim();
    if (!nextId) return;
    if (nextId.startsWith('group:')) {
      window.toastr?.warning('好友名称不可使用 group: 前綴');
      return;
    }
    if (this.contactsStore?.getContact?.(nextId) || this.store.listSessions().includes(nextId)) {
      window.toastr?.warning('名称已存在，请换一个');
      return;
    }

    // 迁移世界书映射（按会话隔离）
    const map = window.appBridge?.worldSessionMap;
    if (map && map[id]) {
      map[nextId] = map[id];
      delete map[id];
      window.appBridge?.persistWorldSessionMap?.();
    }

    // 迁移联系人记录
    const existing = this.contactsStore?.getContact?.(id);
    if (existing) {
      this.contactsStore.removeContact(id);
      this.contactsStore.upsertContact({ ...existing, id: nextId, name: nextId });
    }

    // 迁移聊天记录
    this.store.rename(id, nextId);

    this.switchTo(nextId);
    this.refresh();
    this.onUpdated?.();
  }

  async remove(id) {
    const name = this.contactsStore?.getContact?.(id)?.name || id;
    const ok = await appConfirm({
      title: '删除好友',
      message: `確認删除：${name}？此操作会删除聊天室与好友记录（不可恢复）。`,
      danger: true,
    });
    if (!ok) return;

    try {
      const settings = this.store?.getSessionSettings?.(id) || null;
      const path = String(settings?.wallpaper?.path || '').trim();
      if (path) {
        safeInvoke('delete_wallpaper', { sessionId: id, path }).catch(err => {
          logger.warn('删除联系人时清理壁纸失败', err);
        });
      }
    } catch (err) {
      logger.warn('删除联系人时读取壁纸失败', err);
    }

    // 清理世界书映射
    const map = window.appBridge?.worldSessionMap;
    if (map && map[id]) {
      delete map[id];
      window.appBridge?.persistWorldSessionMap?.();
    }

    this.store.delete(id);
    this.contactsStore?.removeContact?.(id);
    this.refresh();
    const current = this.store.getCurrent();
    this.switchTo(current);
    this.onUpdated?.();
  }

  async loadScopedData(key, { fallbackKey = '' } = {}) {
    if (!key) return null;
    let data = readLocalState(key);
    if (!hasMeaningfulData(data) && fallbackKey) {
      data = readLocalState(fallbackKey);
    }
    if (hasMeaningfulData(data)) return data;
    try {
      data = await safeInvoke('load_kv', { name: key });
    } catch {}
    if (!hasMeaningfulData(data) && fallbackKey) {
      try {
        data = await safeInvoke('load_kv', { name: fallbackKey });
      } catch {}
    }
    return hasMeaningfulData(data) ? data : null;
  }

  async loadContactsByScope(scopeId) {
    const scope = normalizeScopeId(scopeId);
    const key = makeScopedKey(CONTACTS_STORE_KEY, scope);
    const useLegacy = scope === 'default' && !isLegacyContactsMigrated();
    let data = await this.loadScopedData(key, { fallbackKey: useLegacy ? CONTACTS_STORE_KEY : '' });
    if (data && !isScopedDataMatch(data, scope)) {
      data = null;
      try {
        data = await safeInvoke('load_kv', { name: key });
      } catch {}
      if (data && !isScopedDataMatch(data, scope)) data = null;
    }
    if (!data || !data.contacts) {
      try {
        const store = new ContactsStore({ scopeId: scope });
        await store.ready;
        const list = store.listContacts?.() || [];
        if (list.length) return list;
      } catch {}
      return [];
    }
    if (!isScopedDataMatch(data, scope)) return [];
    return Object.values(data.contacts || {});
  }

  async loadWorldMapByScope(scopeId) {
    const scope = normalizeScopeId(scopeId);
    const key = makeScopedKey(WORLD_SESSION_MAP_KEY, scope);
    const useLegacy = scope === 'default' && !isLegacyContactsMigrated();
    let data = await this.loadScopedData(key, { fallbackKey: useLegacy ? WORLD_SESSION_MAP_KEY : '' });
    if (data && !isScopedDataMatch(data, scope)) {
      data = null;
      try {
        data = await safeInvoke('load_kv', { name: key });
      } catch {}
      if (data && !isScopedDataMatch(data, scope)) data = null;
    }
    if (!data || typeof data !== 'object') return {};
    return data || {};
  }

  async loadSessionsByScope(scopeId) {
    const scope = normalizeScopeId(scopeId);
    if (!scope) return [];
    try {
      const data = await safeInvoke('chat_store_v2_read_index', { scope });
      if (data && data.sessions && typeof data.sessions === 'object') {
        const ids = Object.keys(data.sessions || {}).filter(id => String(id || '').trim());
        if (ids.length) return ids;
      }
    } catch {}
    const key = makeScopedKey(CHAT_STORE_KEY, scope);
    const useLegacy = scope === 'default' && !isLegacyContactsMigrated();
    let data = await this.loadScopedData(key, { fallbackKey: useLegacy ? CHAT_STORE_KEY : '' });
    if (data && !isScopedDataMatch(data, scope)) {
      data = null;
      try {
        data = await safeInvoke('load_kv', { name: key });
      } catch {}
      if (data && !isScopedDataMatch(data, scope)) data = null;
    }
    if (!data || !data.sessions) return [];
    return Object.keys(data.sessions || {}).filter(id => String(id || '').trim());
  }

  renderSharedList() {
    if (!this.listElShared) return;
    this.listElShared.innerHTML = '';
    if (this.sharedLoading) {
      const loading = document.createElement('div');
      loading.className = 'sticker-bind-empty';
      loading.textContent = '载入中...';
      this.listElShared.appendChild(loading);
      this.panel?.classList.remove('has-shared');
      return;
    }
    if (!this.otherContacts.length) {
      const empty = document.createElement('div');
      empty.className = 'sticker-bind-empty';
      empty.textContent = '暂无可添加联系人';
      this.listElShared.appendChild(empty);
      this.panel?.classList.remove('has-shared');
      return;
    }
    this.panel?.classList.add('has-shared');
    this.sharedRenderLimit = Math.min(this.sharedChunkSize, this.otherContacts.length);
    this.sharedRenderedCount = 0;
    this.appendSharedRows(this.sharedRenderLimit);
  }

  appendSharedRows(nextLimit) {
    if (!this.listElShared) return;
    const limit = Math.min(nextLimit || 0, this.otherContacts.length);
    if (limit <= this.sharedRenderedCount) return;
    for (let i = this.sharedRenderedCount; i < limit; i += 1) {
      const item = this.otherContacts[i];
      const row = this.buildSharedRow(item);
      if (row) this.listElShared.appendChild(row);
    }
    this.sharedRenderedCount = limit;
  }

  buildSharedRow(item) {
    const contact = item.contact || item;
    const id = String(contact?.id || '').trim();
    if (!id) return null;
    const row = document.createElement('div');
    row.className = 'sticker-bind-row session-row session-row-shared';
    if (item.alreadyAdded) row.classList.add('session-row-shared-added');
    row.addEventListener('click', () => {
      if (item.alreadyAdded) {
        window.toastr?.info?.('联系人已在当前列表');
        return;
      }
      this.importSharedContact(item);
    });

    const avatar = document.createElement('img');
    avatar.className = 'sticker-bind-avatar';
    avatar.alt = '';
    avatar.src = contact.avatar || './assets/external/feather-default.png';

    const info = document.createElement('div');
    info.className = 'sticker-bind-info';
    const name = document.createElement('div');
    name.className = 'sticker-bind-name';
    const baseName = contact.name || id;
    const isGroup = Boolean(contact.isGroup) || id.startsWith('group:');
    const membersCount = isGroup && Array.isArray(contact.members) ? contact.members.length : 0;
    const displayName = isGroup ? `${baseName}(${membersCount})` : baseName;
    name.textContent = displayName;
    const meta = document.createElement('div');
    meta.className = 'sticker-bind-meta';
    meta.textContent = item.alreadyAdded ? '已在当前联系人' : '点击添加到当前用户';
    info.appendChild(name);
    info.appendChild(meta);

    row.appendChild(avatar);
    row.appendChild(info);
    return row;
  }

  maybeLoadMoreShared() {
    if (!this.listElShared) return;
    if (this.sharedLoading) return;
    if (this.sharedRenderedCount >= this.otherContacts.length) return;
    const { scrollTop, clientHeight, scrollHeight } = this.listElShared;
    if (scrollTop + clientHeight < scrollHeight - 60) return;
    const nextLimit = Math.min(this.sharedRenderedCount + this.sharedChunkSize, this.otherContacts.length);
    this.appendSharedRows(nextLimit);
  }

  async loadOtherPersonaContacts() {
    if (!this.personaStore || !this.getPersonaScopeKey) {
      this.otherContacts = [];
      this.sharedLoading = false;
      this.renderSharedList();
      return;
    }
    try {
      const ready = this.personaStore?.ready;
      if (ready && typeof ready.then === 'function') await ready;
    } catch {}
    const activePersona = this.personaStore.getActive?.() || null;
    const activeId = activePersona?.id || 'default';
    const currentScope = normalizeScopeId(this.contactsStore?.scopeId || this.getPersonaScopeKey(activeId) || activeId);
    const currentIds = new Set(
      (this.contactsStore?.listContacts?.() || []).map(c => String(c?.id || '').trim()).filter(Boolean),
    );
    const personas = (this.personaStore.getAll?.() || []).filter(p => p?.id && p.id !== activeId);
    const results = [];
    const cache = (window.__personaContactsCache && typeof window.__personaContactsCache === 'object')
      ? window.__personaContactsCache
      : {};
    for (const persona of personas) {
      const scope = normalizeScopeId(this.getPersonaScopeKey(persona.id) || persona.id);
      if (!scope) continue;
      if (currentScope && scope === currentScope) continue;
      let contacts = Array.isArray(cache?.[persona.id]?.contacts) ? cache[persona.id].contacts : [];
      if (!contacts.length) {
        contacts = await this.loadContactsByScope(scope);
      }
      if (!contacts.length) {
        const sessions = await this.loadSessionsByScope(scope);
        if (sessions.length) {
          contacts = sessions.map(id => ({
            id,
            name: id,
            avatar: '',
            isGroup: String(id || '').startsWith('group:'),
          }));
        }
      }
      if (!contacts.length) continue;
      const worldMap = await this.loadWorldMapByScope(scope);
      contacts.forEach(contact => {
        const id = String(contact?.id || '').trim();
        if (!id) return;
        results.push({
          contact: {
            ...contact,
            avatar: trimAvatarData(contact?.avatar || ''),
          },
          worldId: worldMap?.[id] || '',
          sourcePersonaId: persona.id,
          sourcePersonaName: persona.name || '',
          alreadyAdded: currentIds.has(id),
        });
      });
    }
    let finalResults = results;
    let hardUsed = false;
    if (!finalResults.length) {
      try {
        const hard = await this.loadOtherPersonaContactsHard(personas, currentIds);
        if (Array.isArray(hard) && hard.length) {
          finalResults = hard;
          hardUsed = true;
        }
      } catch (err) {
        logger.warn('硬兜底读取其他联系人失败', err);
      }
    }
    this.otherContacts = finalResults;
    this.sharedLoading = false;
    this.renderSharedList();
  }

  async loadOtherPersonaContactsHard(personas, currentIds) {
    if (this.sharedHardLoading) return [];
    this.sharedHardLoading = true;
    try {
      const scopeToPersona = new Map();
      const scopes = [];
      personas.forEach(persona => {
        const scope = normalizeScopeId(this.getPersonaScopeKey(persona.id) || persona.id);
        if (!scope) return;
        scopeToPersona.set(scope, persona);
        scopes.push(scope);
      });
      if (!scopes.length) return [];
      const payload = await safeInvoke('list_contacts_by_scopes', { scopes });
      const entries = Array.isArray(payload) ? payload : [];
      const results = [];
      entries.forEach(entry => {
        const scopeId = normalizeScopeId(entry?.scopeId || entry?.scope || '');
        if (!scopeId) return;
        const persona = scopeToPersona.get(scopeId);
        if (!persona) return;
        const contacts = Array.isArray(entry?.contacts) ? entry.contacts : [];
        contacts.forEach(contact => {
          const id = String(contact?.id || '').trim();
          if (!id) return;
          results.push({
            contact: {
              ...contact,
              avatar: trimAvatarData(contact?.avatar || ''),
            },
            worldId: '',
            sourcePersonaId: persona.id,
            sourcePersonaName: persona.name || '',
            alreadyAdded: currentIds.has(id),
          });
        });
      });
      return results;
    } catch {
      return [];
    } finally {
      this.sharedHardLoading = false;
    }
  }

  importSharedContact(item) {
    const contact = item?.contact || item;
    if (!contact || !contact.id) return;
    const id = String(contact.id || '').trim();
    if (!id) return;
    if (this.contactsStore.getContact(id)) {
      window.toastr?.info?.('联系人已存在');
      return;
    }
    const next = { ...contact, addedAt: Date.now() };
    this.contactsStore.upsertContact(next);
    if (item?.worldId) {
      window.appBridge?.bindWorldToSession?.(id, item.worldId, { silent: true });
    }
    this.refresh();
    this.onUpdated?.();
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'session-panel-overlay';
    this.overlay.onclick = () => this.hide();

    this.panel = document.createElement('div');
    this.panel.className = 'session-panel';
    this.panel.onclick = e => e.stopPropagation();

    this.panel.innerHTML = `
            <div class="session-panel-header">
              <div>
                <div class="session-panel-title">好友列表</div>
                <div class="session-panel-subtitle">点击好友可切换聊天室</div>
              </div>
              <button class="session-panel-close" type="button" aria-label="关闭">×</button>
            </div>
            <div class="session-panel-form">
                <button id="session-avatar-btn" type="button" title="设置好友头像" class="session-avatar-btn">
                    <img id="session-avatar-preview" alt="" class="session-avatar-preview" src="./assets/external/feather-default.png">
                </button>
                <input id="session-name" placeholder="新好友名称" class="session-name-input">
                <button id="session-add" class="session-btn">添加</button>
                <button id="session-clear" class="session-btn danger">清空聊天</button>
            </div>
            <div class="session-list-split">
              <div class="session-list-section session-list-current">
                <div class="session-list-title">当前联系人</div>
                <div id="session-list-current" class="sticker-bind-list session-list-pane"></div>
              </div>
              <div class="session-list-section session-list-other">
                <div class="session-list-title">其他用户联系人</div>
                <div id="session-list-shared" class="sticker-bind-list session-list-pane session-list-other"></div>
              </div>
            </div>
        `;

    this.newAvatar = '';
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.onchange = async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        this.newAvatar = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
        const img = this.panel.querySelector('#session-avatar-preview');
        if (img) img.src = this.newAvatar || img.src;
      } catch (err) {
        logger.warn('读取/压缩头像失败', err);
        window.toastr?.error?.('读取头像失败');
      }
    };
    this.panel.appendChild(fileInput);

    this.listElCurrent = this.panel.querySelector('#session-list-current');
    this.listElShared = this.panel.querySelector('#session-list-shared');
    this.nameInput = this.panel.querySelector('#session-name');
    this.listElShared?.addEventListener('scroll', () => this.maybeLoadMoreShared());
    this.panel.querySelector('.session-panel-close')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('#session-add').onclick = () => this.addSession();
    this.panel.querySelector('#session-clear').onclick = () => this.clearCurrent();
    this.panel.querySelector('#session-avatar-btn').onclick = () => {
      fileInput.value = '';
      fileInput.click();
    };

    this.overlay.appendChild(this.panel);
    document.body.appendChild(this.overlay);
  }

  addSession() {
    const name = (this.nameInput.value || '').trim();
    if (!name) {
      window.toastr?.warning('请输入好友名称');
      return;
    }

    if (name.startsWith('group:')) {
      window.toastr?.warning('好友名称不可使用 group: 前綴');
      return;
    }

    if (this.contactsStore?.getContact?.(name)) {
      window.toastr?.warning('好友已存在');
      return;
    }

    // 创建独立聊天室（会话）与联系人记录
    this.contactsStore?.upsertContact?.({
      id: name,
      name,
      avatar: this.newAvatar || '',
      isGroup: false,
      addedAt: Date.now(),
    });
    this.store.switchSession(name);
    window.appBridge?.setActiveSession?.(name);

    this.nameInput.value = '';
    this.newAvatar = '';
    const img = this.panel?.querySelector('#session-avatar-preview');
    if (img) img.src = './assets/external/feather-default.png';
    this.switchTo(name);
    this.refresh();
    this.onUpdated?.();
    this.jumpToContactsOnClose = true;
  }

  async clearCurrent() {
    const id = this.store.getCurrent();
    const ok = await appConfirm({
      title: '清空会话',
      message: `清空当前会话：${id}？此操作不可恢复。`,
      danger: true,
    });
    if (!ok) return;
    this.store.clear(id);
    this.switchTo(id);
    this.refresh();
  }
}
