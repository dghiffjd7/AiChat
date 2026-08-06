import { classifyScriptRuntimeErrorCategory } from '../../import/script-capability-preflight.js';
import {
  fingerprintCompatGapValue,
  sanitizeCompatGapApi,
} from '../../storage/compat-gap-report-store.js';

const toIframeList = (value) => {
  try {
    return Array.from(value || []);
  } catch {
    return [];
  }
};

const getDatasetValue = (iframe, key) => String(iframe?.dataset?.[key] || '').trim();

export const resolveCompatGapMessage = ({ event = null, iframes = [] } = {}) => {
  const data = event?.data;
  if (!data || typeof data !== 'object' || data.type !== 'chatapp:compat-miss') {
    return { accepted: false, reason: 'unsupported-message' };
  }
  const iframe = toIframeList(iframes).find(candidate => {
    try {
      return candidate?.contentWindow === event?.source;
    } catch {
      return false;
    }
  });
  if (!iframe) return { accepted: false, reason: 'untrusted-source' };
  const iframeId = getDatasetValue(iframe, 'iframeId');
  const claimedId = String(data.id || '').trim();
  if (!iframeId || !claimedId || claimedId !== iframeId) {
    return { accepted: false, reason: 'iframe-id-mismatch' };
  }
  const api = sanitizeCompatGapApi(data.api);
  if (!api) return { accepted: false, reason: 'invalid-api' };
  const sessionId = getDatasetValue(iframe, 'sessionId');
  const messageId = getDatasetValue(iframe, 'msgId');
  const scopeSeed = sessionId
    ? `session:${sessionId}`
    : messageId
      ? `message:${messageId}`
      : `iframe:${iframeId}`;
  const revisionFingerprint = getDatasetValue(iframe, 'compatRevision') || 'unknown-revision';
  return {
    accepted: true,
    reason: '',
    iframe,
    iframeId,
    report: {
      scopeFingerprint: fingerprintCompatGapValue(scopeSeed),
      revisionFingerprint,
      api,
      status: 'candidate',
      phase: 'shim_access',
    },
  };
};

// 与 worker 诊断共用同一分类器（script-capability-preflight），避免两处规则漂移。
export const classifyCompatGapRuntimeError = classifyScriptRuntimeErrorCategory;

const fingerprintCompatError = (value) => {
  const normalized = String(value || '')
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/(['"`])[^'"`]{1,120}\1/g, '<string>')
    .replace(/\b\d+\b/g, '<number>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 500);
  return normalized ? fingerprintCompatGapValue(normalized) : '';
};

const getCompatApiMember = (api) => {
  const normalized = sanitizeCompatGapApi(api);
  if (!normalized) return '';
  return normalized.slice(normalized.lastIndexOf('.') + 1);
};

export class CompatGapCorrelationTracker {
  constructor({ now = () => Date.now(), windowMs = 5000, perIframeLimit = 48 } = {}) {
    this.now = now;
    this.windowMs = Math.max(250, Math.trunc(Number(windowMs) || 5000));
    this.perIframeLimit = Math.max(1, Math.trunc(Number(perIframeLimit) || 48));
    this.pending = new Map();
  }

  // 已销毁的 iframe 不再发消息，靠自身路径清不掉残键；任一 iframe 的活动顺带全表扫除。
  sweep(now) {
    this.pending.forEach((list, id) => {
      const kept = list.filter(item => now - item.at <= this.windowMs);
      if (kept.length) this.pending.set(id, kept);
      else this.pending.delete(id);
    });
  }

  remember(resolved = {}) {
    if (resolved?.accepted !== true || !resolved.iframeId || !resolved.report?.api) return false;
    const now = Number(this.now()) || Date.now();
    this.sweep(now);
    const list = (this.pending.get(resolved.iframeId) || [])
      .filter(item => item.report.api !== resolved.report.api);
    list.push({ at: now, report: { ...resolved.report } });
    this.pending.set(resolved.iframeId, list.slice(-this.perIframeLimit));
    return true;
  }

  confirm({ iframeId = '', error = '' } = {}) {
    const id = String(iframeId || '').trim();
    if (!id) return null;
    const now = Number(this.now()) || Date.now();
    this.sweep(now);
    const category = classifyCompatGapRuntimeError(error);
    const current = this.pending.get(id) || [];
    if (!current.length) {
      this.pending.delete(id);
      return null;
    }
    this.pending.set(id, current);
    if (category !== 'api_shape') return null;
    const message = String(error || '').toLowerCase();
    let matchIndex = -1;
    for (let index = current.length - 1; index >= 0; index -= 1) {
      const member = getCompatApiMember(current[index].report.api).toLowerCase();
      if (member && message.includes(member)) {
        matchIndex = index;
        break;
      }
    }
    if (matchIndex < 0) return null;
    const [match] = current.splice(matchIndex, 1);
    if (current.length) this.pending.set(id, current);
    else this.pending.delete(id);
    return {
      ...match.report,
      status: 'confirmed',
      phase: 'runtime',
      errorCategory: category,
      errorFingerprint: fingerprintCompatError(error),
    };
  }

  clear(iframeId = '') {
    this.pending.delete(String(iframeId || '').trim());
  }
}

