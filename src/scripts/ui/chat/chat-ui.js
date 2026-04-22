/**
 * Chat UI rendering and interactions
 */

import { resolveMediaAsset } from '../../utils/media-assets.js';
import { stickerPackStore } from '../../storage/sticker-pack-store.js';
import { cleanupRichText, renderRichText, setupIframeResizeListener } from './rich-text-renderer.js';
import { appSettings } from '../../storage/app-settings.js';
import { logger } from '../../utils/logger.js';
import {
  DEFAULT_REACTION_EMOJIS,
  SELF_REACTION_ACTOR,
  countReactionActors,
  hasReactionActor,
  normalizeReactionEntries,
  normalizeReplyTarget,
} from './message-interaction-utils.js';

const resolveMediaUrl = (kind, value) => {
  const resolved = resolveMediaAsset(kind, value);
  return resolved?.url || value || '';
};

const getFallbackUrls = (resolved) => {
  if (Array.isArray(resolved?.fallbacks) && resolved.fallbacks.length) return resolved.fallbacks;
  if (resolved?.url) return [resolved.url];
  return [];
};

const applyImageFallback = (img, resolved, { onFail } = {}) => {
  const urls = getFallbackUrls(resolved);
  if (!urls.length) return false;
  let index = 0;
  img.onerror = () => {
    index += 1;
    if (index < urls.length) {
      img.src = urls[index];
      return;
    }
    img.onerror = null;
    if (typeof onFail === 'function') onFail();
  };
  img.src = urls[0];
  return true;
};
const STICKER_ANIM_DEFAULT_FPS = 12;
const clampStickerFps = (value) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return STICKER_ANIM_DEFAULT_FPS;
  return Math.min(60, Math.max(1, Math.trunc(num)));
};
const resolveLocalMediaUrl = (value) => {
  const raw = String(value || '').trim();
  if (!raw) return '';
  try {
    const g = typeof globalThis !== 'undefined' ? globalThis : window;
    const convert =
      g?.__TAURI__?.core?.convertFileSrc || g?.__TAURI__?.convertFileSrc || g?.__TAURI_INTERNALS__?.convertFileSrc;
    if (typeof convert === 'function') {
      const converted = convert(raw);
      if (converted) return converted;
    }
  } catch {}
  if (/^(file|asset|tauri|app|https?|data|blob):/i.test(raw)) return raw;
  if (/^[a-zA-Z]:[\\/]/.test(raw)) return `file:///${raw.replace(/\\/g, '/')}`;
  if (raw.startsWith('/')) return `file://${raw}`;
  return raw;
};
const normalizeStickerKey = (value) => String(value || '').trim().toLowerCase();
const findStickerByKeyword = (keyword) => {
  const key = normalizeStickerKey(keyword);
  if (!key) return null;
  const packs = stickerPackStore.getPacks?.() || [];
  for (const pack of packs) {
    const stickers = Array.isArray(pack?.stickers) ? pack.stickers : [];
    for (const sticker of stickers) {
      const stickerKey = normalizeStickerKey(sticker?.keyword || sticker?.id);
      if (stickerKey && stickerKey === key) return sticker;
    }
  }
  return null;
};
const resolveStickerFrames = (resolved, keyword) => {
  const frames = Array.isArray(resolved?.item?.frames) ? resolved.item.frames : [];
  if (frames.length > 1) return frames.map(frame => resolveLocalMediaUrl(frame)).filter(Boolean);
  const fallback = findStickerByKeyword(keyword);
  const next = Array.isArray(fallback?.frames) ? fallback.frames : [];
  return next.map(frame => resolveLocalMediaUrl(frame)).filter(Boolean);
};
const resolveStickerFps = (resolved, keyword) => {
  const primary = clampStickerFps(resolved?.item?.fps);
  if (primary) return primary;
  const fallback = findStickerByKeyword(keyword);
  return clampStickerFps(fallback?.fps);
};
const stickerAnimEntries = new WeakMap();
let stickerAnimObserver = null;
const ensureStickerAnimObserver = () => {
  if (stickerAnimObserver) return stickerAnimObserver;
  if (typeof IntersectionObserver === 'undefined') return null;
  stickerAnimObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      const data = stickerAnimEntries.get(entry.target);
      if (!data) return;
      if (entry.isIntersecting) {
        if (data.timer) return;
        data.index = 0;
        data.target.src = data.frames[0];
        const interval = Math.max(16, Math.round(1000 / clampStickerFps(data.fps)));
        data.timer = setInterval(() => {
          if (!data.target.isConnected) {
            clearInterval(data.timer);
            data.timer = null;
            stickerAnimObserver?.unobserve?.(data.target);
            stickerAnimEntries.delete(data.target);
            return;
          }
          data.index = (data.index + 1) % data.frames.length;
          data.target.src = data.frames[data.index];
        }, interval);
        return;
      }
      if (data.timer) {
        clearInterval(data.timer);
        data.timer = null;
      }
    });
  });
  return stickerAnimObserver;
};
const registerStickerAnimation = (img, frames, fps) => {
  if (!img) return false;
  const list = Array.isArray(frames) ? frames.filter(Boolean) : [];
  if (list.length < 2) {
    if (list.length) img.src = list[0];
    return false;
  }
  const data = { target: img, frames: list, fps: clampStickerFps(fps), timer: null, index: 0 };
  stickerAnimEntries.set(img, data);
  const observer = ensureStickerAnimObserver();
  if (observer) {
    observer.observe(img);
    return true;
  }
  data.target.src = list[0];
  const interval = Math.max(16, Math.round(1000 / clampStickerFps(data.fps)));
  data.timer = setInterval(() => {
    if (!data.target.isConnected) {
      clearInterval(data.timer);
      data.timer = null;
      stickerAnimObserver?.unobserve?.(data.target);
      stickerAnimEntries.delete(data.target);
      return;
    }
    data.index = (data.index + 1) % data.frames.length;
    data.target.src = data.frames[data.index];
  }, interval);
  return true;
};

const toastOnce = (message, level = 'warning', ttl = 8000) => {
  const text = String(message || '').trim();
  if (!text) return;
  const key = `${level}:${text}`;
  const now = Date.now();
  if (!toastOnce._cache) toastOnce._cache = new Map();
  const seenAt = toastOnce._cache.get(key) || 0;
  if (now - seenAt < ttl) return;
  toastOnce._cache.set(key, now);
  const fn = window.toastr?.[level] || window.toastr?.warning;
  fn?.(text);
  setTimeout(() => {
    if (toastOnce._cache.get(key) === now) toastOnce._cache.delete(key);
  }, ttl);
};
const DEFAULT_REPLY_AVATAR = './assets/external/feather-default.png';

export class ChatUI {
  constructor() {
    this.scrollEl = document.getElementById('chat-scroll');
    this.inputEl = document.getElementById('composer-input');
    this.sendBtn = document.getElementById('send-button');
    this.inputContainer = document.querySelector('.chat-input-container');
    this.composerAttachmentsEl = document.getElementById('composer-attachments');
    this.configBtn = document.getElementById('config-button');
    this.worldBtn = document.getElementById('world-button');
    this.sessionBtn = document.getElementById('session-button');
    this.typingEl = null;
    this.messageBuffer = [];
    this.sessionLabel = document.getElementById('session-label');
    this.sessionBadge = document.getElementById('session-badge');
    this.errorBanner = null;
    this.isOnline = true;
    this.isStreaming = false;
    this.isSending = false;
    this.contextMenu = this.createContextMenu();
    this.reactionPicker = this.createReactionPicker();
    this.longPressTimer = null;
    this.actionHandler = null;
    this.replyCancelHandler = null;
    this.selectionMode = false;
    this.selectedMessageIds = new Set();
    this.selectionBar = null;
    this.sendClickGuard = null;
    this.jumpFocusState = null;
    this.scrollDateBadgeEl = null;
    this.scrollDateHideTimer = null;
    this.scrollBottomButtonEl = null;
    this.scrollBottomButtonRaf = 0;
    this.scrollBottomButtonImmediate = false;
    this.scrollBottomButtonResizeObserver = null;
    this.replyDraftEl = null;
    this.mentionDropdown = null;
    this.mentionMemberResolver = null;
    this.mentionQuery = '';
    this.mentionStartPos = -1;
    this.mentionSelectedIndex = 0;

    setupIframeResizeListener();
    this.initReplyDraftBar();
    this.initScrollDateBadge();
    this.initScrollBottomButton();
    this.bindIframeLongPressForwarding();
    this.bindInputAutosize();
    this.bindFocusScroll();
    this.bindJumpFocusDismiss();
    this.bindScrollDateBadge();
    this.bindScrollBottomButton();
    this.bindNetworkEvents();
    this.bindReasoningSettings();
    this.bindMentionDetection();
    this._swipeRegenHandler = null;
    this._swipeChangeHandler = null;
    this._bindSwipeEvents();
  }

  _bindSwipeEvents() {
    if (!this.scrollEl) return;
    this.scrollEl.addEventListener('click', (e) => {
      const btn = e.target.closest('.rp-swipe-prev, .rp-swipe-next');
      if (!btn) return;
      e.stopPropagation();
      const indicator = btn.closest('.rp-swipe-indicator');
      if (!indicator) return;
      const busyWrapper = indicator.closest('.QQ_chat_charmsg.is-rp-regenerating');
      if (busyWrapper) return;
      const msgId = indicator.dataset.msgId;
      if (!msgId) return;
      const wrapper = this.scrollEl.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
      const msg = wrapper?.__chatappMessage;
      if (!msg) return;

      if (!msg.meta) msg.meta = {};
      if (!Array.isArray(msg.meta.swipes)) {
        msg.meta.swipes = [{ content: msg.content, raw: msg.raw }];
        msg.meta.activeSwipe = 0;
      }
      const total = msg.meta.swipes.length;
      const active = msg.meta.activeSwipe || 0;

      if (btn.classList.contains('rp-swipe-prev')) {
        if (active <= 0) return;
        this._applySwipe(wrapper, msg, active - 1);
      } else {
        if (active >= total - 1) {
          if (this._swipeRegenHandler) this._swipeRegenHandler({ msgId, message: msg });
          return;
        }
        this._applySwipe(wrapper, msg, active + 1);
      }
    });
  }

  _applySwipe(wrapper, msg, newIndex) {
    const swipes = msg.meta?.swipes;
    if (!swipes || newIndex < 0 || newIndex >= swipes.length) return;
    msg.meta.activeSwipe = newIndex;
    const branch = swipes[newIndex];
    msg.content = branch.content;
    if (branch.raw !== undefined) msg.raw = branch.raw;

    this._renderSwipeContent(wrapper, msg, String(branch.content ?? ''), { streaming: false });
    this._syncSwipeIndicator(wrapper, newIndex, swipes.length);

    if (this._swipeChangeHandler) {
      this._swipeChangeHandler({ msgId: msg.id, message: msg, index: newIndex });
    }
  }

  resolveActiveSwipeMessage(message) {
    if (!message || typeof message !== 'object') return message;
    const meta = message.meta && typeof message.meta === 'object' ? message.meta : null;
    const swipes = Array.isArray(meta?.swipes) && meta.swipes.length ? meta.swipes : null;
    if (!swipes) return message;
    const rawIndex = Math.trunc(Number(meta.activeSwipe));
    const active = Number.isFinite(rawIndex)
      ? Math.min(Math.max(0, rawIndex), swipes.length - 1)
      : 0;
    const branch = swipes[active] || {};
    const next = {
      ...message,
      content: branch.content ?? message.content ?? '',
      meta: meta.activeSwipe === active ? meta : { ...meta, activeSwipe: active },
    };
    if (branch.raw !== undefined) next.raw = branch.raw;
    else if (branch.content !== undefined) next.raw = branch.content;
    return next;
  }

  _renderSwipeContent(wrapper, msg, content, { streaming = false, placeholder = '' } = {}) {
    const bubble = wrapper?.querySelector?.('.QQ_chat_msgdiv');
    if (!bubble) return false;
    this.cleanupRichTextMounts(bubble);
    bubble.classList.remove('rp-swipe-draft-placeholder');
    bubble.style.removeProperty('white-space');
    bubble.innerHTML = '';
    const renderMsg = {
      ...(msg || {}),
      content: String(content ?? ''),
    };
    const target = this.prepareTextContainer(bubble, renderMsg);
    target.classList.remove('rp-swipe-draft-placeholder');
    target.style.removeProperty('white-space');
    const text = String(content ?? '');
    if (!text.trim() && placeholder) {
      target.classList.add('rp-swipe-draft-placeholder');
      const dots = document.createElement('span');
      dots.className = 'typing';
      dots.setAttribute('aria-hidden', 'true');
      for (let i = 0; i < 3; i += 1) {
        const dot = document.createElement('span');
        dot.className = 'typing-dot';
        dots.appendChild(dot);
      }
      const label = document.createElement('span');
      label.textContent = placeholder;
      target.appendChild(dots);
      target.appendChild(label);
      return true;
    }
    if (!streaming && renderMsg.meta?.renderRich) {
      renderRichText(target, text, {
        messageId: renderMsg.id,
        preserveHtmlNewlines: true,
        sessionId: renderMsg.sessionId,
      });
      return true;
    }
    const normalized = this.normalizeAssistantLineBreaks(text);
    if (!this.renderTextWithStickers(target, normalized)) {
      target.textContent = normalized;
      target.style.whiteSpace = 'pre-wrap';
    }
    return true;
  }

  _syncSwipeIndicator(wrapper, index, total, { generating = false } = {}) {
    const indicator = wrapper?.querySelector?.('.rp-swipe-indicator');
    if (!indicator) return;
    const safeTotal = Math.max(1, Number(total) || 1);
    const safeIndex = Math.min(Math.max(0, Number(index) || 0), safeTotal - 1);
    const counter = indicator.querySelector('.rp-swipe-counter');
    if (counter) counter.textContent = `${safeIndex + 1}/${safeTotal}`;
    const prevBtn = indicator.querySelector('.rp-swipe-prev');
    if (prevBtn) {
      prevBtn.disabled = generating || safeIndex <= 0;
      prevBtn.setAttribute('aria-label', '上一条回复');
      prevBtn.title = '上一条回复';
    }
    const nextBtn = indicator.querySelector('.rp-swipe-next');
    if (nextBtn) {
      nextBtn.disabled = generating;
      const label = generating ? '生成中' : (safeIndex >= safeTotal - 1 ? '生成新回复' : '下一条回复');
      nextBtn.setAttribute('aria-label', label);
      nextBtn.title = label;
    }
  }

  addSwipeBranch(msgId, content, raw) {
    const id = String(msgId || '').trim();
    if (!id || !this.scrollEl) return;
    const wrapper = this.scrollEl.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
    const msg = wrapper?.__chatappMessage;
    if (!msg) return;
    if (!msg.meta) msg.meta = {};
    if (!Array.isArray(msg.meta.swipes)) {
      msg.meta.swipes = [{ content: msg.content, raw: msg.raw }];
    }
    msg.meta.swipes.push({ content, raw });
    const newIdx = msg.meta.swipes.length - 1;
    this._applySwipe(wrapper, msg, newIdx);
  }

  onSwipeRegen(handler) { this._swipeRegenHandler = handler; }
  onSwipeChange(handler) { this._swipeChangeHandler = handler; }

  setSwipeRegenerating(msgId, active, label = '生成中...') {
    const id = String(msgId || '').trim();
    if (!id || !this.scrollEl) return false;
    const wrapper = this.scrollEl.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
    if (!wrapper) return false;
    wrapper.classList.toggle('is-rp-regenerating', Boolean(active));
    wrapper.setAttribute('aria-busy', active ? 'true' : 'false');
    const bubble = wrapper.querySelector('.QQ_chat_msgdiv');
    if (bubble) {
      if (active) bubble.dataset.rpRegeneratingLabel = String(label || '生成中...');
      else delete bubble.dataset.rpRegeneratingLabel;
    }
    return true;
  }

