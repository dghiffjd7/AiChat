const escapeHtml = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const truncateBase64 = (value) => {
  if (typeof value !== 'string') return value;
  return value.replace(/data:[^;]+;base64,[A-Za-z0-9+/=]{100,}/g, (match) => {
    const commaAt = match.indexOf(',');
    if (commaAt < 0) return match;
    return `${match.slice(0, commaAt + 1)}...(${match.length - commaAt - 1} chars)`;
  });
};

const stringifyContent = (content) => {
  if (content === null || content === undefined) return '';
  if (typeof content === 'string') return truncateBase64(content);
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (!part || typeof part !== 'object') return '';
      if (part.type === 'text') return String(part.text || '');
      if (part.type === 'image_url') {
        const url = String(part.image_url?.url || '');
        return url.startsWith('data:') ? '[图片：base64]' : `[图片：${url}]`;
      }
      if (part.type === 'input_audio') return '[语音]';
      try { return JSON.stringify(part, null, 2); } catch { return '[复合内容]'; }
    }).filter(Boolean).join('\n');
  }
  try { return truncateBase64(JSON.stringify(content, null, 2)); } catch { return String(content); }
};

const stringifyMessage = (message) => {
  const blocks = [];
  const content = stringifyContent(message?.content);
  if (String(content || '').length) blocks.push(String(content));
  if (Array.isArray(message?.tool_calls) && message.tool_calls.length) {
    try { blocks.push(JSON.stringify({ tool_calls: message.tool_calls }, null, 2)); } catch {}
  }
  if (message?.tool_call_id) blocks.push(`tool_call_id: ${String(message.tool_call_id)}`);
  return blocks.join('\n');
};

const toFiniteNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const next = Number(value);
  return Number.isFinite(next) ? next : null;
};

const formatInt = (value) => {
  const next = toFiniteNumber(value);
  return next === null ? '—' : Math.max(0, Math.trunc(next)).toLocaleString('zh-CN');
};

const formatDuration = (value) => {
  const next = toFiniteNumber(value);
  if (next === null || next < 0) return '—';
  if (next < 1000) return `${Math.round(next)} ms`;
  return `${(next / 1000).toFixed(next < 10_000 ? 2 : 1)} s`;
};

const normalizeParamEntries = (request) => {
  const merged = { ...(request?.options || {}), ...(request?.requestOptions || {}) };
  const skipped = new Set([
    'signal',
    'nativeRequestId',
    'tools',
    'tool_choice',
    'onProviderUsage',
    'onProviderToolCallDelta',
  ]);
  return Object.entries(merged)
    .filter(([key, value]) => !skipped.has(key) && value !== undefined && typeof value !== 'function')
    .map(([key, value]) => {
      if (value === null || typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        return { key, value: value === null ? 'null' : String(value), kind: typeof value };
      }
      if (Array.isArray(value)) return { key, value: `${value.length} 项`, kind: 'summary' };
      if (typeof value === 'object') return { key, value: `${Object.keys(value).length} 个字段`, kind: 'summary' };
      return { key, value: String(value), kind: 'summary' };
    });
};

const renderParamValue = (entry) => {
  if (entry.kind === 'string') return `<span class="prompt-json-string">&quot;${escapeHtml(entry.value)}&quot;</span>`;
  if (entry.kind === 'number') return `<span class="prompt-json-number">${escapeHtml(entry.value)}</span>`;
  if (entry.kind === 'boolean') return `<span class="prompt-json-boolean">${escapeHtml(entry.value)}</span>`;
  if (entry.kind === 'object') return '<span class="prompt-json-muted">null</span>';
  return `<span class="prompt-json-summary">${escapeHtml(entry.value)}</span>`;
};

const roleCounts = (messages) => {
  const counts = new Map();
  messages.forEach((message) => {
    const role = String(message?.role || 'message').trim().toLowerCase() || 'message';
    counts.set(role, (counts.get(role) || 0) + 1);
  });
  return Array.from(counts.entries());
};

const renderMetricCard = ({ label, value, note = '', state = '' }) => `
  <article class="prompt-overview-metric${state ? ` is-${state}` : ''}">
    <span>${escapeHtml(label)}</span>
    <strong>${escapeHtml(value)}</strong>
    ${note ? `<small>${escapeHtml(note)}</small>` : ''}
  </article>
`;

