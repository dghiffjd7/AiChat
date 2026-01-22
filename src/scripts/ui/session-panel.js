/**
 * Session list panel (basic)
 * - list sessions, create new, switch
 */

import { avatarDataUrlFromFile } from '../utils/image.js';
import { logger } from '../utils/logger.js';
import { safeInvoke } from '../utils/tauri.js';

export class SessionPanel {
  constructor(chatStore, contactsStore, ui, { onUpdated } = {}) {
    this.store = chatStore;
    this.contactsStore = contactsStore;
    this.ui = ui;
    this.overlay = null;
    this.panel = null;
    this.listEl = null;
    this.nameInput = null;
    this.onUpdated = typeof onUpdated === 'function' ? onUpdated : null;
    this.jumpToContactsOnClose = false;
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
    if (!this.listEl) return;
    this.listEl.innerHTML = '';
    const contacts = this.contactsStore?.listContacts?.() || [];
    const currentId = this.store.getCurrent();
    if (!contacts.length) {
      const empty = document.createElement('div');
      empty.className = 'sticker-bind-empty';
      empty.textContent = '暂无好友/群组';
      this.listEl.appendChild(empty);
      return;
    }
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
      this.listEl.appendChild(row);
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

  remove(id) {
    const name = this.contactsStore?.getContact?.(id)?.name || id;
    if (!confirm(`確認删除：${name}？此操作会删除聊天室与好友记录（不可恢复）。`)) return;

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
            <div id="session-list" class="sticker-bind-list session-list"></div>
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

    this.listEl = this.panel.querySelector('#session-list');
    this.nameInput = this.panel.querySelector('#session-name');
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

  clearCurrent() {
    const id = this.store.getCurrent();
    if (!confirm(`清空当前会话：${id}？此操作不可恢复。`)) return;
    this.store.clear(id);
    this.switchTo(id);
    this.refresh();
  }
}