  startSwipeGenerationStream(msgId, meta = {}) {
    const id = String(msgId || '').trim();
    if (!id || !this.scrollEl) return null;
    const wrapper = this.scrollEl.querySelector(`[data-msg-id="${CSS.escape(id)}"]`);
    const msg = wrapper?.__chatappMessage;
    if (!wrapper || !msg) return null;
    const streamId = String(meta.id || `swipe-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
    const total = Math.max(1, Number(meta.total) || 1);
    const index = Math.min(Math.max(0, Number(meta.index) || total - 1), total - 1);
    const label = String(meta.label || '生成新回复中...');
    const raf = cb => {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) return window.requestAnimationFrame(cb);
      } catch {}
      return setTimeout(cb, 16);
    };
    const caf = handle => {
      try {
        if (typeof window !== 'undefined' && window.cancelAnimationFrame) return window.cancelAnimationFrame(handle);
      } catch {}
      clearTimeout(handle);
    };
    let updateHandle = null;
    let pendingText = '';
    this.setSwipeRegenerating(id, true, label);
    this._syncSwipeIndicator(wrapper, index, total, { generating: true });
    this._renderSwipeContent(wrapper, msg, '', { streaming: true, placeholder: label });
    this.setStreamingState(true);

    const flush = (text, { final = false, finalMessage = null } = {}) => {
      if (!wrapper.isConnected) return;
      const renderMsg = finalMessage ? { ...msg, ...finalMessage, id: msg.id } : msg;
      this._renderSwipeContent(wrapper, renderMsg, text, { streaming: !final, placeholder: label });
      if (this.isNearBottom()) this.scrollToBottom();
    };

    return {
      id: streamId,
      update: text => {
        pendingText = String(text ?? '');
        if (updateHandle != null) return;
        updateHandle = raf(() => {
          updateHandle = null;
          flush(pendingText, { final: false });
        });
      },
      finish: finalMessage => {
        this.setStreamingState(false);
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        const finalText = String(finalMessage?.content ?? pendingText ?? '');
        pendingText = finalText;
        flush(finalText, { final: true, finalMessage });
      },
      cancel: (options = {}) => {
        const keepPartial = Boolean(options && options.keepPartial);
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        this.setStreamingState(false);
        const rawText = String(pendingText ?? '');
        if (keepPartial && rawText.trim()) {
          const content = this.normalizeAssistantLineBreaks(rawText);
          flush(content, { final: false });
          return {
            role: 'assistant',
            type: 'text',
            id: streamId,
            name: meta.name || msg.name || '助手',
            avatar: meta.avatar || msg.avatar,
            time: meta.time || msg.time,
            content,
            raw: rawText,
            rawOriginal: rawText,
            meta: {
              renderRich: msg.meta?.renderRich === true,
              partial: true,
              cancelled: true,
            },
          };
        }
        return null;
      },
    };
  }

  decorateMessage(message, context = {}) {
    if (!message || typeof message !== 'object') return message;
    const decorator = this.messageDecorator;
    if (typeof decorator !== 'function') return message;
    try {
      const next = decorator(message, context);
      return next && typeof next === 'object' ? next : message;
    } catch (err) {
      logger.warn('message decoration failed', err);
      return message;
    }
  }

  isTypingDotsEnabled() {
    return document?.body?.dataset?.typingDots !== 'off';
  }

  normalizeAssistantLineBreaks(text) {
    // Some models output "<br>" as a line break marker; render it as real newlines while keeping the same bubble.
    return String(text ?? '')
      .replace(/&lt;br\s*\/?&gt;/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n');
  }

  applyCreativeBubbleState(wrapper, message) {
    if (!wrapper) return;
    const isCreative = message?.role === 'assistant' && message?.meta?.renderRich;
    if (isCreative) {
      wrapper.dataset.creative = '1';
    } else {
      delete wrapper.dataset.creative;
    }
  }

  resolveMessageSessionId(message = null) {
    const explicit = String(message?.sessionId || '').trim();
    if (explicit) return explicit;
    const bridge = typeof window !== 'undefined' ? window.appBridge : null;
    const active = String(bridge?.activeSessionId || '').trim();
    if (active) return active;
    return String(bridge?.chatStore?.getCurrent?.() || '').trim();
  }

  getReasoningText(message) {
    const meta = message?.meta;
    if (!meta || typeof meta !== 'object') return '';
    const raw = typeof meta.reasoningDisplay === 'string' ? meta.reasoningDisplay : meta.reasoning;
    return String(raw ?? '').trim();
  }

  buildReasoningElement(message) {
    const meta = message?.meta;
    if (!meta || typeof meta !== 'object') return null;
    if (meta.reasoningHidden === true && appSettings.get().reasoningShowHidden !== true) return null;
    const text = this.getReasoningText(message);
    if (!text) return null;
    const details = document.createElement('details');
    details.className = 'chat-reasoning';
    if (meta.reasoningHidden === true) details.dataset.hidden = '1';
    if (appSettings.get().reasoningAutoExpand === true) details.open = true;
    const summary = document.createElement('summary');
    summary.className = 'chat-reasoning-summary';
    summary.textContent = '推理';
    const content = document.createElement('div');
    content.className = 'chat-reasoning-content';
    content.textContent = text;
    details.appendChild(summary);
    details.appendChild(content);
    return details;
  }

  buildGreetingSwitch(message) {
    const meta = message?.meta;
    if (!meta || meta.isGreeting !== true) return null;
    if (document?.body?.dataset?.uiMode !== 'rp') return null;
    const bridge = typeof window !== 'undefined' ? window.appBridge : null;
    if (!bridge?.getRpGreetingState || !bridge?.setRpGreeting) return null;
    const state = bridge.getRpGreetingState(bridge.activeSessionId || message?.sessionId);
    const list = Array.isArray(state?.greetings) ? state.greetings : [];
    if (list.length <= 1) return null;

    const wrap = document.createElement('div');
    wrap.className = 'rp-greeting-switch';
    const label = document.createElement('span');
    label.className = 'rp-greeting-switch-label';
    label.textContent = '开场白';
    const select = document.createElement('select');
    select.className = 'rp-greeting-switch-select';
    list.forEach((g, idx) => {
      const opt = document.createElement('option');
      opt.value = g.id;
      opt.textContent = g.title || `开场白 ${idx + 1}`;
      select.appendChild(opt);
    });
    const activeId = String(state?.activeId || '').trim();
    if (activeId) select.value = activeId;
    select.disabled = state?.locked === true;
    select.addEventListener('change', () => {
      const nextId = String(select.value || '').trim();
      if (!nextId) return;
      bridge.setRpGreeting?.(nextId, state?.sessionId || bridge.activeSessionId);
    });
    wrap.appendChild(label);
    wrap.appendChild(select);
    return wrap;
  }

  prepareTextContainer(bubble, message) {
    const replyEl = this.buildReplyPreviewElement(message);
    const greetingEl = this.buildGreetingSwitch(message);
    const reasoningEl = this.buildReasoningElement(message);
    if (!replyEl && !greetingEl && !reasoningEl) return bubble;
    bubble.innerHTML = '';
    if (replyEl) bubble.appendChild(replyEl);
    if (greetingEl) bubble.appendChild(greetingEl);
    if (reasoningEl) bubble.appendChild(reasoningEl);
    const content = document.createElement('div');
    content.className = 'chat-message-content';
    bubble.appendChild(content);
    return content;
  }

  buildReplyPreviewElement(message) {
    const replyTo = normalizeReplyTarget(message?.meta?.replyTo);
    if (!replyTo) return null;
    const box = document.createElement('button');
    box.type = 'button';
    box.className = 'chat-reply-preview';
    box.setAttribute('aria-label', `查看回复原消息：${replyTo.author || '消息'}`);
    const avatar = document.createElement('img');
    avatar.className = 'chat-reply-preview-avatar';
    avatar.src = replyTo.avatar || DEFAULT_REPLY_AVATAR;
    avatar.alt = '';
    const textWrap = document.createElement('span');
    textWrap.className = 'chat-reply-preview-text';
    const author = document.createElement('span');
    author.className = 'chat-reply-preview-author';
    author.textContent = replyTo.author || '消息';
    const snippet = document.createElement('span');
    snippet.className = 'chat-reply-preview-snippet';
    snippet.textContent = replyTo.content || '...';
    textWrap.appendChild(author);
    textWrap.appendChild(snippet);
    box.appendChild(avatar);
    box.appendChild(textWrap);
    box.addEventListener('click', async e => {
      e.preventDefault();
      e.stopPropagation();
      const handled = await this.actionHandler?.('jump-reply-target', message, {
        targetId: replyTo.id,
        sessionId: replyTo.sessionId || message?.sessionId || this.resolveMessageSessionId(message),
        keyword: replyTo.content || '',
      });
      if (handled) return;
      if (replyTo.id && this.scrollToMessage(replyTo.id, { keyword: replyTo.content || '', kind: 'anchor' })) return;
      window.toastr?.warning?.('未找到被回复的消息');
    });
    return box;
  }

  buildReactionSummaryElement(message) {
    if (!this.isThreadingEnabledForMessage(message)) return null;
    const reactions = normalizeReactionEntries(message?.meta?.reactions);
    if (!reactions.length) return null;
    const wrap = document.createElement('div');
    wrap.className = 'chat-reaction-summary';
    reactions.forEach((entry) => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'chat-reaction-chip';
      if (hasReactionActor(entry, SELF_REACTION_ACTOR)) chip.classList.add('is-self');
      const emoji = document.createElement('span');
      emoji.className = 'chat-reaction-chip-emoji';
      emoji.textContent = entry.emoji;
      const count = document.createElement('span');
      count.className = 'chat-reaction-chip-count';
      count.textContent = String(countReactionActors(entry));
      chip.appendChild(emoji);
      chip.appendChild(count);
      chip.setAttribute('aria-label', `${entry.emoji} ${countReactionActors(entry)}个反应`);
      chip.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.actionHandler?.('toggle-reaction', message, { emoji: entry.emoji });
      });
      wrap.appendChild(chip);
    });
    return wrap;
  }

  showReactionPicker(anchor, message) {
    if (!this.reactionPicker || !anchor || !this.isThreadingEnabledForMessage(message)) return;
    this.contextMenu.style.display = 'none';
    this.reactionPicker.innerHTML = '';
    const currentReactions = normalizeReactionEntries(message?.meta?.reactions);
    DEFAULT_REACTION_EMOJIS.forEach((emoji) => {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'chat-reaction-option';
      if (currentReactions.some((entry) => entry.emoji === emoji && hasReactionActor(entry, SELF_REACTION_ACTOR))) {
        btn.classList.add('is-active');
      }
      btn.textContent = emoji;
      btn.setAttribute('aria-label', `使用${emoji}回应`);
      btn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.hideReactionPicker();
        this.actionHandler?.('toggle-reaction', message, { emoji });
      });
      this.reactionPicker.appendChild(btn);
    });
    this.reactionPicker.style.display = 'flex';
    this.reactionPicker.style.visibility = 'hidden';
    const rect = anchor.getBoundingClientRect();
    const pickerW = this.reactionPicker.offsetWidth || 240;
    const pickerH = this.reactionPicker.offsetHeight || 48;
    const padding = 8;
    let left = rect.left + rect.width / 2 - pickerW / 2;
    let top = rect.top - pickerH - 10;
    left = Math.max(padding, Math.min(left, window.innerWidth - pickerW - padding));
    if (top < padding) top = Math.min(window.innerHeight - pickerH - padding, rect.bottom + 10);
    this.reactionPicker.style.left = `${left}px`;
    this.reactionPicker.style.top = `${Math.max(padding, top)}px`;
    this.reactionPicker.style.visibility = 'visible';
  }

  bindReasoningSettings() {
    if (this.__chatappReasoningBound) return;
    this.__chatappReasoningBound = true;
    const updateAll = () => {
      const autoExpand = appSettings.get().reasoningAutoExpand === true;
      document.querySelectorAll('details.chat-reasoning').forEach((el) => {
        if (!(el instanceof HTMLDetailsElement)) return;
        el.open = autoExpand;
        if (el.dataset.hidden === '1') {
          el.style.display = appSettings.get().reasoningShowHidden === true ? '' : 'none';
        }
      });
    };
    window.addEventListener('reasoning-settings-changed', updateAll);
    updateAll();
  }

  renderTextWithStickers(bubble, text) {
    const raw = String(text ?? '');
    const re = /\[bqb-([\s\S]+?)\]/gi;
    let match = null;
    let lastIndex = 0;
    let hasToken = false;
    const frag = document.createDocumentFragment();

    const appendText = segment => {
      if (!segment) return;
      const parts = segment.split(/\n/);
      parts.forEach((part, idx) => {
        if (part) frag.appendChild(document.createTextNode(part));
        if (idx < parts.length - 1) frag.appendChild(document.createElement('br'));
      });
    };

    const ensureBreak = () => {
      const last = frag.lastChild;
      if (last && last.nodeName !== 'BR') frag.appendChild(document.createElement('br'));
    };

    while ((match = re.exec(raw))) {
      hasToken = true;
      const before = raw.slice(lastIndex, match.index);
      appendText(before);

      const keyword = String(match[1] || '').trim();
      if (frag.childNodes.length) ensureBreak();
      const resolved = resolveMediaAsset('sticker', keyword) || resolveMediaAsset('image', keyword);
      if (resolved) {
        const img = document.createElement('img');
        img.alt = keyword || 'sticker';
        img.className = 'previewable sticker-image sticker-inline';
        const frames = resolveStickerFrames(resolved, keyword);
        const fps = resolveStickerFps(resolved, keyword);
        const loaded = applyImageFallback(img, resolved, {
          onFail: () => {
            img.classList.add('broken');
            img.alt = '表情包加载失败';
            toastOnce('表情包加载失败');
          },
        });
        if (loaded) {
          if (frames.length > 1) registerStickerAnimation(img, frames, fps);
          img.addEventListener('click', () => this.openLightbox(img.currentSrc || img.src));
          frag.appendChild(img);
        } else {
          const chip = document.createElement('span');
          chip.className = 'chip';
          chip.textContent = keyword ? `表情包：${keyword}` : '表情包';
          frag.appendChild(chip);
        }
      } else {
        const chip = document.createElement('span');
        chip.className = 'chip';
        chip.textContent = keyword ? `表情包：${keyword}` : '表情包';
        frag.appendChild(chip);
      }
      const remaining = raw.slice(match.index + match[0].length);
      if (remaining && !remaining.startsWith('\n')) frag.appendChild(document.createElement('br'));
      lastIndex = match.index + match[0].length;
    }

    if (!hasToken) return false;
    appendText(raw.slice(lastIndex));
    bubble.innerHTML = '';
    bubble.appendChild(frag);
    bubble.style.whiteSpace = 'pre-wrap';
    return true;
  }

  bindIframeLongPressForwarding() {
    if (this.__chatappIframePressBound) return;
    this.__chatappIframePressBound = true;

    window.addEventListener(
      'chatapp-iframe-press',
      ev => {
        const d = ev?.detail;
        if (!d || typeof d !== 'object') return;
        const phase = String(d.phase || '');
        const msgId = String(d.msgId || '');
        const iframeId = String(d.id || '');
        const clientX = Number(d.clientX);
        const clientY = Number(d.clientY);
        if (!phase || !msgId || !Number.isFinite(clientX) || !Number.isFinite(clientY)) return;

        const esc =
          CSS && typeof CSS.escape === 'function' ? CSS.escape : s => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        const wrapper = this.scrollEl?.querySelector?.(`[data-msg-id="${esc(msgId)}"]`);
        const message = wrapper?.__chatappMessage;
        if (!message) return;

        // Tapping inside iframe won't trigger outer document click; mirror "click outside to close"
        if (phase === 'down' && this.contextMenu && this.contextMenu.style.display !== 'none') {
          this.contextMenu.style.display = 'none';
        }

        if (phase === 'down') {
          this.clearLongPress();
          return;
        }
        if (phase === 'longpress') {
          const iframe = iframeId ? document.querySelector(`iframe[data-iframe-id="${esc(iframeId)}"]`) : null;
          this.clearLongPress();
          this.showContextMenu({ clientX, clientY, target: iframe || wrapper }, message);
          return;
        }
        if (phase === 'up' || phase === 'cancel') {
          this.clearLongPress();
        }
      },
      { passive: true },
    );
  }

  bindInputAutosize() {
    const el = this.inputEl;
    if (!el) return;

    const resize = () => {
      el.style.height = 'auto';
      // CSS max-height handles the limit
      el.style.height = `${el.scrollHeight}px`;
    };
    // Reset initially
    el.setAttribute('rows', '1');
    el.addEventListener('input', resize);
    // Also resize on focus/blur to ensure correct size
    el.addEventListener('focus', resize);
    // Initial sizing
    setTimeout(resize, 0);
  }

  bindFocusScroll() {
    if (!this.inputEl || !this.scrollEl) return;
    this.inputEl.addEventListener('focus', () => {
      setTimeout(() => this.scrollToBottom(), 120);
    });
  }

  initScrollDateBadge() {
    if (!this.scrollEl || this.scrollDateBadgeEl) return;
    const host = this.scrollEl.parentElement;
    if (!host) return;
    const badge = document.createElement('div');
    badge.className = 'chat-scroll-date-badge';
    badge.setAttribute('aria-hidden', 'true');
    host.appendChild(badge);
    this.scrollDateBadgeEl = badge;
  }

  initScrollBottomButton() {
    if (!this.scrollEl || this.scrollBottomButtonEl) return;
    const host = this.scrollEl.parentElement;
    if (!host) return;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'chat-scroll-bottom-btn';
    button.setAttribute('aria-label', '跳到最新消息');
    button.setAttribute('title', '跳到最新消息');
    button.innerHTML = `
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path
          d="M12 4.75a1 1 0 0 1 1 1v10.586l2.714-2.714a1 1 0 1 1 1.414 1.414l-4.422 4.422a1 1 0 0 1-1.414 0l-4.422-4.422a1 1 0 1 1 1.414-1.414L11 16.336V5.75a1 1 0 0 1 1-1Z"
          fill="currentColor"
        />
      </svg>
    `;
    button.addEventListener('click', () => {
      this.scrollToBottom();
    });
    host.appendChild(button);
    this.scrollBottomButtonEl = button;
  }

  formatScrollDateLabel(timestamp) {
    const ts = Number(timestamp || 0);
    if (!Number.isFinite(ts) || ts <= 0) return '';
    const date = new Date(ts);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const targetStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const diffDays = Math.round((todayStart - targetStart) / 86400000);
    if (diffDays === 0) return '今天';
    if (diffDays === 1) return '昨天';
    if (date.getFullYear() === now.getFullYear()) {
      return `${date.getMonth() + 1}/${date.getDate()}`;
    }
    return `${date.getFullYear()}/${date.getMonth() + 1}/${date.getDate()}`;
  }

  resolveScrollDateLabel() {
    if (!this.scrollEl) return '';
    const items = this.scrollEl.querySelectorAll('[data-msg-id][data-timestamp]');
    if (!items.length) return '';
    const anchorTop = Number(this.scrollEl.scrollTop || 0) + 24;
    let fallback = null;
    for (const el of items) {
      const ts = Number(el.dataset.timestamp || 0);
      if (!Number.isFinite(ts) || ts <= 0) continue;
      fallback = el;
      const bottom = Number(el.offsetTop || 0) + Number(el.offsetHeight || 0);
      if (bottom >= anchorTop) {
        return this.formatScrollDateLabel(ts);
      }
    }
    return fallback ? this.formatScrollDateLabel(Number(fallback.dataset.timestamp || 0)) : '';
  }

  hideScrollDateBadge({ immediate = false } = {}) {
    if (this.scrollDateHideTimer) {
      clearTimeout(this.scrollDateHideTimer);
      this.scrollDateHideTimer = null;
    }
    if (!this.scrollDateBadgeEl) return;
    if (immediate) {
      this.scrollDateBadgeEl.classList.add('is-immediate');
      this.scrollDateBadgeEl.classList.remove('is-visible');
      setTimeout(() => {
        this.scrollDateBadgeEl?.classList?.remove('is-immediate');
      }, 0);
      return;
    }
    this.scrollDateBadgeEl.classList.remove('is-visible');
  }

  showScrollDateBadge(label) {
    const text = String(label || '').trim();
    if (!this.scrollDateBadgeEl || !text) {
      this.hideScrollDateBadge();
      return;
    }
    this.scrollDateBadgeEl.textContent = text;
    this.scrollDateBadgeEl.classList.remove('is-immediate');
    this.scrollDateBadgeEl.classList.add('is-visible');
    if (this.scrollDateHideTimer) clearTimeout(this.scrollDateHideTimer);
    this.scrollDateHideTimer = setTimeout(() => {
      this.scrollDateHideTimer = null;
      this.scrollDateBadgeEl?.classList?.remove('is-visible');
    }, 760);
  }

  refreshScrollDateBadge({ reveal = false } = {}) {
    if (document?.body?.dataset?.uiMode === 'rp') {
      this.hideScrollDateBadge({ immediate: true });
      return;
    }
    const label = this.resolveScrollDateLabel();
    if (!label) {
      this.hideScrollDateBadge({ immediate: !reveal });
      return;
    }
    if (reveal) this.showScrollDateBadge(label);
    else this.hideScrollDateBadge({ immediate: true });
  }

  bindScrollDateBadge() {
    if (!this.scrollEl || this.__chatappScrollDateBadgeBound) return;
    this.__chatappScrollDateBadgeBound = true;
    let rafId = 0;
    this.scrollEl.addEventListener(
      'scroll',
      () => {
        if (this._programmaticScroll) {
          this._programmaticScroll = false;
          return;
        }
        if (rafId) return;
        const schedule =
          typeof requestAnimationFrame === 'function'
            ? requestAnimationFrame
            : (cb => setTimeout(cb, 16));
        rafId = schedule(() => {
          rafId = 0;
          this.refreshScrollDateBadge({ reveal: true });
        });
      },
      { passive: true },
    );
  }

  isNearBottom(threshold = 120) {
    return this.getScrollDistanceFromBottom() <= threshold;
  }

  getScrollDistanceFromBottom() {
    if (!this.scrollEl) return 0;
    const scrollHeight = Number(this.scrollEl.scrollHeight || 0);
    const viewportHeight = Number(this.scrollEl.clientHeight || 0);
    const scrollTop = Number(this.scrollEl.scrollTop || 0);
    return Math.max(0, scrollHeight - viewportHeight - scrollTop);
  }

  resolveScrollBottomButtonThresholds() {
    const viewportHeight = Math.max(0, Number(this.scrollEl?.clientHeight || 0));
    return {
      show: Math.max(220, Math.round(viewportHeight * 0.58)),
      hide: Math.max(84, Math.round(viewportHeight * 0.18)),
    };
  }

  hideScrollBottomButton({ immediate = false } = {}) {
    const button = this.scrollBottomButtonEl;
    if (!button) return;
    if (immediate) {
      button.classList.add('is-immediate');
    } else {
      button.classList.remove('is-immediate');
    }
    button.classList.remove('is-visible');
    if (!immediate) return;
    setTimeout(() => {
      this.scrollBottomButtonEl?.classList?.remove('is-immediate');
    }, 0);
  }

  showScrollBottomButton({ immediate = false } = {}) {
    const button = this.scrollBottomButtonEl;
    if (!button) return;
    if (immediate) {
      button.classList.add('is-immediate');
    } else {
      button.classList.remove('is-immediate');
    }
    button.classList.add('is-visible');
    if (!immediate) return;
    setTimeout(() => {
      this.scrollBottomButtonEl?.classList?.remove('is-immediate');
    }, 0);
  }

  refreshScrollBottomButton({ immediate = false } = {}) {
    const button = this.scrollBottomButtonEl;
    if (!this.scrollEl || !button) return;
    const scrollHeight = Number(this.scrollEl.scrollHeight || 0);
    const viewportHeight = Number(this.scrollEl.clientHeight || 0);
    const maxScrollable = Math.max(0, scrollHeight - viewportHeight);
    if (maxScrollable <= 8) {
      this.hideScrollBottomButton({ immediate });
      return;
    }
    const distance = this.getScrollDistanceFromBottom();
    const { show, hide } = this.resolveScrollBottomButtonThresholds();
    const visible = button.classList.contains('is-visible');
    const shouldShow = visible ? distance > hide : distance > show;
    if (shouldShow) this.showScrollBottomButton({ immediate });
    else this.hideScrollBottomButton({ immediate });
    // 悬浮输入指示器：滚到底部时移除，离开底部时显示
    if (this.typingEl) {
      if (this.isNearBottom()) {
        if (this._floatingTypingEl) { this._floatingTypingEl.remove(); this._floatingTypingEl = null; }
      } else if (!this._floatingTypingEl) {
        this._showFloatingTyping(this.typingEl);
      }
    }
  }

  scheduleScrollBottomButtonRefresh({ immediate = false } = {}) {
    this.scrollBottomButtonImmediate = this.scrollBottomButtonImmediate || immediate;
    if (this.scrollBottomButtonRaf) return;
    const schedule =
      typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb => setTimeout(cb, 16));
    this.scrollBottomButtonRaf = schedule(() => {
      this.scrollBottomButtonRaf = 0;
      const shouldApplyImmediately = this.scrollBottomButtonImmediate;
      this.scrollBottomButtonImmediate = false;
      this.refreshScrollBottomButton({ immediate: shouldApplyImmediately });
    });
  }

  bindScrollBottomButton() {
    if (!this.scrollEl || this.__chatappScrollBottomButtonBound) return;
    this.__chatappScrollBottomButtonBound = true;
    this.scrollEl.addEventListener(
      'scroll',
      () => {
        this.hideReactionPicker();
        this.scheduleScrollBottomButtonRefresh();
      },
      { passive: true },
    );
    if (typeof ResizeObserver === 'function') {
      this.scrollBottomButtonResizeObserver = new ResizeObserver(() => {
        this.scheduleScrollBottomButtonRefresh({ immediate: true });
      });
      this.scrollBottomButtonResizeObserver.observe(this.scrollEl);
    }
    window.addEventListener(
      'resize',
      () => {
        this.scheduleScrollBottomButtonRefresh({ immediate: true });
      },
      { passive: true },
    );
  }

  bindJumpFocusDismiss() {
    if (!this.scrollEl || this.__chatappJumpFocusBound) return;
    this.__chatappJumpFocusBound = true;
    this.scrollEl.addEventListener(
      'scroll',
      () => {
        const state = this.jumpFocusState;
        if (!state?.dismissOnScroll || !state.wrapper) return;
        if (Date.now() < Number(state.ignoreScrollUntil || 0)) return;
        const currentTop = Number(this.scrollEl?.scrollTop || 0);
        if (Math.abs(currentTop - Number(state.scrollTop || 0)) < 6) return;
        this.clearJumpFocus();
      },
      { passive: true },
    );
  }

  resolveJumpFocusElements(wrapper) {
    if (!wrapper) return { focusEl: null, textRoot: null };
    const focusEl =
      wrapper.querySelector('.QQ_chat_unread-line')
      || wrapper.querySelector('.QQ_chat_msgdiv')
      || wrapper.querySelector('.QQ_chat_sysbubble')
      || wrapper;
    const textRoot = focusEl?.querySelector?.('.chat-message-content') || focusEl;
    return { focusEl, textRoot };
  }

  clearJumpKeywordHighlights(root) {
    if (!root?.querySelectorAll) return;
    root.querySelectorAll('.chat-jump-keyword').forEach(mark => {
      const parent = mark.parentNode;
      if (!parent) return;
      parent.replaceChild(document.createTextNode(mark.textContent || ''), mark);
      parent.normalize?.();
    });
  }

  highlightKeywordInElement(root, keyword) {
    const term = String(keyword || '').trim();
    if (!root || !term || typeof document === 'undefined' || typeof NodeFilter === 'undefined') return 0;
    this.clearJumpKeywordHighlights(root);
    const skipTags = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'INPUT', 'SELECT', 'OPTION', 'BUTTON', 'PRE', 'CODE']);
    const walker = document.createTreeWalker(
      root,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: node => {
          const value = String(node?.nodeValue || '');
          if (!value.trim()) return NodeFilter.FILTER_REJECT;
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;
          if (skipTags.has(parent.tagName)) return NodeFilter.FILTER_REJECT;
          if (parent.closest?.('.chat-reasoning')) return NodeFilter.FILTER_REJECT;
          if (parent.closest?.('.chat-jump-keyword')) return NodeFilter.FILTER_REJECT;
          if (!value.toLowerCase().includes(term.toLowerCase())) return NodeFilter.FILTER_REJECT;
          return NodeFilter.FILTER_ACCEPT;
        },
      },
      false,
    );
    const textNodes = [];
    let current = null;
    while ((current = walker.nextNode())) textNodes.push(current);
    let hitCount = 0;
    textNodes.forEach(node => {
      const value = String(node.nodeValue || '');
      const lower = value.toLowerCase();
      const termLower = term.toLowerCase();
      let index = 0;
      let cursor = 0;
      const frag = document.createDocumentFragment();
      while ((index = lower.indexOf(termLower, cursor)) !== -1) {
        if (index > cursor) frag.appendChild(document.createTextNode(value.slice(cursor, index)));
        const mark = document.createElement('span');
        mark.className = 'chat-jump-keyword';
        mark.textContent = value.slice(index, index + term.length);
        frag.appendChild(mark);
        cursor = index + term.length;
        hitCount += 1;
      }
      if (!hitCount && !frag.childNodes.length) return;
      if (cursor < value.length) frag.appendChild(document.createTextNode(value.slice(cursor)));
      node.parentNode?.replaceChild(frag, node);
    });
    return hitCount;
  }

  clearJumpFocus() {
    const state = this.jumpFocusState;
    if (state?.timer) {
      clearTimeout(state.timer);
    }
    const wrapper = state?.wrapper;
    const focusEl = state?.focusEl;
    if (focusEl?.classList) {
      focusEl.classList.remove('chat-jump-focus-target');
    }
    if (wrapper?.classList) {
      wrapper.classList.remove('chat-jump-focus-line');
      delete wrapper.dataset.chatJumpKind;
    }
    this.clearJumpKeywordHighlights(state?.textRoot || focusEl || wrapper);
    this.jumpFocusState = null;
  }

  applyJumpFocus(wrapper, { keyword = '', kind = 'anchor', dismissOnScroll = true, autoClearMs = 0 } = {}) {
    if (!wrapper) return false;
    this.clearJumpFocus();
    const { focusEl, textRoot } = this.resolveJumpFocusElements(wrapper);
    wrapper.classList.add('chat-jump-focus-line');
    wrapper.dataset.chatJumpKind = String(kind || 'anchor');
    focusEl?.classList?.add('chat-jump-focus-target');
    if (keyword) this.highlightKeywordInElement(textRoot, keyword);
    const state = {
      wrapper,
      focusEl,
      textRoot,
      dismissOnScroll: dismissOnScroll !== false,
      scrollTop: Number(this.scrollEl?.scrollTop || 0),
      ignoreScrollUntil: Date.now() + 260,
      timer: null,
    };
    if (Number(autoClearMs) > 0) {
      state.timer = setTimeout(() => {
        if (this.jumpFocusState?.wrapper === wrapper) {
          wrapper.classList.remove('chat-jump-focus-line');
        }
      }, Number(autoClearMs));
    }
    this.jumpFocusState = state;
    return true;
  }

  bindNetworkEvents() {
    const updateStatus = () => {
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        this.setSendEnabled(false);
        this.showErrorBanner('网络不可用，请检查连接');
      } else {
        this.setSendEnabled(true);
        if (this.errorBanner) this.errorBanner.style.display = 'none';
        window.toastr?.info?.('网络已连接');
      }
    };
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    updateStatus();
  }

  onSend(handler) {
    this.sendBtn.addEventListener('click', handler);
    this.inputEl.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handler();
      }
    });
  }

  /**
   * 新方法：分别绑定 Enter 和发送按钮的回调
   * @param {Object} handlers - { onEnter: Function, onSendButton: Function }
   */
  onSendWithMode(handlers) {
    const { onEnter, onSendButton } = handlers;

    // 发送按钮：真正发送请求
    if (typeof onSendButton === 'function') {
      this.sendBtn.addEventListener('click', e => {
        e.preventDefault();
        if (typeof this.sendClickGuard === 'function' && this.sendClickGuard()) return;
        onSendButton();
      });
    }

    // Enter 键：缓存消息
    if (typeof onEnter === 'function') {
      this.inputEl.addEventListener('keydown', e => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          onEnter();
        }
      });
    }
  }

  setSendClickGuard(guard) {
    this.sendClickGuard = typeof guard === 'function' ? guard : null;
  }

  onConfig(handler) {
    if (this.configBtn) {
      this.configBtn.addEventListener('click', handler);
    }
  }

  onWorld(handler) {
    if (this.worldBtn) {
      this.worldBtn.addEventListener('click', handler);
    }
  }

  onSession(handler) {
    if (this.sessionBtn) {
      this.sessionBtn.addEventListener('click', handler);
    }
  }

  getInputText() {
    return this.inputEl.value.trim();
  }

  setInputText(val) {
    this.inputEl.value = val;
  }

  setSessionLabel(id) {
    if (this.sessionLabel) {
      this.sessionLabel.textContent = id;
    }
    if (this.sessionBadge) {
      this.sessionBadge.textContent = id?.startsWith('group:') ? '群聊' : '单聊';
    }
  }

  // ── @Mention system ──────────────────────────────────────────────

  setMentionMemberResolver(resolver) {
    this.mentionMemberResolver = resolver;
  }

  bindMentionDetection() {
    if (!this.inputEl) return;
    this.inputEl.addEventListener('input', () => this.handleMentionInput());
    this.inputEl.addEventListener('keydown', (e) => this.handleMentionKeydown(e));
    document.addEventListener('click', (e) => {
      if (this.mentionDropdown && !this.mentionDropdown.contains(e.target) && e.target !== this.inputEl) {
        this.hideMentionDropdown();
      }
    });
  }

  handleMentionInput() {
    const el = this.inputEl;
    const pos = el.selectionStart;
    const text = el.value;
    // find the '@' before cursor that starts a mention query
    let atPos = -1;
    for (let i = pos - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '@') { atPos = i; break; }
      if (ch === ' ' || ch === '\n') break;
    }
    if (atPos < 0 || (atPos > 0 && text[atPos - 1] !== ' ' && text[atPos - 1] !== '\n')) {
      this.hideMentionDropdown();
      return;
    }
    const query = text.slice(atPos + 1, pos).toLowerCase();
    this.mentionStartPos = atPos;
    this.mentionQuery = query;
    this.showMentionDropdown(query);
  }

  handleMentionKeydown(e) {
    if (!this.mentionDropdown || this.mentionDropdown.style.display === 'none') return;
    const items = this.mentionDropdown.querySelectorAll('.mention-item');
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.mentionSelectedIndex = Math.min(this.mentionSelectedIndex + 1, items.length - 1);
      this.updateMentionSelection(items);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.mentionSelectedIndex = Math.max(this.mentionSelectedIndex - 1, 0);
      this.updateMentionSelection(items);
    } else if (e.key === 'Enter' && !e.shiftKey) {
      const selected = items[this.mentionSelectedIndex];
      if (selected) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.insertMention(selected.dataset.memberName);
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      this.hideMentionDropdown();
    }
  }

  updateMentionSelection(items) {
    items.forEach((item, i) => {
      item.style.background = i === this.mentionSelectedIndex ? 'var(--app-accent-soft)' : 'transparent';
    });
    const active = items[this.mentionSelectedIndex];
    if (active) active.scrollIntoView({ block: 'nearest' });
  }

  showMentionDropdown(query) {
    if (typeof this.mentionMemberResolver !== 'function') return;
    const members = this.mentionMemberResolver();
    if (!members || !members.length) { this.hideMentionDropdown(); return; }
    const filtered = query
      ? members.filter(m => (m.name || '').toLowerCase().includes(query) || (m.id || '').toLowerCase().includes(query))
      : members;
    if (!filtered.length) { this.hideMentionDropdown(); return; }
    if (!this.mentionDropdown) {
      this.mentionDropdown = document.createElement('div');
      this.mentionDropdown.className = 'mention-dropdown';
      this.mentionDropdown.style.cssText = [
        'position:absolute', 'z-index:15000',
        'background:var(--app-surface-card)', 'border:1px solid var(--app-border-default)',
        'border-radius:12px', 'box-shadow:var(--app-shadow-md)',
        'max-height:220px', 'overflow-y:auto', 'overflow-x:hidden',
        'padding:4px 0', 'min-width:180px', 'max-width:280px',
      ].join(';');
      document.body.appendChild(this.mentionDropdown);
    }
    this.mentionSelectedIndex = 0;
    this.mentionDropdown.innerHTML = '';
    filtered.forEach((m, idx) => {
      const item = document.createElement('div');
      item.className = 'mention-item';
      item.dataset.memberName = m.name || m.id;
      item.style.cssText = [
        'display:flex', 'align-items:center', 'gap:8px',
        'padding:8px 12px', 'cursor:pointer', 'font-size:14px',
        'color:var(--app-text-primary)', 'transition:background 0.1s',
        idx === 0 ? 'background:var(--app-accent-soft)' : 'background:transparent',
      ].join(';');
      if (m.avatar) {
        const img = document.createElement('img');
        img.src = m.avatar;
        img.style.cssText = 'width:28px;height:28px;border-radius:50%;object-fit:cover;flex-shrink:0';
        img.onerror = () => { img.style.display = 'none'; };
        item.appendChild(img);
      }
      const nameEl = document.createElement('span');
      nameEl.textContent = m.name || m.id;
      nameEl.style.cssText = 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0';
      item.appendChild(nameEl);
      item.addEventListener('pointerenter', () => {
        this.mentionSelectedIndex = idx;
        this.updateMentionSelection(this.mentionDropdown.querySelectorAll('.mention-item'));
      });
      item.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.insertMention(m.name || m.id);
      });
      this.mentionDropdown.appendChild(item);
    });
    // position above input
    this.positionMentionDropdown();
    this.mentionDropdown.style.display = 'block';
  }

  positionMentionDropdown() {
    if (!this.mentionDropdown || !this.inputContainer) return;
    const rect = this.inputContainer.getBoundingClientRect();
    this.mentionDropdown.style.left = `${rect.left + 8}px`;
    this.mentionDropdown.style.bottom = `${window.innerHeight - rect.top + 4}px`;
    this.mentionDropdown.style.top = 'auto';
  }

  insertMention(name) {
    const el = this.inputEl;
    const before = el.value.slice(0, this.mentionStartPos);
    const after = el.value.slice(el.selectionStart);
    const mention = `@${name} `;
    el.value = before + mention + after;
    const newPos = before.length + mention.length;
    el.setSelectionRange(newPos, newPos);
    el.focus();
    this.hideMentionDropdown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  hideMentionDropdown() {
    if (this.mentionDropdown) {
      this.mentionDropdown.style.display = 'none';
    }
    this.mentionStartPos = -1;
    this.mentionQuery = '';
    this.mentionSelectedIndex = 0;
  }

  // ── End @Mention system ────────────────────────────────────────

  onInputChange(handler) {
    let timer = null;
    this.inputEl.addEventListener('input', () => {
      // Clear existing timer
      if (timer) clearTimeout(timer);
      // Debounce draft saving (500ms)
      timer = setTimeout(() => {
        handler(this.inputEl.value);
      }, 500);
    });
  }

  clearMessages() {
    this.cleanupRichTextMounts(this.scrollEl);
    this.scrollEl.innerHTML = '';
    this.hideReactionPicker();
    this.hideScrollDateBadge({ immediate: true });
    this.hideScrollBottomButton({ immediate: true });
    // 切换会话时重置所有送达/已读状态
    this._clearDeliverySequence();
    this._clearTypingTimers();
    if (this._readCountTimer) { clearTimeout(this._readCountTimer); this._readCountTimer = null; }
    this._readCountCurrent = 0;
    this._readCountMax = 0;
    this._readCountTargets = null;
    this._deliverySequenceDone = false;
    this.typingEl = null;
    if (this._floatingTypingEl) { this._floatingTypingEl.remove(); this._floatingTypingEl = null; }
    this._rpFloorCount = 0;
  }

  _createRpFloorMarker(message) {
    if (document.body?.dataset?.uiMode !== 'rp') return null;
    const role = message?.role;
    if (role === 'system') return null;

    let floor = null;
    if (message?.meta?.isGreeting) {
      this._rpFloorCount = 0;
      floor = 0;
    } else if (role === 'user') {
      this._rpFloorCount = (this._rpFloorCount || 0) + 1;
      floor = this._rpFloorCount;
    } else {
      const cur = this._rpFloorCount || 0;
      if (!message.meta) message.meta = {};
      message.meta.floor = cur;
      return null;
    }

    if (!message.meta) message.meta = {};
    message.meta.floor = floor;

    const marker = document.createElement('div');
    marker.className = 'rp-floor-marker';
    marker.dataset.floor = String(floor);
    const label = document.createElement('span');
    label.className = 'rp-floor-label';
    label.textContent = floor === 0 ? '#0 序章' : `# ${floor}`;
    marker.appendChild(label);
    return marker;
  }

  _refreshAllRpFloorMarkers() {
    if (!this.scrollEl) return;
    this.scrollEl.querySelectorAll('.rp-floor-marker').forEach(el => el.remove());
    if (document.body?.dataset?.uiMode !== 'rp') return;

    let floor = -1;
    const wrappers = this.scrollEl.querySelectorAll('.QQ_chat_mymsg, .QQ_chat_charmsg');
    for (const w of wrappers) {
      const msg = w.__chatappMessage;
      if (!msg) continue;

      let isNewFloor = false;
      if (msg?.meta?.isGreeting) {
        floor = 0;
        isNewFloor = true;
      } else if (msg.role === 'user') {
        floor = Math.max(floor, 0) + 1;
        isNewFloor = true;
      }

      if (floor >= 0) {
        if (!msg.meta) msg.meta = {};
        msg.meta.floor = floor;
        w.dataset.rpFloor = String(floor);
      }

      if (isNewFloor) {
        const marker = document.createElement('div');
        marker.className = 'rp-floor-marker';
        marker.dataset.floor = String(floor);
        const label = document.createElement('span');
        label.className = 'rp-floor-label';
        label.textContent = floor === 0 ? '#0 序章' : `# ${floor}`;
        marker.appendChild(label);
        w.parentNode.insertBefore(marker, w);
      }
    }
    this._rpFloorCount = Math.max(floor, 0);
  }

  cleanupRichTextMounts(rootEl) {
    if (!rootEl) return;
    const seen = new Set();
    const candidates = [];
    if (rootEl.matches?.('.chat-message-content, .QQ_chat_msgdiv')) candidates.push(rootEl);
    rootEl.querySelectorAll?.('.chat-message-content, .QQ_chat_msgdiv').forEach(el => candidates.push(el));
    candidates.forEach(el => {
      if (!el || seen.has(el)) return;
      seen.add(el);
      try {
        cleanupRichText(el);
      } catch {}
    });
  }

  clearInput(options = {}) {
    const shouldFocus = options === true
      || (typeof options === 'object' ? options.focus !== false : options !== false);
    this.inputEl.value = '';
    if (shouldFocus) this.inputEl.focus();
  }

  setSendingState(isSending) {
    this.isSending = Boolean(isSending);
    this.updateSendButtonState();
  }

  setStreamingState(isStreaming) {
    this.isStreaming = Boolean(isStreaming);
    this.updateSendButtonState();
  }

  setSendEnabled(enabled) {
    this.isOnline = Boolean(enabled);
    this.updateSendButtonState();
  }

  updateSendButtonState() {
    if (!this.sendBtn) return;
    const isBusy = this.isSending || this.isStreaming;
    const disabled = !this.isOnline;
    this.sendBtn.disabled = disabled;
    this.sendBtn.classList.toggle('is-generating', isBusy);
    const label = !this.isOnline ? '离线' : (isBusy ? '停止生成' : '发送');
    this.sendBtn.setAttribute('aria-label', label);
    if (this.isOnline) {
      this.sendBtn.classList.remove('is-offline');
    } else {
      this.sendBtn.classList.add('is-offline');
    }
    const contBtn = document.getElementById('rp-continue-btn');
    if (contBtn) contBtn.disabled = isBusy || disabled;
  }

  scrollToBottom() {
    this._programmaticScroll = true;
    this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
    this.scheduleScrollBottomButtonRefresh({ immediate: true });
  }

  scrollToMessage(msgId, options = {}) {
    const id = String(msgId || '').trim();
    if (!id || !this.scrollEl) return false;
    const esc =
      CSS && typeof CSS.escape === 'function' ? CSS.escape : s => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const el = this.scrollEl.querySelector(`[data-msg-id="${esc(id)}"]`);
    if (!el) return false;
    const top = el.offsetTop - 12;
    this.scrollEl.scrollTop = Math.max(0, top);
    this.scheduleScrollBottomButtonRefresh({ immediate: true });
    const autoClearMs = Number.isFinite(Number(options?.autoClearMs))
      ? Number(options.autoClearMs)
      : 2900;
    this.applyJumpFocus(el, {
      keyword: options?.keyword || '',
      kind: options?.kind || (options?.keyword ? 'search' : 'anchor'),
      dismissOnScroll: options?.dismissOnScroll !== false,
      autoClearMs,
    });
    return true;
  }

  /**
   * Render a message bubble - QQ Legacy Structure
   * @param {Object} message
   * @param {'user'|'assistant'|'system'} message.role
   * @param {'text'|'image'|'audio'|'music'|'transfer'|'sticker'|'document'|'meta'} message.type
   * @param {string} message.content
   * @param {string} message.avatar - 头像URL
   * @param {string} message.name - 发送者名称
   * @param {string} message.time - 时间戳
   */
  /**
   * @param {object} message
   * @param {object} [options]
   * @param {boolean} [options.autoScroll] - 是否自动滚动，默认true。
   *   true = 仅在用户已在底部时滚动（Discord风格）。false = 不滚动。
   */
  addMessage(message, options = {}) {
    const original = message;
    message = this.decorateMessage(message, { phase: 'add' });
    if (message && !message.id) {
      message.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }
    // 将生成的 id 同步回原始对象，确保 store 和 DOM 使用同一 id
    if (original && message && original !== message && message.id && !original.id) {
      original.id = message.id;
    }
    const runtime = typeof window !== 'undefined' ? window.appBridge?.pluginRuntime : null;
    const scriptRuntime = typeof window !== 'undefined' ? window.appBridge?.scriptRuntime : null;
    if (runtime) {
      runtime.dispatchEvent('message.before_render', { message }).catch(err => {
        logger.warn('plugin message.before_render failed', err);
      });
    }
    if (scriptRuntime) {
      scriptRuntime.dispatchEvent('message.before_render', { message }).catch(err => {
        logger.warn('script message.before_render failed', err);
      });
    }
    const wasNearBottom = this.isNearBottom();
    const floorMarker = this._createRpFloorMarker(message);
    const el = this.buildMessageElement(message);
    if (el) {
      if (floorMarker) this.scrollEl.appendChild(floorMarker);
      this.scrollEl.appendChild(el);
      if (message?.meta?.floor != null) el.dataset.rpFloor = String(message.meta.floor);
      const shouldScroll = options.autoScroll !== false && wasNearBottom;
      if (shouldScroll) this.scrollToBottom();
    }
    if (runtime && el) {
      runtime.dispatchEvent('message.after_render', { message, elementId: message?.id || '' }).catch(err => {
        logger.warn('plugin message.after_render failed', err);
      });
    }
    if (scriptRuntime && el) {
      scriptRuntime.dispatchEvent('message.after_render', { message, elementId: message?.id || '' }).catch(err => {
        logger.warn('script message.after_render failed', err);
      });
    }
    return el?.querySelector('.QQ_chat_msgdiv') || el;
  }

  buildMessageElement(message) {
    message = this.resolveActiveSwipeMessage(message);
    if (!message?.content && !message?.type) {
      return null;
    }
    if (!message.id) {
      message.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    }
    const resolvedSessionId = this.resolveMessageSessionId(message);
    if (resolvedSessionId && String(message?.sessionId || '').trim() !== resolvedSessionId) {
      message = { ...message, sessionId: resolvedSessionId };
    }

    if (message.role === 'system' && message.type === 'divider') {
      const wrapper = document.createElement('div');
      wrapper.className = 'QQ_chat_sysmsg QQ_chat_unread-divider';
      wrapper.dataset.msgId = message.id;
      wrapper.dataset.role = 'system';
      wrapper.__chatappMessage = message;

      const line = document.createElement('div');
      line.className = 'QQ_chat_unread-line';
      const text = document.createElement('span');
      text.textContent = String(message.content ?? '');
      line.appendChild(text);
      wrapper.appendChild(line);

      return wrapper;
    }

    if (message.role === 'system') {
      const wrapper = document.createElement('div');
      wrapper.className = 'QQ_chat_sysmsg';
      wrapper.dataset.msgId = message.id;
      wrapper.dataset.role = 'system';
      if (Number.isFinite(Number(message?.timestamp)) && Number(message.timestamp) > 0) {
        wrapper.dataset.timestamp = String(Number(message.timestamp));
      }
      wrapper.__chatappMessage = message;

      const bubble = document.createElement('div');
      bubble.className = 'QQ_chat_sysbubble';
      bubble.textContent = String(message.content ?? '');

      const timeEl = document.createElement('span');
      timeEl.className = 'QQ_chat_time sys';
      timeEl.textContent = message.time || '';

      wrapper.appendChild(bubble);
      if (timeEl.textContent) wrapper.appendChild(timeEl);

      wrapper.addEventListener('pointerdown', e => this.startLongPress(e, message));
      wrapper.addEventListener(
        'pointermove',
        e => {
          if (!this.longPressTimer || !this.longPressStart) return;
          const p = this.getPoint(e);
          const dx = p.x - this.longPressStart.x;
          const dy = p.y - this.longPressStart.y;
          if (dx * dx + dy * dy > 10 * 10) this.clearLongPress();
        },
        { passive: true },
      );
      ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
        wrapper.addEventListener(evt, () => this.clearLongPress());
      });
      wrapper.addEventListener(
        'contextmenu',
        e => {
          try {
            e.preventDefault();
          } catch {}
          this.clearLongPress();
          this.showContextMenu(e, message);
        },
        { passive: false },
      );

      return wrapper;
    }

