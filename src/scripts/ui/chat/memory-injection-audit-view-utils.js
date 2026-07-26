import { buildOverQuotaWarnings, formatInjectionAuditText } from '../../memory/memory-injection-audit-utils.js';

const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const toNonNegativeInt = (value) => {
  const next = Math.trunc(Number(value));
  return Number.isFinite(next) ? Math.max(0, next) : 0;
};

export const renderMemoryInjectionAuditHtml = (audit = null) => {
  if (!audit || typeof audit !== 'object') return '';
  const total = toNonNegativeInt(audit.totalEstimateTokens ?? audit.usedTokens);
  const budget = Number.isFinite(Number(audit.inputBudgetTokens))
    ? Math.max(0, Math.trunc(Number(audit.inputBudgetTokens)))
    : null;
  const segments = Array.isArray(audit.segments) ? audit.segments : [];
  const rows = segments.map((segment) => {
    const used = toNonNegativeInt(segment?.usedTokens);
    const quota = Number.isFinite(Number(segment?.quotaTokens))
      ? Math.max(0, Math.trunc(Number(segment.quotaTokens)))
      : null;
    const percent = budget && budget > 0 ? Math.min(100, Math.round((used / budget) * 100)) : 0;
    const meta = [];
    if (toNonNegativeInt(segment?.messageCount) > 0) meta.push(`${toNonNegativeInt(segment.messageCount)} 条消息`);
    if (toNonNegativeInt(segment?.rowCount) > 0) meta.push(`${toNonNegativeInt(segment.rowCount)} 行`);
    if (toNonNegativeInt(segment?.trimmedCount) > 0) meta.push(`裁掉 ${toNonNegativeInt(segment.trimmedCount)}`);
    if (segment?.detail) meta.push(String(segment.detail));
    return `
      <div class="memory-injection-audit-row">
        <div class="memory-injection-audit-row-head">
          <strong>${escapeHtml(segment?.label || segment?.id || '未命名分段')}</strong>
          <span>${used} token${quota === null ? '' : ` / ${quota}`}</span>
        </div>
        ${budget ? `<div class="memory-injection-audit-meter"><i style="width:${percent}%"></i></div>` : ''}
        ${meta.length ? `<small>${escapeHtml(meta.join(' · '))}</small>` : ''}
      </div>
    `;
  }).join('');
  const coverage = audit?.coverageLine && typeof audit.coverageLine === 'object'
    ? audit.coverageLine
    : null;
  const coverageRate = coverage && Number.isFinite(Number(coverage.coverageRate))
    ? Math.round(Number(coverage.coverageRate) * 100)
    : null;
  const holes = coverage && Array.isArray(coverage.holes) ? coverage.holes : [];
  const holeText = holes
    .map(item => `${toNonNegativeInt(item?.from)}-${toNonNegativeInt(item?.to)}`)
    .join('、');
  const protectedCount = toNonNegativeInt(coverage?.protectedMessageCount);
  const budgetModeLabel = String(audit.mode || '').toLowerCase() === 'rows'
    ? '行数模式 · Token 仅作安全估算'
    : 'Token 模式';
  const calibration = audit?.calibration && typeof audit.calibration === 'object'
    ? audit.calibration
    : null;
  const calibrationSamples = toNonNegativeInt(calibration?.samples);
  const calibrationLabel = calibrationSamples > 0
    ? `本地校准估算 ×${Number(calibration?.coefficient || 1).toFixed(3)} · ${calibrationSamples} 次样本`
    : `保守默认估算 ×${Number(calibration?.coefficient || 1).toFixed(2)} · 等待真实 usage 校准`;
  return `
    <section class="memory-injection-audit-card" data-memory-injection-audit>
      <header>
        <span><strong>本次注入构成</strong><small>只读审计 · ${budgetModeLabel} · ${escapeHtml(calibrationLabel)}</small></span>
        <b>${total}${budget === null ? '' : ` / ${budget}`} token</b>
      </header>
      ${buildOverQuotaWarnings(audit).map(warning => `<div class="memory-injection-audit-warning">${escapeHtml(warning)}</div>`).join('')}
      ${audit.overflowed === true ? '<div class="memory-injection-audit-warning">本次估算已超过输入预算</div>' : ''}
      ${coverage ? `
        <div class="memory-injection-audit-coverage ${holes.length ? 'has-holes' : ''}">
          摘要覆盖 ${coverageRate === null ? '未知' : `${coverageRate}%`}
          ${holes.length ? ` · 空洞 ${escapeHtml(holeText)}` : ' · 无空洞'}
          ${protectedCount > 0 ? ` · 已强制保留 ${protectedCount} 条原文消息` : ''}
        </div>
      ` : ''}
      <div class="memory-injection-audit-list">${rows || '<div class="memory-injection-audit-empty">暂无可统计分段</div>'}</div>
    </section>
  `;
};

export const formatMemoryInjectionAuditForCopy = (audit = null) => formatInjectionAuditText(audit);
