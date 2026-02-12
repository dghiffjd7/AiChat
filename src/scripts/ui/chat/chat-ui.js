/**
 * Chat UI rendering and interactions
 */

import { resolveMediaAsset } from '../../utils/media-assets.js';
import { stickerPackStore } from '../../storage/sticker-pack-store.js';
import { renderRichText, setupIframeResizeListener } from './rich-text-renderer.js';
import { appSettings } from '../../storage/app-settings.js';
import { logger } from '../../utils/logger.js';

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

export class ChatUI {
  constructor() {
    this.scrollEl = document.getElementById('chat-scroll');
    this.inputEl = document.getElementById('composer-input');
    this.sendBtn = document.getElementById('send-button');
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
    this.longPressTimer = null;
    this.actionHandler = null;
    this.selectionMode = false;
    this.selectedMessageIds = new Set();
    this.selectionBar = null;
    this.sendClickGuard = null;

    setupIframeResizeListener();
    this.bindIframeLongPressForwarding();
    this.bindInputAutosize();
    this.bindFocusScroll();
    this.bindNetworkEvents();
    this.bindReasoningSettings();
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
    const greetingEl = this.buildGreetingSwitch(message);
    const reasoningEl = this.buildReasoningElement(message);
    if (!greetingEl && !reasoningEl) return bubble;
    bubble.innerHTML = '';
    if (greetingEl) bubble.appendChild(greetingEl);
    if (reasoningEl) bubble.appendChild(reasoningEl);
    const content = document.createElement('div');
    content.className = 'chat-message-content';
    bubble.appendChild(content);
    return content;
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
    this.scrollEl.innerHTML = '';
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
  }

  scrollToBottom() {
    this.scrollEl.scrollTop = this.scrollEl.scrollHeight;
  }