    // 确定消息方向：user 用 QQ_chat_mymsg，其他用 QQ_chat_charmsg
    const isUser = message.role === 'user';
    const wrapper = document.createElement('div');
    wrapper.className = isUser ? 'QQ_chat_mymsg' : 'QQ_chat_charmsg';
    wrapper.dataset.msgId = message.id;
    wrapper.dataset.role = message.role || '';
    if (Number.isFinite(Number(message?.timestamp)) && Number(message.timestamp) > 0) {
      wrapper.dataset.timestamp = String(Number(message.timestamp));
    } else {
      delete wrapper.dataset.timestamp;
    }
    wrapper.__chatappMessage = message;
    if (message?.meta?.floor != null) wrapper.dataset.rpFloor = String(message.meta.floor);
    this.applyCreativeBubbleState(wrapper, message);

    // 添加 pending/sending 状态标记
    if (message.status === 'pending' || message.status === 'sending') {
      wrapper.classList.add('message-pending');
      wrapper.dataset.status = message.status;
    }

    // 头像
    const avatarImg = document.createElement('img');
    avatarImg.className = 'QQ_chat_head';
    avatarImg.src = message.avatar || './assets/external/feather-default.png';
    avatarImg.alt = message.name || '';

    // 消息气泡
    const bubble = document.createElement('div');
    bubble.className = 'QQ_chat_msgdiv';