export const buildPromptOverviewView = (request = null, {
  injectionAuditHtml = '',
  injectionAuditText = '',
} = {}) => {
  const req = request && typeof request === 'object' ? request : {};
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const roles = roleCounts(messages);
  const audit = req.injectionAudit && typeof req.injectionAudit === 'object' ? req.injectionAudit : {};
  const diagnostics = req.responseDiagnostics && typeof req.responseDiagnostics === 'object'
    ? req.responseDiagnostics
    : {};
  const params = normalizeParamEntries(req);
  const at = req.at
    ? new Date(req.at).toLocaleString('zh-CN', { hour12: false })
    : '—';
  const estimatedInput = toFiniteNumber(audit.totalEstimateTokens ?? audit.usedTokens);
  const inputBudget = toFiniteNumber(audit.inputBudgetTokens);
  const headroom = Number.isFinite(estimatedInput) && Number.isFinite(inputBudget)
    ? Math.max(0, inputBudget - estimatedInput)
    : null;
  const usagePercent = Number.isFinite(estimatedInput) && Number.isFinite(inputBudget) && inputBudget > 0
    ? Math.max(0, Math.min(100, (estimatedInput / inputBudget) * 100))
    : null;
  const firstTokenLatencyMs = toFiniteNumber(diagnostics.firstTokenLatencyMs);
  const tokensPerSecond = toFiniteNumber(diagnostics.tokensPerSecond);
  const firstTokenValue = firstTokenLatencyMs !== null
    ? formatDuration(diagnostics.firstTokenLatencyMs)
    : (req.stream ? '未记录' : '非流式');
  const tpsValue = tokensPerSecond !== null
    ? `${tokensPerSecond.toFixed(1)} tok/s`
    : '—';
  const fingerprint = String(diagnostics.systemFingerprint || '').trim();
  const requestRows = [
    ['request_id', req.requestId || '—'],
    ['provider', req.provider || '—'],
    ['model', req.model || '—'],
    ['base_url', req.baseUrl || '—'],
    ['stream', req.stream ? 'true' : 'false'],
    ['session', req.session?.name || req.session?.id || '—'],
    ['profile', req.configProfile?.id || req.configProfile?.source || 'global'],
    ['message_count', String(messages.length)],
    ['response_prefix', req.responsePrefix ? 'present' : 'none'],
  ];

  const requestJsonRows = requestRows.map(([key, value], index) => `
    <div class="prompt-overview-code-line">
      <span class="prompt-overview-line-number">${index + 1}</span>
      <code><span class="prompt-json-key">&quot;${escapeHtml(key)}&quot;</span><span class="prompt-json-punctuation">: </span><span class="prompt-json-string">&quot;${escapeHtml(value)}&quot;</span>${index === requestRows.length - 1 && !params.length ? '' : '<span class="prompt-json-punctuation">,</span>'}</code>
    </div>
  `).join('');
  const paramRows = params.map((entry, index) => `
    <div class="prompt-overview-code-line">
      <span class="prompt-overview-line-number">${requestRows.length + index + 1}</span>
      <code><span class="prompt-json-key">&quot;${escapeHtml(entry.key)}&quot;</span><span class="prompt-json-punctuation">: </span>${renderParamValue(entry)}${index === params.length - 1 ? '' : '<span class="prompt-json-punctuation">,</span>'}</code>
    </div>
  `).join('');
  const roleChips = roles.map(([role, count]) => (
    `<span class="prompt-overview-role-chip" data-prompt-role="${escapeHtml(role)}">${escapeHtml(role)} ×${count}</span>`
  )).join('');
  const metrics = [
    { label: '总响应耗时', value: formatDuration(diagnostics.latencyMs), note: '请求开始至 usage 返回' },
    { label: '首字延迟', value: firstTokenValue, note: req.stream ? '首个 provider 流片段' : '仅流式请求可测' },
    { label: '输出速度', value: tpsValue, note: '真实输出 token ÷ 首字后时长' },
    { label: '输出 Token', value: formatInt(diagnostics.completionTokens), note: '供应方 usage' },
  ];

  const html = `
    <div class="prompt-overview-view">
      <div class="prompt-overview-intro">
        <span class="prompt-overview-kicker">REQUEST OVERVIEW · READ ONLY</span>
        <h2>本次请求概览</h2>
        <p>这里仅展示注入构成、请求配置与响应诊断；完整消息正文只在“完整 Prompt”分页出现。</p>
        <div class="prompt-overview-chips">
          <span>${escapeHtml(req.provider || '未配置 provider')}</span>
          <span>${escapeHtml(req.model || '未配置 model')}</span>
          <span>${messages.length} 条消息</span>
          <span>${escapeHtml(at)}</span>
        </div>
      </div>

      <div class="prompt-overview-layout">
        <section class="prompt-overview-panel prompt-overview-composition">
          <header class="prompt-overview-panel-head">
            <span class="prompt-overview-panel-icon" aria-hidden="true">◌</span>
            <span><strong>本次注入构成</strong><small>INJECTION COMPOSITION</small></span>
            ${Number.isFinite(estimatedInput) ? `<b>≈ ${formatInt(estimatedInput)} tok</b>` : ''}
          </header>
          <div class="prompt-overview-role-summary">
            ${roleChips || '<span class="prompt-overview-role-chip">暂无消息</span>'}
            ${headroom === null ? '' : `<span class="prompt-overview-headroom">余量 ${formatInt(headroom)} tok</span>`}
          </div>
          <div class="prompt-overview-usage">
            <div class="prompt-overview-usage-ring" style="--prompt-usage-angle:${usagePercent === null ? 0 : (usagePercent * 3.6).toFixed(2)}deg">
              <span><strong>${usagePercent === null ? '—' : `${usagePercent.toFixed(1)}%`}</strong><small>CONTEXT</small></span>
            </div>
            <dl>
              <div><dt>已注入</dt><dd>${formatInt(estimatedInput)} <small>tok</small></dd></div>
              <div><dt>输入预算</dt><dd>${formatInt(inputBudget)} <small>tok</small></dd></div>
              <div><dt>剩余空间</dt><dd>${formatInt(headroom)} <small>tok</small></dd></div>
            </dl>
          </div>
          ${injectionAuditHtml || '<div class="prompt-overview-empty">暂无本次注入审计记录</div>'}
        </section>

        <section class="prompt-overview-panel prompt-overview-request-card">
          <header class="prompt-overview-panel-head">
            <span class="prompt-overview-panel-icon" aria-hidden="true">{ }</span>
            <span><strong>请求配置</strong><small>REQUEST.JSONC · 不含消息正文</small></span>
            <span class="prompt-overview-readonly">readonly</span>
          </header>
          <div class="prompt-overview-code" role="region" aria-label="请求配置">
            <div class="prompt-overview-code-line is-brace"><span class="prompt-overview-line-number">0</span><code>{</code></div>
            ${requestJsonRows}${paramRows}
            <div class="prompt-overview-code-line is-brace"><span class="prompt-overview-line-number">${requestRows.length + params.length + 1}</span><code>}</code></div>
          </div>
        </section>
      </div>

      <section class="prompt-overview-response">
        <header class="prompt-overview-section-head">
          <span><strong>响应性能</strong><small>真实 provider 数据；不可得时不估算</small></span>
          ${diagnostics.finishReason ? `<b>finish · ${escapeHtml(diagnostics.finishReason)}</b>` : ''}
        </header>
        <div class="prompt-overview-metrics">${metrics.map(renderMetricCard).join('')}</div>
        <div class="prompt-overview-fingerprint">
          <span>system fingerprint</span>
          <code title="${escapeHtml(fingerprint || '供应方未返回')}">${escapeHtml(fingerprint || '供应方未返回')}</code>
          <small>模型运行标识 · 仅在响应提供时记录</small>
        </div>
      </section>
    </div>
  `;

  const plain = [
    '本次请求概览',
    `时间: ${at}`,
    `request id: ${req.requestId || '—'}`,
    `provider: ${req.provider || '—'}`,
    `model: ${req.model || '—'}`,
    `base url: ${req.baseUrl || '—'}`,
    `stream: ${req.stream ? 'true' : 'false'}`,
    `message count: ${messages.length}`,
    roles.length ? `roles: ${roles.map(([role, count]) => `${role} ×${count}`).join(', ')}` : '',
    params.length ? `generation params: ${params.map(item => `${item.key}=${item.value}`).join(', ')}` : '',
    injectionAuditText,
    `total latency: ${formatDuration(diagnostics.latencyMs)}`,
    `first token latency: ${firstTokenValue}`,
    `output speed: ${tpsValue}`,
    `completion tokens: ${formatInt(diagnostics.completionTokens)}`,
    `system fingerprint: ${fingerprint || '供应方未返回'}`,
  ].filter(Boolean).join('\n');

  return { html, plain };
};