  scrollToMessage(msgId) {
    const id = String(msgId || '').trim();
    if (!id || !this.scrollEl) return false;
    const esc =
      CSS && typeof CSS.escape === 'function' ? CSS.escape : s => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
    const el = this.scrollEl.querySelector(`[data-msg-id="${esc(id)}"]`);
    if (!el) return false;
    const top = el.offsetTop - 12;
    this.scrollEl.scrollTop = Math.max(0, top);
    // brief highlight
    try {
      el.style.transition = 'background 0.2s ease';
      const prev = el.style.backgroundColor;
      el.style.backgroundColor = 'rgba(239,68,68,0.10)';
      setTimeout(() => {
        el.style.backgroundColor = prev || '';
      }, 900);
    } catch {}
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
  addMessage(message) {
    if (message && !message.id) {
      message.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
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
    const el = this.buildMessageElement(message);
    if (el) {
      this.scrollEl.appendChild(el);
      this.scrollToBottom();
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
    wrapper.__chatappMessage = message;
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

    // 时间戳
    const timeEl = document.createElement('span');
    timeEl.className = 'QQ_chat_time';
    timeEl.textContent = message.time || '';

    // 组装 DOM - 符合 QQ 原版结构
    if (isUser) {
      // 我的消息：气泡 + 头像 + 时间（grid布局自动处理）
      wrapper.appendChild(bubble);
      wrapper.appendChild(avatarImg);
      wrapper.appendChild(timeEl);
    } else {
      // 别人的消息：头像 +（可选名字）+ 气泡 + 时间
      const contentWrap = document.createElement('div');
      contentWrap.style.cssText =
        'grid-column: 2; display:flex; flex-direction:column; align-items:flex-start; gap:2px;';
      if (message?.meta?.showName && message.name) {
        const nameEl = document.createElement('div');
        nameEl.className = 'QQ_chat_name';
        nameEl.textContent = String(message.name || '');
        contentWrap.appendChild(nameEl);
      }
      contentWrap.appendChild(bubble);
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

  showTyping(avatarUrl = '') {
    if (!this.isTypingDotsEnabled()) return;
    if (this.typingEl) return;
    const wrap = document.createElement('div');
    wrap.className = 'QQ_chat_charmsg';
    wrap.id = 'typing-indicator';

    // 头像（使用默认助手头像）
    const avatar = document.createElement('img');
    avatar.className = 'QQ_chat_head';
    avatar.src = avatarUrl || './assets/external/feather-default.png';

    // 气泡
    const bubble = document.createElement('div');
    bubble.className = 'QQ_chat_msgdiv';
    bubble.innerHTML = `
            <div class="typing">
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
                <span class="typing-dot"></span>
            </div>
        `;

    wrap.appendChild(avatar);
    wrap.appendChild(bubble);
    this.scrollEl.appendChild(wrap);
    this.typingEl = wrap;
    this.scrollToBottom();
  }

  hideTyping() {
    if (this.typingEl) {
      this.typingEl.remove();
      this.typingEl = null;
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
          this.scrollToBottom();
        });
      },
      finish: finalMessage => {
        this.setStreamingState(false);
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        if (finalMessage && finalMessage.type && finalMessage.type !== 'text') {
          // Replace with structured render
          const parent = messageEl.parentElement?.parentElement || messageEl.parentElement;
          parent?.remove();
          this.addMessage(finalMessage);
          this.messageBuffer[bufferIndex] = finalMessage;
        } else {
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
            // Render rich content for the final text
            const text = String(fm?.content ?? '');
            const target = this.prepareTextContainer(messageEl, fm);
            if (fm?.meta?.renderRich) {
              renderRichText(target, text, {
                messageId: msgId || fm?.id || meta?.id,
                sessionId: fm?.sessionId,
                debugTag: fm?.meta?.isGreeting ? 'rp-greeting' : '',
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
      },
      cancel: () => {
        this.isStreaming = false;
        this.updateSendButtonState();
        if (updateHandle != null) {
          caf(updateHandle);
          updateHandle = null;
        }
        try {
          wrapperEl?.remove?.();
        } catch {}
        try {
          this.messageBuffer.splice(bufferIndex, 1);
        } catch {}
      },
    };
  }

  preloadHistory(messages = [], { keepScroll = false } = {}) {
    const list = Array.isArray(messages) ? messages : [];
    if (!list.length || !this.scrollEl) return;
    const fragment = document.createDocumentFragment();
    for (const msg of list) {
      const el = this.buildMessageElement({
        role: msg.role === 'system' ? 'system' : msg.role === 'user' ? 'user' : 'assistant',
        type: msg.type || 'text',
        content: msg.content,
        name: msg.name,
        avatar: msg.avatar,
        time: msg.time,
        meta: msg.meta,
        badge: msg.badge,
        id: msg.id,
        status: msg.status,
        sessionId: msg.sessionId,
      });
      if (el) fragment.appendChild(el);
    }
    this.scrollEl.appendChild(fragment);
    if (!keepScroll) this.scrollToBottom();
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
        meta: msg.meta,
        badge: msg.badge,
        id: msg.id,
        status: msg.status,
        sessionId: msg.sessionId,
      });
      if (el) fragment.appendChild(el);
    }

    const first = this.scrollEl.firstChild;
    if (first) this.scrollEl.insertBefore(fragment, first);
    else this.scrollEl.appendChild(fragment);

    const afterHeight = this.scrollEl.scrollHeight;
    const delta = afterHeight - beforeHeight;
    this.scrollEl.scrollTop = beforeTop + delta;
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
    if (el) el.remove();
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
    const next = { ...prev, ...(newMessage || {}), id: msgId, sessionId: resolvedSessionId };
    const newEl = this.buildMessageElement(next);
    if (newEl) existing.replaceWith(newEl);
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
            <button data-role="cancel" style="border:1px solid rgba(0,0,0,0.10); background:#fff; border-radius:12px; padding:8px 12px;">取消</button>
            <div data-role="count" style="flex:1; font-weight:800; color:#0f172a;">已选择 0 条</div>
            <button data-role="delete" style="border:none; background:#ef4444; color:#fff; border-radius:12px; padding:8px 14px; font-weight:800;">删除</button>
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
                color: #fff;
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
            background: #fff;
            border: 1px solid #e5e7eb;
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
                background: #fff;
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
                border-bottom: 1px solid #e5e7eb;
            `;
      const title = document.createElement('div');
      title.style.cssText = 'font-size:14px; font-weight:700; color:#111827;';
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
                border: 1px solid #e5e7eb;
                background: #fff;
                color: #111827;
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
                color: #fff;
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
        this.actionHandler?.('edit-assistant-raw', m, { text: nextText });
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
      btn.onmouseenter = () => (btn.style.background = '#f1f5f9');
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
            background: #fff;
            color: #000;
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
        'margin-left:8px; padding:4px 10px; border:1px solid #ef4444; background:#fff; color:#b91c1c; border-radius:6px; cursor:pointer;';
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
