/**
 * Session list panel (basic)
 * - list sessions, create new, switch
 */

import { CharacterLibraryStore } from '../storage/character-library-store.js';
import { ContactsStore } from '../storage/contacts-store.js';
import { makeScopedKey, normalizeScopeId } from '../storage/store-scope.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { FEATHER_DEFAULT, resolveLineAvatar } from '../utils/line-avatar.js';
import { getDefaultAppIcon } from '../utils/default-icon.js';
import { logger } from '../utils/logger.js';
import { buildNameWithBadgesHtml, escapeHtml, getAutoBadgeFromName, getContactBadges } from '../utils/name-badges.js';
import { safeInvoke } from '../utils/tauri.js';
import { appConfirm } from './app-confirm.js';
import {
  deleteWorldSessionMapEntry,
  getWorldSessionMap,
  renameWorldSessionMapEntry,
} from './world-session-runtime-utils.js';

const CONTACTS_STORE_KEY = 'contacts_store_v1';
const WORLD_SESSION_MAP_KEY = 'world_session_map_v1';
const LEGACY_CONTACTS_MIGRATION_KEY = `${CONTACTS_STORE_KEY}__scoped_migrated`;
const SHARED_AVATAR_MAX = 200_000;

const readLocalState = key => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const hasMeaningfulData = data => {
  if (!data) return false;
  if (data && typeof data === 'object' && data._tooLarge) return false;
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

const isDefaultScopeId = (scopeId = '') => {
  const scope = normalizeScopeId(scopeId);
  return !scope || scope === 'default';
};

const isScopedDataMatch = (data, scopeId) => {
  try {
    const stored = String(data?.scopeId ?? '').trim();
    const scope = normalizeScopeId(scopeId);
    if (!stored) return isDefaultScopeId(scope);
    return stored === scope;
  } catch {
    return true;
  }
};

const trimAvatarData = value => {
  const raw = typeof value === 'string' ? value : '';
  if (!raw) return '';
  return raw.length > SHARED_AVATAR_MAX ? '' : raw;
};

const uniqueKeys = (list = []) => {
  const seen = new Set();
  const out = [];
  for (const item of list) {
    const text = String(item || '').trim();
    if (!text) continue;
    if (seen.has(text)) continue;
    seen.add(text);
    out.push(text);
  }
  return out;
};

const isRpSessionId = (sessionId) => String(sessionId || '').startsWith('rp:');
const isGroupSessionId = (sessionId) => String(sessionId || '').startsWith('group:');
const isSharedContactCandidate = (contact) => {
  const id = String(contact?.id || '').trim();
  if (!id) return false;
  if (isRpSessionId(id) || isGroupSessionId(id)) return false;
  if (contact?.isGroup === true) return false;
  return true;
};

const calculateStaggerDelay = (index = 0) => {
  const idx = Math.max(0, Math.trunc(index));
  if (idx <= 0) return 0;
  const initialDelay = 300;
  const minDelay = 50;
  const decay = 0.65;
  let total = 0;
  for (let i = 0; i < idx; i += 1) {
    const gap = Math.max(initialDelay * Math.pow(decay, i), minDelay);
    total += gap;
  }
  return Math.round(total);
};

const RECOMMEND_ADD_ICON = `
  <svg class="session-recommend-add-icon" viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 5v14"></path>
    <path d="M5 12h14"></path>
  </svg>
`;

const summarizeCharacterMeta = (character = {}) => {
  const source = String(character.source || '').trim();
  const tags = Array.isArray(character.tags)
    ? character.tags.map(tag => String(tag || '').trim()).filter(Boolean)
    : [];
  const aliases = Array.isArray(character.aliases)
    ? character.aliases.map(alias => String(alias || '').trim()).filter(Boolean)
    : [];
  const parts = [];
  if (source) parts.push(source);
  if (tags.length) parts.push(tags.slice(0, 3).join(' / '));
  if (!parts.length && aliases.length) parts.push(`别名：${aliases.slice(0, 2).join(' / ')}`);
  return parts.join(' · ');
};

export class SessionPanel {
  constructor(chatStore, contactsStore, ui, { onUpdated, personaStore, getPersonaScopeKey, getChatSessionId, getSocialSessionId } = {}) {
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
    this.getChatSessionId =
      typeof getChatSessionId === 'function' ? getChatSessionId : typeof getSocialSessionId === 'function' ? getSocialSessionId : null;
    this.getSocialSessionId = typeof getSocialSessionId === 'function' ? getSocialSessionId : this.getChatSessionId;
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
    // 角色库推荐（按 persona scope 隔离）
    this.characterStore = new CharacterLibraryStore({ scopeId: this.contactsStore?.scopeId || '' });
    this.recommendSection = null;
    this.recommendListEl = null;
    this.recommendPullEl = null;
    this.recommendPullIcon = null;
    this.recommendPullText = null;
    this.recommendMode = false;
    this.recommendLoading = false;
    this.recommendSections = [];
    this.recommendCharacters = [];
    this.recommendQuery = '';
    this.lastRecommendRefreshAt = 0;
    this.recommendRefreshCooldownMs = 1200;
    this.recommendPullThreshold = 188;
    this.recommendTouchStartY = 0;
    this.recommendBottomArmed = false;
    this.recommendPullDistance = 0;
    this.recommendPulling = false;
    this.recommendPullLoading = false;
    this.recommendRequestToken = 0;
    this.recommendPointerDownAt = 0;
    this.lastChatSessionId = '';
  }

  formatTime(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  renderNameHtml(id, contact) {
    const sid = String(id || '');
    const c = contact || this.contactsStore?.getContact?.(sid) || { id: sid, name: sid };
    const isGroup = Boolean(c?.isGroup) || sid.startsWith('group:');
    const baseName = c.name || sid;
    if (isGroup) {
      const count = Array.isArray(c?.members) ? c.members.length : 0;
      const text = `${baseName}(${count})`;
      return escapeHtml(text);
    }
    const badges = getContactBadges(c);
    return buildNameWithBadgesHtml(baseName, badges);
  }

  resolveAvatarSrc({ avatar = '', name = '', tags = [] } = {}) {
    const list = Array.isArray(tags) ? tags : [];
    return resolveLineAvatar({ avatar, name, tags: list, size: 96 });
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
    try {
      this.characterStore?.setScope?.(this.contactsStore?.scopeId || '');
    } catch {}
    this.listElCurrent.innerHTML = '';
    let contacts = this.contactsStore?.listContacts?.() || [];
    const currentIdRaw = this.store.getCurrent();
    if (currentIdRaw && !isRpSessionId(currentIdRaw)) {
      this.lastChatSessionId = currentIdRaw;
    } else if (isRpSessionId(currentIdRaw) && !this.lastChatSessionId && this.getChatSessionId) {
      const fromChat = String(this.getChatSessionId() || '').trim();
      if (fromChat && !isRpSessionId(fromChat)) {
        this.lastChatSessionId = fromChat;
      }
    }
    const currentId = isRpSessionId(currentIdRaw) ? this.lastChatSessionId : currentIdRaw;
    const visibleContacts = contacts.filter(c => c && !isRpSessionId(c.id));
    if (!visibleContacts.length) {
      const empty = document.createElement('div');
      empty.className = 'sticker-bind-empty';
      empty.textContent = this.contactsReadyResolved ? '暂无好友/群组' : '载入中…';
      this.listElCurrent.appendChild(empty);
    } else {
      visibleContacts.forEach(c => {
        const id = c.id;
        const row = document.createElement('div');
        row.className = 'sticker-bind-row session-row';
        if (id === currentId) row.classList.add('is-current');
        row.addEventListener('click', () => this.switchTo(id));

        const avatar = document.createElement('img');
        avatar.className = 'sticker-bind-avatar';
        avatar.alt = '';
        avatar.src = this.resolveAvatarSrc({
          avatar: c.avatar,
          name: c.name || id,
          tags: c.libraryTags || c.labels || [],
        });

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
            ? `<span style="margin-left:8px; min-width:18px; height:18px; padding:0 6px; display:inline-flex; align-items:center; justify-content:center; border-radius:999px; background:#ef4444; color:var(--app-text-inverse); font-size:11px; font-weight:800; line-height:18px;">${unread}</span>`
            : '';
        const badge = isGroup
          ? `<span style="padding:2px 6px; border-radius:8px; background:#e0f2fe; color:#0369a1; font-size:11px; margin-left:4px;">群</span>`
          : '';
        const currentTag =
          id === currentId ? `<span style="color:#059669; font-size:11px; margin-left:6px;">当前</span>` : '';
        const displayNameHtml = this.renderNameHtml(id, c);
        name.innerHTML = `${displayNameHtml}${unreadBadge}${badge}${currentTag}`;
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
        delBtn.onclick = event => {
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
    if (
      this.contactsStore?.getContact?.(nextId) ||
      this.store.listSessions().filter(id => !isRpSessionId(id)).includes(nextId)
    ) {
      window.toastr?.warning('名称已存在，请换一个');
      return;
    }

    // 迁移世界书映射（按会话隔离）
    renameWorldSessionMapEntry(window.appBridge, id, nextId);

    // 迁移联系人记录
    const existing = this.contactsStore?.getContact?.(id);
    if (existing) {
      this.contactsStore.removeContact(id);
      this.contactsStore.upsertContact({ ...existing, id: nextId, name: nextId });
    }

    // 迁移聊天记录
    this.store.rename(id, nextId);
    window.appBridge?.renameSessionTurnCheckpointState?.(id, nextId).catch?.(err => {
      logger.warn('rename session checkpoint state failed', err);
    });

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

    // 删除由拆分条目创建的引用世界书（仅在未被其他会话使用时）
    try {
      const bound = window.appBridge?.getWorldIdsForSession?.(id) || [];
      const boundIds = Array.isArray(bound) ? bound.filter(Boolean) : (bound ? [String(bound)] : []);
      const map = getWorldSessionMap(window.appBridge);
      const isUsedElsewhere = (worldId) => {
        const target = String(worldId || '').trim();
        if (!target) return false;
        return Object.entries(map).some(([sid, list]) => {
          if (String(sid || '').trim() === String(id || '').trim()) return false;
          const ids = Array.isArray(list) ? list : (list ? [list] : []);
          return ids.some(val => String(val || '').trim() === target);
        });
      };
      for (const worldId of boundIds) {
        if (!worldId || isUsedElsewhere(worldId)) continue;
        let data = null;
        try {
          data = await window.appBridge?.getWorldInfo?.(worldId);
        } catch {}
        if (data?.source === 'world_entry') {
          await window.appBridge?.deleteWorldInfo?.(worldId);
        }
      }
    } catch (err) {
      logger.warn('删除联系人时清理引用世界书失败', err);
    }

    // 清理世界书映射
    deleteWorldSessionMapEntry(window.appBridge, id);

    this.store.delete(id);
    window.appBridge?.clearSessionTurnCheckpointState?.(id).catch?.(err => {
      logger.warn('clear session checkpoint state failed', err);
    });
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

  renderSharedList() {
    if (!this.listElShared) return;
    this.listElShared.innerHTML = '';
    if (this.sharedLoading) {
      const loading = document.createElement('div');
      loading.className = 'sticker-bind-empty';
      loading.textContent = '载入中…';
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
    avatar.src = this.resolveAvatarSrc({
      avatar: contact.avatar,
      name: contact.name || id,
      tags: contact.libraryTags || contact.labels || [],
    });

    const info = document.createElement('div');
    info.className = 'sticker-bind-info';
    const name = document.createElement('div');
    name.className = 'sticker-bind-name';
    const isGroup = Boolean(contact.isGroup) || id.startsWith('group:');
    name.innerHTML = this.renderNameHtml(id, contact);
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
    const cache =
      window.__personaContactsCache && typeof window.__personaContactsCache === 'object'
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
      if (!contacts.length) continue;
      const worldMap = await this.loadWorldMapByScope(scope);
      contacts.forEach(contact => {
        const id = String(contact?.id || '').trim();
        if (!isSharedContactCandidate(contact)) return;
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
          if (!isSharedContactCandidate(contact)) return;
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
    if (!isSharedContactCandidate(contact)) {
      window.toastr?.warning?.('群组不能通过添加好友导入');
      return;
    }
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

  setRecommendMode(active) {
    this.recommendMode = Boolean(active);
    if (this.panel) {
      this.panel.classList.toggle('is-recommend-mode', this.recommendMode);
    }
    if (!this.recommendMode) {
      this.recommendQuery = '';
      this.recommendBottomArmed = false;
      this.resetRecommendPullUI();
    }
  }

  enterRecommendMode({ reason = 'focus', force = false } = {}) {
    this.setRecommendMode(true);
    try {
      this.characterStore?.setScope?.(this.contactsStore?.scopeId || '');
    } catch {}
    const q = String(this.nameInput?.value || '').trim();
    if (q) {
      this.handleRecommendQueryChange(q, { reason: `${reason}-query`, force });
      return;
    }
    this.refreshRecommendations({ force, reason });
  }

  handleRecommendQueryChange(query, { reason = 'input', force = false } = {}) {
    const q = String(query || '').trim();
    this.recommendQuery = q;
    this.setRecommendMode(true);
    if (!q) {
      this.refreshRecommendations({ force, reason: `${reason}-empty` });
      return;
    }
    this.performSearch(q, { reason });
  }

  canRefreshRecommendations({ force = false } = {}) {
    if (force) return true;
    const now = Date.now();
    return now - this.lastRecommendRefreshAt >= this.recommendRefreshCooldownMs;
  }

  async refreshRecommendations({ force = false, reason = 'refresh' } = {}) {
    if (!this.recommendMode) this.setRecommendMode(true);
    if (this.recommendLoading) return;
    if (!this.canRefreshRecommendations({ force })) return;
    const isPullRefresh = String(reason || '').includes('pull-bottom') || String(reason || '').includes('wheel-bottom');
    const token = ++this.recommendRequestToken;
    this.recommendLoading = true;
    this.lastRecommendRefreshAt = Date.now();
    if (isPullRefresh) {
      this.recommendPullLoading = true;
      this.updateRecommendPullUI({ progress: 1, state: 'loading' });
      this.applyRecommendPullTransform(this.recommendPullThreshold, { dragging: false });
    }
    this.renderRecommendSections([], { kind: 'loading', hint: '载入推荐中…' });
    try {
      await this.characterStore?.setScope?.(this.contactsStore?.scopeId || '');
      const data = await this.characterStore?.buildRecommendations?.({ contactsStore: this.contactsStore });
      if (token !== this.recommendRequestToken) return;
      this.recommendSections = Array.isArray(data?.sections) ? data.sections : [];
      this.recommendCharacters = Array.isArray(data?.characters) ? data.characters : [];
      this.renderRecommendSections(this.recommendCharacters, { kind: 'recommend' });
    } catch (err) {
      logger.warn('刷新角色推荐失败', err);
      if (token !== this.recommendRequestToken) return;
      this.renderRecommendSections([], { kind: 'empty', hint: '推荐加载失败' });
    } finally {
      if (token === this.recommendRequestToken) {
        this.recommendLoading = false;
      }
      if (isPullRefresh) {
        this.resetRecommendPullUI();
      }
    }
  }

  async performSearch(query, { reason = 'search' } = {}) {
    if (!this.recommendMode) this.setRecommendMode(true);
    const token = ++this.recommendRequestToken;
    this.recommendLoading = true;
    this.renderRecommendSections([], { kind: 'loading', hint: '搜索中…' });
    try {
      await this.characterStore?.setScope?.(this.contactsStore?.scopeId || '');
      const results = await this.characterStore?.search?.(query, { contactsStore: this.contactsStore });
      if (token !== this.recommendRequestToken) return;
      const list = Array.isArray(results) ? results : [];
      this.recommendCharacters = list;
      this.renderRecommendSections(list, {
        kind: list.length ? 'search' : 'empty',
        hint: list.length ? '' : '未找到匹配角色',
      });
    } catch (err) {
      logger.warn('角色库搜索失败', err);
      if (token !== this.recommendRequestToken) return;
      this.renderRecommendSections([], { kind: 'empty', hint: '搜索失败' });
    } finally {
      if (token === this.recommendRequestToken) {
        this.recommendLoading = false;
      }
    }
  }

  renderRecommendSections(characters, { kind = 'recommend', hint = '' } = {}) {
    if (!this.recommendListEl) return;
    const el = this.recommendListEl;
    el.innerHTML = '';
    if (kind === 'loading') {
      const loading = document.createElement('div');
      loading.className = 'session-recommend-empty';
      loading.textContent = hint || '载入中…';
      el.appendChild(loading);
      return;
    }
    const list = Array.isArray(characters) ? characters : [];
    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'session-recommend-empty';
      empty.textContent = hint || '暂无推荐角色';
      el.appendChild(empty);
      return;
    }
    list.forEach((character, index) => {
      const row = this.renderRecommendRow(character, { index });
      if (row) el.appendChild(row);
    });
  }

  renderRecommendRow(character, { index = 0 } = {}) {
    const char = character || {};
    const id = String(char.id || '').trim();
    const name = String(char.name || '').trim();
    if (!id || !name) return null;

    const row = document.createElement('div');
    row.className = 'sticker-bind-row session-row session-recommend-row';
    row.dataset.characterId = id;
    const delay = calculateStaggerDelay(index);
    row.style.animationDelay = `${delay}ms`;
    row.addEventListener('click', () => this.confirmAddCharacter(char));

    const avatar = document.createElement('img');
    avatar.className = 'sticker-bind-avatar session-recommend-avatar';
    avatar.alt = '';
    avatar.src = this.resolveAvatarSrc({
      avatar: '',
      name,
      tags: char.tags || [],
    });

    const info = document.createElement('div');
    info.className = 'sticker-bind-info session-recommend-info';

    const nameEl = document.createElement('div');
    nameEl.className = 'sticker-bind-name session-recommend-name';
    const autoBadges = getAutoBadgeFromName(name);
    nameEl.innerHTML = buildNameWithBadgesHtml(name, autoBadges);
    info.appendChild(nameEl);

    const metaText = summarizeCharacterMeta(char);
    if (metaText) {
      const meta = document.createElement('div');
      meta.className = 'session-recommend-meta';
      meta.textContent = metaText;
      info.appendChild(meta);
    }

    const tagList = Array.isArray(char.tags)
      ? char.tags.map(tag => String(tag || '').trim()).filter(Boolean).slice(0, 3)
      : [];
    if (tagList.length) {
      const chips = document.createElement('div');
      chips.className = 'session-recommend-row-tags';
      tagList.forEach(tag => {
        const chip = document.createElement('span');
        chip.className = 'session-recommend-row-tag';
        chip.textContent = tag;
        chips.appendChild(chip);
      });
      info.appendChild(chips);
    }

    const addBtn = document.createElement('button');
    addBtn.type = 'button';
    addBtn.className = 'session-recommend-add';
    addBtn.setAttribute('aria-label', `添加 ${name}`);
    addBtn.innerHTML = `${RECOMMEND_ADD_ICON}<span>添加</span>`;
    addBtn.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();
      this.confirmAddCharacter(char);
    });

    row.appendChild(avatar);
    row.appendChild(info);
    row.appendChild(addBtn);
    return row;
  }

  isRecommendAtBottom() {
    const el = this.recommendListEl;
    if (!el) return false;
    const { scrollTop, clientHeight, scrollHeight } = el;
    if (!scrollHeight) return false;
    return scrollTop + clientHeight >= scrollHeight - 2;
  }

  applyRecommendPullTransform(distance = 0, { dragging = false } = {}) {
    if (!this.recommendListEl) return;
    const offset = Math.max(0, Math.min(20, Math.round(distance * 0.2)));
    if (offset > 0) {
      this.recommendListEl.style.transform = `translateY(${-offset}px)`;
    } else {
      this.recommendListEl.style.transform = '';
    }
    this.recommendListEl.classList.toggle('is-pulling', dragging);
  }

  updateRecommendPullUI({ progress = 0, state = 'idle' } = {}) {
    if (!this.recommendPullEl) return;
    const clamped = Math.max(0, Math.min(1, progress));
    const isLoading = state === 'loading';
    const isArmed = !isLoading && clamped >= 1;
    const show = isLoading || clamped > 0.02;
    const opacity = isLoading ? 1 : Math.min(1, 0.25 + clamped * 0.85);
    const translate = show ? 0 : 8;

    this.recommendPullEl.style.opacity = show ? String(opacity) : '0';
    this.recommendPullEl.style.transform = `translateY(${translate}px)`;
    this.recommendPullEl.classList.toggle('is-armed', isArmed);
    this.recommendPullEl.classList.toggle('is-loading', isLoading);

    if (this.recommendPullText) {
      if (isLoading) this.recommendPullText.textContent = '刷新中…';
      else this.recommendPullText.textContent = isArmed ? '释放刷新' : '上拉刷新';
    }
  }

  resetRecommendPullUI() {
    this.recommendPullDistance = 0;
    this.recommendPulling = false;
    this.recommendPullLoading = false;
    this.updateRecommendPullUI({ progress: 0, state: 'idle' });
    this.applyRecommendPullTransform(0, { dragging: false });
  }

  async confirmAddCharacter(character) {
    const name = String(character?.name || '').trim();
    if (!name) return;
    const source = String(character?.source || '').trim();
    const message = source
      ? `将「${name}」添加为好友？\n\n来源：${source}\n\n会自动创建聊天室与世界书并绑定。`
      : `将「${name}」添加为好友？\n\n会自动创建聊天室与世界书并绑定。`;
    const ok = await appConfirm({
      title: '添加推荐角色',
      message,
    });
    if (!ok) return;
    await this.addCharacterFromLibrary(character);
  }

  async ensureWorldBookForCharacter(character, sessionId) {
    const bridge = window.appBridge;
    if (!bridge?.saveWorldInfo || !bridge?.bindWorldToSession) return;
    const worldId = String(sessionId || '').trim();
    if (!worldId) return;
    try {
      const existing = await bridge.getWorldInfo?.(worldId);
      if (existing && Array.isArray(existing.entries) && existing.entries.length) {
        const reuse = await appConfirm({
          title: '同名世界书已存在',
          message: `检测到同名世界书「${worldId}」。\n\n是否直接复用并绑定到该角色？`,
        });
        if (!reuse) return;
        bridge.bindWorldToSession(worldId, worldId, { silent: true });
        return;
      }
    } catch (err) {
      logger.debug('检查同名世界书失败（忽略）', err);
    }

    const baseName = String(character?.baseName || character?.name || worldId).trim() || worldId;
    const source = String(character?.source || '').trim() || '未知作品';
    const content = `你是来自“${source}”的${baseName}。`;
    const entry = {
      id: baseName,
      comment: baseName,
      content,
      key: uniqueKeys([baseName, worldId]),
      keysecondary: [],
      order: 100,
      depth: 4,
      position: 0,
      selective: false,
      selectiveLogic: 0,
      disable: false,
      constant: true,
      probability: 100,
      useProbability: true,
    };
    const worldData = { name: worldId, entries: [entry] };
    try {
      await bridge.saveWorldInfo(worldId, worldData);
      bridge.bindWorldToSession(worldId, worldId, { silent: true });
    } catch (err) {
      logger.warn('自动创建/绑定世界书失败', err);
    }
  }

  async addCharacterFromLibrary(character) {
    const char = character || {};
    const id = String(char.id || '').trim();
    const name = String(char.name || '').trim();
    if (!id || !name) return;
    const sessionId = name;
    const existing = this.contactsStore?.getContact?.(sessionId);
    if (existing) {
      window.toastr?.info?.('该角色已在联系人列表');
      this.characterStore?.markAdded?.(id);
      return;
    }
    const addedAt = Date.now();
    const labels = getAutoBadgeFromName(name);
    this.contactsStore?.upsertContact?.({
      id: sessionId,
      name,
      avatar: FEATHER_DEFAULT,
      isGroup: false,
      addedAt,
      labels,
      libraryTags: Array.isArray(char.tags) ? char.tags : [],
      libraryCharacterId: id,
      source: String(char.source || ''),
      isUserCreated: false,
    });
    this.characterStore?.markAdded?.(id, { addedAt });
    await this.ensureWorldBookForCharacter(char, sessionId);
    window.toastr?.success?.(`已添加：${name}`);
    this.jumpToContactsOnClose = true;
    this.refresh();
    this.onUpdated?.();
    const currentList = Array.isArray(this.recommendCharacters) ? this.recommendCharacters : [];
    this.recommendCharacters = currentList.filter(item => String(item?.id || '').trim() !== id);
    if (this.recommendMode) {
      const rows = Array.from(this.recommendListEl?.querySelectorAll?.('.session-recommend-row') || []);
      const targetRow = rows.find(row => String(row?.dataset?.characterId || '') === id) || null;
      if (!targetRow) {
        const hasItems = this.recommendCharacters.length > 0;
        const kind = this.recommendQuery ? (hasItems ? 'search' : 'empty') : hasItems ? 'recommend' : 'empty';
        const hint = hasItems ? '' : this.recommendQuery ? '未找到匹配角色' : '暂无推荐角色';
        this.renderRecommendSections(this.recommendCharacters, { kind, hint });
        return;
      }
      targetRow.classList.add('is-removing');
      targetRow.setAttribute('aria-hidden', 'true');
      const finalizeRemoval = () => {
        targetRow.remove();
        const remainingRows = this.recommendListEl?.querySelectorAll?.('.session-recommend-row').length || 0;
        if (!remainingRows && this.recommendCharacters.length === 0) {
          const empty = document.createElement('div');
          empty.className = 'session-recommend-empty';
          empty.textContent = this.recommendQuery ? '未找到匹配角色' : '暂无推荐角色';
          this.recommendListEl?.appendChild(empty);
        }
      };
      let removed = false;
      const safeFinalize = () => {
        if (removed) return;
        removed = true;
        finalizeRemoval();
      };
      const onTransitionEnd = event => {
        const prop = String(event?.propertyName || '');
        if (prop && prop !== 'max-height' && prop !== 'opacity') return;
        safeFinalize();
      };
      targetRow.addEventListener('transitionend', onTransitionEnd, { once: true });
      window.setTimeout(safeFinalize, 320);
    }
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'session-panel-overlay app-themed-overlay';
    this.overlay.onclick = () => this.hide();

    this.panel = document.createElement('div');
    this.panel.className = 'session-panel app-themed-panel';
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
                    <img id="session-avatar-preview" alt="" class="session-avatar-preview" src="${getDefaultAppIcon()}">
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
            <div id="session-recommend-section" class="session-recommend-section">
              <div id="session-recommend-list" class="sticker-bind-list session-list-pane session-recommend-list"></div>
              <div id="session-recommend-pull" class="session-recommend-pull" aria-hidden="true">
                <div class="session-recommend-pull-indicator">
                  <span class="session-recommend-pull-icon">↑</span>
                  <span class="session-recommend-pull-text">上拉刷新</span>
                </div>
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
    this.recommendSection = this.panel.querySelector('#session-recommend-section');
    this.recommendListEl = this.panel.querySelector('#session-recommend-list');
    this.recommendPullEl = this.panel.querySelector('#session-recommend-pull');
    this.recommendPullIcon = this.panel.querySelector('#session-recommend-pull .session-recommend-pull-icon');
    this.recommendPullText = this.panel.querySelector('#session-recommend-pull .session-recommend-pull-text');
    this.listElShared?.addEventListener('scroll', () => this.maybeLoadMoreShared());
    this.panel.querySelector('.session-panel-close')?.addEventListener('click', () => this.hide());
    this.panel.querySelector('#session-add').onclick = () => this.addSession();
    this.panel.querySelector('#session-clear').onclick = () => this.clearCurrent();
    this.panel.querySelector('#session-avatar-btn').onclick = () => {
      fileInput.value = '';
      fileInput.click();
    };

    this.nameInput?.addEventListener('focus', () => {
      this.enterRecommendMode({ reason: 'focus', force: true });
    });
    this.nameInput?.addEventListener('input', () => {
      const q = String(this.nameInput?.value || '').trim();
      this.handleRecommendQueryChange(q);
    });
    this.nameInput?.addEventListener('blur', () => {
      // 当用户点击推荐列表时也会触发 blur；给一次微延时并检测 pointerDown，避免把点击吞掉。
      setTimeout(() => {
        if (!this.recommendMode) return;
        const sincePointerDown = Date.now() - Number(this.recommendPointerDownAt || 0);
        if (sincePointerDown >= 0 && sincePointerDown < 420) return;
        this.setRecommendMode(false);
        this.refresh();
      }, 0);
    });

    // 底部继续下拉刷新（推荐列表）
    const recList = this.recommendListEl;
    const onMaybeRefresh = reason => {
      if (!this.recommendMode) return;
      if (!this.isRecommendAtBottom()) return;
      this.refreshRecommendations({ force: true, reason });
    };
    recList?.addEventListener('wheel', ev => {
      const delta = Number(ev?.deltaY || 0);
      if (delta > 32) onMaybeRefresh('wheel-bottom');
    });
    recList?.addEventListener(
      'touchstart',
      ev => {
        this.recommendPointerDownAt = Date.now();
        const touch = ev.touches?.[0];
        this.recommendTouchStartY = touch?.clientY || 0;
        this.recommendBottomArmed = this.isRecommendAtBottom();
        this.recommendPullDistance = 0;
        this.recommendPulling = false;
        if (this.recommendBottomArmed) {
          this.updateRecommendPullUI({ progress: 0, state: 'idle' });
        }
      },
      { passive: true },
    );
    recList?.addEventListener('mousedown', () => {
      this.recommendPointerDownAt = Date.now();
    });
    recList?.addEventListener(
      'touchmove',
      ev => {
        if (!this.recommendBottomArmed) return;
        if (!this.isRecommendAtBottom()) return;
        const touch = ev.touches?.[0];
        const y = touch?.clientY || 0;
        const deltaY = y - this.recommendTouchStartY;
        const pull = Math.max(0, -deltaY);
        this.recommendPullDistance = pull;
        this.recommendPulling = pull > 0;
        if (pull <= 0) {
          this.updateRecommendPullUI({ progress: 0, state: 'idle' });
          this.applyRecommendPullTransform(0, { dragging: true });
          return;
        }
        const progress = pull / this.recommendPullThreshold;
        this.updateRecommendPullUI({ progress, state: 'idle' });
        this.applyRecommendPullTransform(pull, { dragging: true });
        if (pull >= this.recommendPullThreshold) {
          if (this.recommendLoading) return;
          this.recommendBottomArmed = false;
          this.recommendPullLoading = true;
          this.updateRecommendPullUI({ progress: 1, state: 'loading' });
          this.applyRecommendPullTransform(this.recommendPullThreshold, { dragging: false });
          onMaybeRefresh('pull-bottom');
        }
      },
      { passive: true },
    );
    recList?.addEventListener(
      'touchend',
      () => {
        if (this.recommendPullLoading) return;
        this.recommendBottomArmed = false;
        this.resetRecommendPullUI();
      },
      { passive: true },
    );
    recList?.addEventListener(
      'touchcancel',
      () => {
        if (this.recommendPullLoading) return;
        this.recommendBottomArmed = false;
        this.resetRecommendPullUI();
      },
      { passive: true },
    );

    this.setRecommendMode(false);

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
      labels: [],
      isUserCreated: true,
    });
    this.store.switchSession(name);
    window.appBridge?.setActiveSession?.(name);

    this.nameInput.value = '';
    this.newAvatar = '';
    const img = this.panel?.querySelector('#session-avatar-preview');
    if (img) img.src = getDefaultAppIcon();
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

export const __sessionPanelInternals = {
  isDefaultScopeId,
  isGroupSessionId,
  isScopedDataMatch,
  isSharedContactCandidate,
};
