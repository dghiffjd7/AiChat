const toPositiveInteger = value => {
  const number = Math.trunc(Number(value));
  return Number.isFinite(number) && number > 0 ? number : 0;
};

export const buildChatStructuredCircuitOccurrenceKey = (detail = {}) => {
  const evidenceKey = String(detail?.evidenceKey || '').trim();
  const circuitEpoch = toPositiveInteger(detail?.circuitEpoch);
  const circuitOpenedAt = toPositiveInteger(detail?.circuitOpenedAt);
  if (!evidenceKey || !circuitEpoch || !circuitOpenedAt) return '';
  return `${evidenceKey}:${circuitEpoch}:${circuitOpenedAt}`;
};

export const createChatStructuredCircuitToastTracker = ({ maxEntries = 128 } = {}) => {
  const seen = new Set();
  const limit = Math.max(1, toPositiveInteger(maxEntries) || 128);
  return {
    shouldNotify(detail = {}) {
      const key = buildChatStructuredCircuitOccurrenceKey(detail);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      while (seen.size > limit) seen.delete(seen.values().next().value);
      return true;
    },
    get size() {
      return seen.size;
    },
  };
};

export const armChatStructuredCircuitRetry = async ({
  detail = {},
  evidenceStore = null,
  localCapabilityStore = null,
} = {}) => {
  const evidenceKey = String(detail?.evidenceKey || '').trim();
  if (!evidenceKey) return false;
  const cell = (evidenceStore?.list?.() || [])
    .find(item => String(item?.key || '').trim() === evidenceKey);
  if (!cell || cell?.health?.circuitOpen !== true) return false;
  const localRuleId = String(detail?.localRuleId || '').trim();
  if (localRuleId) {
    const localReset = await localCapabilityStore?.resetCircuit?.(localRuleId);
    if (localReset !== true) return false;
  }
  return await evidenceStore?.armHalfOpen?.(cell.identity, cell.mode) === true;
};

const getToastRoot = toast => toast?.[0] || toast?.get?.(0) || null;

export const showChatStructuredCircuitToast = ({
  toastr = null,
  detail = {},
  onRetry = null,
} = {}) => {
  if (typeof toastr?.info !== 'function') return false;
  const retryLabel = String(detail?.mode || '').trim() === 'json_terminal'
    ? '下次重试结构化'
    : '下次重试 FC';
  const toast = toastr.info(
    `<span>该模型的回复格式连续失败，已切换为传统模式。</span><button type="button" class="chat-structured-route-toast-action">${retryLabel}</button>`,
    '聊天格式已自动调整',
    {
      tapToDismiss: false,
      closeButton: true,
      timeOut: 8000,
      extendedTimeOut: 4000,
    },
  );
  const button = getToastRoot(toast)?.querySelector?.('.chat-structured-route-toast-action');
  if (!button) return Boolean(toast);
  button.addEventListener?.('click', async (event) => {
    event?.preventDefault?.();
    event?.stopPropagation?.();
    event?.stopImmediatePropagation?.();
    if (button.disabled) return;
    button.disabled = true;
    button.textContent = '正在安排…';
    let armed = false;
    try {
      armed = await onRetry?.(detail) === true;
    } catch {}
    if (armed) {
      button.textContent = '已安排重试';
      button.classList?.add?.('is-complete');
      return;
    }
    button.disabled = false;
    button.textContent = '安排失败，重试';
  });
  return true;
};
