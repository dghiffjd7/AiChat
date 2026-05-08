/**
 * Chat UI rendering and interactions
 */

import { resolveMediaAsset } from '../../utils/media-assets.js';
import { stickerPackStore } from '../../storage/sticker-pack-store.js';
import { cleanupRichText, renderRichText, setupIframeResizeListener } from './rich-text-renderer.js';
import { appSettings } from '../../storage/app-settings.js';
import { logger } from '../../utils/logger.js';
import { getDefaultAppIcon } from '../../utils/default-icon.js';
import { bindCustomSelectButton, createCustomSelectWrapper } from '../custom-select.js';
import {
  DEFAULT_REACTION_EMOJIS,
  SELF_REACTION_ACTOR,
  buildRpFloorAssignments,
  countReactionActors,
  getRpFloorLabel,
  hasReactionActor,
  normalizeReactionEntries,
  normalizeReplyTarget,
} from './message-interaction-utils.js';
import {
  buildReactionSummaryElement as buildReactionSummaryElementCore,
  createReactionPicker as createReactionPickerCore,
  createReactionTriggerButton,
  hideReactionPicker as hideReactionPickerCore,
  showReactionPicker as showReactionPickerCore,
} from './reaction-ui-utils.js';
import { createMessageHeaderUiRuntime } from './message-header-ui-utils.js';
import { createReplyDraftUiRuntime } from './reply-draft-ui-utils.js';
import { createSelectionModeUiRuntime } from './selection-mode-ui-utils.js';
import { createMessagePatchUiRuntime } from './message-patch-ui-utils.js';
import { createMessageClipboardUiRuntime } from './message-clipboard-ui-utils.js';
import { createCodeViewerUiRuntime } from './code-viewer-ui-utils.js';
import { buildContextMenuActions, positionContextMenu, resolveViewCodeText } from './context-menu-ui-utils.js';
import { createContextMenuActionButton, createContextMenuReactionRow } from './context-menu-dom-utils.js';
import { dispatchContextMenuAction } from './context-menu-action-runtime-utils.js';
import { createContextMenuShell, resolveContextMenuContext } from './context-menu-runtime-utils.js';
import { showContextMenuCore } from './context-menu-orchestration-ui-utils.js';
import { createInlineEditUiRuntime } from './inline-edit-ui-utils.js';
import { createFeedbackOverlayUiRuntime } from './feedback-overlay-ui-utils.js';
import {
  createScrollDateBadgeUiRuntime,
  formatScrollDateLabel as formatScrollDateLabelCore,
  resolveScrollDateLabel as resolveScrollDateLabelCore,
} from './scroll-date-badge-ui-utils.js';
import {
  createScrollBottomButtonUiRuntime,
  getScrollDistanceFromBottom as getScrollDistanceFromBottomCore,
  isNearBottom as isNearBottomCore,
  resolveScrollBottomButtonThresholds as resolveScrollBottomButtonThresholdsCore,
} from './scroll-bottom-button-ui-utils.js';
import { createDeliveryStatusUiRuntime } from './delivery-status-ui-utils.js';
import { createTypingIndicatorUiRuntime } from './typing-indicator-ui-utils.js';
import { createTypingIndicatorShell, renderTypingGroupMembers } from './typing-indicator-dom-utils.js';
import { createTypingIndicatorScheduleRuntime } from './typing-indicator-schedule-utils.js';
import {
  createSwipeIndicatorElement,
  ensureSwipeMeta,
  renderSwipeDraftPlaceholderCore,
  resolveActiveSwipeMessageCore,
  resolveSwipeIndicatorState,
  syncSwipeIndicatorElement,
} from './swipe-ui-utils.js';
import { createSwipeUiRuntime } from './swipe-runtime-utils.js';
import {
  applyJumpFocusState,
  clearJumpFocusState,
  resolveJumpFocusElements as resolveJumpFocusElementsCore,
  shouldDismissJumpFocusOnScroll,
} from './jump-focus-ui-utils.js';
import {
  applyMentionInsertion,
  buildMentionDropdownItems,
  ensureMentionDropdownShell,
  filterMentionMembers,
  positionMentionDropdownCore,
  updateMentionSelectionCore,
} from './mention-dropdown-ui-utils.js';
import {
  hideMentionDropdownCore,
  resolveMentionKeyAction,
  resolveMentionQueryContext,
} from './mention-input-ui-utils.js';
import { createLongPressUiRuntime } from './long-press-ui-utils.js';
import {
  bindDebouncedInputChangeCore,
  bindFocusScrollCore,
  bindInputAutosizeCore,
  bindOptionalClickCore,
  bindSendCore,
  bindSendWithModeCore,
  createNetworkStatusRuntime,
  setSessionLabelCore,
} from './input-binding-ui-utils.js';
import {
  buildAssistantStreamMessageCore,
  createAssistantStreamUiRuntime,
  finishMessageDomCore,
  renderAssistantStreamStateCore,
} from './assistant-stream-ui-utils.js';
import {
  addMessageCore,
  preloadHistoryCore,
  prependHistoryCore,
  refreshAvatarsCore,
  removeMessageCore,
  updateMessageCore,
} from './message-list-ui-utils.js';
import {
  clearMessageQueueTimerCore,
  enqueueMessagesCore,
  hideTypingCore,
  showTypingCore,
} from './typing-flow-ui-utils.js';
import {
  clearInputCore,
  clearMessagesCore,
  scrollToBottomCore,
  scrollToMessageCore,
  showConversationLoadingCore,
  updateSendButtonStateCore,
} from './chat-view-state-ui-utils.js';
import { createRpFloorUiRuntime } from './rp-floor-ui-utils.js';
import { renderTextWithStickersCore } from './sticker-text-ui-utils.js';
import { renderMessageBubbleContentCore } from './message-bubble-content-ui-utils.js';
import {
  appendStandardMessageLayoutCore,
  buildBubbleStackCore,
  scheduleSelectionModeApplyCore,
} from './message-layout-ui-utils.js';
import {
  createDividerMessageWrapperCore,
  createMessageAvatarImageCore,
  createStandardMessageWrapperCore,
  createSystemMessageWrapperCore,
} from './message-wrapper-ui-utils.js';
import { buildMessageElementCore } from './message-element-ui-utils.js';

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
const getDefaultReplyAvatar = () => getDefaultAppIcon();

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
    this.messageHeaderRuntime = createMessageHeaderUiRuntime({
      documentLike: document,
      appSettings,
      createCustomSelectWrapper,
      bindCustomSelectButton,
      normalizeReplyTarget,
      getDefaultReplyAvatar,
      getBridge: () => window.appBridge || null,
      getUiMode: () => document?.body?.dataset?.uiMode || '',
      onAction: (...args) => this.actionHandler?.(...args),
      scrollToMessage: (messageId, options) => this.scrollToMessage(messageId, options),
      resolveMessageSessionId: message => this.resolveMessageSessionId(message),
      warningToast: text => window.toastr?.warning?.(text),
    });
    this.replyDraftRuntime = createReplyDraftUiRuntime({
      documentLike: document,
      normalizeReplyTarget,
      getDefaultReplyAvatar,
      getReplyCancelHandler: () => this.replyCancelHandler,
    });
    this.selectionModeRuntime = createSelectionModeUiRuntime({
      documentLike: document,
      getSelectionMode: () => this.selectionMode,
      getSelectedMessageIds: () => this.selectedMessageIds,
      onExitSelectionMode: () => this.exitSelectionMode(),
      onDeleteSelected: ids => this.actionHandler?.('delete-selected', null, { ids }),
      onToggleMessageSelection: msgId => this.toggleMessageSelection(msgId),
      toastInfo: text => window.toastr?.info?.(text),
    });
    this.messagePatchRuntime = createMessagePatchUiRuntime({
      normalizeReplyTarget,
      normalizeReactionEntries,
      resolveActiveSwipeMessage: message => this.resolveActiveSwipeMessage(message),
      applyCreativeBubbleState: (wrapper, message) => this.applyCreativeBubbleState(wrapper, message),
    });
    this.rpFloorUiRuntime = createRpFloorUiRuntime({
      documentLike: document,
      getUiMode: () => document.body?.dataset?.uiMode || '',
      getRpFloorLabel,
      buildRpFloorAssignments,
    });
    this.messageClipboardRuntime = createMessageClipboardUiRuntime({
      documentLike: document,
      navigatorLike: navigator,
      execCopyCommand: command => document.execCommand(command),
    });
    this.codeViewerRuntime = createCodeViewerUiRuntime({
      documentLike: document,
      windowLike: window,
      schedule: cb => setTimeout(cb, 0),
      onSaveEdit: async (message, text) => {
        if (typeof this.actionHandler !== 'function') return;
        await this.actionHandler('edit-assistant-raw', message, { text, regexEditMode: false });
      },
    });
    this.inlineEditRuntime = createInlineEditUiRuntime({
      documentLike: document,
      schedule: cb => setTimeout(cb, 0),
      onConfirmEdit: (message, text) => this.actionHandler?.('edit-confirm', message, { text }),
    });
    this.feedbackOverlayRuntime = createFeedbackOverlayUiRuntime({
      documentLike: document,
      scheduleHide: (handler, delay) => setTimeout(handler, delay),
    });
    this.scrollDateBadgeRuntime = createScrollDateBadgeUiRuntime({
      documentLike: document,
      getUiMode: () => document?.body?.dataset?.uiMode || '',
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      clearSchedule: timerId => clearTimeout(timerId),
    });
    this.scrollBottomButtonRuntime = createScrollBottomButtonUiRuntime({
      documentLike: document,
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
    });
    this.deliveryStatusRuntime = createDeliveryStatusUiRuntime({
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      clearSchedule: timerId => clearTimeout(timerId),
    });
    this.typingIndicatorRuntime = createTypingIndicatorUiRuntime({
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      clearSchedule: timerId => clearTimeout(timerId),
    });
    this.typingIndicatorScheduleRuntime = createTypingIndicatorScheduleRuntime({
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      scheduleFrame: typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb => setTimeout(cb, 16)),
    });
    this.swipeRuntime = createSwipeUiRuntime({
      scheduleFrame: typeof requestAnimationFrame === 'function'
        ? requestAnimationFrame
        : (cb => setTimeout(cb, 16)),
      cancelFrame: typeof cancelAnimationFrame === 'function'
        ? cancelAnimationFrame
        : (handle => clearTimeout(handle)),
    });
    this.assistantStreamUiRuntime = createAssistantStreamUiRuntime({
      windowLike: typeof window !== 'undefined' ? window : null,
    });
    this.longPressRuntime = createLongPressUiRuntime({
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      clearSchedule: timerId => clearTimeout(timerId),
    });
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
    this.streamAutoFollow = false;
    this._programmaticStreamFollowScroll = false;
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
    this._unbindSwipeEvents?.();
    this._unbindSwipeEvents = this.swipeRuntime.bindSwipeEvents({
      scrollEl: this.scrollEl,
      getSwipeHandlers: (msgId) => {
        if (!this.scrollEl) return null;
        const wrapper = this.scrollEl.querySelector(`[data-msg-id="${CSS.escape(msgId)}"]`);
        const message = wrapper?.__chatappMessage;
        if (!wrapper || !message) return null;
        return {
          wrapper,
          message,
          applySwipe: ({ wrapper: nextWrapper, message: nextMessage, newIndex }) =>
            this._applySwipe(nextWrapper, nextMessage, newIndex),
          onSwipeRegen: payload => this._swipeRegenHandler?.(payload),
        };
      },
    });
  }

  _applySwipe(wrapper, msg, newIndex, options = {}) {
    this.swipeRuntime.applySwipe({
      wrapper,
      message: msg,
      newIndex,
      options,
      renderSwipeContent: (...args) => this._renderSwipeContent(...args),
      syncSwipeIndicator: (...args) => this._syncSwipeIndicator(...args),
      onSwipeChange: payload => this._swipeChangeHandler?.(payload),
    });
  }

  resolveActiveSwipeMessage(message) {
    return resolveActiveSwipeMessageCore(message, {
      activeSwipeGenerationMsgId: String(document.body?.dataset?.activeSwipeGenerationMsgId || ''),
    });
  }

  renderSwipeDraftPlaceholder(target, label = '生成新回复中...') {
    return renderSwipeDraftPlaceholderCore(target, {
      documentLike: document,
      label,
    });
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
      return this.renderSwipeDraftPlaceholder(target, placeholder);
    }
    if (renderMsg.meta?.renderRich) {
      renderRichText(target, text, {
        messageId: renderMsg.id,
        preserveHtmlNewlines: true,
        sessionId: renderMsg.sessionId,
        deferSandboxExecution: streaming === true,
        streaming: streaming === true,
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
    syncSwipeIndicatorElement(indicator, index, total, { generating });
  }

  addSwipeBranch(msgId, content, raw) {
    this.swipeRuntime.addSwipeBranch({
      scrollEl: this.scrollEl,
      msgId,
      content,
      raw,
      applySwipe: ({ wrapper, message, newIndex }) => this._applySwipe(wrapper, message, newIndex),
    });
  }

  onSwipeRegen(handler) { this._swipeRegenHandler = handler; }
  onSwipeChange(handler) { this._swipeChangeHandler = handler; }

  normalizeAssistantStreamState(state = {}) {
    return this.swipeRuntime.normalizeAssistantStreamState(state);
  }

  setSwipeRegenerating(msgId, active, label = '生成中...') {
    return this.swipeRuntime.setSwipeRegenerating({
      scrollEl: this.scrollEl,
      msgId,
      active,
      label,
    });
  }

  startSwipeGenerationStream(msgId, meta = {}) {
    return this.swipeRuntime.startSwipeGenerationStream({
      scrollEl: this.scrollEl,
      msgId,
      meta,
      setSwipeRegenerating: (...args) => this.setSwipeRegenerating(...args),
      syncSwipeIndicator: (...args) => this._syncSwipeIndicator(...args),
      renderSwipeContent: (...args) => this._renderSwipeContent(...args),
      setStreamingState: active => this.setStreamingState(active),
      isNearBottom: threshold => this.isNearBottom(threshold),
      getStreamAutoFollow: () => this.streamAutoFollow,
      setStreamAutoFollow: value => { this.streamAutoFollow = value; },
      buildAssistantStreamMessage: (...args) => this.buildAssistantStreamMessage(...args),
      applyReasoningUiState: (...args) => this.applyReasoningUiState(...args),
      scrollToBottom: () => this.scrollToBottom(),
    });
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
    const active = String(bridge?.getActiveSessionId?.() || '').trim();
    if (active) return active;
    return String(bridge?.chatStore?.getCurrent?.() || '').trim();
  }

  getReasoningText(message) {
    return this.messageHeaderRuntime.getReasoningText(message);
  }

  getReasoningUiState(message) {
    return this.messageHeaderRuntime.getReasoningUiState(message);
  }

  applyReasoningUiState(targetMessage, sourceMessage) {
    return this.messageHeaderRuntime.applyReasoningUiState(targetMessage, sourceMessage);
  }

  resolveReasoningOpenState(message) {
    return this.messageHeaderRuntime.resolveReasoningOpenState(message);
  }

  buildReasoningElement(message) {
    return this.messageHeaderRuntime.buildReasoningElement(message);
  }

  buildGreetingSwitch(message) {
    return this.messageHeaderRuntime.buildGreetingSwitch(message);
  }

  prepareTextContainer(bubble, message) {
    return this.messageHeaderRuntime.prepareTextContainer(bubble, message);
  }

  buildReplyPreviewElement(message) {
    return this.messageHeaderRuntime.buildReplyPreviewElement(message);
  }

  buildReactionSummaryElement(message) {
    return buildReactionSummaryElementCore(message, {
      documentLike: document,
      isThreadingEnabled: this.isThreadingEnabledForMessage(message),
      onToggleReaction: emoji => this.actionHandler?.('toggle-reaction', message, { emoji }),
    });
  }

  showReactionPicker(anchor, message) {
    return showReactionPickerCore({
      picker: this.reactionPicker,
      contextMenuEl: this.contextMenu,
      anchor,
      message,
      isThreadingEnabled: this.isThreadingEnabledForMessage(message),
      onToggleReaction: emoji => this.actionHandler?.('toggle-reaction', message, { emoji }),
      hidePicker: () => this.hideReactionPicker(),
      windowLike: window,
      documentLike: document,
    });
  }

  bindReasoningSettings() {
    if (this.__chatappReasoningBound) return;
    this.__chatappReasoningBound = true;
    const updateAll = () => {
      const autoExpand = appSettings.get().reasoningAutoExpand === true;
      const showHidden = appSettings.get().reasoningShowHidden === true;
      document.querySelectorAll('details.chat-reasoning').forEach((el) => {
        if (!(el instanceof HTMLDetailsElement)) return;
        el.open = autoExpand && (showHidden || el.dataset.hidden !== '1');
        if (el.dataset.hidden === '1') {
          el.style.display = '';
        }
      });
    };
    window.addEventListener('reasoning-settings-changed', updateAll);
    updateAll();
  }

  renderTextWithStickers(bubble, text) {
    return renderTextWithStickersCore({
      bubble,
      text,
      documentLike: document,
      resolveMediaAsset,
      resolveStickerFrames,
      resolveStickerFps,
      applyImageFallback,
      registerStickerAnimation,
      toastOnce,
      onPreview: url => this.openLightbox(url),
    });
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
    bindInputAutosizeCore(this.inputEl, {
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
    });
  }

  bindFocusScroll() {
    bindFocusScrollCore(this.inputEl, {
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      onFocusScroll: () => this.scrollToBottom(),
    });
  }

  initScrollDateBadge() {
    this.scrollDateBadgeEl = this.scrollDateBadgeRuntime.ensureBadge({
      scrollEl: this.scrollEl,
      existingBadgeEl: this.scrollDateBadgeEl,
    });
  }

  initScrollBottomButton() {
    this.scrollBottomButtonEl = this.scrollBottomButtonRuntime.ensureButton({
      scrollEl: this.scrollEl,
      existingButtonEl: this.scrollBottomButtonEl,
      onClick: () => this.scrollToBottom(),
    });
  }

  formatScrollDateLabel(timestamp) {
    return formatScrollDateLabelCore(timestamp);
  }

  resolveScrollDateLabel() {
    return resolveScrollDateLabelCore(this.scrollEl, {
      formatLabel: value => this.formatScrollDateLabel(value),
    });
  }

  hideScrollDateBadge({ immediate = false } = {}) {
    if (this.scrollDateHideTimer) {
      this.scrollDateBadgeRuntime.clearTimer(this.scrollDateHideTimer);
      this.scrollDateHideTimer = null;
    }
    this.scrollDateBadgeRuntime.hideBadge({
      badgeEl: this.scrollDateBadgeEl,
      immediate,
    });
  }

  showScrollDateBadge(label) {
    const shown = this.scrollDateBadgeRuntime.showBadge({
      badgeEl: this.scrollDateBadgeEl,
      label,
      clearHideTimer: timerId => this.scrollDateBadgeRuntime.clearTimer(timerId),
      getHideTimer: () => this.scrollDateHideTimer,
      setHideTimer: value => {
        this.scrollDateHideTimer = value;
      },
    });
    if (!shown) this.hideScrollDateBadge();
  }

  refreshScrollDateBadge({ reveal = false } = {}) {
    this.scrollDateBadgeRuntime.refreshBadge({
      scrollEl: this.scrollEl,
      badgeEl: this.scrollDateBadgeEl,
      reveal,
      hideBadge: options => this.hideScrollDateBadge(options),
      showBadge: label => this.showScrollDateBadge(label),
      resolveLabel: scrollEl => resolveScrollDateLabelCore(scrollEl, {
        formatLabel: value => this.formatScrollDateLabel(value),
      }),
    });
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
    return isNearBottomCore(this.scrollEl, threshold);
  }

  getScrollDistanceFromBottom() {
    return getScrollDistanceFromBottomCore(this.scrollEl);
  }

  resolveScrollBottomButtonThresholds() {
    return resolveScrollBottomButtonThresholdsCore(this.scrollEl);
  }

  hideScrollBottomButton({ immediate = false } = {}) {
    this.scrollBottomButtonRuntime.hideButton({
      buttonEl: this.scrollBottomButtonEl,
      immediate,
    });
  }

  showScrollBottomButton({ immediate = false } = {}) {
    this.scrollBottomButtonRuntime.showButton({
      buttonEl: this.scrollBottomButtonEl,
      immediate,
    });
  }

  refreshScrollBottomButton({ immediate = false } = {}) {
    this.scrollBottomButtonRuntime.refreshButton({
      scrollEl: this.scrollEl,
      buttonEl: this.scrollBottomButtonEl,
      immediate,
      typingEl: this.typingEl,
      floatingTypingEl: this._floatingTypingEl,
      hideButton: options => this.hideScrollBottomButton(options),
      showButton: options => this.showScrollBottomButton(options),
      hideFloatingTyping: floatingEl => {
        if (floatingEl) floatingEl.remove();
        if (this._floatingTypingEl === floatingEl) this._floatingTypingEl = null;
      },
      showFloatingTyping: sourceWrap => this._showFloatingTyping(sourceWrap),
      getDistance: scrollEl => getScrollDistanceFromBottomCore(scrollEl),
      resolveThresholds: scrollEl => resolveScrollBottomButtonThresholdsCore(scrollEl),
      isNearBottomFn: scrollEl => isNearBottomCore(scrollEl),
    });
  }

  scheduleScrollBottomButtonRefresh({ immediate = false } = {}) {
    this.scrollBottomButtonRuntime.scheduleRefresh({
      immediate,
      getPendingImmediate: () => this.scrollBottomButtonImmediate,
      setPendingImmediate: value => {
        this.scrollBottomButtonImmediate = value;
      },
      getRafId: () => this.scrollBottomButtonRaf,
      setRafId: value => {
        this.scrollBottomButtonRaf = value;
      },
      refresh: options => this.refreshScrollBottomButton(options),
    });
  }

  bindScrollBottomButton() {
    if (!this.scrollEl || this.__chatappScrollBottomButtonBound) return;
    this.__chatappScrollBottomButtonBound = true;
    this.scrollEl.addEventListener(
      'scroll',
      () => {
        if (this._programmaticStreamFollowScroll) {
          this._programmaticStreamFollowScroll = false;
        } else if (this.isStreaming) {
          const distance = this.getScrollDistanceFromBottom();
          if (distance <= 8) this.streamAutoFollow = true;
          else if (distance >= 12) this.streamAutoFollow = false;
        }
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
        const currentTop = Number(this.scrollEl?.scrollTop || 0);
        if (!shouldDismissJumpFocusOnScroll({ state, currentTop, now: Date.now() })) return;
        this.clearJumpFocus();
      },
      { passive: true },
    );
  }

  resolveJumpFocusElements(wrapper) {
    return resolveJumpFocusElementsCore(wrapper);
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
    this.jumpFocusState = clearJumpFocusState(this.jumpFocusState, {
      clearTimer: timerId => clearTimeout(timerId),
      clearHighlights: root => this.clearJumpKeywordHighlights(root),
    });
  }

  applyJumpFocus(wrapper, { keyword = '', kind = 'anchor', dismissOnScroll = true, autoClearMs = 0 } = {}) {
    return applyJumpFocusState(wrapper, {
      keyword,
      kind,
      dismissOnScroll,
      autoClearMs,
      clearExisting: () => this.clearJumpFocus(),
      resolveElements: value => this.resolveJumpFocusElements(value),
      highlightKeyword: (root, term) => this.highlightKeywordInElement(root, term),
      getScrollTop: () => Number(this.scrollEl?.scrollTop || 0),
      now: Date.now(),
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      onAutoClear: value => {
        if (this.jumpFocusState?.wrapper === value) {
          value.classList.remove('chat-jump-focus-line');
        }
      },
      setState: value => {
        this.jumpFocusState = value;
      },
    });
  }

  bindNetworkEvents() {
    createNetworkStatusRuntime({
      navigatorLike: typeof navigator !== 'undefined' ? navigator : undefined,
      windowLike: window,
      onOffline: () => {
        this.setSendEnabled(false);
        this.showErrorBanner('网络不可用，请检查连接');
      },
      onOnline: () => {
        this.setSendEnabled(true);
        if (this.errorBanner) this.errorBanner.style.display = 'none';
        window.toastr?.info?.('网络已连接');
      },
    }).bind();
  }

  onSend(handler) {
    bindSendCore(this.sendBtn, this.inputEl, handler);
  }

  /**
   * 新方法：分别绑定 Enter 和发送按钮的回调
   * @param {Object} handlers - { onEnter: Function, onSendButton: Function }
   */
  onSendWithMode(handlers) {
    bindSendWithModeCore(this.sendBtn, this.inputEl, {
      ...handlers,
      getSendClickGuard: () => this.sendClickGuard,
    });
  }

  setSendClickGuard(guard) {
    this.sendClickGuard = typeof guard === 'function' ? guard : null;
  }

  onConfig(handler) {
    bindOptionalClickCore(this.configBtn, handler);
  }

  onWorld(handler) {
    bindOptionalClickCore(this.worldBtn, handler);
  }

  onSession(handler) {
    bindOptionalClickCore(this.sessionBtn, handler);
  }

  getInputText() {
    return this.inputEl.value.trim();
  }

  setInputText(val) {
    this.inputEl.value = val;
  }

  setSessionLabel(id) {
    setSessionLabelCore(this.sessionLabel, this.sessionBadge, id);
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
    const next = resolveMentionQueryContext(el.value, el.selectionStart);
    if (!next) {
      this.hideMentionDropdown();
      return;
    }
    this.mentionStartPos = next.mentionStartPos;
    this.mentionQuery = next.query;
    this.showMentionDropdown(next.query);
  }

  handleMentionKeydown(e) {
    if (!this.mentionDropdown || this.mentionDropdown.style.display === 'none') return;
    const items = this.mentionDropdown.querySelectorAll('.mention-item');
    if (!items.length) return;
    const action = resolveMentionKeyAction({
      key: e.key,
      shiftKey: e.shiftKey,
      selectedIndex: this.mentionSelectedIndex,
      itemCount: items.length,
    });
    if (action.type === 'move') {
      e.preventDefault();
      this.mentionSelectedIndex = action.selectedIndex;
      this.updateMentionSelection(items);
    } else if (action.type === 'select') {
      const selected = items[action.selectedIndex];
      if (selected) {
        e.preventDefault();
        e.stopImmediatePropagation();
        this.insertMention(selected.dataset.memberName);
      }
    } else if (action.type === 'hide') {
      e.preventDefault();
      this.hideMentionDropdown();
    }
  }

  updateMentionSelection(items) {
    updateMentionSelectionCore(items, this.mentionSelectedIndex);
  }

  showMentionDropdown(query) {
    if (typeof this.mentionMemberResolver !== 'function') return;
    const members = this.mentionMemberResolver();
    if (!members || !members.length) { this.hideMentionDropdown(); return; }
    const filtered = filterMentionMembers(members, query);
    if (!filtered.length) { this.hideMentionDropdown(); return; }
    this.mentionDropdown = ensureMentionDropdownShell(document, this.mentionDropdown);
    this.mentionSelectedIndex = 0;
    this.mentionDropdown.innerHTML = '';
    buildMentionDropdownItems(document, filtered, {
      selectedIndex: this.mentionSelectedIndex,
      onHover: index => {
        this.mentionSelectedIndex = index;
        this.updateMentionSelection(this.mentionDropdown.querySelectorAll('.mention-item'));
      },
      onSelect: name => {
        this.insertMention(name);
      },
    }).forEach(item => {
      this.mentionDropdown.appendChild(item);
    });
    // position above input
    this.positionMentionDropdown();
    this.mentionDropdown.style.display = 'block';
  }

  positionMentionDropdown() {
    positionMentionDropdownCore(this.mentionDropdown, this.inputContainer, {
      windowHeight: window.innerHeight,
    });
  }

  insertMention(name) {
    const el = this.inputEl;
    const { value, cursor } = applyMentionInsertion({
      value: el.value,
      selectionStart: el.selectionStart,
      mentionStartPos: this.mentionStartPos,
      name,
    });
    el.value = value;
    el.setSelectionRange(cursor, cursor);
    el.focus();
    this.hideMentionDropdown();
    el.dispatchEvent(new Event('input', { bubbles: true }));
  }

  hideMentionDropdown() {
    const next = hideMentionDropdownCore(this.mentionDropdown);
    this.mentionStartPos = next.mentionStartPos;
    this.mentionQuery = next.mentionQuery;
    this.mentionSelectedIndex = next.mentionSelectedIndex;
  }

  // ── End @Mention system ────────────────────────────────────────

  onInputChange(handler) {
    bindDebouncedInputChangeCore(this.inputEl, handler, {
      schedule: (nextHandler, delay = 0) => setTimeout(nextHandler, delay),
      clearSchedule: timerId => clearTimeout(timerId),
      delay: 500,
    });
  }

  clearMessages() {
    return clearMessagesCore({
      scrollEl: this.scrollEl,
      cleanupRichTextMounts: target => this.cleanupRichTextMounts(target),
      hideReactionPicker: () => this.hideReactionPicker(),
      hideScrollDateBadge: options => this.hideScrollDateBadge(options),
      hideScrollBottomButton: options => this.hideScrollBottomButton(options),
      clearDeliverySequence: () => this._clearDeliverySequence(),
      clearTypingTimers: () => this._clearTypingTimers(),
      getReadCountTimer: () => this._readCountTimer,
      setReadCountTimer: value => {
        this._readCountTimer = value;
      },
      setReadCountCurrent: value => {
        this._readCountCurrent = value;
      },
      setReadCountMax: value => {
        this._readCountMax = value;
      },
      setReadCountTargets: value => {
        this._readCountTargets = value;
      },
      setDeliverySequenceDone: value => {
        this._deliverySequenceDone = value;
      },
      setTypingEl: value => {
        this.typingEl = value;
      },
      getFloatingTypingEl: () => this._floatingTypingEl,
      setFloatingTypingEl: value => {
        this._floatingTypingEl = value;
      },
      setRpFloorCount: value => {
        this._rpFloorCount = value;
      },
    });
  }

  showConversationLoading({ title = '', isGroup = false } = {}) {
    return showConversationLoadingCore({
      title,
      isGroup,
      scrollEl: this.scrollEl,
      documentLike: document,
      clearMessages: () => this.clearMessages(),
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  _createRpFloorMarker(message) {
    return this.rpFloorUiRuntime.createFloorMarker(message, {
      getFloorCount: () => this._rpFloorCount,
      setFloorCount: value => {
        this._rpFloorCount = value;
      },
    });
  }

  _refreshAllRpFloorMarkers() {
    this.rpFloorUiRuntime.refreshAllFloorMarkers(this.scrollEl, {
      setFloorCount: value => {
        this._rpFloorCount = value;
      },
    });
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
    return clearInputCore({
      inputEl: this.inputEl,
      options,
    });
  }

  setSendingState(isSending) {
    this.isSending = Boolean(isSending);
    this.updateSendButtonState();
  }

  setStreamingState(isStreaming) {
    this.isStreaming = Boolean(isStreaming);
    if (!this.isStreaming) this.streamAutoFollow = false;
    this.updateSendButtonState();
  }

  setSendEnabled(enabled) {
    this.isOnline = Boolean(enabled);
    this.updateSendButtonState();
  }

  updateSendButtonState() {
    return updateSendButtonStateCore({
      sendBtn: this.sendBtn,
      isSending: this.isSending,
      isStreaming: this.isStreaming,
      isOnline: this.isOnline,
      continueButton: document.getElementById('rp-continue-btn'),
    });
  }

  scrollToBottom() {
    return scrollToBottomCore({
      scrollEl: this.scrollEl,
      isStreaming: this.isStreaming,
      setProgrammaticScroll: value => {
        this._programmaticScroll = value;
      },
      setProgrammaticStreamFollowScroll: value => {
        this._programmaticStreamFollowScroll = value;
      },
      setStreamAutoFollow: value => {
        this.streamAutoFollow = value;
      },
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  scrollToMessage(msgId, options = {}) {
    const targetEl = scrollToMessageCore({
      msgId,
      scrollEl: this.scrollEl,
      setProgrammaticStreamFollowScroll: value => {
        this._programmaticStreamFollowScroll = value;
      },
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
    if (!targetEl) return false;
    const autoClearMs = Number.isFinite(Number(options?.autoClearMs))
      ? Number(options.autoClearMs)
      : 2900;
    this.applyJumpFocus(targetEl, {
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
    const runtime = typeof window !== 'undefined' ? window.appBridge?.pluginRuntime : null;
    const scriptRuntime = typeof window !== 'undefined' ? window.appBridge?.scriptRuntime : null;
    return addMessageCore({
      message,
      options,
      decorateMessage: (nextMessage, context) => this.decorateMessage(nextMessage, context),
      ensureMessageId: (nextMessage) => {
        if (nextMessage && !nextMessage.id) {
          nextMessage.id = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        }
        return nextMessage;
      },
      syncOriginalMessageId: (originalMessage, renderedMessage) => {
        if (originalMessage && renderedMessage && originalMessage !== renderedMessage && renderedMessage.id && !originalMessage.id) {
          originalMessage.id = renderedMessage.id;
        }
      },
      dispatchBeforeRender: (renderedMessage) => {
        if (runtime) {
          runtime.dispatchEvent('message.before_render', { message: renderedMessage }).catch(err => {
            logger.warn('plugin message.before_render failed', err);
          });
        }
        if (scriptRuntime) {
          scriptRuntime.dispatchEvent('message.before_render', { message: renderedMessage }).catch(err => {
            logger.warn('script message.before_render failed', err);
          });
        }
      },
      dispatchAfterRender: (renderedMessage, element) => {
        if (runtime && element) {
          runtime.dispatchEvent('message.after_render', { message: renderedMessage, elementId: renderedMessage?.id || '' }).catch(err => {
            logger.warn('plugin message.after_render failed', err);
          });
        }
        if (scriptRuntime && element) {
          scriptRuntime.dispatchEvent('message.after_render', { message: renderedMessage, elementId: renderedMessage?.id || '' }).catch(err => {
            logger.warn('script message.after_render failed', err);
          });
        }
      },
      isNearBottom: () => this.isNearBottom(),
      createRpFloorMarker: nextMessage => this._createRpFloorMarker(nextMessage),
      buildMessageElement: nextMessage => this.buildMessageElement(nextMessage),
      scrollEl: this.scrollEl,
      scrollToBottom: () => this.scrollToBottom(),
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
    });
  }

  buildMessageElement(message) {
    return buildMessageElementCore({
      message,
      resolveActiveSwipeMessage: value => this.resolveActiveSwipeMessage(value),
      resolveMessageSessionId: value => this.resolveMessageSessionId(value),
      createMessageId: () => `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      createDividerMessageWrapper: payload => createDividerMessageWrapperCore(payload),
      createSystemMessageWrapper: payload => createSystemMessageWrapperCore(payload),
      bindMessageContextInteractions: ({ wrapper, message: nextMessage }) => this.longPressRuntime.bindMessageContextInteractions({
        wrapper,
        message: nextMessage,
        getLongPressTimer: () => this.longPressTimer,
        getLongPressStart: () => this.longPressStart,
        getPoint: event => this.getPoint(event),
        clearLongPress: () => this.clearLongPress(),
        startLongPress: (event, messageValue) => this.startLongPress(event, messageValue),
        showContextMenu: (event, messageValue) => this.showContextMenu(event, messageValue),
      }),
      createStandardMessageWrapper: ({ documentLike, message: nextMessage, isUser }) => createStandardMessageWrapperCore({
        documentLike,
        message: nextMessage,
        isUser,
        applyCreativeBubbleState: (nextWrapper, messageValue) => this.applyCreativeBubbleState(nextWrapper, messageValue),
      }),
      createMessageAvatarImage: payload => createMessageAvatarImageCore(payload),
      defaultAvatar: getDefaultAppIcon(),
      documentLike: document,
      createBubble: (documentLike) => {
        const bubble = documentLike.createElement('div');
        bubble.className = 'QQ_chat_msgdiv';
        return bubble;
      },
      renderMessageBubbleContent: ({ bubble, message: nextMessage, resolvedSessionId }) => {
        renderMessageBubbleContentCore({
          bubble,
          message: nextMessage,
          resolvedSessionId,
          documentLike: document,
          resolveMediaUrl,
          resolveMediaAsset,
          resolveStickerFrames,
          resolveStickerFps,
          applyImageFallback,
          registerStickerAnimation,
          toastOnce,
          openLightbox: url => this.openLightbox(url),
          renderRichText,
          prepareTextContainer: (target, messageValue) => this.prepareTextContainer(target, messageValue),
          renderSwipeDraftPlaceholder: (target, label) => this.renderSwipeDraftPlaceholder(target, label),
          normalizeAssistantLineBreaks: text => this.normalizeAssistantLineBreaks(text),
          renderTextWithStickers: (target, text) => this.renderTextWithStickers(target, text),
          logGreetingRender: (messageValue, sessionId) => {
            logger.info(
              `[rp-greeting] ui-render messageId=${String(messageValue?.id || '')} session=${sessionId} len=${String(messageValue?.content || '').length}`,
            );
          },
          createAudio: url => new Audio(url),
          warningToast: text => window.toastr?.warning?.(text),
          errorToast: text => window.toastr?.error?.(text),
        });
      },
      buildReactionSummaryElement: nextMessage => this.buildReactionSummaryElement(nextMessage),
      createReactionTriggerButton,
      buildBubbleStack: payload => buildBubbleStackCore(payload),
      appendStandardMessageLayout: payload => appendStandardMessageLayoutCore(payload),
      isThreadingEnabledForMessage: nextMessage => this.isThreadingEnabledForMessage(nextMessage),
      showReactionPicker: (button, nextMessage) => this.showReactionPicker(button, nextMessage),
      createSwipeIndicatorElement,
      getUiMode: () => document.body?.dataset?.uiMode || '',
      selectionMode: this.selectionMode,
      scheduleSelectionModeApply: ({ selectionMode, messageId, scrollEl, markWrapperSelectable, setSelectionBarVisible }) =>
        scheduleSelectionModeApplyCore({
          selectionMode,
          messageId,
          scrollEl,
          markWrapperSelectable,
          setSelectionBarVisible,
          schedule: (handler, delay = 0) => setTimeout(handler, delay),
        }),
      scrollEl: this.scrollEl,
      markWrapperSelectable: (wrapper, msgId) => this.markWrapperSelectable(wrapper, msgId),
      setSelectionBarVisible: visible => this.setSelectionBarVisible(visible),
    });
  }

  /**
   * @param {string} avatarUrl - 单聊头像
   * @param {object} options
   * @param {Array<{name:string, avatar:string}>} [options.groupMembers] - 群聊成员列表，提供时启用多人输入样式
   */
  showTyping(avatarUrl = '', options = {}) {
    return showTypingCore({
      avatarUrl,
      options,
      isTypingDotsEnabled: () => this.isTypingDotsEnabled(),
      uiMode: document.body.dataset.uiMode,
      typingEl: this.typingEl,
      clearTypingTimers: () => this._clearTypingTimers(),
      createTypingIndicatorShell,
      documentLike: document,
      runGroupTypingCycle: payload => this.typingIndicatorScheduleRuntime.runGroupTypingCycle(payload),
      renderTypingGroupMembers,
      getDefaultAvatar: getDefaultAppIcon,
      schedule: (handler, delay = 0) => setTimeout(handler, delay),
      runPrivateThinkPause: payload => this.typingIndicatorScheduleRuntime.runPrivateThinkPause(payload),
      isNearBottom: () => this.isNearBottom(),
      applyThinkPause: () => this._applyThinkPause(),
      removeThinkPause: () => this._removeThinkPause(),
      scrollToBottom: () => this.scrollToBottom(),
      setCycleTimer: value => {
        this._typingCycleTimer = value;
      },
      setThinkTimer: value => {
        this._typingThinkTimer = value;
      },
      setResumeTimer: value => {
        this._typingThinkResumeTimer = value;
      },
      mountTypingElement: payload => this.typingIndicatorScheduleRuntime.mountTypingElement(payload),
      scrollEl: this.scrollEl,
      setTypingEl: value => {
        this.typingEl = value;
      },
      setTypingNaturalHeight: value => {
        this._typingNaturalHeight = value;
      },
      showFloatingTyping: value => this._showFloatingTyping(value),
    });
  }

  hideTyping() {
    hideTypingCore({
      clearTypingTimers: () => this._clearTypingTimers(),
      clearMessageQueueTimer: () => this._clearMessageQueueTimer(),
      removeTypingElement: () => this._removeTypingElement(),
    });
  }

  /** 仅移除 typing DOM，不清除定时器（供 enqueueMessages 在同一帧替换用） */
  _removeTypingElement() {
    this.typingIndicatorRuntime.removeTypingElement({
      typingEl: this.typingEl,
      floatingTypingEl: this._floatingTypingEl,
      setTypingEl: value => {
        this.typingEl = value;
      },
      setFloatingTypingEl: value => {
        this._floatingTypingEl = value;
      },
      onRemoved: () => {
        this.scheduleScrollBottomButtonRefresh({ immediate: true });
      },
    });
  }

  _applyThinkPause() {
    this.typingIndicatorRuntime.applyThinkPause({
      typingEl: this.typingEl,
    });
  }

  _removeThinkPause() {
    this.typingIndicatorRuntime.removeThinkPause({
      typingEl: this.typingEl,
      typingNaturalHeight: this._typingNaturalHeight || 36,
    });
  }

  _showFloatingTyping(sourceWrap) {
    return this.typingIndicatorRuntime.showFloatingTyping({
      scrollEl: this.scrollEl,
      sourceWrap,
      floatingTypingEl: this._floatingTypingEl,
      setFloatingTypingEl: value => {
        this._floatingTypingEl = value;
      },
    });
  }

  _clearTypingTimers() {
    this.typingIndicatorRuntime.clearTypingTimers({
      getCycleTimer: () => this._typingCycleTimer,
      setCycleTimer: value => {
        this._typingCycleTimer = value;
      },
      getThinkTimer: () => this._typingThinkTimer,
      setThinkTimer: value => {
        this._typingThinkTimer = value;
      },
      getResumeTimer: () => this._typingThinkResumeTimer,
      setResumeTimer: value => {
        this._typingThinkResumeTimer = value;
      },
    });
  }

  _clearDeliverySequence() {
    this.deliveryStatusRuntime.clearDeliverySequence({
      getReadTimer: () => this._deliveryReadTimer,
      setReadTimer: value => {
        this._deliveryReadTimer = value;
      },
      getTypingTimer: () => this._deliveryTypingTimer,
      setTypingTimer: value => {
        this._deliveryTypingTimer = value;
      },
    });
  }

  /**
   * 对最近发送的用户消息显示「✔ 已送出」
   */
  showDeliveryStatus() {
    this.deliveryStatusRuntime.showDeliveryStatus({
      scrollEl: this.scrollEl,
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
    this.deliveryStatusRuntime.startDeliverySequence({
      avatarUrl,
      typingOptions,
      readOptions,
      clearDeliverySequence: () => this._clearDeliverySequence(),
      setDeliverySequenceDone: value => {
        this._deliverySequenceDone = value;
      },
      markAsRead: options => this._markAsRead(options),
      showTyping: (nextAvatarUrl, nextTypingOptions) => this.showTyping(nextAvatarUrl, nextTypingOptions),
      setReadTimer: value => {
        this._deliveryReadTimer = value;
      },
      setTypingTimer: value => {
        this._deliveryTypingTimer = value;
      },
    });
  }

  _syncDeliveryTextToMessages(targets, text) {
    this.deliveryStatusRuntime.syncDeliveryText(targets, text, {
      onDeliveryTextChange: this._onDeliveryTextChange,
    });
  }

  onDeliveryTextChange(handler) {
    this._onDeliveryTextChange = typeof handler === 'function' ? handler : null;
  }

  /**
   * 将「✔ 已送出」标记为「已读」
   */
  _markAsRead(options = {}) {
    this.deliveryStatusRuntime.markAsRead({
      scrollEl: this.scrollEl,
      groupMemberCount: options.groupMemberCount,
      onSyncText: (targets, text) => this._syncDeliveryTextToMessages(targets, text),
      getReadCountCurrent: () => this._readCountCurrent,
      setReadCountCurrent: value => {
        this._readCountCurrent = value;
      },
      setReadCountTargets: value => {
        this._readCountTargets = value;
      },
      setReadCountMax: value => {
        this._readCountMax = value;
      },
      getReadCountTimer: () => this._readCountTimer,
      setReadCountTimer: value => {
        this._readCountTimer = value;
      },
    });
  }

  /**
   * AI 回复后：根据回复中出现的不同说话者数量提升已读计数
   * @param {number} speakerCount - 本次回复中不同说话者数量
   */
  bumpReadCount(speakerCount) {
    this.deliveryStatusRuntime.bumpReadCount({
      speakerCount,
      onSyncText: (targets, text) => this._syncDeliveryTextToMessages(targets, text),
      getReadCountTargets: () => this._readCountTargets,
      getReadCountCurrent: () => this._readCountCurrent,
      setReadCountCurrent: value => {
        this._readCountCurrent = value;
      },
      getReadCountMax: () => this._readCountMax,
      getReadCountTimer: () => this._readCountTimer,
      setReadCountTimer: value => {
        this._readCountTimer = value;
      },
    });
  }

  /**
   * 快进送达序列：如果 AI 回复在序列完成前就到达，
   * 立刻显示「已读」并跳过 typing dots
   */
  fastForwardDeliverySequence(readOptions = {}) {
    this.deliveryStatusRuntime.fastForwardDeliverySequence({
      readOptions,
      clearDeliverySequence: () => this._clearDeliverySequence(),
      markAsRead: options => this._markAsRead(options),
      setDeliverySequenceDone: value => {
        this._deliverySequenceDone = value;
      },
    });
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
    return enqueueMessagesCore({
      items,
      options,
      clearMessageQueueTimer: () => this._clearMessageQueueTimer(),
      hideTyping: () => this.hideTyping(),
      showTyping: (nextAvatarUrl, nextOptions) => this.showTyping(nextAvatarUrl, nextOptions),
      getTypingThinkTimer: () => this._typingThinkTimer,
      setTypingThinkTimer: value => {
        this._typingThinkTimer = value;
      },
      getTypingThinkResumeTimer: () => this._typingThinkResumeTimer,
      setTypingThinkResumeTimer: value => {
        this._typingThinkResumeTimer = value;
      },
      isNearBottom: () => this.isNearBottom(),
      applyThinkPause: () => this._applyThinkPause(),
      removeThinkPause: () => this._removeThinkPause(),
      removeTypingElement: () => this._removeTypingElement(),
      scrollToBottom: () => this.scrollToBottom(),
      setMessageQueueTimer: value => {
        this._messageQueueTimer = value;
      },
      scheduleTimeout: (handler, delay) => setTimeout(handler, delay),
      scheduleFrame: handler => requestAnimationFrame(handler),
      addMessage: message => this.addMessage(message),
    });
  }

  _clearMessageQueueTimer() {
    return clearMessageQueueTimerCore({
      getMessageQueueTimer: () => this._messageQueueTimer,
      setMessageQueueTimer: value => {
        this._messageQueueTimer = value;
      },
      clearTimer: timerId => clearTimeout(timerId),
    });
  }

  startAssistantContinuationStream(msgId, meta = {}) {
    return this.assistantStreamUiRuntime.startAssistantContinuationStream({
      scrollEl: this.scrollEl,
      msgId,
      meta,
      messageBuffer: this.messageBuffer,
      setStreamingState: active => this.setStreamingState(active),
      isNearBottom: threshold => this.isNearBottom(threshold),
      getStreamAutoFollow: () => this.streamAutoFollow,
      setStreamAutoFollow: value => { this.streamAutoFollow = value; },
      renderAssistantStreamState: (...args) => this.renderAssistantStreamState(...args),
      finishMessageDom: (...args) => this.finishMessageDom(...args),
      buildAssistantStreamMessage: (...args) => this.buildAssistantStreamMessage(...args),
      normalizeAssistantStreamState: state => this.normalizeAssistantStreamState(state),
      scrollToBottom: () => this.scrollToBottom(),
    });
  }

  /**
   * Start a streaming assistant bubble
   */
  buildAssistantStreamMessage(placeholder, meta, msgId, state = {}) {
    return buildAssistantStreamMessageCore(placeholder, meta, msgId, state);
  }

  renderAssistantStreamState(messageEl, wrapperEl, msgId, meta, placeholder, state = {}) {
    return renderAssistantStreamStateCore({
      messageEl,
      wrapperEl,
      msgId,
      meta,
      placeholder,
      state,
      buildAssistantStreamMessage: (...args) => this.buildAssistantStreamMessage(...args),
      applyReasoningUiState: (...args) => this.applyReasoningUiState(...args),
      cleanupRichTextMounts: target => this.cleanupRichTextMounts(target),
      prepareTextContainer: (...args) => this.prepareTextContainer(...args),
      normalizeAssistantLineBreaks: text => this.normalizeAssistantLineBreaks(text),
      renderTextWithStickers: (...args) => this.renderTextWithStickers(...args),
      renderRichText,
      applyCreativeBubbleState: (...args) => this.applyCreativeBubbleState(...args),
    });
  }

  startAssistantStream(meta = {}) {
    return this.assistantStreamUiRuntime.startAssistantStream({
      meta,
      addMessage: (...args) => this.addMessage(...args),
      messageBuffer: this.messageBuffer,
      setStreamingState: active => this.setStreamingState(active),
      isNearBottom: threshold => this.isNearBottom(threshold),
      getStreamAutoFollow: () => this.streamAutoFollow,
      setStreamAutoFollow: value => { this.streamAutoFollow = value; },
      buildAssistantStreamMessage: (...args) => this.buildAssistantStreamMessage(...args),
      renderAssistantStreamState: (...args) => this.renderAssistantStreamState(...args),
      finishMessageDom: (...args) => this.finishMessageDom(...args),
      normalizeAssistantStreamState: state => this.normalizeAssistantStreamState(state),
      isTypingDotsEnabled: () => this.isTypingDotsEnabled(),
      scrollToBottom: () => this.scrollToBottom(),
    });
  }

  finishMessageDom(messageEl, wrapperEl, finalMessage, bufferIndex, msgId, meta, placeholder) {
    return finishMessageDomCore({
      messageEl,
      wrapperEl,
      finalMessage,
      bufferIndex,
      msgId,
      meta,
      placeholder,
      messageBuffer: this.messageBuffer,
      addMessage: (...args) => this.addMessage(...args),
      applyReasoningUiState: (...args) => this.applyReasoningUiState(...args),
      applyCreativeBubbleState: (...args) => this.applyCreativeBubbleState(...args),
      prepareTextContainer: (...args) => this.prepareTextContainer(...args),
      renderRichText,
      normalizeAssistantLineBreaks: text => this.normalizeAssistantLineBreaks(text),
      renderTextWithStickers: (...args) => this.renderTextWithStickers(...args),
    });
  }

  preloadHistory(messages = [], { keepScroll = false } = {}) {
    preloadHistoryCore({
      messages,
      keepScroll,
      scrollEl: this.scrollEl,
      documentLike: document,
      isRp: document.body?.dataset?.uiMode === 'rp',
      createRpFloorMarker: message => this._createRpFloorMarker(message),
      buildMessageElement: message => this.buildMessageElement(message),
      scrollToBottom: () => this.scrollToBottom(),
      refreshScrollDateBadge: () => this.refreshScrollDateBadge(),
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  prependHistory(messages = []) {
    prependHistoryCore({
      messages,
      scrollEl: this.scrollEl,
      documentLike: document,
      isRp: document.body?.dataset?.uiMode === 'rp',
      buildMessageElement: message => this.buildMessageElement(message),
      refreshRpFloorMarkers: () => this._refreshAllRpFloorMarkers(),
      refreshScrollDateBadge: () => this.refreshScrollDateBadge(),
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  refreshAvatars(resolver) {
    return refreshAvatarsCore({
      scrollEl: this.scrollEl,
      resolver,
    });
  }

  removeMessage(msgId) {
    return removeMessageCore({
      scrollEl: this.scrollEl,
      msgId,
      isRp: document.body?.dataset?.uiMode === 'rp',
      cleanupRichTextMounts: target => this.cleanupRichTextMounts(target),
      refreshRpFloorMarkers: () => this._refreshAllRpFloorMarkers(),
      refreshScrollDateBadge: () => this.refreshScrollDateBadge(),
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  updateMessage(msgId, newMessage) {
    return updateMessageCore({
      scrollEl: this.scrollEl,
      msgId,
      newMessage,
      resolveMessageSessionId: message => this.resolveMessageSessionId(message),
      resolveActiveSwipeMessage: message => this.resolveActiveSwipeMessage(message),
      decorateMessage: (...args) => this.decorateMessage(...args),
      tryPatchMessageElement: (...args) => this.tryPatchMessageElement(...args),
      buildMessageElement: message => this.buildMessageElement(message),
      cleanupRichTextMounts: target => this.cleanupRichTextMounts(target),
      refreshScrollDateBadge: () => this.refreshScrollDateBadge(),
      scheduleScrollBottomButtonRefresh: options => this.scheduleScrollBottomButtonRefresh(options),
    });
  }

  getMessageRenderSignature(message) {
    return this.messagePatchRuntime.getMessageRenderSignature(message);
  }

  patchMessageChrome(existing, next) {
    this.messagePatchRuntime.patchMessageChrome(existing, next);
  }

  tryPatchMessageElement(existing, next) {
    return this.messagePatchRuntime.tryPatchMessageElement(existing, next);
  }

  onMessageAction(handler) {
    this.actionHandler = handler;
  }

  startLongPress(event, message) {
    this.longPressRuntime.startLongPress({
      selectionMode: this.selectionMode,
      event,
      message,
      getPoint: value => this.getPoint(value),
      clearExisting: () => this.clearLongPress(),
      setLongPressStart: value => {
        this.longPressStart = value;
      },
      setLongPressTimer: value => {
        this.longPressTimer = value;
      },
      onTrigger: (nextEvent, nextMessage) => {
        this.showContextMenu(nextEvent, nextMessage);
      },
    });
  }

  clearLongPress() {
    this.longPressRuntime.clearLongPress({
      getLongPressTimer: () => this.longPressTimer,
      setLongPressTimer: value => {
        this.longPressTimer = value;
      },
      setLongPressStart: value => {
        this.longPressStart = value;
      },
    });
  }

  ensureSelectionBar() {
    this.selectionBar = this.selectionModeRuntime.ensureSelectionBar(this.selectionBar);
  }

  setSelectionBarVisible(visible) {
    this.ensureSelectionBar();
    this.selectionModeRuntime.setSelectionBarVisible(this.selectionBar, visible, this.selectedMessageIds);
  }

  updateWrapperSelectionState(wrapper, msgId) {
    this.selectionModeRuntime.updateWrapperSelectionState(wrapper, msgId, this.selectedMessageIds);
  }

  markWrapperSelectable(wrapper, msgId) {
    this.selectionModeRuntime.markWrapperSelectable(wrapper, msgId);
  }

  enterSelectionMode(initialMsgId) {
    this.selectionModeRuntime.enterSelectionMode({
      initialMsgId,
      scrollEl: this.scrollEl,
      setSelectionMode: value => {
        this.selectionMode = value;
      },
      setSelectedMessageIds: value => {
        this.selectedMessageIds = value;
      },
      setSelectionBarVisible: visible => this.setSelectionBarVisible(visible),
      markWrapperSelectable: (wrapper, msgId) => this.markWrapperSelectable(wrapper, msgId),
    });
  }

  exitSelectionMode() {
    this.selectionModeRuntime.exitSelectionMode({
      scrollEl: this.scrollEl,
      setSelectionMode: value => {
        this.selectionMode = value;
      },
      setSelectedMessageIds: value => {
        this.selectedMessageIds = value;
      },
      setSelectionBarVisible: visible => this.setSelectionBarVisible(visible),
    });
  }

  toggleMessageSelection(msgId) {
    this.selectionModeRuntime.toggleMessageSelection({
      msgId,
      selectedMessageIds: this.selectedMessageIds,
      scrollEl: this.scrollEl,
      updateWrapperSelectionState: (wrapper, id) => this.updateWrapperSelectionState(wrapper, id),
      setSelectionBarVisible: visible => this.setSelectionBarVisible(visible),
    });
  }

  createContextMenu() {
    return createContextMenuShell({ documentLike: document });
  }

  createReactionPicker() {
    return createReactionPickerCore({
      documentLike: document,
      onOutsidePress: () => this.hideReactionPicker(),
    });
  }

  hideReactionPicker() {
    hideReactionPickerCore(this.reactionPicker);
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
    this.replyDraftEl = this.replyDraftRuntime.ensureReplyDraftBar({
      inputContainer: this.inputContainer,
      composerAttachmentsEl: this.composerAttachmentsEl,
      existingBar: this.replyDraftEl,
    });
  }

  setReplyTarget(target) {
    this.replyDraftRuntime.setReplyTarget(this.replyDraftEl, target);
  }

  onReplyCancel(handler) {
    this.replyCancelHandler = typeof handler === 'function' ? handler : null;
  }

  getPoint(e) {
    return this.messageClipboardRuntime.getPoint(e);
  }

  async copyToClipboard(text) {
    return this.messageClipboardRuntime.copyToClipboard(text);
  }

  getBubbleCopyText(wrapper) {
    return this.messageClipboardRuntime.getBubbleCopyText(wrapper);
  }

  openCodeViewer({ message = null, text = '' } = {}) {
    const msg = message && typeof message === 'object' ? message : null;
    const content = String(text ?? '');
    const canSave = msg?.role === 'assistant' && typeof this.actionHandler === 'function';
    this.__chatappCodeViewer = this.codeViewerRuntime.openCodeViewer(this.__chatappCodeViewer, {
      message: msg,
      text: content,
      canSave,
    });
  }

  showContextMenu(evt, message) {
    return showContextMenuCore({
      event: evt,
      message,
      selectionMode: this.selectionMode,
      contextMenu: this.contextMenu,
      navigatorLike: navigator,
      scrollEl: this.scrollEl,
      hideReactionPicker: () => this.hideReactionPicker(),
      resolveContextMenuContext,
      buildContextMenuActions,
      isThreadingEnabledForMessage: nextMessage => this.isThreadingEnabledForMessage(nextMessage),
      normalizeReactionEntries,
      createContextMenuReactionRow,
      defaultReactionEmojis: DEFAULT_REACTION_EMOJIS,
      isSelfReaction: entry => hasReactionActor(entry, SELF_REACTION_ACTOR),
      createContextMenuActionButton,
      dispatchContextMenuAction,
      getPoint: nextEvent => this.getPoint(nextEvent),
      positionContextMenu,
      actionHandler: this.actionHandler,
      clearLongPress: () => this.clearLongPress(),
      openCodeViewer: payload => this.openCodeViewer(payload),
      getBubbleCopyText: wrapper => this.getBubbleCopyText(wrapper),
      copyToClipboard: text => this.copyToClipboard(text),
      startInlineEdit: nextMessage => this.startInlineEdit(nextMessage),
      enterSelectionMode: id => this.enterSelectionMode(id),
      successToast: text => window.toastr?.success?.(text),
      warningToast: text => window.toastr?.warning?.(text),
      documentLike: document,
      windowLike: window,
    });
  }

  startInlineEdit(message) {
    return this.inlineEditRuntime.startInlineEdit({
      scrollEl: this.scrollEl,
      message,
    });
  }

  openLightbox(url) {
    return this.feedbackOverlayRuntime.openLightbox(url);
  }

  showErrorBanner(text, action) {
    this.errorBanner = this.feedbackOverlayRuntime.showErrorBanner(this.errorBanner, text, action);
  }
}