const INLINE_TOKEN_RE = /(<\|[^|\n]*\|>|<\/?[A-Za-z_\u3400-\u9fff][^>\n]*>|\*\*[^*\n]+\*\*)/g;

const renderPromptInline = (line) => {
  const parts = String(line || '').split(INLINE_TOKEN_RE);
  return parts.map((part) => {
    if (!part) return '';
    if (part.startsWith('<|') && part.endsWith('|>')) {
      return `<span class="prompt-inline-token">${escapeHtml(part)}</span>`;
    }
    if (/^<\/?[A-Za-z_\u3400-\u9fff][^>\n]*>$/.test(part)) {
      return `<span class="prompt-inline-tag">${escapeHtml(part)}</span>`;
    }
    if (part.startsWith('**') && part.endsWith('**')) {
      return `<strong class="prompt-inline-bold">${escapeHtml(part.slice(2, -2))}</strong>`;
    }
    return escapeHtml(part);
  }).join('');
};

const roleLabel = (message, index) => {
  const role = String(message?.role || 'message').trim().toLowerCase() || 'message';
  const name = String(message?.name || '').trim();
  return {
    role,
    label: `[${role}] #${index + 1}${name ? ` · ${name}` : ''}`,
  };
};

export const buildFullPromptDocument = (request = null, { fallbackText = '' } = {}) => {
  const req = request && typeof request === 'object' ? request : {};
  const messages = Array.isArray(req.messages) ? req.messages : [];
  const blocks = messages.map((message, index) => {
    const role = roleLabel(message, index);
    return { ...role, text: stringifyMessage(message) };
  });
  if (req.responsePrefix) {
    blocks.push({ role: 'assistant', label: '[assistant prefill]', text: String(truncateBase64(req.responsePrefix) || '') });
  }
  if (!blocks.length && String(fallbackText || '').trim()) {
    blocks.push({ role: 'message', label: '[prompt]', text: String(fallbackText) });
  }

  const plain = blocks.map(block => `${block.label}\n${block.text}`).join('\n\n');
  const rows = [];
  blocks.forEach((block, blockIndex) => {
    rows.push({ type: 'role', role: block.role, text: block.label });
    String(block.text || '').split(/\r?\n/).forEach((line) => rows.push({ type: 'content', role: block.role, text: line }));
    if (blockIndex < blocks.length - 1) rows.push({ type: 'content', role: block.role, text: '' });
  });
  const estimatedTokens = toFiniteNumber(req.injectionAudit?.totalEstimateTokens ?? req.injectionAudit?.usedTokens);
  const lineRows = rows.map((row, index) => {
    const lineNumber = index + 1;
    if (row.type === 'role') {
      return `
        <div class="prompt-document-role" data-prompt-role="${escapeHtml(row.role)}" style="--prompt-line-index:${index}">
          <span class="prompt-document-line-number" data-prompt-line-number="${lineNumber}">${lineNumber}</span>
          <span class="prompt-document-rule"></span>
          <strong>${escapeHtml(row.text)}</strong>
          <span class="prompt-document-rule"></span>
        </div>
      `;
    }
    const lineClass = row.text.startsWith('# ')
      ? ' is-heading'
      : row.text === 'NOTE:'
        ? ' is-note'
        : row.text.startsWith('- ')
          ? ' is-list'
          : '';
    return `
      <div class="prompt-document-line${lineClass}" style="--prompt-line-index:${index}">
        <span class="prompt-document-line-number" data-prompt-line-number="${lineNumber}">${lineNumber}</span>
        <code>${row.text === '' ? '&nbsp;' : renderPromptInline(row.text)}</code>
      </div>
    `;
  }).join('');

  const html = `
    <section class="prompt-full-browser">
      <header class="prompt-full-heading">
        <div class="prompt-full-heading-icon" aria-hidden="true">¶</div>
        <div>
          <span class="prompt-overview-kicker">ASSEMBLED PROMPT · READ ONLY</span>
          <h2>完整 Prompt</h2>
          <p>所有消息按实际发送顺序展开；行号仅用于浏览，不会进入请求。</p>
        </div>
        <div class="prompt-full-stats">
          <span>${formatInt(rows.length)} 行</span>
          <span>${formatInt(plain.length)} 字符</span>
          ${Number.isFinite(estimatedTokens) ? `<span>≈ ${formatInt(estimatedTokens)} tok</span>` : ''}
        </div>
        <button type="button" class="prompt-full-wrap is-active" data-prompt-wrap-toggle aria-pressed="true">
          <span aria-hidden="true">↩</span>自动换行<i></i>
        </button>
        <button type="button" class="prompt-full-copy" data-prompt-copy-all>复制全文</button>
      </header>
      <div class="prompt-document-shell" data-prompt-document>
        <div class="prompt-document-titlebar">
          <span class="prompt-document-status" aria-hidden="true"></span>
          <code>assembled_prompt.txt · utf-8</code>
          <span>readonly</span>
        </div>
        <div class="prompt-document-scroll">
          <div class="prompt-document-lines">${lineRows || '<div class="prompt-overview-empty">暂无 Prompt 内容</div>'}</div>
        </div>
      </div>
      <footer class="prompt-document-end"><span></span>END OF PROMPT<span></span></footer>
    </section>
  `;

  return {
    html,
    plain,
    lineCount: rows.length,
    charCount: plain.length,
    messageCount: blocks.length,
  };
};
