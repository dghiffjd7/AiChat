/**
 * Moments UI (动态) - simplified renderer
 */

import { logger } from '../utils/logger.js';
import { resolveMediaAsset, isLikelyUrl, isAssetRef } from '../utils/media-assets.js';
import { appConfirm } from './app-confirm.js';

const esc = s =>
  String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const normalizeInlineBreaks = (s) => String(s ?? '')
  .replace(/&lt;br\s*\/?&gt;/gi, '\n')
  .replace(/<br\s*\/?>/gi, '\n');

const renderTextWithStickers = (raw = '') => {
  const input = normalizeInlineBreaks(raw);
  if (!input) return '';
  const TOKEN_RE = /\[bqb-([\s\S]+?)\]/gi;
  let output = '';
  let lastIndex = 0;

  const appendText = (text) => {
    if (!text) return;
    output += esc(text).replace(/\n/g, '<br>');
  };

  const appendSticker = (payload, fallback) => {
    const resolved = resolveMediaAsset('sticker', payload);
    const url = resolved?.url || '';
    if (!url) {
      appendText(fallback);
      return;
    }
    if (output && !output.endsWith('<br>')) output += '<br>';
    output += `<span class="moment-sticker-wrap"><img class="moment-sticker" src="${esc(url)}" alt="${esc(payload)}"></span>`;
    output += '<br>';
  };

  let match;
  while ((match = TOKEN_RE.exec(input))) {
    appendText(input.slice(lastIndex, match.index));
    const payload = String(match[1] || '').trim();
    if (payload) appendSticker(payload, match[0]);
    else appendText(match[0]);
    lastIndex = TOKEN_RE.lastIndex;
  }
  appendText(input.slice(lastIndex));
  return output;
};

const extractMomentMedia = (raw = '') => {
  const text = normalizeInlineBreaks(raw);
  const images = [];
  const audios = [];
  const TOKEN_RE = /\[(img|yy)-([\s\S]+?)\]|<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;
  let output = '';
  let lastIndex = 0;

  const pushImage = (payload, kind = 'image') => {
    const resolved = resolveMediaAsset(kind, payload) || resolveMediaAsset('image', payload);
    const url = resolved?.url || (isLikelyUrl(payload) ? payload : '');
    if (!url) return false;
    images.push({ url, label: String(payload || '').trim() });
    return true;
  };

  const pushAudio = (payload) => {
    const resolved = resolveMediaAsset('audio', payload);
    const url = resolved?.url || (isLikelyUrl(payload) ? payload : '');
    if (!url) return false;
    audios.push({ url, label: String(payload || '').trim() });
    return true;
  };

  let match;
  while ((match = TOKEN_RE.exec(text))) {
    const before = text.slice(lastIndex, match.index);
    output += before;
    lastIndex = TOKEN_RE.lastIndex;
    if (match[3]) {
      const ok = pushImage(match[3], 'image');
      if (!ok) output += match[0];
      continue;
    }
    const type = String(match[1] || '').toLowerCase();
    const payload = String(match[2] || '').trim();
    if (!payload) {
      output += match[0];
      continue;
    }
    if (type === 'yy') {
      const ok = pushAudio(payload);
      if (!ok) output += match[0];
      continue;
    }
    const ok = pushImage(payload, 'image');
    if (!ok) output += match[0];
  }
  output += text.slice(lastIndex);

  const trimmed = output.trim();
  if (trimmed && (isAssetRef(trimmed) || isLikelyUrl(trimmed))) {
    const img = resolveMediaAsset('image', trimmed);
    if (img?.url) {
      images.push({ url: img.url, label: trimmed });
      output = '';
    } else {
      const audio = resolveMediaAsset('audio', trimmed);
      if (audio?.url) {
        audios.push({ url: audio.url, label: trimmed });
        output = '';
      }
    }
  }

  return { text: output, images, audios };
};

export class MomentsPanel {
  constructor({ momentsStore, contactsStore, defaultAvatar = '', userAvatar = '', onUserComment } = {}) {
    this.store = momentsStore;
    this.contactsStore = contactsStore;
    this.defaultAvatar = defaultAvatar;
    this.userAvatar = userAvatar;
    this.onUserComment = typeof onUserComment === 'function' ? onUserComment : null;
    this.listEl = null;
    this.modal = null;
    this.activeMomentId = null;
    this.menuEl = null;
    this.expandedComments = new Set();
    this.openComposer = new Set();
    this.pendingComment = new Set();
    this.replyTargets = new Map(); // momentId -> { id, author, content }
    this.commentMenuEl = null;
    this.visibleCount = 5;
    this.pageSize = 5;
  }