    switch (message.type) {
      case 'image': {
        const imgSrc = resolveMediaUrl('image', message.content);
        bubble.innerHTML = `<img src="${imgSrc}" alt="image" class="previewable">`;
        const imgEl = bubble.querySelector('img');
        imgEl.addEventListener('click', () => this.openLightbox(imgSrc));
        imgEl.onerror = () => {
          imgEl.classList.add('broken');
          imgEl.alt = '图片加载失败';
          toastOnce('图片加载失败，请检查链接或网络');
        };
        break;
      }
      case 'audio': {
        const audioSrc = resolveMediaUrl('audio', message.content);
        bubble.innerHTML = `
                    <div class="message-toolbar">
                        <span class="chip">语音</span>
                        <audio controls preload="none" style="width: 160px;">
                            <source src="${audioSrc}">
                        </audio>
                    </div>`;
        const audioEl = bubble.querySelector('audio');
        audioEl.onerror = () => {
          toastOnce('语音加载失败');
        };
        break;
      }
      case 'document': {
        const titleText = String(message.content || message.meta?.name || '文件');
        const metaLine = [message.meta?.mime, message.meta?.sizeLabel].filter(Boolean).join(' · ');
        const card = document.createElement('div');
        card.className = 'card file-card';
        const title = document.createElement('div');
        title.className = 'card-title';
        title.textContent = titleText;
        card.appendChild(title);
        if (metaLine) {
          const subtitle = document.createElement('div');
          subtitle.className = 'card-subtitle';
          subtitle.textContent = metaLine;
          card.appendChild(subtitle);
        }
        bubble.appendChild(card);
        break;
      }
      case 'music': {
        const artist = message.meta?.artist || '';
        const rawUrl = message.meta?.url || '';
        const resolved = resolveMediaAsset('audio', rawUrl);
        const url = resolved?.url || rawUrl;
        const statusText = url ? '待播放' : '无音频地址';
        bubble.innerHTML = `
                    <div class="card music-card">
                        <div class="card-title">🎵 ${message.content || '音乐'}</div>
                        ${artist ? `<div class="card-subtitle">${artist}</div>` : ''}
                        <div class="card-status" data-role="status">${statusText}</div>
                        <div class="card-actions">
                            <button class="card-button" data-action="play">播放</button>
                            <button class="card-button" data-action="pause">暂停</button>
                            ${url ? `<span style="font-size:12px;color:#9ca3af;">${url}</span>` : ''}
                        </div>
                        ${url ? `<div class="card-progress" data-role="progress">00:00 / --:--</div>` : ''}
                    </div>
                `;
        const playBtn = bubble.querySelector('[data-action="play"]');
        const pauseBtn = bubble.querySelector('[data-action="pause"]');
        const audio = url ? new Audio(url) : null;
        let playing = false;
        const statusEl = bubble.querySelector('[data-role="status"]');
        const progressEl = bubble.querySelector('[data-role="progress"]');
        if (audio) {
          audio.onerror = () => {
            playing = false;
            playBtn.textContent = '播放';
            if (statusEl) statusEl.textContent = '播放错误';
            window.toastr?.error('音频加载/播放失败');
          };
        }

        const formatTime = (sec = 0) => {
          if (!Number.isFinite(sec)) return '--:--';
          const m = Math.floor(sec / 60)
            .toString()
            .padStart(2, '0');
          const s = Math.floor(sec % 60)
            .toString()
            .padStart(2, '0');
          return `${m}:${s}`;
        };

        const updateProgress = () => {
          if (!audio || !progressEl) return;
          const current = formatTime(audio.currentTime || 0);
          const total = audio.duration ? formatTime(audio.duration) : '--:--';
          progressEl.textContent = `${current} / ${total}`;
        };

        if (audio) {
          audio.addEventListener('timeupdate', updateProgress);
          audio.addEventListener('loadedmetadata', updateProgress);
          audio.addEventListener('ended', () => {
            playing = false;
            playBtn.textContent = '播放';
            if (statusEl) statusEl.textContent = '播放完畢';
            updateProgress();
          });
        }

        playBtn.onclick = () => {
          if (!audio) {
            window.toastr?.warning('无音频地址，播放失败');
            return;
          }
          audio
            .play()
            .then(() => {
              playing = true;
              playBtn.textContent = '播放中';
              if (statusEl) statusEl.textContent = '播放中';
              updateProgress();
            })
            .catch(() => window.toastr?.warning('播放失败'));
        };
        pauseBtn.onclick = () => {
          audio?.pause();
          if (playing) {
            playBtn.textContent = '播放';
            if (statusEl) statusEl.textContent = '已暂停';
            playing = false;
          }
        };
        break;
      }
      case 'transfer':
        bubble.innerHTML = `
                    <div class="card transfer-card">
                        <div class="card-title">转账</div>
                        <div class="card-subtitle">金额：${message.content}</div>
                        <div class="card-status" data-role="status">待确认</div>
                        <div class="card-actions">
                            <button class="card-button" data-action="confirm">确认收款</button>
                        </div>
                    </div>
                `;
        const confirmBtn = bubble.querySelector('[data-action="confirm"]');
        const statusEl = bubble.querySelector('[data-role="status"]');
        confirmBtn.onclick = () => {
          confirmBtn.disabled = true;
          confirmBtn.textContent = '已收款';
          if (statusEl) {
            const stamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            statusEl.textContent = `已收款 ${stamp}`;
          }
          window.toastr?.success(`已确认收款：${message.content}`);
        };
        break;
      case 'sticker': {
        const stickerResolved =
          resolveMediaAsset('sticker', message.content) || resolveMediaAsset('image', message.content);
        if (stickerResolved) {
          const stickerImg = document.createElement('img');
          stickerImg.alt = 'sticker';
          stickerImg.className = 'previewable sticker-image';
          const frames = resolveStickerFrames(stickerResolved, message.content);
          const fps = resolveStickerFps(stickerResolved, message.content);
          const loaded = applyImageFallback(stickerImg, stickerResolved, {
            onFail: () => {
              stickerImg.classList.add('broken');
              stickerImg.alt = '表情包加载失败';
              toastOnce('表情包加载失败');
            },
          });
          if (loaded) {
            if (frames.length > 1) registerStickerAnimation(stickerImg, frames, fps);
            stickerImg.addEventListener('click', () => this.openLightbox(stickerImg.currentSrc || stickerImg.src));
            bubble.innerHTML = '';
            bubble.appendChild(stickerImg);
          } else {
            bubble.innerHTML = `<div class="chip">表情包：${message.content}</div>`;
          }
        } else {
          bubble.innerHTML = `<div class="chip">表情包：${message.content}</div>`;
        }
        break;
      }
      case 'meta':
        bubble.classList.add('meta');
        bubble.textContent = message.content;
        break;
      case 'text':
      default:
        // === 创意写作模式===
        // Safe rich rendering (code fences + html iframe preview)
        if (message?.meta?.renderRich) {
          const target = this.prepareTextContainer(bubble, message);
          if (message?.meta?.isGreeting) {
            logger.info(
              `[rp-greeting] ui-render messageId=${String(message?.id || '')} session=${resolvedSessionId} len=${String(message?.content || '').length}`,
            );
          }
          renderRichText(target, String(message.content ?? ''), {
            messageId: message.id,
            preserveHtmlNewlines: true,
            sessionId: resolvedSessionId,
            debugTag: message?.meta?.isGreeting ? 'rp-greeting' : '',
            lazyMount: message?.__lazyRichMount === true,
          });
          break;
        }
        // === 对话模式（纯文本）===
        {
          const baseText = typeof message.raw === 'string' ? message.raw : message.content;
          const normalized =
            message.role === 'assistant' ? this.normalizeAssistantLineBreaks(baseText) : String(baseText ?? '');
          const target = this.prepareTextContainer(bubble, message);
          if (!this.renderTextWithStickers(target, normalized)) {
            target.textContent = normalized;
            target.style.whiteSpace = 'pre-wrap';
          }
        }
    }