  buildThreadedComments(comments = []) {
    const list = Array.isArray(comments) ? comments.filter(Boolean) : [];
    const byId = new Map();
    list.forEach((c) => {
      const id = String(c?.id || '').trim();
      if (id) byId.set(id, c);
    });
    const repliesByParent = new Map();
    const roots = [];
    for (const c of list) {
      const replyTo = String(c?.replyTo || '').trim();
      if (replyTo && byId.has(replyTo)) {
        if (!repliesByParent.has(replyTo)) repliesByParent.set(replyTo, []);
        repliesByParent.get(replyTo).push(c);
      } else {
        roots.push(c);
      }
    }
    return { roots, repliesByParent, byId };
  }

  mount(listEl) {
    this.listEl = listEl;
    this.visibleCount = 5;
    this.render();
  }

  setUserAvatar(url) {
    this.userAvatar = url;
  }

  getAvatarByName(name) {
    const raw = String(name || '').trim();
    if (!raw) return this.defaultAvatar;
    if (raw === '我' || raw.toLowerCase() === 'user' || raw === '用户') {
      return this.userAvatar || this.defaultAvatar;
    }
    try {
      const byId = this.contactsStore?.getContact?.(raw);
      if (byId?.avatar) return byId.avatar;
    } catch {}
    const norm = s =>
      String(s || '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '');
    const loose = s => norm(s).replace(/[^a-z0-9\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/g, '');
    const key = norm(raw);
    const looseKey = loose(raw);
    try {
      const list = this.contactsStore?.listContacts?.() || [];
      const exact = list.find(x => String(x?.name || '').trim() === raw || String(x?.id || '').trim() === raw);
      if (exact?.avatar) return exact.avatar;
      const fuzzy = list.find(x => norm(x?.name) === key || norm(x?.id) === key);
      if (fuzzy?.avatar) return fuzzy.avatar;
      const f2 = list.find(x => loose(x?.name) === looseKey || loose(x?.id) === looseKey);
      return f2?.avatar || this.defaultAvatar;
    } catch {
      return this.defaultAvatar;
    }
  }

  getAvatarForMoment(m) {
    const snap = String(m?.authorAvatar || '').trim();
    if (snap) return snap;
    const authorId = String(m?.authorId || '').trim();
    if (authorId === 'user') return this.userAvatar || this.defaultAvatar;
    if (authorId) {
      try {
        const c = this.contactsStore?.getContact?.(authorId);
        if (c?.avatar) return c.avatar;
      } catch {}
    }
    const origin = String(m?.originSessionId || '').trim();
    if (origin) {
      try {
        const c = this.contactsStore?.getContact?.(origin);
        if (c?.avatar) return c.avatar;
      } catch {}
    }
    return this.getAvatarByName(m?.author);
  }

  ensureMenu() {
    if (this.menuEl) return;
    const el = document.createElement('div');
    el.className = 'moment-menu-dropdown hidden';
    el.innerHTML = `
            <button class="moment-menu-item danger" data-action="delete">🗑️ 删除动态</button>
            <button class="moment-menu-item" data-action="cancel">❌ 取消</button>
        `;
    el.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => this.hideMenu());
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const momentId = el.dataset.momentId || '';
        this.hideMenu();
        if (action === 'delete' && momentId) {
          const ok = await appConfirm({
            title: '删除动态',
            message: '删除后无法恢复，确定要删除这条动态吗？',
            danger: true,
          });
          if (!ok) return;
          const removed = this.store?.remove?.(momentId);
          if (!removed) window.toastr?.warning('删除失败：未找到该动态');
          else window.toastr?.success('已删除动态');
          this.render({ preserveScroll: true });
        }
      });
    });
    document.body.appendChild(el);
    this.menuEl = el;
  }

  hideMenu() {
    if (!this.menuEl) return;
    this.menuEl.classList.add('hidden');
    this.menuEl.dataset.momentId = '';
  }

  showMenu(anchorEl, momentId) {
    this.ensureMenu();
    if (!this.menuEl || !anchorEl) return;
    const rect = anchorEl.getBoundingClientRect();
    const el = this.menuEl;
    el.dataset.momentId = String(momentId || '');
    el.classList.remove('hidden');

    // position after visible so we can measure width
    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    const mw = el.offsetWidth || 140;
    const mh = el.offsetHeight || 80;
    const margin = 8;
    const top = Math.min(vh - mh - margin, rect.bottom + 6);
    const left = Math.max(margin, Math.min(vw - mw - margin, rect.right - mw));
    el.style.top = `${Math.max(margin, top)}px`;
    el.style.left = `${left}px`;
  }

  ensureCommentMenu() {
    if (this.commentMenuEl) return;
    const el = document.createElement('div');
    el.className = 'moment-menu-dropdown hidden';
    el.innerHTML = `
            <button class="moment-menu-item danger" data-action="delete-comment">🗑️ 删除评论</button>
            <button class="moment-menu-item" data-action="cancel">❌ 取消</button>
        `;
    el.addEventListener('click', e => e.stopPropagation());
    document.addEventListener('click', () => this.hideCommentMenu());
    el.querySelectorAll('button').forEach(btn => {
      btn.addEventListener('click', async () => {
        const action = btn.dataset.action;
        const momentId = el.dataset.momentId || '';
        const commentId = el.dataset.commentId || '';
        this.hideCommentMenu();
        if (action === 'delete-comment' && momentId && commentId) {
          const ok = await appConfirm({
            title: '删除评论',
            message: '删除这条评论？',
            danger: true,
          });
          if (!ok) return;
          const removed = this.store?.removeComment?.(momentId, commentId);
          if (!removed) window.toastr?.warning?.('删除失败：未找到该评论');
          else window.toastr?.success?.('已删除评论');
          this.render({ preserveScroll: true });
        }
      });
    });
    document.body.appendChild(el);
    this.commentMenuEl = el;
  }

  hideCommentMenu() {
    if (!this.commentMenuEl) return;
    this.commentMenuEl.classList.add('hidden');
    this.commentMenuEl.dataset.momentId = '';
    this.commentMenuEl.dataset.commentId = '';
  }

  showCommentMenu({ x, y }, momentId, commentId) {
    this.ensureCommentMenu();
    const el = this.commentMenuEl;
    if (!el) return;
    el.dataset.momentId = String(momentId || '');
    el.dataset.commentId = String(commentId || '');
    el.classList.remove('hidden');

    const vw = window.innerWidth || document.documentElement.clientWidth || 360;
    const vh = window.innerHeight || document.documentElement.clientHeight || 640;
    const mw = el.offsetWidth || 160;
    const mh = el.offsetHeight || 88;
    const margin = 8;
    const left = Math.max(margin, Math.min(vw - mw - margin, Number(x || 0) - mw + 18));
    const top = Math.max(margin, Math.min(vh - mh - margin, Number(y || 0) + 8));
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  render({ preserveScroll = false } = {}) {
    if (!this.listEl) return;
    const moments = this.store?.list?.() || [];
    const prevScroll = preserveScroll ? this.listEl.scrollTop || 0 : 0;
    const visibleN = Math.max(this.pageSize, Number(this.visibleCount) || this.pageSize);
    this.listEl.innerHTML = '';
    if (!moments.length) {
      const empty = document.createElement('div');
      empty.style.cssText = 'padding:16px; color:#64748b; text-align:center;';
      empty.textContent = '（暂无动态）';
      this.listEl.appendChild(empty);
      this.visibleCount = this.pageSize;
      return;
    }
    moments.slice(0, visibleN).forEach(m => {
      const card = document.createElement('div');
      card.className = 'moment-card';
      card.dataset.momentId = m.id;
      const avatar = this.getAvatarForMoment(m);
      // Backfill originSessionId for older data (helps avatar fallback to current chat persona)
      try {
        const hasOrigin = String(m?.originSessionId || '').trim().length > 0;
        if (!hasOrigin && String(m?.authorId || '').trim()) {
          this.store?.upsert?.({ id: m.id, originSessionId: String(m.authorId).trim() });
          m.originSessionId = String(m.authorId).trim();
        }
      } catch {}
      // Backfill snapshot avatar so legacy moments keep correct avatar even if names change later
      try {
        const hasSnap = String(m?.authorAvatar || '').trim().length > 0;
        if (!hasSnap && avatar && avatar !== this.defaultAvatar) {
          this.store?.upsert?.({
            id: m.id,
            authorAvatar: avatar,
            authorId: m.authorId || '',
            author: m.author || '',
            originSessionId: m.originSessionId || '',
          });
        }
      } catch {}
      const comments = Array.isArray(m.comments) ? m.comments : [];
      const VISIBLE_COMMENTS = 3;
      const expanded = this.expandedComments.has(m.id);
      const showComposer = this.openComposer.has(m.id);
      const replyTarget = this.replyTargets.get(m.id) || null;
      const hiddenCount = comments.length > VISIBLE_COMMENTS ? comments.length - VISIBLE_COMMENTS : 0;
      const visibleComments = expanded ? comments : hiddenCount > 0 ? comments.slice(-VISIBLE_COMMENTS) : comments;
      const { roots: commentRoots, repliesByParent } = this.buildThreadedComments(visibleComments);
      const pending = this.pendingComment.has(m.id);
      const threadedHtml = commentRoots
        .map((c) => {
          const cid = String(c?.id || '').trim();
          const author = String(c?.author || '').trim();
          const content = String(c?.content || '');
          const replies = cid ? (repliesByParent.get(cid) || []) : [];
          const replyHtml = replies
            .map((r) => {
              const rid = String(r?.id || '').trim();
              const rauthor = String(r?.author || '').trim();
              const rcontent = String(r?.content || '');
              const toName = String(r?.replyToAuthor || '').trim() || author;
              return `
                        <div class="moment-comment moment-comment-reply" data-comment-id="${esc(rid)}" style="margin-left:20px; padding-left:10px; border-left:2px solid rgba(0,0,0,0.08);">
                            <span class="comment-user"><span class="comment-author" role="button" tabindex="0" data-comment-id="${esc(rid)}" style="cursor:pointer; font-weight:800;">${esc(rauthor)}</span> 回复 <span class="comment-replyto" style="font-weight:800;">${esc(toName)}</span>：</span>
                            <span class="comment-text">${renderTextWithStickers(rcontent)}</span>
                        </div>
                    `;
            })
            .join('');
          return `
                        <div class="moment-comment" data-comment-id="${esc(cid)}">
                            <span class="comment-user"><span class="comment-author" role="button" tabindex="0" data-comment-id="${esc(cid)}" style="cursor:pointer; font-weight:800;">${esc(author)}</span>：</span>
                            <span class="comment-text">${renderTextWithStickers(content)}</span>
                        </div>
                        ${replyHtml}
                    `;
        })
        .join('');
      card.innerHTML = `
                <div class="moment-header">
                    <img src="${esc(avatar)}" alt="" class="moment-avatar">
                    <div class="moment-user-info">
                        <div class="moment-username">${esc(m.author || '角色')}</div>
                        <div class="moment-time">${esc(m.time || '')}</div>
                    </div>
                    <button class="moment-more" aria-label="更多" title="更多">⋯</button>
                </div>
                <div class="moment-content">
                    <div class="moment-text"></div>
                </div>
                <div class="moment-stats">
                    <span>👁 浏览${Number(m.views || 0)}次</span>
                    <span>💬 评论${comments.length}条</span>
                </div>
                <div class="moment-footer">
                    <span class="moment-likes">👍 ${Number(m.likes || 0)}人已赞</span>
                    <button class="moment-action" data-action="comment" style="margin-left:auto; border:none; background:transparent; color:#2563eb; font-weight:700;">评论</button>
                </div>
                <div class="moment-comments ${comments.length ? '' : 'empty'}" ${
        comments.length ? '' : 'style="display:none;"'
      }>
                    ${
                      !expanded && hiddenCount > 0
                        ? `<div class="moment-comments-toggle" data-action="expand">展开查看更多评论 (${hiddenCount}条)</div>`
                        : ''
                    }
                    ${threadedHtml}
                    ${
                      expanded && hiddenCount > 0
                        ? `<div class="moment-comments-toggle" data-action="collapse">收起评论</div>`
                        : ''
                    }
                </div>
                <div class="moment-comment-composer" style="${
                  showComposer ? 'display:flex; flex-direction:column; align-items:stretch; gap:10px;' : 'display:none;'
                }">
                    <div class="moment-replying" style="${
                      replyTarget ? '' : 'display:none;'
                    } padding:8px 10px; margin-bottom:10px; border:1px solid rgba(0,0,0,0.08); border-radius:12px; background:rgba(248,250,252,0.92); font-size:12px; color:#334155;">
                        <div style="display:flex; gap:10px; align-items:flex-start;">
                            <div style="flex:1; min-width:0; white-space:normal; overflow-wrap:anywhere; word-break:break-word; line-height:1.35;">
                                回复 <b>${esc(replyTarget?.author || '')}</b>：${esc(String(replyTarget?.content || '').slice(0, 120))}
                            </div>
                            <button class="moment-reply-cancel" data-action="cancel-reply" type="button" style="border:none; background:transparent; color:#ef4444; font-weight:900; cursor:pointer; padding:0 4px; font-size:16px; line-height:1;">×</button>
                        </div>
                    </div>
                    <div class="moment-comment-input-row" style="display:flex; gap:10px; align-items:center;">
                        <input class="moment-comment-input" type="text" placeholder="${
                          replyTarget ? `回复 ${esc(replyTarget.author || '')}...` : '写评论...'
                        }" style="flex:1; min-width:0;" ${pending ? 'disabled' : ''} />
                        <button class="moment_comment" data-action="send" ${pending ? 'disabled' : ''}>${
          pending ? '发送中…' : '发送'
        }</button>
                    </div>
                </div>
            `;
      const media = extractMomentMedia(m.content || '');
      const textEl = card.querySelector('.moment-text');
      if (textEl) {
        textEl.innerHTML = '';
        const html = renderTextWithStickers(media.text || '');
        textEl.innerHTML = html;
        textEl.style.display = html ? '' : 'none';
      }
      const contentEl = card.querySelector('.moment-content');
      if (contentEl) {
        if (media.images.length) {
          const grid = document.createElement('div');
          grid.className = 'moment-images';
          media.images.forEach((img) => {
            const el = document.createElement('img');
            el.src = img.url;
            el.alt = img.label || '';
            el.loading = 'lazy';
            el.addEventListener('click', (e) => {
              e.stopPropagation();
              this.openImagePreview?.(img.url);
            });
            grid.appendChild(el);
          });
          contentEl.appendChild(grid);
        }
        if (media.audios.length) {
          const list = document.createElement('div');
          list.className = 'moment-audios';
          media.audios.forEach((audio) => {
            const wrap = document.createElement('div');
            wrap.className = 'moment-audio-item';
            wrap.innerHTML = `
              <span class="moment-audio-label">语音</span>
              <audio controls preload="none">
                <source src="${audio.url}">
              </audio>
            `;
            list.appendChild(wrap);
          });
          contentEl.appendChild(list);
        }
      }
      const dotsBtn = card.querySelector('.moment-more');
      dotsBtn?.addEventListener('click', e => {
        e.stopPropagation();
        this.showMenu(dotsBtn, m.id);
      });

      card.querySelector('[data-action="comment"]')?.addEventListener('click', e => {
        e.stopPropagation();
        if (this.openComposer.has(m.id)) this.openComposer.delete(m.id);
        else this.openComposer.add(m.id);
        this.replyTargets.delete(m.id);
        this.render({ preserveScroll: true });
        // focus input after rerender
        setTimeout(() => {
          const escId =
            window.CSS && typeof window.CSS.escape === 'function'
              ? window.CSS.escape(String(m.id))
              : String(m.id).replace(/["\\]/g, '\\$&');
          const next = this.listEl?.querySelector(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
          next?.focus?.();
        }, 0);
      });

      card.querySelectorAll('.moment-comments-toggle').forEach(toggle => {
        toggle.addEventListener('click', e => {
          e.stopPropagation();
          const act = toggle.dataset.action;
          if (act === 'expand') this.expandedComments.add(m.id);
          if (act === 'collapse') this.expandedComments.delete(m.id);
          this.render({ preserveScroll: true });
        });
      });

      // Long press on comment -> delete single comment
      card.querySelectorAll('.moment-comment').forEach(commentEl => {
        commentEl.style.userSelect = 'none';
        commentEl.style.webkitUserSelect = 'none';
        const cid = String(commentEl.dataset.commentId || '').trim();
        let timer = null;
        let startX = 0;
        let startY = 0;
        const clear = () => {
          if (timer) clearTimeout(timer);
          timer = null;
        };
        const schedule = (x, y) => {
          clear();
          startX = x;
          startY = y;
          timer = setTimeout(() => {
            if (!cid) return;
            this.showCommentMenu({ x: startX, y: startY }, m.id, cid);
          }, 520);
        };
        commentEl.addEventListener('contextmenu', e => {
          e.preventDefault();
          e.stopPropagation();
          if (!cid) return;
          this.showCommentMenu({ x: e.clientX || 0, y: e.clientY || 0 }, m.id, cid);
        });
        commentEl.addEventListener(
          'touchstart',
          e => {
            e.stopPropagation();
            const t = e.touches?.[0];
            if (!t) return;
            schedule(t.clientX, t.clientY);
          },
          { passive: true },
        );
        commentEl.addEventListener('touchmove', clear, { passive: true });
        commentEl.addEventListener('touchend', clear, { passive: true });
        commentEl.addEventListener('touchcancel', clear, { passive: true });
        // Desktop fallback
        commentEl.addEventListener('mousedown', e => {
          if (e.button !== 0) return;
          schedule(e.clientX, e.clientY);
        });
        commentEl.addEventListener('mouseup', clear);
        commentEl.addEventListener('mouseleave', clear);
      });

      // Click author name to reply (楼中楼)
      card.querySelectorAll('.comment-author').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cid = String(el.dataset.commentId || '').trim();
          if (!cid) return;
          const all = Array.isArray(m.comments) ? m.comments : [];
          const target = all.find((x) => String(x?.id || '').trim() === cid) || null;
          if (!target) return;
          this.replyTargets.set(m.id, { id: cid, author: String(target.author || '').trim(), content: String(target.content || '') });
          this.openComposer.add(m.id);
          this.render({ preserveScroll: true });
          setTimeout(() => {
            const escId =
              window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(String(m.id))
                : String(m.id).replace(/["\\]/g, '\\$&');
            const next = this.listEl?.querySelector(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
            next?.focus?.();
          }, 0);
        });
      });

      card.querySelector('.moment-reply-cancel')?.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.replyTargets.delete(m.id);
        this.render({ preserveScroll: true });
        setTimeout(() => {
          const escId =
            window.CSS && typeof window.CSS.escape === 'function'
              ? window.CSS.escape(String(m.id))
              : String(m.id).replace(/["\\]/g, '\\$&');
          const next = this.listEl?.querySelector(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
          next?.focus?.();
        }, 0);
      });

      const sendBtn = card.querySelector('.moment_comment[data-action="send"]');
      const inputEl = card.querySelector('.moment-comment-input');
      const send = async () => {
        if (pending) return;
        const text = String(inputEl?.value || '').trim();
        if (!text) return;
        const reply = this.replyTargets.get(m.id) || null;
        const userCommentId = `comment-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        this.store.addComments(m.id, [
          {
            id: userCommentId,
            author: '我',
            content: text,
            replyTo: String(reply?.id || '').trim(),
            replyToAuthor: String(reply?.author || '').trim(),
          },
        ]);
        this.openComposer.delete(m.id);
        this.replyTargets.delete(m.id);
        if (inputEl) inputEl.value = '';
        this.pendingComment.add(m.id);
        this.render({ preserveScroll: true });

        try {
          await this.onUserComment?.(m.id, text, {
            userCommentId,
            replyTo: reply ? { ...reply } : null,
          });
        } catch (err) {
          logger.warn('onUserComment failed', err);
        } finally {
          this.pendingComment.delete(m.id);
          this.render({ preserveScroll: true });
        }
      };
      sendBtn?.addEventListener('click', e => {
        e.stopPropagation();
        send();
      });
      inputEl?.addEventListener('keydown', e => {
        if (e.key === 'Enter') {
          e.preventDefault();
          e.stopPropagation();
          send();
        }
      });

      this.listEl.appendChild(card);
    });

    if (moments.length > visibleN) {
      const more = document.createElement('button');
      more.type = 'button';
      more.textContent = `展开更多`;
      more.style.cssText = `
                width: calc(100% - 24px);
                margin: 6px 12px 16px;
                padding: 10px 12px;
                border: 1px solid rgba(0,0,0,0.10);
                border-radius: 12px;
                background: rgba(255,255,255,0.92);
                color: #0f172a;
                font-weight: 800;
                cursor: pointer;
            `;
      more.addEventListener('click', () => {
        this.visibleCount = Math.min(moments.length, visibleN + this.pageSize);
        this.render({ preserveScroll: true });
      });
      this.listEl.appendChild(more);
    } else {
      this.visibleCount = Math.min(visibleN, moments.length);
    }
    if (preserveScroll) this.listEl.scrollTop = prevScroll;
  }

  ensureModal() {
    if (this.modal) return;
    const overlay = document.createElement('div');
    overlay.id = 'moments-detail-overlay';
    overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 23000;
            display: none;
            background: rgba(0,0,0,0.32);
            padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom)) 14px;
            box-sizing: border-box;
        `;
    const panel = document.createElement('div');
    panel.style.cssText = `
            height: 100%;
            background: #fff;
            border-radius: 14px;
            overflow: hidden;
            display: flex;
            flex-direction: column;
        `;
    panel.addEventListener('click', e => e.stopPropagation());
    panel.innerHTML = `
            <div style="display:flex; align-items:center; gap:10px; padding:12px; background:#f3f4f6; border-bottom:1px solid #e5e7eb;">
                <div style="font-weight:800;">动态</div>
                <div id="moment-detail-meta" style="margin-left:auto; font-size:12px; color:#64748b;"></div>
                <button id="moment-detail-close" style="border:1px solid #e5e7eb; background:#fff; border-radius:10px; padding:6px 10px;">关闭</button>
            </div>
            <div id="moment-detail-body" style="flex:1; overflow:auto; -webkit-overflow-scrolling:touch; padding:12px;"></div>
            <div style="padding:10px; border-top:1px solid #e5e7eb; display:flex; gap:10px;">
                <input id="moment-comment-input" type="text" placeholder="写评论..." style="flex:1; padding:10px; border:1px solid #e2e8f0; border-radius:999px;">
                <button id="moment-comment-send" style="padding:10px 14px; border:none; border-radius:999px; background:#019aff; color:#fff; font-weight:800;">发送</button>
            </div>
        `;
    overlay.appendChild(panel);
    overlay.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    panel.querySelector('#moment-detail-close')?.addEventListener('click', () => {
      overlay.style.display = 'none';
    });
    panel.querySelector('#moment-comment-send')?.addEventListener('click', () => this.addLocalComment());
    document.body.appendChild(overlay);
    this.modal = overlay;
  }

  openDetail(momentId) {
    this.ensureModal();
    this.activeMomentId = momentId;
    const m = this.store?.get?.(momentId);
    if (!m) return;
    const meta = this.modal.querySelector('#moment-detail-meta');
    if (meta) meta.textContent = `id: ${m.id}`;
    const body = this.modal.querySelector('#moment-detail-body');
    if (body) {
      const avatar = this.getAvatarForMoment(m);
      const comments = Array.isArray(m.comments) ? m.comments : [];
      body.innerHTML = `
                <div style="display:flex; gap:10px; align-items:flex-start;">
                    <img src="${esc(avatar)}" style="width:42px; height:42px; border-radius:999px; object-fit:cover;">
                    <div style="flex:1;">
                        <div style="font-weight:800;">${esc(m.author || '角色')}</div>
                        <div style="color:#64748b; font-size:12px; margin-top:2px;">${esc(m.time || '')} · 👁 ${Number(
        m.views || 0,
      )} · 👍 ${Number(m.likes || 0)}</div>
                        <div class="moment-detail-text" style="margin-top:10px; overflow-wrap:anywhere;"></div>
                    </div>
                </div>
                <div style="margin-top:14px; font-weight:800;">评论</div>
                <div style="margin-top:8px; display:flex; flex-direction:column; gap:8px;">
                    ${
                      comments.length
                        ? comments
                            .map(
                              c => `
                        <div class="moment-detail-comment" data-comment-id="${esc(c.id || '')}" style="border:1px solid #e5e7eb; border-radius:12px; padding:10px;">
                            <div class="moment-detail-author" role="button" tabindex="0" data-comment-id="${esc(c.id || '')}" style="font-weight:800; font-size:13px; cursor:pointer;">${esc(c.author || '')}</div>
                            <div style="margin-top:6px; overflow-wrap:anywhere;">${renderTextWithStickers(c.content || '')}</div>
                        </div>
                    `,
                            )
                            .join('')
                        : `<div style="color:#64748b;">（暂无评论）</div>`
                    }
                </div>
            `;
      const media = extractMomentMedia(m.content || '');
      const detailText = body.querySelector('.moment-detail-text');
      if (detailText) {
        detailText.innerHTML = '';
        const html = renderTextWithStickers(media.text || '');
        detailText.innerHTML = html;
        const hasMedia = media.images.length || media.audios.length;
        detailText.style.display = html || hasMedia ? '' : 'none';
      }
      if (media.images.length) {
        const grid = document.createElement('div');
        grid.className = 'moment-images';
        media.images.forEach((img) => {
          const el = document.createElement('img');
          el.src = img.url;
          el.alt = img.label || '';
          el.loading = 'lazy';
          el.addEventListener('click', (e) => {
            e.stopPropagation();
            this.openImagePreview(img.url);
          });
          grid.appendChild(el);
        });
        detailText?.appendChild(grid);
      }
      if (media.audios.length) {
        const list = document.createElement('div');
        list.className = 'moment-audios';
        media.audios.forEach((audio) => {
          const wrap = document.createElement('div');
          wrap.className = 'moment-audio-item';
          wrap.innerHTML = `
            <span class="moment-audio-label">语音</span>
            <audio controls preload="none">
              <source src="${audio.url}">
            </audio>
          `;
          list.appendChild(wrap);
        });
        detailText?.appendChild(list);
      }

      // Long press / right click to delete comment in detail view too
      const wrap = body;
      wrap.querySelectorAll('.moment-detail-comment').forEach((commentEl) => {
        commentEl.style.userSelect = 'none';
        commentEl.style.webkitUserSelect = 'none';
        const cid = String(commentEl.dataset.commentId || '').trim();
        let timer = null;
        let startX = 0;
        let startY = 0;
        const clear = () => {
          if (timer) clearTimeout(timer);
          timer = null;
        };
        const schedule = (x, y) => {
          clear();
          startX = x;
          startY = y;
          timer = setTimeout(() => {
            if (!cid) return;
            this.showCommentMenu({ x: startX, y: startY }, m.id, cid);
          }, 520);
        };
        commentEl.addEventListener('contextmenu', (e) => {
          e.preventDefault();
          e.stopPropagation();
          if (!cid) return;
          this.showCommentMenu({ x: e.clientX || 0, y: e.clientY || 0 }, m.id, cid);
        });
        commentEl.addEventListener(
          'touchstart',
          (e) => {
            e.stopPropagation();
            const t = e.touches?.[0];
            if (!t) return;
            schedule(t.clientX, t.clientY);
          },
          { passive: true },
        );
        commentEl.addEventListener('touchmove', clear, { passive: true });
        commentEl.addEventListener('touchend', clear, { passive: true });
        commentEl.addEventListener('touchcancel', clear, { passive: true });
        commentEl.addEventListener('mousedown', (e) => {
          if (e.button !== 0) return;
          schedule(e.clientX, e.clientY);
        });
        commentEl.addEventListener('mouseup', clear);
        commentEl.addEventListener('mouseleave', clear);
      });

      // Click author in detail view to reply (open composer on feed card)
      wrap.querySelectorAll('.moment-detail-author').forEach((el) => {
        el.addEventListener('click', (e) => {
          e.preventDefault();
          e.stopPropagation();
          const cid = String(el.dataset.commentId || '').trim();
          if (!cid) return;
          const all = Array.isArray(m.comments) ? m.comments : [];
          const target = all.find((x) => String(x?.id || '').trim() === cid) || null;
          if (!target) return;
          this.replyTargets.set(m.id, { id: cid, author: String(target.author || '').trim(), content: String(target.content || '') });
          this.openComposer.add(m.id);
          this.render({ preserveScroll: true });
          // Focus feed composer if visible
          setTimeout(() => {
            const escId =
              window.CSS && typeof window.CSS.escape === 'function'
                ? window.CSS.escape(String(m.id))
                : String(m.id).replace(/["\\]/g, '\\$&');
            const next = this.listEl?.querySelector(`.moment-card[data-moment-id="${escId}"] .moment-comment-input`);
            next?.focus?.();
          }, 0);
        });
      });
    }
    this.modal.style.display = 'block';
  }

  openImagePreview(url) {
    const src = String(url || '').trim();
    if (!src) return;
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `<img src="${src}" alt="preview">`;
    overlay.addEventListener('click', () => overlay.remove());
    document.body.appendChild(overlay);
  }

  addLocalComment() {
    try {
      const id = this.activeMomentId;
      if (!id) return;
      const input = this.modal?.querySelector('#moment-comment-input');
      const text = String(input?.value || '').trim();
      if (!text) return;
      this.store.addComments(id, [{ author: '我', content: text }]);
      if (input) input.value = '';
      this.openDetail(id);
      this.render();
    } catch (err) {
      logger.error('addLocalComment failed', err);
    }
  }
}