    const bubbleStack = document.createElement('div');
    bubbleStack.className = 'chat-bubble-stack';
    if (isUser) bubbleStack.classList.add('is-user');
    bubbleStack.appendChild(bubble);
    const reactionSummaryEl = this.buildReactionSummaryElement(message);
    if (reactionSummaryEl) bubbleStack.appendChild(reactionSummaryEl);
    if (this.isThreadingEnabledForMessage(message)) {
      const reactionBtn = document.createElement('button');
      reactionBtn.type = 'button';
      reactionBtn.className = 'chat-reaction-trigger';
      reactionBtn.setAttribute('aria-label', '添加回应');
      reactionBtn.textContent = '☺';
      reactionBtn.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        this.showReactionPicker(reactionBtn, message);
      });
      bubbleStack.appendChild(reactionBtn);
    }

    // 时间戳
    const timeEl = document.createElement('span');
    timeEl.className = 'QQ_chat_time';
    timeEl.textContent = message.time || '';

    // 组装 DOM - 符合 QQ 原版结构
    if (isUser) {
      const contentWrap = document.createElement('div');
      contentWrap.className = 'chat-message-stack';
      contentWrap.style.cssText = 'grid-column: 1; display:flex; flex-direction:column; align-items:flex-end; gap:4px; min-width:0;';
      contentWrap.appendChild(bubbleStack);
      // 时间 + 送达状态行
      const timeRow = document.createElement('div');
      timeRow.className = 'chat-time-row';
      const statusEl = document.createElement('span');
      statusEl.className = 'chat-delivery-status';
      // 已发送的历史消息：从 meta.deliveryText 恢复，或默认「已读」
      if (message.status !== 'pending' && message.status !== 'sending') {
        const saved = message.meta?.deliveryText;
        statusEl.textContent = typeof saved === 'string' && saved ? saved : '已读';
      }
      timeRow.appendChild(statusEl);
      timeRow.appendChild(timeEl);
      contentWrap.appendChild(timeRow);
      wrapper.appendChild(contentWrap);
      wrapper.appendChild(avatarImg);
    } else {
      // 别人的消息：头像 +（可选名字）+ 气泡 + 时间
      const contentWrap = document.createElement('div');
      contentWrap.className = 'chat-message-stack';
      contentWrap.style.cssText =
        'grid-column: 2; display:flex; flex-direction:column; align-items:flex-start; gap:4px; min-width:0;';
      if (message?.meta?.showName && message.name) {
        const nameEl = document.createElement('div');
        nameEl.className = 'QQ_chat_name';
        nameEl.textContent = String(message.name || '');
        contentWrap.appendChild(nameEl);
      }
      contentWrap.appendChild(bubbleStack);

      if (document.body?.dataset?.uiMode === 'rp' && message.role === 'assistant' && !message?.meta?.isGreeting) {
        const swipes = Array.isArray(message.meta?.swipes) ? message.meta.swipes : null;
        const total = swipes ? swipes.length : 1;
        const active = swipes ? Math.min(message.meta.activeSwipe || 0, total - 1) : 0;
        const swipeWrap = document.createElement('div');
        swipeWrap.className = 'rp-swipe-indicator';
        swipeWrap.dataset.msgId = message.id;
        const prevBtn = document.createElement('button');
        prevBtn.type = 'button';
        prevBtn.className = 'rp-swipe-prev';
        prevBtn.textContent = '◀';
        prevBtn.disabled = active <= 0;
        prevBtn.setAttribute('aria-label', '上一条回复');
        prevBtn.title = '上一条回复';
        const counter = document.createElement('span');
        counter.className = 'rp-swipe-counter';
        counter.textContent = `${active + 1}/${total}`;
        const nextBtn = document.createElement('button');
        nextBtn.type = 'button';
        nextBtn.className = 'rp-swipe-next';
        nextBtn.textContent = '▶';
        const nextLabel = active >= total - 1 ? '生成新回复' : '下一条回复';
        nextBtn.setAttribute('aria-label', nextLabel);
        nextBtn.title = nextLabel;
        swipeWrap.appendChild(prevBtn);
        swipeWrap.appendChild(counter);
        swipeWrap.appendChild(nextBtn);
        contentWrap.appendChild(swipeWrap);
      }

      contentWrap.appendChild(timeEl);

      wrapper.appendChild(avatarImg);
      wrapper.appendChild(contentWrap);
    }

    // 长按呼出菜单
    wrapper.addEventListener('pointerdown', e => this.startLongPress(e, message));
    wrapper.addEventListener(
      'pointermove',
      e => {
        if (!this.longPressTimer || !this.longPressStart) return;
        const p = this.getPoint(e);
        const dx = p.x - this.longPressStart.x;
        const dy = p.y - this.longPressStart.y;
        if (dx * dx + dy * dy > 10 * 10) this.clearLongPress();
      },
      { passive: true },
    );
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(evt => {
      wrapper.addEventListener(evt, () => this.clearLongPress());
    });
    wrapper.addEventListener(
      'contextmenu',
      e => {
        try {
          e.preventDefault();
        } catch {}
        this.clearLongPress();
        this.showContextMenu(e, message);
      },
      { passive: false },
    );

    // If we're in selection mode, make new messages selectable too.
    if (this.selectionMode && message?.id) {
      setTimeout(() => {
        try {
          const w = this.scrollEl?.querySelector?.(`[data-msg-id="${message.id}"]`);
          if (w) this.markWrapperSelectable(w, message.id);
          this.setSelectionBarVisible(true);
        } catch {}
      }, 0);
    }

    return wrapper;
  }

  /**
   * @param {string} avatarUrl - 单聊头像
   * @param {object} options
   * @param {Array<{name:string, avatar:string}>} [options.groupMembers] - 群聊成员列表，提供时启用多人输入样式
   */
  showTyping(avatarUrl = '', options = {}) {
    if (!this.isTypingDotsEnabled()) return;
    // RP/创意写作模式不显示输入指示器
    if (document.body.dataset.uiMode === 'rp') return;
    if (this.typingEl) return;

    // 清理之前的动态定时器
    this._clearTypingTimers();

    const wrap = document.createElement('div');
    wrap.className = 'typing-indicator-wrap';
    wrap.id = 'typing-indicator';

    const { groupMembers } = options;

    if (Array.isArray(groupMembers) && groupMembers.length > 0) {
      // 群聊多人输入模式：动态随机切换成员
      const avatarStack = document.createElement('div');
      avatarStack.className = 'typing-avatar-stack';

      const labelEl = document.createElement('span');
      labelEl.className = 'typing-group-label';

      const dotsEl = document.createElement('div');
      dotsEl.className = 'typing';
      dotsEl.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

      const contentWrap = document.createElement('div');
      contentWrap.className = 'typing-group-content';
      contentWrap.appendChild(labelEl);
      contentWrap.appendChild(dotsEl);

      wrap.appendChild(avatarStack);
      wrap.appendChild(contentWrap);

      // 初始化 + 动态切换逻辑
      const members = [...groupMembers];
      const cycleMembers = () => {
        const shuffled = members.sort(() => Math.random() - 0.5);
        const count = Math.min(shuffled.length, Math.floor(Math.random() * 3) + 1);
        const selected = shuffled.slice(0, count);

        // 更新头像堆叠（带淡入淡出）
        avatarStack.classList.add('typing-avatar-fade');
        setTimeout(() => {
          avatarStack.innerHTML = '';
          selected.forEach((m, i) => {
            const img = document.createElement('img');
            img.className = 'typing-avatar-item';
            img.src = m.avatar || './assets/external/feather-default.png';
            img.style.zIndex = String(selected.length - i);
            if (i > 0) img.style.marginLeft = '-8px';
            avatarStack.appendChild(img);
          });
          avatarStack.classList.remove('typing-avatar-fade');
        }, 200);

        // 更新文字
        const names = selected.map(m => m.name).join('、');
        labelEl.textContent = `${names} 正在输入`;
      };

      cycleMembers(); // 立即执行一次

      // 动态切换定时器 (0.5-3秒随机间隔，参考手机流式.html)
      const scheduleCycle = () => {
        this._typingCycleTimer = setTimeout(() => {
          cycleMembers();
          scheduleCycle();
        }, Math.random() * 2500 + 500);
      };
      scheduleCycle();
    } else {
      // 单聊模式：「输入中」文字 + dots（不显示头像）
      const labelEl = document.createElement('span');
      labelEl.className = 'typing-private-label';
      labelEl.textContent = '输入中';

      const dotsEl = document.createElement('div');
      dotsEl.className = 'typing';
      dotsEl.innerHTML = '<span class="typing-dot"></span><span class="typing-dot"></span><span class="typing-dot"></span>';

      wrap.appendChild(labelEl);
      wrap.appendChild(dotsEl);

      // 私聊等待时随机思考停顿
      const scheduleThinkPause = () => {
        const interval = 2500 + Math.random() * 4000;
        this._typingThinkTimer = setTimeout(() => {
          if (!this.typingEl || Math.random() > 0.35) {
            scheduleThinkPause();
            return;
          }
          const nearBefore = this.isNearBottom();
          this._applyThinkPause();
          this._typingThinkResumeTimer = setTimeout(() => {
            if (this.typingEl) {
              this._removeThinkPause();
              if (nearBefore) requestAnimationFrame(() => this.scrollToBottom());
            }
            scheduleThinkPause();
          }, 600 + Math.random() * 900);
        }, interval);
      };
      scheduleThinkPause();
    }

    // 首次创建时抑制 transition，避免 height 的「闪入」
    wrap.style.transition = 'none';
    const wasNearBottom = this.isNearBottom();
    this.scrollEl.appendChild(wrap);
    this.typingEl = wrap;
    this._typingNaturalHeight = wrap.offsetHeight;
    wrap.style.transition = '';

    // 不在底部时：在输入框上方显示半透明悬浮版
    if (!wasNearBottom) {
      this._showFloatingTyping(wrap);
    }
    if (wasNearBottom) this.scrollToBottom();
  }

  hideTyping() {
    this._clearTypingTimers();
    this._clearMessageQueueTimer();
    this._removeTypingElement();
  }

  /** 仅移除 typing DOM，不清除定时器（供 enqueueMessages 在同一帧替换用） */
  _removeTypingElement() {
    if (this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
      if (this._floatingTypingEl) {
        this._floatingTypingEl.remove();
        this._floatingTypingEl = null;
      }
      this.scheduleScrollBottomButtonRefresh({ immediate: true });
    }
  }

  _applyThinkPause() {
    if (!this.typingEl) return;
    this.typingEl.style.height = this.typingEl.offsetHeight + 'px';
    this.typingEl.offsetHeight;
    this.typingEl.classList.add('typing-think-pause');
  }

  _removeThinkPause() {
    if (!this.typingEl) return;
    this.typingEl.classList.remove('typing-think-pause');
    this.typingEl.style.height = (this._typingNaturalHeight || 36) + 'px';
    setTimeout(() => { if (this.typingEl) this.typingEl.style.height = ''; }, 200);
  }

  _showFloatingTyping(sourceWrap) {
    if (this._floatingTypingEl) { this._floatingTypingEl.remove(); this._floatingTypingEl = null; }
    const host = this.scrollEl?.parentElement;
    if (!host) return;
    const clone = sourceWrap.cloneNode(true);
    clone.removeAttribute('id');
    clone.className = 'typing-indicator-floating';
    host.appendChild(clone);
    this._floatingTypingEl = clone;
  }

  _clearTypingTimers() {
    if (this._typingCycleTimer) {
      clearTimeout(this._typingCycleTimer);
      this._typingCycleTimer = null;
    }
    if (this._typingThinkTimer) {
      clearTimeout(this._typingThinkTimer);
      this._typingThinkTimer = null;
    }
    if (this._typingThinkResumeTimer) {
      clearTimeout(this._typingThinkResumeTimer);
      this._typingThinkResumeTimer = null;
    }
  }

  _clearDeliverySequence() {
    if (this._deliveryReadTimer) {
      clearTimeout(this._deliveryReadTimer);
      this._deliveryReadTimer = null;
    }
    if (this._deliveryTypingTimer) {
      clearTimeout(this._deliveryTypingTimer);
      this._deliveryTypingTimer = null;
    }
  }

  /**
   * 对最近发送的用户消息显示「✔ 已送出」
   */
  showDeliveryStatus() {
    const statusEls = this.scrollEl?.querySelectorAll?.('.chat-delivery-status') || [];
    [...statusEls].forEach(el => {
      if (!el.textContent.trim()) {
        el.textContent = '✔ 已送出';
      }
    });
  }

  /**
   * 完整送达时序：✔ 已送出 → 已读 → typing dots
   * 已送出/已读 始终显示（与回复动画开关无关）
   * typing dots 受 isTypingDotsEnabled() 控制
   * @param {string} avatarUrl
   * @param {object} typingOptions - 传给 showTyping 的 options
   * @param {object} readOptions - { groupMemberCount }
   */
  startDeliverySequence(avatarUrl = '', typingOptions = {}, readOptions = {}) {
    this._clearDeliverySequence();
    this._deliverySequenceDone = false;

    // 阶段1：0.8-2秒后 → 已读
    const readDelay = Math.random() * 1200 + 800;
    this._deliveryReadTimer = setTimeout(() => {
      this._deliveryReadTimer = null;
      this._markAsRead(readOptions);

      // 阶段2：已读后 0.3-1秒 → typing dots（仅在启用时）
      const typingDelay = Math.random() * 700 + 300;
      this._deliveryTypingTimer = setTimeout(() => {
        this._deliveryTypingTimer = null;
        this._deliverySequenceDone = true;
        this.showTyping(avatarUrl, typingOptions);
      }, typingDelay);
    }, readDelay);
  }

  _syncDeliveryTextToMessages(targets, text) {
    targets.forEach(el => {
      el.textContent = text;
      const wrapper = el.closest?.('[data-msg-id]');
      if (!wrapper) return;
      if (wrapper.__chatappMessage) {
        if (!wrapper.__chatappMessage.meta) wrapper.__chatappMessage.meta = {};
        wrapper.__chatappMessage.meta.deliveryText = text;
      }
      const msgId = wrapper.dataset.msgId;
      if (msgId && this._onDeliveryTextChange) {
        try { this._onDeliveryTextChange(msgId, text); } catch {}
      }
    });
  }

  onDeliveryTextChange(handler) {
    this._onDeliveryTextChange = typeof handler === 'function' ? handler : null;
  }

  /**
   * 将「✔ 已送出」标记为「已读」
   */
  _markAsRead(options = {}) {
    const statusEls = this.scrollEl?.querySelectorAll?.('.chat-delivery-status') || [];
    // 匹配「✔ 已送出」或已经是「已读X」的元素
    const targets = [...statusEls].filter(el => {
      const txt = el.textContent.trim();
      return txt === '✔ 已送出' || txt.startsWith('已读');
    });
    if (!targets.length) return;

    const { groupMemberCount } = options;

    if (groupMemberCount && groupMemberCount > 1) {
      // 群聊：如果已有计数就保留，否则从1开始
      const existing = this._readCountCurrent || 0;
      let current = Math.max(1, existing);
      const softMax = Math.min(groupMemberCount, Math.max(current + 1, Math.ceil(groupMemberCount * (0.3 + Math.random() * 0.3))));
      this._readCountCurrent = current;
      this._readCountTargets = targets;
      this._readCountMax = groupMemberCount;
      this._syncDeliveryTextToMessages(targets, `已读${current}`);

      // 清除旧的递增定时器，重新启动
      if (this._readCountTimer) { clearTimeout(this._readCountTimer); this._readCountTimer = null; }
      const scheduleIncrement = () => {
        if (current >= softMax) return;
        this._readCountTimer = setTimeout(() => {
          current = Math.min(current + 1, softMax);
          this._readCountCurrent = current;
          this._syncDeliveryTextToMessages(targets, `已读${current}`);
          scheduleIncrement();
        }, Math.random() * 3000 + 1500);
      };
      scheduleIncrement();
    } else {
      this._syncDeliveryTextToMessages(targets, '已读');
    }
  }

  /**
   * AI 回复后：根据回复中出现的不同说话者数量提升已读计数
   * @param {number} speakerCount - 本次回复中不同说话者数量
   */
  bumpReadCount(speakerCount) {
    if (!this._readCountTargets?.length || !speakerCount) return;
    const ceiling = this._readCountMax || 999;
    const minCount = Math.min(ceiling, Math.max(speakerCount, this._readCountCurrent || 1));

    // 清除旧定时器
    if (this._readCountTimer) {
      clearTimeout(this._readCountTimer);
      this._readCountTimer = null;
    }

    this._readCountCurrent = minCount;
    this._syncDeliveryTextToMessages(this._readCountTargets, `已读${minCount}`);

    // 继续缓慢递增，上限为 speakerCount + 随机少量（模拟旁观者也在看）
    const max = Math.min(
      this._readCountMax || 999,
      minCount + Math.floor(Math.random() * Math.max(3, Math.ceil(minCount * 0.3))) + 1
    );
    let current = minCount;
    const scheduleMore = () => {
      if (current >= max) return;
      this._readCountTimer = setTimeout(() => {
        current = Math.min(current + 1, max);
        this._readCountCurrent = current;
        this._syncDeliveryTextToMessages(this._readCountTargets, `已读${current}`);
        scheduleMore();
      }, Math.random() * 4000 + 2000);
    };
    scheduleMore();
  }

  /**
   * 快进送达序列：如果 AI 回复在序列完成前就到达，
   * 立刻显示「已读」并跳过 typing dots
   */
  fastForwardDeliverySequence(readOptions = {}) {
    this._clearDeliverySequence();
    this._markAsRead(readOptions);
    this._deliverySequenceDone = true;
  }

  /**
   * 逐条延迟输出消息队列（模拟真人逐条发送）
   * @param {Array<{message: object, callback?: function}>} items - 消息 + 可选回调
   * @param {object} [options]
   * @param {string} [options.avatarUrl] - typing dots 头像
   * @param {object} [options.typingOptions] - showTyping 的 options
   * @returns {{ cancel: function, promise: Promise }}
   */
  enqueueMessages(items, options = {}) {
    let cancelled = false;
    const cancel = () => {
      cancelled = true;
      this._clearMessageQueueTimer();
      this.hideTyping();
    };

    // 模拟真人打字延迟：
    // 手机中文平均 ~35字/分钟 ≈ 1.7秒/字，但用户不会逐字感知
    // 模拟的是"读+想+打+发送"的完整周期
    const calcDelay = (charCount) => {
      // 短句(<20字)：1.5-3.5秒（快速回复）
      // 中句(20-60字)：3-5.5秒（正常打字）
      // 长句(>60字)：4.5-7秒（需要打比较久，但封顶避免太慢）
      const base = Math.min(charCount * 60, 5500) + 1200;
      const jitter = (Math.random() - 0.5) * 1200;
      return Math.max(1500, base + jitter);
    };

    const promise = (async () => {
      for (let i = 0; i < items.length; i++) {
        if (cancelled) break;
        const item = items[i];
        const isLast = i === items.length - 1;

        if (i > 0) {
          const prevContent = String(items[i - 1]?.message?.content || '');
          const delay = calcDelay(prevContent.length);
          const isPrivate = !Array.isArray(options.typingOptions?.groupMembers) || options.typingOptions.groupMembers.length === 0;

          this.showTyping(options.avatarUrl || '', options.typingOptions || {});
          // 清除 showTyping 自带的思考停顿定时器，enqueue 自己管理停顿节奏
          if (this._typingThinkTimer) { clearTimeout(this._typingThinkTimer); this._typingThinkTimer = null; }
          if (this._typingThinkResumeTimer) { clearTimeout(this._typingThinkResumeTimer); this._typingThinkResumeTimer = null; }

          // 私聊 + 延迟够长时，随机插入 1-2 次「思考停顿」（淡出下沉 → 淡入浮现）
          if (isPrivate && delay >= 1500 && Math.random() < 0.3) {
            const pauseCount = delay >= 3000 && Math.random() < 0.4 ? 2 : 1;
            const segments = pauseCount + 1;
            const segmentBase = delay / (segments + pauseCount * 0.4);

            for (let p = 0; p < pauseCount; p++) {
              if (cancelled) break;
              const nearBottom = this.isNearBottom();
              const typingTime = segmentBase * (0.8 + Math.random() * 0.4);
              await new Promise(r => { this._messageQueueTimer = setTimeout(r, typingTime); });
              if (cancelled) break;
              this._applyThinkPause();
              const pauseTime = 600 + Math.random() * 900;
              await new Promise(r => { this._messageQueueTimer = setTimeout(r, pauseTime); });
              if (cancelled) break;
              this._removeThinkPause();
              if (nearBottom) requestAnimationFrame(() => this.scrollToBottom());
            }
            if (!cancelled) {
              const remaining = segmentBase * (0.8 + Math.random() * 0.4);
              await new Promise(r => { this._messageQueueTimer = setTimeout(r, remaining); });
            }
          } else {
            await new Promise(r => { this._messageQueueTimer = setTimeout(r, delay); });
          }
          if (cancelled) break;
          this._removeTypingElement();
        }

        this.addMessage(item.message);
        if (typeof item.callback === 'function') {
          try { item.callback(item.message); } catch {}
        }
      }

      // 彩蛋：~20% 概率在最后一条消息后短暂出现 typing dots 再消失
      // 模拟「对方正在打字…算了不发了」的真实社交体验
      if (!cancelled && items.length > 1 && Math.random() < 0.2) {
        await new Promise(r => { this._messageQueueTimer = setTimeout(r, 800 + Math.random() * 1500); });
        if (!cancelled) {
          this.showTyping(options.avatarUrl || '', options.typingOptions || {});
          await new Promise(r => { this._messageQueueTimer = setTimeout(r, 1500 + Math.random() * 2500); });
          if (!cancelled) {
            this._applyThinkPause();
            await new Promise(r => { this._messageQueueTimer = setTimeout(r, 200); });
            this.hideTyping();
          }
        }
      }
    })();

    return { cancel, promise };
  }

  _clearMessageQueueTimer() {
    if (this._messageQueueTimer) {
      clearTimeout(this._messageQueueTimer);
      this._messageQueueTimer = null;
    }
  }

  /**
   * Start a streaming assistant bubble
   */
  startAssistantStream(meta = {}) {
    const placeholder = {
      role: 'assistant',
      type: 'text',
      content: ' ',
      avatar: meta.avatar,
      name: meta.name,
      time: meta.time,
    };
    const messageEl = this.addMessage(placeholder);
    const wrapperEl = messageEl?.closest?.('.QQ_chat_charmsg, .QQ_chat_mymsg') || messageEl?.parentElement || null;
    const msgId = wrapperEl?.dataset?.msgId || placeholder.id || meta?.id || '';
    // Default: show typing animation inside the streaming bubble (avoid an extra placeholder bubble)
    if (wrapperEl) {
      wrapperEl.dataset.typingPlaceholder = '1';
    }
    if (meta?.typing !== false && messageEl && this.isTypingDotsEnabled()) {
      messageEl.innerHTML = `
                <div class="typing">
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                    <span class="typing-dot"></span>
                </div>
            `;
    } else if (messageEl) {
      messageEl.textContent = '';
    }
    const raf = cb => {
      try {
        if (typeof window !== 'undefined' && window.requestAnimationFrame) return window.requestAnimationFrame(cb);
      } catch {}
      return setTimeout(cb, 16);
    };
    const caf = id => {
      try {
        if (typeof window !== 'undefined' && window.cancelAnimationFrame) return window.cancelAnimationFrame(id);
      } catch {}
      clearTimeout(id);
    };
    let updateHandle = null;
    let pendingText = '';
    const bufferIndex = this.messageBuffer.push({ role: 'assistant', type: 'text', content: '' }) - 1;
    this.setStreamingState(true);
    return {
      id: msgId,
      update: text => {
        // Keep streaming lightweight (avoid re-parsing markdown/code each token)
        pendingText = String(text ?? '');
        this.messageBuffer[bufferIndex].content = pendingText;
        if (updateHandle != null) return;
        updateHandle = raf(() => {
          const next = pendingText;
          updateHandle = null;
          if (!messageEl || !messageEl.isConnected) return;
          if (wrapperEl?.dataset?.typingPlaceholder) {
            delete wrapperEl.dataset.typingPlaceholder;
          }
          messageEl.textContent = this.normalizeAssistantLineBreaks(next);
          messageEl.style.whiteSpace = 'pre-wrap';
          if (this.isNearBottom()) this.scrollToBottom();
        });
      },
      finish: finalMessage => {
        this.setStreamingState(false);
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        this.finishMessageDom(messageEl, wrapperEl, finalMessage, bufferIndex, msgId, meta, placeholder);
      },
      cancel: (options = {}) => {
        const keepPartial = Boolean(options && options.keepPartial);
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        const rawText = String(this.messageBuffer?.[bufferIndex]?.content ?? pendingText ?? '');
        const hasText = rawText.trim().length > 0;
        if (keepPartial && hasText) {
          const partial = {
            ...(this.messageBuffer?.[bufferIndex] || placeholder),
            role: 'assistant',
            type: 'text',
            id: msgId || this.messageBuffer?.[bufferIndex]?.id || placeholder.id,
            content: this.normalizeAssistantLineBreaks(rawText),
            raw: rawText,
            rawOriginal: rawText,
            meta: {
              ...((this.messageBuffer?.[bufferIndex] && this.messageBuffer[bufferIndex].meta) || {}),
              partial: true,
              cancelled: true,
            },
          };
          this.setStreamingState(false);
          this.finishMessageDom(messageEl, wrapperEl, partial, bufferIndex, msgId, meta, placeholder);
          return partial;
        }

        this.isStreaming = false;
        this.updateSendButtonState();
        try {
          wrapperEl?.remove?.();
        } catch {}
        try {
          this.messageBuffer.splice(bufferIndex, 1);
        } catch {}
        return null;
      },
    };
  }

  finishMessageDom(messageEl, wrapperEl, finalMessage, bufferIndex, msgId, meta, placeholder) {
    if (finalMessage && finalMessage.type && finalMessage.type !== 'text') {
      const parent = messageEl.parentElement?.parentElement || messageEl.parentElement;
      parent?.remove();
      this.addMessage(finalMessage);
      this.messageBuffer[bufferIndex] = finalMessage;
      return;
    }
    const fm = finalMessage || this.messageBuffer[bufferIndex];
    if (wrapperEl) {
      wrapperEl.__chatappMessage = {
        ...(wrapperEl.__chatappMessage || placeholder),
        ...(fm || {}),
        id: msgId || fm?.id || placeholder.id,
      };
      this.applyCreativeBubbleState(wrapperEl, fm);
    }
    this.messageBuffer[bufferIndex] = fm;
    try {
      const text = String(fm?.content ?? '');
      const target = this.prepareTextContainer(messageEl, fm);
      if (fm?.meta?.renderRich) {
        renderRichText(target, text, {
          messageId: msgId || fm?.id || meta?.id,
          preserveHtmlNewlines: true,
          sessionId: fm?.sessionId,
          debugTag: fm?.meta?.isGreeting ? 'rp-greeting' : '',
          lazyMount: false,
        });
      } else {
        const normalized = this.normalizeAssistantLineBreaks(text);
        if (!this.renderTextWithStickers(target, normalized)) {
          target.textContent = normalized;
          target.style.whiteSpace = 'pre-wrap';
        }
      }
    } catch {}
  }

  preloadHistory(messages = [], { keepScroll = false } = {}) {
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length || !this.scrollEl) return;
    const eagerTailCount = 8;
    const eagerStart = Math.max(0, list.length - eagerTailCount);
    const isRp = document.body?.dataset?.uiMode === 'rp';
    const fragment = document.createDocumentFragment();
    for (let idx = 0; idx < list.length; idx += 1) {
      const msg = list[idx];
      if (isRp) {
        const fm = this._createRpFloorMarker(msg);
        if (fm) fragment.appendChild(fm);
      }
      const el = this.buildMessageElement({
        role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
        type: msg.type || 'text',
        content: msg.content,
        name: msg.name,
        avatar: msg.avatar,
        time: msg.time,
        timestamp: msg.timestamp,
        meta: msg.meta,
        badge: msg.badge,
        id: msg.id,
        status: msg.status,
        sessionId: msg.sessionId,
        __lazyRichMount: Boolean(msg?.meta?.renderRich) && idx < eagerStart,
      });
      if (el) {
        if (isRp && msg.meta?.floor != null) el.dataset.rpFloor = String(msg.meta.floor);
        fragment.appendChild(el);
      }
    }
    this.scrollEl.appendChild(fragment);
    if (!keepScroll) this.scrollToBottom();
    this.refreshScrollDateBadge();
    this.scheduleScrollBottomButtonRefresh({ immediate: true });
  }

  prependHistory(messages = []) {
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length || !this.scrollEl) return;
    const beforeHeight = this.scrollEl.scrollHeight;
    const beforeTop = this.scrollEl.scrollTop;

    const fragment = document.createDocumentFragment();
    for (const msg of list) {
      const el = this.buildMessageElement({
        role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
        type: msg.type || 'text',
        content: msg.content,
        name: msg.name,
        avatar: msg.avatar,
        time: msg.time,
        timestamp: msg.timestamp,
        meta: msg.meta,
        badge: msg.badge,
        id: msg.id,
        status: msg.status,
        sessionId: msg.sessionId,
        __lazyRichMount: Boolean(msg?.meta?.renderRich),
      });
      if (el) fragment.appendChild(el);
    }

    const first = this.scrollEl.firstChild;
    if (first) this.scrollEl.insertBefore(fragment, first);
    else this.scrollEl.appendChild(fragment);

    if (document.body?.dataset?.uiMode === 'rp') this._refreshAllRpFloorMarkers();

    const afterHeight = this.scrollEl.scrollHeight;
    const delta = afterHeight - beforeHeight;
    this.scrollEl.scrollTop = beforeTop + delta;
    this.refreshScrollDateBadge();
    this.scheduleScrollBottomButtonRefresh({ immediate: true });
  }

  refreshAvatars(resolver) {
    if (!this.scrollEl || typeof resolver !== 'function') return;
    const list = this.scrollEl.querySelectorAll('.QQ_chat_mymsg, .QQ_chat_charmsg');
    list.forEach(wrapper => {
      const msg = wrapper.__chatappMessage;
      const img = wrapper.querySelector('img.QQ_chat_head');
      if (!img) return;
      const src = resolver(msg);
      if (src && img.src !== src) img.src = src;
    });
  }

  removeMessage(msgId) {
    const el = this.scrollEl.querySelector(`[data-msg-id="${msgId}"]`);
    if (el) {
      this.cleanupRichTextMounts(el);
      el.remove();
      this.refreshScrollDateBadge();
      this.scheduleScrollBottomButtonRefresh({ immediate: true });
    }
  }

  updateMessage(msgId, newMessage) {
    const existing = this.scrollEl.querySelector(`[data-msg-id="${msgId}"]`);
    if (!existing) return;
    const prev = existing.__chatappMessage && typeof existing.__chatappMessage === 'object'
      ? existing.__chatappMessage
      : {};
    const resolvedSessionId =
      String(newMessage?.sessionId || '').trim()
      || String(prev?.sessionId || '').trim()
      || this.resolveMessageSessionId(prev);
    const next = this.resolveActiveSwipeMessage(this.decorateMessage(
      { ...prev, ...(newMessage || {}), id: msgId, sessionId: resolvedSessionId },
      { phase: 'update', previous: prev },
    ));
    if (this.tryPatchMessageElement(existing, next)) {
      this.refreshScrollDateBadge();
      this.scheduleScrollBottomButtonRefresh({ immediate: true });
      return existing;
    }
    const newEl = this.buildMessageElement(next);
    if (newEl) {
      this.cleanupRichTextMounts(existing);
      existing.replaceWith(newEl);
      this.refreshScrollDateBadge();
      this.scheduleScrollBottomButtonRefresh({ immediate: true });
    }
  }

  getMessageRenderSignature(message) {
    const msg = this.resolveActiveSwipeMessage(message && typeof message === 'object' ? message : {});
    const meta = msg.meta && typeof msg.meta === 'object' ? msg.meta : {};
    const rawSource =
      typeof msg.rawSource === 'string'
        ? msg.rawSource
        : (typeof msg.raw_source === 'string' ? msg.raw_source : '');
    const swipes = Array.isArray(meta.swipes) ? meta.swipes : null;
    return JSON.stringify({
      role: String(msg.role || ''),
      type: String(msg.type || 'text'),
      content: typeof msg.content === 'string' ? msg.content : '',
      raw: typeof msg.raw === 'string' ? msg.raw : '',
      rawSource,
      activeSwipe: swipes ? Math.min(Math.max(0, Math.trunc(Number(meta.activeSwipe)) || 0), swipes.length - 1) : 0,
      swipeCount: swipes ? swipes.length : 0,
      renderRich: meta.renderRich === true,
      isGreeting: meta.isGreeting === true,
      showName: meta.showName === true,
      reasoning: typeof meta.reasoning === 'string' ? meta.reasoning : '',
      reasoningDisplay: typeof meta.reasoningDisplay === 'string' ? meta.reasoningDisplay : '',
      reasoningHidden: meta.reasoningHidden === true,
      summary: typeof meta.summary === 'string' ? meta.summary : '',
      replyTo: normalizeReplyTarget(meta.replyTo),
      reactions: normalizeReactionEntries(meta.reactions),
      name: typeof msg.name === 'string' ? msg.name : '',
      badge: typeof msg.badge === 'string' ? msg.badge : '',
    });
  }

  patchMessageChrome(existing, next) {
    if (!existing || !next) return;
    existing.__chatappMessage = next;
    existing.dataset.msgId = String(next.id || '');
    existing.dataset.role = String(next.role || '');
    if (Number.isFinite(Number(next?.timestamp)) && Number(next.timestamp) > 0) {
      existing.dataset.timestamp = String(Number(next.timestamp));
    } else {
      delete existing.dataset.timestamp;
    }
    if (next.status === 'pending' || next.status === 'sending') {
      existing.classList.add('message-pending');
      existing.dataset.status = String(next.status || '');
    } else {
      existing.classList.remove('message-pending');
      delete existing.dataset.status;
      // 状态从 pending/sending 变为已发送时，显示"✔ 已送出"
      if (next.role === 'user') {
        const statusEl = existing.querySelector('.chat-delivery-status');
        if (statusEl && !statusEl.textContent && existing.dataset.trackDelivery) {
          statusEl.textContent = '✔ 已送出';
        }
      }
    }
    this.applyCreativeBubbleState(existing, next);

    const avatarImg = existing.querySelector('img.QQ_chat_head');
    if (avatarImg && typeof next.avatar === 'string' && next.avatar.trim()) {
      avatarImg.src = next.avatar;
    }

    const nameEl = existing.querySelector('.QQ_chat_name');
    if (nameEl && typeof next.name === 'string') {
      nameEl.textContent = next.name;
    }

    const timeEls = existing.querySelectorAll('.QQ_chat_time');
    const timeEl = timeEls.length ? timeEls[timeEls.length - 1] : null;
    if (timeEl) {
      timeEl.textContent = next.time || '';
    }
  }

  tryPatchMessageElement(existing, next) {
    if (!existing || !next) return false;
    const prev = existing.__chatappMessage && typeof existing.__chatappMessage === 'object'
      ? existing.__chatappMessage
      : null;
    if (!prev) return false;
    if (String(prev.role || '') !== String(next.role || '')) return false;
    if (String(prev.type || 'text') !== String(next.type || 'text')) return false;
    if (this.getMessageRenderSignature(prev) !== this.getMessageRenderSignature(next)) return false;
    this.patchMessageChrome(existing, next);
    return true;
  }

  onMessageAction(handler) {
    this.actionHandler = handler;
  }

  startLongPress(event, message) {
    if (this.selectionMode) return;
    this.clearLongPress();
    const p = this.getPoint(event);
    this.longPressStart = p;
    this.longPressTimer = setTimeout(() => {
      this.showContextMenu(event, message);
    }, 500);
  }

  clearLongPress() {
    if (this.longPressTimer) {
      clearTimeout(this.longPressTimer);
      this.longPressTimer = null;
    }
    this.longPressStart = null;
  }

  ensureSelectionBar() {
    if (this.selectionBar) return;
    const bar = document.createElement('div');
    bar.id = 'chat-batch-delete-bar';
    bar.style.cssText = `
            display:none;
            position: fixed;
            left: 12px;
            right: 12px;
            top: calc(56px + env(safe-area-inset-top, 0px) + 8px);
            z-index: 22000;
            background: rgba(255,255,255,0.96);
            border: 1px solid rgba(0,0,0,0.08);
            border-radius: 14px;
            box-shadow: 0 10px 30px rgba(0,0,0,0.18);
            padding: 10px;
            display:flex;
            align-items:center;
            gap: 10px;
            box-sizing: border-box;
        `;
    bar.innerHTML = `
            <button data-role="cancel" style="border:1px solid rgba(0,0,0,0.10); background:var(--app-surface-card); border-radius:12px; padding:8px 12px;">取消</button>
            <div data-role="count" style="flex:1; font-weight:800; color:var(--app-text-primary);">已选择 0 条</div>
            <button data-role="delete" style="border:none; background:#ef4444; color:var(--app-text-inverse); border-radius:12px; padding:8px 14px; font-weight:800;">删除</button>
        `;
    bar.querySelector('[data-role="cancel"]')?.addEventListener('click', e => {
      e.stopPropagation();
      this.exitSelectionMode();
    });
    bar.querySelector('[data-role="delete"]')?.addEventListener('click', e => {
      e.stopPropagation();
      const ids = [...this.selectedMessageIds];
      if (!ids.length) {
        window.toastr?.info?.('请选择要删除的消息');
        return;
      }
      this.actionHandler?.('delete-selected', null, { ids });
      this.exitSelectionMode();
    });
    document.body.appendChild(bar);
    this.selectionBar = bar;
  }

  setSelectionBarVisible(visible) {
    this.ensureSelectionBar();
    if (!this.selectionBar) return;
    this.selectionBar.style.display = visible ? 'flex' : 'none';
    if (!visible) return;
    const countEl = this.selectionBar.querySelector('[data-role="count"]');
    const delBtn = this.selectionBar.querySelector('[data-role="delete"]');
    const n = this.selectedMessageIds.size;
    if (countEl) countEl.textContent = `已选择 ${n} 条`;
    if (delBtn) delBtn.disabled = n === 0;
    if (delBtn) delBtn.style.opacity = n === 0 ? '0.6' : '1';
  }

  updateWrapperSelectionState(wrapper, msgId) {
    const selected = this.selectedMessageIds.has(msgId);
    const dot = wrapper?.__chatappSelectDot;
    if (!dot) return;
    if (selected) {
      dot.style.background = '#2563eb';
      dot.style.borderColor = '#2563eb';
      dot.textContent = '✓';
    } else {
      dot.style.background = 'rgba(255,255,255,0.92)';
      dot.style.borderColor = 'rgba(0,0,0,0.22)';
      dot.textContent = '';
    }
    wrapper.style.paddingLeft = '30px';
  }

  markWrapperSelectable(wrapper, msgId) {
    if (!wrapper || !msgId) return;
    const role = String(wrapper.dataset?.role || '');
    if (role === 'system') return;
    wrapper.style.position = 'relative';
    wrapper.classList.add('chat-selectable');

    if (!wrapper.__chatappSelectDot) {
      const dot = document.createElement('div');
      dot.className = 'chat-select-dot';
      dot.style.cssText = `
                position:absolute;
                left: 6px;
                top: 50%;
                transform: translateY(-50%);
                width: 22px;
                height: 22px;
                border-radius: 999px;
                border: 2px solid rgba(0,0,0,0.22);
                background: rgba(255,255,255,0.92);
                display:flex;
                align-items:center;
                justify-content:center;
                font-size: 14px;
                color: var(--app-text-inverse);
                pointer-events: none;
                box-sizing: border-box;
            `;
      wrapper.appendChild(dot);
      wrapper.__chatappSelectDot = dot;
    }

    if (!wrapper.__chatappSelectClick) {
      const handler = e => {
        if (!this.selectionMode) return;
        try {
          e.preventDefault();
        } catch {}
        try {
          e.stopPropagation();
        } catch {}
        this.toggleMessageSelection(msgId);
      };
      wrapper.__chatappSelectClick = handler;
      wrapper.addEventListener('click', handler, true);
    }

    this.updateWrapperSelectionState(wrapper, msgId);
  }

  enterSelectionMode(initialMsgId) {
    this.selectionMode = true;
    this.selectedMessageIds = new Set();
    if (initialMsgId) this.selectedMessageIds.add(String(initialMsgId));
    this.setSelectionBarVisible(true);

    const wrappers = this.scrollEl?.querySelectorAll?.('[data-msg-id]') || [];
    wrappers.forEach(w => {
      const id = String(w.dataset?.msgId || '');
      if (!id) return;
      this.markWrapperSelectable(w, id);
    });
    this.setSelectionBarVisible(true);
  }

  exitSelectionMode() {
    this.selectionMode = false;
    this.selectedMessageIds = new Set();
    this.setSelectionBarVisible(false);
    const wrappers = this.scrollEl?.querySelectorAll?.('[data-msg-id].chat-selectable') || [];
    wrappers.forEach(w => {
      try {
        w.classList.remove('chat-selectable');
      } catch {}
      try {
        w.style.paddingLeft = '';
      } catch {}
      try {
        if (w.__chatappSelectClick) {
          w.removeEventListener('click', w.__chatappSelectClick, true);
        }
      } catch {}
      w.__chatappSelectClick = null;
      try {
        w.__chatappSelectDot?.remove?.();
      } catch {}
      w.__chatappSelectDot = null;
    });
  }

  toggleMessageSelection(msgId) {
    const id = String(msgId || '');
    if (!id) return;
    if (this.selectedMessageIds.has(id)) this.selectedMessageIds.delete(id);
    else this.selectedMessageIds.add(id);
    const w = this.scrollEl?.querySelector?.(`[data-msg-id="${id}"]`);
    if (w) this.updateWrapperSelectionState(w, id);
    this.setSelectionBarVisible(true);
  }

  createContextMenu() {
    const menu = document.createElement('div');
    menu.id = 'msg-context-menu';
    menu.style.cssText = `
            position: fixed;
            background: var(--app-surface-card);
            border: 1px solid var(--app-border-default);
            border-radius: 10px;
            box-shadow: 0 8px 30px rgba(0,0,0,0.12);
            padding: 6px;
            display: none;
            z-index: 20000;
            min-width: 120px;
        `;
    document.body.appendChild(menu);
    document.addEventListener(
      'pointerdown',
      e => {
        if (menu.style.display === 'none') return;
        if (menu.contains(e.target)) return;
        menu.style.display = 'none';
      },
      { passive: true },
    );
    return menu;
  }

  createReactionPicker() {
    const picker = document.createElement('div');
    picker.id = 'msg-reaction-picker';
    picker.style.cssText = `
            position: fixed;
            display: none;
            z-index: 20010;
            padding: 6px;
            border-radius: 999px;
            border: 1px solid rgba(15, 23, 42, 0.08);
            background: rgba(255, 255, 255, 0.98);
            box-shadow: 0 10px 28px rgba(15, 23, 42, 0.16);
            gap: 4px;
            align-items: center;
        `;
    document.body.appendChild(picker);
    document.addEventListener(
      'pointerdown',
      e => {
        if (picker.style.display === 'none') return;
        if (picker.contains(e.target)) return;
        this.hideReactionPicker();
      },
      { passive: true },
    );
    return picker;
  }

  hideReactionPicker() {
    if (!this.reactionPicker) return;
    this.reactionPicker.style.display = 'none';
    this.reactionPicker.innerHTML = '';
  }

  isThreadingEnabledForMessage(message) {
    if (!message || typeof message !== 'object') return false;
    if (message.role !== 'user' && message.role !== 'assistant') return false;
    if (message.status === 'pending' || message.status === 'sending') return false;
    const sessionId = this.resolveMessageSessionId(message);
    if (String(sessionId || '').trim().startsWith('rp:')) return false;
    if (document?.body?.dataset?.uiMode === 'rp') return false;
    return true;
  }

  initReplyDraftBar() {
    if (!this.inputContainer || this.replyDraftEl) return;
    const bar = document.createElement('div');
    bar.className = 'chat-reply-draft';
    bar.style.display = 'none';
    this.inputContainer.insertBefore(bar, this.composerAttachmentsEl || this.inputContainer.firstChild || null);
    this.replyDraftEl = bar;
  }

  setReplyTarget(target) {
    if (!this.replyDraftEl) return;
    const next = normalizeReplyTarget(target);
    if (!next) {
      this.replyDraftEl.style.display = 'none';
      this.replyDraftEl.innerHTML = '';
      return;
    }
    const avatar = next.avatar || DEFAULT_REPLY_AVATAR;
    this.replyDraftEl.style.display = '';
    this.replyDraftEl.innerHTML = '';
    const main = document.createElement('div');
    main.className = 'chat-reply-draft-main';
    const avatarEl = document.createElement('img');
    avatarEl.className = 'chat-reply-draft-avatar';
    avatarEl.src = avatar;
    avatarEl.alt = '';
    const textWrap = document.createElement('div');
    textWrap.className = 'chat-reply-draft-text';
    const author = document.createElement('div');
    author.className = 'chat-reply-draft-author';
    author.textContent = next.author || '消息';
    const snippet = document.createElement('div');
    snippet.className = 'chat-reply-draft-snippet';
    snippet.textContent = next.content || '...';
    textWrap.appendChild(author);
    textWrap.appendChild(snippet);
    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'chat-reply-draft-cancel';
    cancelBtn.setAttribute('aria-label', '取消回复');
    cancelBtn.textContent = '×';
    main.appendChild(avatarEl);
    main.appendChild(textWrap);
    main.appendChild(cancelBtn);
    this.replyDraftEl.appendChild(main);
    cancelBtn.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      this.replyCancelHandler?.();
    });
  }

  onReplyCancel(handler) {
    this.replyCancelHandler = typeof handler === 'function' ? handler : null;
  }

  getPoint(e) {
    if (e?.touches?.[0]) return { x: e.touches[0].clientX, y: e.touches[0].clientY };
    if (e?.changedTouches?.[0]) return { x: e.changedTouches[0].clientX, y: e.changedTouches[0].clientY };
    return { x: e?.clientX ?? 0, y: e?.clientY ?? 0 };
  }

  async copyToClipboard(text) {
    const s = String(text ?? '');
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(s);
        return true;
      }
    } catch {}
    try {
      const ta = document.createElement('textarea');
      ta.value = s;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      ta.style.top = '0';
      ta.setAttribute('readonly', 'true');
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }

  getBubbleCopyText(wrapper) {
    if (!wrapper || typeof wrapper.querySelector !== 'function') return '';
    const bubble = wrapper.querySelector('.QQ_chat_msgdiv');
    if (!bubble) return '';
    const clone = bubble.cloneNode(true);
    try {
      clone.querySelectorAll('.chat-codeblock, iframe, details, summary, script, style').forEach(node => node.remove());
    } catch {}
    const raw = clone.innerText ?? clone.textContent ?? '';
    return String(raw || '')
      .replace(/\n{3,}/g, '\n\n')
      .trim();
  }

  openCodeViewer({ message = null, text = '' } = {}) {
    const msg = message && typeof message === 'object' ? message : null;
    const content = String(text ?? '');
    const canSave = msg?.role === 'assistant' && typeof this.actionHandler === 'function';

    if (!this.__chatappCodeViewer) {
      const overlay = document.createElement('div');
      overlay.id = 'code-viewer-modal';
      overlay.style.cssText = `
                position: fixed;
                inset: 0;
                z-index: 22000;
                display: none;
                background: rgba(0,0,0,0.32);
                padding: calc(14px + env(safe-area-inset-top)) 14px calc(14px + env(safe-area-inset-bottom)) 14px;
                box-sizing: border-box;
            `;

      const panel = document.createElement('div');
      panel.style.cssText = `
                height: 100%;
                background: var(--app-surface-card);
                border-radius: 14px;
                box-shadow: 0 18px 50px rgba(0,0,0,0.18);
                overflow: hidden;
                display: flex;
                flex-direction: column;
            `;
      panel.addEventListener('click', e => e.stopPropagation());

      const header = document.createElement('div');
      header.style.cssText = `
                display: flex;
                align-items: center;
                justify-content: space-between;
                gap: 10px;
                padding: 12px 12px;
                background: #f3f4f6;
                border-bottom: 1px solid var(--app-border-default);
            `;
      const title = document.createElement('div');
      title.style.cssText = 'font-size:14px; font-weight:700; color:var(--app-text-primary);';
      title.textContent = '原回复';

      const hint = document.createElement('div');
      hint.style.cssText =
        'font-size:12px; color:#6b7280; margin-left:auto; max-width: 55vw; overflow:hidden; text-overflow: ellipsis; white-space: nowrap;';
      hint.dataset.role = 'hint';
      hint.textContent = '未套用正则';

      const closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.textContent = '取消';
      closeBtn.style.cssText = `
                border: 1px solid var(--app-border-default);
                background: var(--app-surface-card);
                color: var(--app-text-primary);
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 13px;
            `;

      const saveBtn = document.createElement('button');
      saveBtn.type = 'button';
      saveBtn.textContent = '保存';
      saveBtn.dataset.role = 'save';
      saveBtn.style.cssText = `
                border: 1px solid #3b82f6;
                background: #3b82f6;
                color: var(--app-text-inverse);
                border-radius: 10px;
                padding: 6px 10px;
                font-size: 13px;
            `;

      const body = document.createElement('div');
      body.style.cssText = `
                flex: 1;
                overflow: auto;
                -webkit-overflow-scrolling: touch;
                background: #0b1220;
                padding: 12px;
            `;
      const ta = document.createElement('textarea');
      ta.dataset.role = 'code';
      ta.spellcheck = false;
      ta.autocapitalize = 'off';
      ta.autocomplete = 'off';
      ta.autocorrect = 'off';
      ta.style.cssText = `
                width: 100%;
                height: 100%;
                min-height: 100%;
                resize: none;
                border: none;
                outline: none;
                background: transparent;
                color: #e2e8f0;
                font-size: 12px;
                line-height: 1.45;
                font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace;
                white-space: pre-wrap;
                overflow-wrap: anywhere;
                word-break: break-word;
            `;
      body.appendChild(ta);

      header.appendChild(title);
      header.appendChild(hint);
      header.appendChild(closeBtn);
      header.appendChild(saveBtn);
      panel.appendChild(header);
      panel.appendChild(body);
      overlay.appendChild(panel);

      const hide = () => {
        overlay.style.display = 'none';
        overlay.__chatappMessage = null;
      };
      overlay.addEventListener('click', hide);
      closeBtn.addEventListener('click', hide);
      window.addEventListener('keydown', e => {
        if (overlay.style.display !== 'none' && e.key === 'Escape') hide();
      });
      saveBtn.addEventListener('click', () => {
        const m = overlay.__chatappMessage;
        if (!m || m.role !== 'assistant') return;
        const codeEl = overlay.querySelector('[data-role="code"]');
        const nextText = String(codeEl?.value ?? '');
        this.actionHandler?.('edit-assistant-raw', m, { text: nextText, regexEditMode: false });
        hide();
      });

      document.body.appendChild(overlay);
      this.__chatappCodeViewer = overlay;
    }

    const overlay = this.__chatappCodeViewer;
    overlay.__chatappMessage = msg;
    const saveBtn = overlay.querySelector('[data-role="save"]');
    const codeEl = overlay.querySelector('[data-role="code"]');
    if (codeEl) codeEl.value = content;
    if (saveBtn) saveBtn.style.display = canSave ? 'inline-block' : 'none';
    overlay.style.display = 'block';
    setTimeout(() => {
      try {
        codeEl?.focus?.();
      } catch {}
    }, 0);
  }

  showContextMenu(evt, message) {
    if (this.selectionMode) return;
    if (!this.contextMenu) return;
    this.hideReactionPicker();
    const actions = [];
    const target = evt?.target;
    const wrapper =
      target?.closest?.('[data-msg-id]') ||
      (message?.id ? this.scrollEl?.querySelector?.(`[data-msg-id="${message.id}"]`) : null);
    const msg =
      wrapper && wrapper.__chatappMessage && typeof wrapper.__chatappMessage === 'object'
        ? wrapper.__chatappMessage
        : message;
    const directCodeBlock = target?.closest?.('.chat-codeblock') || null;
    const fallbackCodeBlock = directCodeBlock || wrapper?.querySelector?.('.chat-codeblock') || null;
    const codeBlock = fallbackCodeBlock;
    const hasCode = !!(codeBlock && typeof codeBlock.__chatappCode === 'string' && codeBlock.__chatappCode.length);
    if (this.isThreadingEnabledForMessage(msg)) {
      actions.push({ key: 'reply', label: '回复' });
    }
    if (hasCode) {
      actions.push({ key: 'view-code', label: '✏' });
    }
    const canDownload = ['image', 'document', 'sticker'].includes(String(msg?.type || ''));
    if (canDownload) {
      actions.push({ key: 'download', label: '下载' });
    }
    if (msg.role === 'assistant') {
      actions.push({ key: 'copy-text', label: '复制' });
      actions.push({ key: 'regenerate', label: '重新生成' });
      actions.push({ key: 'delete', label: '删除' });
    } else if (msg.role === 'user') {
      // 如果是 pending 消息，显示"发送到这里"
      if (msg.status === 'pending') {
        actions.push({ key: 'send-to-here', label: '🚀 发送到这里' });
      }
      actions.push({ key: 'copy-text', label: '复制' });
      if (msg.status !== 'pending' && msg.status !== 'sending' && !msg?.meta?.generatedByAssistant) {
        actions.push({ key: 'regenerate', label: '重新生成' });
      }
      if (msg.status !== 'pending' && msg.status !== 'sending') {
        // 已发送的消息才能编辑/收回
        actions.push({ key: 'edit', label: '编辑' });
      }
      actions.push({ key: 'delete', label: '删除' });
    }
    this.contextMenu.innerHTML = '';
    // 手机端：在选单上方显示表情反应列（仅在threading启用时）
    if (this.isThreadingEnabledForMessage(msg)) {
      const reactionRow = document.createElement('div');
      reactionRow.style.cssText = 'display:flex; justify-content:center; gap:4px; padding:6px 8px; border-bottom:1px solid var(--app-border-light);';
      const currentReactions = normalizeReactionEntries(msg?.meta?.reactions);
      DEFAULT_REACTION_EMOJIS.forEach(emoji => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'chat-reaction-option';
        if (currentReactions.some(e => e.emoji === emoji && hasReactionActor(e, SELF_REACTION_ACTOR))) {
          btn.classList.add('is-active');
        }
        btn.textContent = emoji;
        btn.onclick = ev => {
          ev.stopPropagation();
          this.contextMenu.style.display = 'none';
          this.actionHandler?.('toggle-reaction', msg, { emoji });
        };
        reactionRow.appendChild(btn);
      });
      this.contextMenu.appendChild(reactionRow);
    }
    actions.forEach(act => {
      const btn = document.createElement('button');
      btn.textContent = act.label;
      btn.style.cssText = `
                width: 100%;
                padding: 10px 12px;
                border: none;
                background: transparent;
                text-align: left;
                border-radius: 8px;
                cursor: pointer;
                font-size: 14px;
            `;
      btn.onmouseenter = () => (btn.style.background = 'var(--app-surface-hover)');
      btn.onmouseleave = () => (btn.style.background = 'transparent');
      btn.onclick = async e => {
        e.stopPropagation();
        this.contextMenu.style.display = 'none';
        this.clearLongPress();
        if (act.key === 'view-code' && hasCode) {
          if (this.actionHandler) {
            try {
              const handled = await this.actionHandler('view-code', msg, { wrapper, codeBlock });
              if (handled) return;
            } catch {}
          }
          const raw =
            msg?.rawOriginal ?? msg?.rawSource ?? msg?.raw_source ?? msg?.source ?? msg?.raw ?? msg?.content ?? '';
          this.openCodeViewer({ message: msg, text: raw });
          return;
        }
        if (act.key === 'copy-text') {
          if (this.actionHandler) {
            try {
              const handled = await this.actionHandler('copy-text', msg, { wrapper, codeBlock });
              if (handled) return;
            } catch {}
          }
          let text = msg?.meta?.renderRich ? this.getBubbleCopyText(wrapper) : msg.content || '';
          if (!String(text || '').trim()) {
            text = msg?.rawSource ?? msg?.raw_source ?? msg?.rawOriginal ?? msg?.raw ?? msg?.content ?? '';
          }
          this.copyToClipboard(text).then(ok =>
            ok ? window.toastr?.success?.('已复制') : window.toastr?.warning?.('复制失败'),
          );
          return;
        }
        if (act.key === 'reply') {
          this.actionHandler?.('reply', msg, { wrapper });
          return;
        }
        if (act.key === 'edit') {
          this.startInlineEdit(msg);
          return;
        }
        if (act.key === 'delete' && msg.role === 'assistant') {
          this.enterSelectionMode(msg.id);
          return;
        }
        this.actionHandler?.(act.key, msg);
      };
      this.contextMenu.appendChild(btn);
    });
    const { x, y } = this.getPoint(evt);

    // 先显示但隐藏，用于测量尺寸
    this.contextMenu.style.visibility = 'hidden';
    this.contextMenu.style.display = 'block';
    const menuW = this.contextMenu.offsetWidth || 160;
    const menuH = this.contextMenu.offsetHeight || 120;
    const padding = 8;

    let left = x;
    let top = y + 6;
    left = Math.max(padding, Math.min(left, window.innerWidth - menuW - padding));
    top = Math.max(padding, Math.min(top, window.innerHeight - menuH - padding));

    this.contextMenu.style.left = `${left}px`;
    this.contextMenu.style.top = `${top}px`;
    this.contextMenu.style.visibility = 'visible';
  }

  startInlineEdit(message) {
    const wrapper = this.scrollEl.querySelector(`[data-msg-id="${message.id}"]`);
    const bubble = wrapper?.querySelector('.QQ_chat_msgdiv');
    if (!bubble) return;

    const originalText = message.content || '';
    const ta = document.createElement('textarea');
    ta.value = originalText;
    ta.style.cssText = `
            width: 100%;
            min-width: 200px;
            max-width: 100%;
            height: auto;
            min-height: 40px;
            border: 1px solid #019aff;
            border-radius: 4px;
            padding: 6px;
            font: inherit;
            resize: none;
            outline: none;
            background: var(--app-surface-card);
            color: var(--app-text-primary);
            box-sizing: border-box;
        `;

    // 自动高度
    const resize = () => {
      ta.style.height = 'auto';
      ta.style.height = ta.scrollHeight + 'px';
    };
    ta.addEventListener('input', resize);

    const save = () => {
      const newText = ta.value.trim();
      if (newText && newText !== originalText) {
        // Notify app to update storage
        this.actionHandler?.('edit-confirm', message, { text: newText });
      } else {
        // Restore original text if unchanged or empty
        bubble.textContent = originalText;
        bubble.style.whiteSpace = 'pre-wrap';
      }
    };

    ta.addEventListener('blur', save);
    ta.addEventListener('keydown', e => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        ta.blur(); // Trigger save
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        bubble.textContent = originalText; // Cancel
        bubble.style.whiteSpace = 'pre-wrap';
      }
    });

    bubble.innerHTML = '';
    bubble.appendChild(ta);
    setTimeout(() => {
      resize();
      ta.focus();
      // Cursor to end
      ta.setSelectionRange(ta.value.length, ta.value.length);
    }, 0);
  }

  openLightbox(url) {
    const overlay = document.createElement('div');
    overlay.className = 'lightbox';
    overlay.innerHTML = `<img src="${url}" alt="preview">`;
    overlay.onclick = () => overlay.remove();
    document.body.appendChild(overlay);
  }

  showErrorBanner(text, action) {
    if (!this.errorBanner) {
      this.errorBanner = document.createElement('div');
      this.errorBanner.style.cssText = `
                position: fixed; top: 0; left: 0; right:0; padding: 10px 12px;
                background: #fef2f2; color: #b91c1c; text-align:center;
                font-size: 13px; z-index: 12000; box-shadow: 0 2px 10px rgba(0,0,0,0.08);
            `;
      document.body.appendChild(this.errorBanner);
    }
    this.errorBanner.innerHTML = '';
    const span = document.createElement('span');
    span.textContent = text;
    this.errorBanner.appendChild(span);

    if (action && typeof action.handler === 'function') {
      const btn = document.createElement('button');
      btn.textContent = action.label || '重试';
      btn.style.cssText =
        'margin-left:8px; padding:4px 10px; border:1px solid #ef4444; background:var(--app-surface-card); color:#b91c1c; border-radius:6px; cursor:pointer;';
      btn.onclick = () => action.handler();
      this.errorBanner.appendChild(btn);
    }

    this.errorBanner.style.display = 'block';
    setTimeout(
      () => {
        if (this.errorBanner) this.errorBanner.style.display = 'none';
      },
      action ? 6000 : 4000,
    );
  }
}
