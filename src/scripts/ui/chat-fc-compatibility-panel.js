import { LLMClient } from '../api/client.js';
import {
  buildChatFcLocalRulesExport,
  buildChatFcLocalRuleFromProfile,
  getChatFcLocalRuleIdentityKey,
  normalizeChatFcLocalRule,
  parseChatFcLocalRulesImport,
} from '../agent/chat-fc-local-capability-rules.js';
import {
  buildChatFcZeroWriteTestPlan,
  runChatFcZeroWriteCompatibilityTest,
} from '../agent/chat-fc-zero-write-compat-test.js';
import { chatFcLocalCapabilityStore } from '../storage/chat-fc-local-capability-store.js';
import { chatStructuredRouteEvidenceStore } from '../storage/chat-structured-route-evidence-store.js';
import { appSettings } from '../storage/app-settings.js';
import { appConfirm } from './app-confirm.js';
import { logger } from '../utils/logger.js';
import { downloadJsonFile, pickJsonFileText } from '../utils/regex-transfer.js';

const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}[character]));

const trim = (value, fallback = '') => String(value ?? '').trim() || fallback;

const TEST_STATUS_LABELS = Object.freeze({
  passed: '零写入测试通过',
  failed: '上次测试失败',
  not_run: '尚未测试',
});

const ruleKey = rule => getChatFcLocalRuleIdentityKey(rule);

const EVIDENCE_MODE_LABELS = Object.freeze({
  provider_fc: 'FC',
  json_terminal: 'JSON',
});

const EVIDENCE_STATUS_LABELS = Object.freeze({
  unobserved: '尚未观察',
  observing: '观察中',
  local_observed_compatible: '本机观察兼容',
  contract_failure: '合同失败',
  circuit_open: '已熔断',
  negative_capability: '明确不支持',
  cooldown: '冷却中',
  identity_drift: '响应身份漂移',
});

const ZERO_WRITE_EVIDENCE_CAPABILITIES = Object.freeze({
  private_chat: Object.freeze(['basic_reply']),
  group_chat: Object.freeze(['basic_reply', 'batch_terminal']),
  moment_comment: Object.freeze(['basic_reply', 'batch_terminal', 'moment_comment']),
});

const sameSortedStrings = (left = [], right = []) => {
  const normalizedLeft = (Array.isArray(left) ? left : []).map(value => trim(value).toLowerCase()).sort();
  const normalizedRight = (Array.isArray(right) ? right : []).map(value => trim(value).toLowerCase()).sort();
  return normalizedLeft.length === normalizedRight.length
    && normalizedLeft.every((value, index) => value === normalizedRight[index]);
};

export const isChatStructuredEvidenceCoveredByZeroWriteRule = (cell = {}, rule = {}) => {
  if (trim(cell?.mode).toLowerCase() !== 'provider_fc') return false;
  const evidenceIdentity = cell?.identity && typeof cell.identity === 'object' ? cell.identity : {};
  const ruleIdentity = rule?.identity && typeof rule.identity === 'object' ? rule.identity : {};
  const surface = trim(evidenceIdentity.surface).toLowerCase();
  const expectedCapabilities = ZERO_WRITE_EVIDENCE_CAPABILITIES[surface];
  if (!expectedCapabilities) return false;
  return trim(evidenceIdentity.provider).toLowerCase() === trim(ruleIdentity.providerId).toLowerCase()
    && trim(evidenceIdentity.model).toLowerCase() === trim(ruleIdentity.modelId).toLowerCase()
    && trim(evidenceIdentity.endpoint).toLowerCase() === trim(ruleIdentity.endpointClass).toLowerCase()
    && trim(evidenceIdentity.adapter).toLowerCase() === trim(ruleIdentity.transportAdapter).toLowerCase()
    && trim(evidenceIdentity.endpointIdentity).toLowerCase() === trim(ruleIdentity.baseUrl).toLowerCase()
    && trim(evidenceIdentity.route).toLowerCase() === trim(ruleIdentity.route).toLowerCase()
    && sameSortedStrings(evidenceIdentity.capabilitySet, expectedCapabilities);
};

export const formatChatStructuredEvidenceCellForPanel = (cell = {}, { now = Date.now() } = {}) => {
  const identity = cell?.identity && typeof cell.identity === 'object' ? cell.identity : {};
  const health = cell?.health && typeof cell.health === 'object' ? cell.health : {};
  const cooldownUntil = Number(health.cooldownUntil || 0);
  const route = trim(identity.route);
  return {
    key: trim(cell.key),
    mode: trim(cell.mode),
    modeLabel: EVIDENCE_MODE_LABELS[trim(cell.mode)] || trim(cell.mode, '结构化'),
    statusLabel: EVIDENCE_STATUS_LABELS[trim(health.status)] || trim(health.status, '尚未观察'),
    providerModel: [trim(identity.provider), trim(identity.model)].filter(Boolean).join(' · '),
    endpoint: [trim(identity.endpoint), route ? `route ${route}` : ''].filter(Boolean).join(' · '),
    scope: [trim(identity.surface), ...(Array.isArray(identity.capabilitySet) ? identity.capabilitySet : [])
      .map(value => trim(value)).filter(Boolean)].join(' · '),
    successCount: Math.max(0, Math.trunc(Number(health.strictSuccessCount) || 0)),
    failureCount: Math.max(0, Math.trunc(Number(health.deterministicFailureCount) || 0)),
    circuitOpen: health.circuitOpen === true,
    halfOpenReady: health.halfOpenReady === true,
    failureShape: health.lastFailureShape && typeof health.lastFailureShape === 'object'
      ? health.lastFailureShape
      : null,
    cooldownLabel: cooldownUntil > Number(now)
      ? `冷却至 ${new Date(cooldownUntil).toLocaleString('zh-CN', { hour12: false })}`
      : '',
  };
};

const describeRuleError = (reason = '') => ({
  base_url_required: '该设置档没有 Base URL。',
  base_url_invalid: 'Base URL 格式无效。',
  base_url_credentials_forbidden: 'Base URL 不可包含账号或密码。',
  base_url_query_forbidden: 'Base URL 不可包含查询参数。',
  base_url_fragment_forbidden: 'Base URL 不可包含锚点。',
  model_id_required: '该设置档没有模型 ID。',
  openrouter_route_required: 'OpenRouter 本地规则必须固定上游 route。',
  provider_route_invalid: '上游 route 格式无效。',
  ollama_local_rule_deferred: 'Ollama 本地模型规则依照当前计划延后处理。',
  provider_transport_unsupported: '该服务商尚无可用的受信 transport 模板。',
  import_json_invalid: 'JSON 文件无法解析。',
  import_payload_invalid: '导入文件不是有效对象。',
  import_type_unsupported: '这不是 MiPhone FC 本地规则文件。',
  import_schema_unsupported: '该规则文件版本暂不受支持。',
  import_rules_invalid: '规则列表格式无效。',
  import_rule_identity_duplicate: '导入文件包含重复的精确模型身份。',
  chat_fc_local_rules_limit_exceeded: '本地规则最多保存 64 条。',
}[reason] || reason || '本地规则无效。');

export class ChatFcCompatibilityPanel {
  constructor({
    configManager,
    store = chatFcLocalCapabilityStore,
    evidenceStore = chatStructuredRouteEvidenceStore,
    createClient = config => new LLMClient(config),
    confirm = appConfirm,
    onChanged = null,
  } = {}) {
    this.configManager = configManager;
    this.store = store;
    this.evidenceStore = evidenceStore;
    this.createClient = createClient;
    this.confirm = confirm;
    this.onChanged = typeof onChanged === 'function' ? onChanged : null;
    this.overlay = null;
    this.element = null;
    this.abortController = null;
    this.draftLastTests = new Map();
  }

  ensureUI() {
    if (this.element) return;
    this.overlay = document.createElement('div');
    this.overlay.className = 'api-fc-compat-overlay';
    this.overlay.style.display = 'none';
    this.overlay.addEventListener('click', () => this.hide());

    this.element = document.createElement('div');
    this.element.className = 'api-fc-compat-panel';
    this.element.style.display = 'none';
    this.element.innerHTML = `
      <div class="api-fc-compat-modal" role="dialog" aria-modal="true" aria-labelledby="api-fc-compat-title">
        <header class="api-fc-compat-header">
          <div>
            <small>Function Calling · Local Advanced</small>
            <h2 id="api-fc-compat-title">FC 兼容性（高级）</h2>
          </div>
          <button type="button" data-fc-action="close" aria-label="关闭">×</button>
        </header>
        <div class="api-fc-compat-scroll">
          <div class="api-fc-compat-warning">
            本地规则只在这台设备生效，不代表官方验证。普通发送不会自动探测；请先主动运行零写入测试。
          </div>
          <section class="api-fc-compat-card">
            <div class="api-fc-compat-section-title">
              <div><strong>思考与格式优先级</strong><small>只影响需要二选一的模型组合</small></div>
            </div>
            <label class="api-fc-compat-field">
              <span>开思考时优先</span>
              <select data-fc-field="thinking-preference">
                <option value="preserve">保留思考（默认）</option>
                <option value="stable_format">暂不思考，优先最稳格式</option>
              </select>
            </label>
          </section>
          <section class="api-fc-compat-card">
            <div class="api-fc-compat-section-title">
              <div><strong>建立精确规则</strong><small>从已保存的聊天连线设置档建立</small></div>
            </div>
            <label class="api-fc-compat-field">
              <span>连线设置档</span>
              <select data-fc-field="profile"></select>
            </label>
            <div class="api-fc-compat-identity" data-fc-role="identity"></div>
            <label class="api-fc-compat-field" data-fc-role="route-field" style="display:none;">
              <span>OpenRouter 固定上游 route</span>
              <input data-fc-field="route" type="text" placeholder="例如 google-ai-studio/flex" autocomplete="off">
            </label>
            <label class="api-fc-compat-field">
              <span>规则名称</span>
              <input data-fc-field="name" type="text" maxlength="100" placeholder="本地实验规则">
            </label>
            <label class="api-fc-compat-enable">
              <input data-fc-field="enabled" type="checkbox">
              <span><strong>保存后启用</strong><small>启用前会再次确认；未通过测试也可强制启用，但不建议</small></span>
            </label>
            <div class="api-fc-compat-test-state" data-fc-role="draft-test">尚未测试</div>
            <div class="api-fc-compat-actions">
              <button type="button" class="is-secondary" data-fc-action="test">运行零写入测试</button>
              <button type="button" class="is-primary" data-fc-action="save">保存本地规则</button>
            </div>
          </section>
          <section class="api-fc-compat-card">
            <div class="api-fc-compat-section-title">
              <div><strong>本机规则</strong><small data-fc-role="rule-count">0 条</small></div>
              <div class="api-fc-compat-transfer-actions">
                <button type="button" data-fc-action="import">导入</button>
                <button type="button" data-fc-action="export">导出</button>
              </div>
            </div>
            <div class="api-fc-compat-list" data-fc-role="rule-list"></div>
          </section>
          <section class="api-fc-compat-card">
            <div class="api-fc-compat-section-title">
              <div><strong>本机结构化观察证据</strong><small data-fc-role="evidence-count">0 个精确单元</small></div>
              <div class="api-fc-compat-transfer-actions">
                <button type="button" class="is-danger" data-fc-action="clear-evidence">全部清除</button>
              </div>
            </div>
            <div class="api-fc-compat-warning">
              只保存精确模型身份、能力范围、成功/失败计数与熔断状态，不保存回复正文、工具参数或 API Key。清除后会重新进入试用观察。
            </div>
            <div class="api-fc-compat-list" data-fc-role="evidence-list"></div>
          </section>
        </div>
        <footer class="api-fc-compat-footer">
          <div data-fc-role="status" aria-live="polite"></div>
          <button type="button" data-fc-action="close">关闭</button>
        </footer>
      </div>
    `;
    this.element.addEventListener('click', event => event.stopPropagation());
    this.element.querySelectorAll('[data-fc-action="close"]').forEach(button => {
      button.addEventListener('click', () => this.hide());
    });
    this.element.querySelector('[data-fc-field="profile"]')?.addEventListener('change', () => {
      this.fillDraftForSelectedProfile();
    });
    this.element.querySelector('[data-fc-field="thinking-preference"]')?.addEventListener('change', (event) => {
      const value = event.currentTarget?.value === 'stable_format' ? 'stable_format' : 'preserve';
      appSettings.update({ chatStructuredThinkingPreference: value });
      this.showStatus(value === 'stable_format'
        ? '已优先最稳格式；仅在必要时暂不启用思考。'
        : '已优先保留思考。', 'success');
      this.onChanged?.(this.store.list());
    });
    this.element.querySelector('[data-fc-field="route"]')?.addEventListener('input', () => {
      this.renderDraftTestState();
    });
    this.element.querySelector('[data-fc-action="save"]')?.addEventListener('click', () => {
      this.saveDraftRule();
    });
    this.element.querySelector('[data-fc-action="test"]')?.addEventListener('click', () => {
      if (this.abortController) this.abortController.abort();
      else this.runZeroWriteTest();
    });
    this.element.querySelector('[data-fc-action="import"]')?.addEventListener('click', () => {
      this.importRules();
    });
    this.element.querySelector('[data-fc-action="export"]')?.addEventListener('click', () => {
      this.exportRules();
    });
    this.element.querySelector('[data-fc-action="clear-evidence"]')?.addEventListener('click', () => {
      this.clearAllEvidence();
    });
    this.element.querySelector('[data-fc-role="rule-list"]')?.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-rule-action]');
      if (!button) return;
      const id = trim(button.dataset.ruleId);
      if (button.dataset.ruleAction === 'toggle') this.toggleRule(id);
      if (button.dataset.ruleAction === 'delete') this.deleteRule(id);
      if (button.dataset.ruleAction === 'edit') this.editRule(id);
      if (button.dataset.ruleAction === 'recover') this.recoverRule(id);
    });
    this.element.querySelector('[data-fc-role="evidence-list"]')?.addEventListener('click', event => {
      const button = event.target?.closest?.('[data-evidence-key]');
      if (!button) return;
      const key = trim(button.dataset.evidenceKey);
      if (button.dataset.evidenceAction === 'retry') this.retryEvidenceCell(key);
      else this.clearEvidenceCell(key);
    });
    document.body.appendChild(this.overlay);
    document.body.appendChild(this.element);
  }

  async show() {
    this.ensureUI();
    await Promise.all([
      this.store.load(),
      this.evidenceStore?.load?.(),
    ]);
    this.renderProfiles();
    const thinkingPreference = this.element?.querySelector?.('[data-fc-field="thinking-preference"]');
    if (thinkingPreference) {
      thinkingPreference.value = appSettings.get().chatStructuredThinkingPreference === 'stable_format'
        ? 'stable_format'
        : 'preserve';
    }
    this.fillDraftForSelectedProfile();
    this.renderRules();
    this.renderEvidence();
    this.overlay.style.display = 'block';
    this.element.style.display = 'flex';
  }

  hide() {
    if (this.abortController) this.abortController.abort();
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.element) this.element.style.display = 'none';
  }

  getRuleCount() {
    return this.store.list().length;
  }

  renderProfiles(preferredId = '') {
    const select = this.element?.querySelector('[data-fc-field="profile"]');
    if (!select) return;
    const profiles = this.configManager?.getProfiles?.() || [];
    const activeId = trim(preferredId || this.configManager?.getActiveProfileId?.());
    select.innerHTML = profiles.map(profile => (
      `<option value="${escapeHtml(profile.id)}">${escapeHtml(profile.name)} · ${escapeHtml(profile.model)}</option>`
    )).join('');
    if (profiles.some(profile => profile.id === activeId)) select.value = activeId;
  }

  getSelectedProfile() {
    const id = trim(this.element?.querySelector('[data-fc-field="profile"]')?.value);
    return this.configManager?.getProfileById?.(id) || null;
  }

  findRuleForProfile(profile) {
    if (!profile?.id) return null;
    return this.store.list().find(rule => rule.profileId === profile.id) || null;
  }

  fillDraftForSelectedProfile() {
    const profile = this.getSelectedProfile();
    const existing = this.findRuleForProfile(profile);
    const provider = trim(profile?.provider).toLowerCase();
    const identity = this.element?.querySelector('[data-fc-role="identity"]');
    if (identity) {
      identity.innerHTML = profile ? `
        <div><span>Provider</span><strong>${escapeHtml(provider)}</strong></div>
        <div><span>Model</span><strong>${escapeHtml(profile.model)}</strong></div>
        <div><span>Base URL</span><strong>${escapeHtml(profile.baseUrl)}</strong></div>
        <div><span>策略</span><strong>forced terminal · 三个聊天 surface</strong></div>
      ` : '<div>没有可用的聊天连线设置档</div>';
    }
    const routeField = this.element?.querySelector('[data-fc-role="route-field"]');
    if (routeField) routeField.style.display = provider === 'openrouter' ? 'grid' : 'none';
    const routeInput = this.element?.querySelector('[data-fc-field="route"]');
    if (routeInput) routeInput.value = trim(existing?.identity?.route);
    const nameInput = this.element?.querySelector('[data-fc-field="name"]');
    if (nameInput) nameInput.value = trim(existing?.name, profile ? `${profile.name} · ${profile.model}` : '');
    const enabledInput = this.element?.querySelector('[data-fc-field="enabled"]');
    if (enabledInput) enabledInput.checked = existing?.enabled === true;
    this.renderDraftTestState();
  }

  buildDraft({ enabled = null } = {}) {
    const profile = this.getSelectedProfile();
    if (!profile) return { ok: false, reason: 'profile_required', rule: null };
    const existing = this.findRuleForProfile(profile);
    const route = trim(this.element?.querySelector('[data-fc-field="route"]')?.value);
    const name = trim(this.element?.querySelector('[data-fc-field="name"]')?.value);
    const enabledValue = enabled === null
      ? this.element?.querySelector('[data-fc-field="enabled"]')?.checked === true
      : enabled === true;
    const preliminary = buildChatFcLocalRuleFromProfile(profile, {
      ruleId: existing?.ruleId,
      name,
      enabled: enabledValue,
      route,
    });
    if (!preliminary.ok) return preliminary;
    const draftTest = this.draftLastTests.get(ruleKey(preliminary.rule));
    const sameIdentity = existing && ruleKey(existing) === ruleKey(preliminary.rule);
    const existingLastTest = sameIdentity
      ? existing.evidence?.lastTest
      : null;
    const existingHealth = sameIdentity ? existing.health : null;
    const passedAfterCircuit = draftTest?.status === 'passed'
      && Number(draftTest?.testedAt || 0) > Number(existingHealth?.openedAt || 0);
    return buildChatFcLocalRuleFromProfile(profile, {
      ruleId: preliminary.rule.ruleId,
      name: preliminary.rule.name,
      enabled: enabledValue,
      route,
      lastTest: draftTest || existingLastTest,
      health: passedAfterCircuit ? null : existingHealth,
    });
  }

  renderDraftTestState() {
    const state = this.element?.querySelector('[data-fc-role="draft-test"]');
    if (!state) return;
    const draft = this.buildDraft({ enabled: false });
    if (!draft.ok) {
      state.dataset.state = 'error';
      state.textContent = describeRuleError(draft.reason);
      return;
    }
    const status = draft.rule.evidence.lastTest.status;
    if (draft.rule.health?.circuitOpen === true) {
      state.dataset.state = 'error';
      state.textContent = `已熔断：${draft.rule.health.lastFailureReason || '结构合同连续失败'}；请重新测试通过后保存恢复。`;
      return;
    }
    state.dataset.state = status;
    state.textContent = TEST_STATUS_LABELS[status] || TEST_STATUS_LABELS.not_run;
  }

  showStatus(message, type = 'info') {
    const status = this.element?.querySelector('[data-fc-role="status"]');
    if (!status) return;
    status.dataset.state = type;
    status.textContent = message;
  }

  async saveDraftRule() {
    const draft = this.buildDraft();
    if (!draft.ok) {
      this.showStatus(describeRuleError(draft.reason), 'error');
      return;
    }
    if (draft.rule.enabled && draft.rule.health?.circuitOpen === true) {
      this.showStatus('该规则已熔断。请先运行零写入测试，通过后再保存恢复。', 'error');
      return;
    }
    if (draft.rule.enabled) {
      const tested = draft.rule.evidence.lastTest.status === 'passed';
      const confirmed = await this.confirm({
        title: tested ? '启用本地实验规则？' : '强制启用未经测试的规则？',
        message: tested
          ? '该组合仅在本机零写入测试通过，不代表官方兼容库验证。启用后普通聊天会按精确身份使用 FC。'
          : '这项规则尚未通过零写入测试。模型可能返回坏结构并回退；只有你明确接受风险时才继续。',
        confirmText: tested ? '确认启用' : '仍要强制启用',
        danger: !tested,
      });
      if (!confirmed) return;
    }
    try {
      const freshPassedTest = this.draftLastTests.get(ruleKey(draft.rule))?.status === 'passed';
      let armedEvidenceCount = 0;
      if (freshPassedTest) {
        const coveredCells = (this.evidenceStore?.list?.() || [])
          .filter(cell => isChatStructuredEvidenceCoveredByZeroWriteRule(cell, draft.rule));
        for (const cell of coveredCells) {
          const health = cell?.health && typeof cell.health === 'object' ? cell.health : {};
          if (health.circuitOpen === true && await this.evidenceStore.armHalfOpen(cell.identity, cell.mode)) {
            armedEvidenceCount += 1;
          }
        }
      }
      await this.store.upsert(draft.rule);
      this.showStatus(
        armedEvidenceCount
          ? `本地规则已保存，${armedEvidenceCount} 个复测覆盖的观察单元已可在下次真实请求中重试。`
          : '本地规则已保存。',
        'success',
      );
      this.renderRules();
      if (armedEvidenceCount) this.renderEvidence();
      this.onChanged?.(this.store.list());
    } catch (error) {
      this.showStatus(`保存失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  setTestBusy(busy) {
    const button = this.element?.querySelector('[data-fc-action="test"]');
    if (!button) return;
    button.textContent = busy ? '中止测试' : '运行零写入测试';
    button.classList.toggle('is-danger', busy);
    const save = this.element?.querySelector('[data-fc-action="save"]');
    if (save) save.disabled = busy;
  }

  bindImportedRulesToProfiles(rules = []) {
    const profiles = this.configManager?.getProfiles?.() || [];
    return rules.map((rule) => {
      const matchedProfile = profiles.find((profile) => {
        const built = buildChatFcLocalRuleFromProfile(profile, {
          route: rule.identity?.route || '',
        });
        return built.ok && ruleKey(built.rule) === ruleKey(rule);
      });
      if (!matchedProfile) return rule;
      const normalized = normalizeChatFcLocalRule({
        ...rule,
        profileId: matchedProfile.id,
        profileName: matchedProfile.name,
      });
      return normalized.ok ? normalized.rule : rule;
    });
  }

  async importRules() {
    try {
      const text = await pickJsonFileText();
      if (!text) return;
      const parsed = parseChatFcLocalRulesImport(text);
      if (!parsed.ok) {
        this.showStatus(describeRuleError(parsed.reason), 'error');
        return;
      }
      const rules = this.bindImportedRulesToProfiles(parsed.rules);
      const existingKeys = new Set(this.store.list().map(ruleKey));
      const importableCount = rules.filter(rule => !existingKeys.has(ruleKey(rule))).length;
      const skippedCount = rules.length - importableCount;
      if (!importableCount) {
        this.showStatus(`没有新规则可导入；已跳过 ${skippedCount} 条重复身份。`, 'info');
        return;
      }
      const confirmed = await this.confirm({
        title: `导入 ${importableCount} 条本地 FC 规则？`,
        message: `导入规则会强制设为停用、未测试，并清除外部健康状态；${skippedCount ? `另有 ${skippedCount} 条重复身份会跳过。` : '不会覆盖现有规则。'}`,
        confirmText: '安全导入',
      });
      if (!confirmed) return;
      const result = await this.store.mergeImportedRules(rules);
      this.renderRules();
      this.fillDraftForSelectedProfile();
      this.onChanged?.(this.store.list());
      this.showStatus(
        `已导入 ${result.importedCount} 条停用规则${result.skippedCount ? `，跳过 ${result.skippedCount} 条重复规则` : ''}。`,
        'success',
      );
    } catch (error) {
      logger.warn('导入本地 FC 规则失败', error);
      this.showStatus(`导入失败：${describeRuleError(error?.code || error?.message)}`, 'error');
    }
  }

  async exportRules() {
    const rules = this.store.list();
    if (!rules.length) {
      this.showStatus('没有可导出的本地规则。', 'info');
      return;
    }
    try {
      const payload = buildChatFcLocalRulesExport(rules);
      const timestamp = new Date().toISOString().replace(/[:.]/gu, '-').slice(0, 19);
      const result = await downloadJsonFile(payload, `miphone-fc-local-rules-${timestamp}.json`);
      if (result?.cancelled) return;
      this.showStatus(`已导出 ${rules.length} 条本地规则；文件不含 API Key。`, 'success');
    } catch (error) {
      logger.warn('导出本地 FC 规则失败', error);
      this.showStatus(`导出失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  async runZeroWriteTest() {
    const draft = this.buildDraft({ enabled: false });
    if (!draft.ok) {
      this.showStatus(describeRuleError(draft.reason), 'error');
      return;
    }
    const plan = buildChatFcZeroWriteTestPlan({ rule: draft.rule });
    const confirmed = await this.confirm({
      title: '运行零写入兼容测试？',
      message: `${plan.billingNotice} 测试期间不会自动保存或启用规则。`,
      confirmText: `发送 ${plan.modelCallCount} 次测试`,
    });
    if (!confirmed) return;

    const runtime = await this.configManager?.getRuntimeConfigByProfileId?.(draft.rule.profileId);
    if (!runtime) {
      this.showStatus('无法读取该设置档，请先保存 API 配置。', 'error');
      return;
    }
    this.abortController = new AbortController();
    this.setTestBusy(true);
    try {
      const client = this.createClient({ ...runtime, stream: false, webSearchEnabled: false });
      if (typeof client.prepareProviderFcCapabilities === 'function') {
        this.showStatus('正在主动读取模型能力元数据…', 'info');
        await client.prepareProviderFcCapabilities();
      }
      const result = await runChatFcZeroWriteCompatibilityTest({
        client,
        config: runtime,
        rule: draft.rule,
        signal: this.abortController.signal,
        onProgress: event => {
          const labels = { private_chat: '私聊', group_chat: '群聊', moment_comment: '动态' };
          this.showStatus(`正在测试${labels[event.surface] || event.surface}（${event.index + 1}/${event.total}）…`, 'info');
        },
      });
      const lastTest = {
        status: result.ok ? 'passed' : 'failed',
        testedAt: Date.now(),
        modelCallCount: result.modelCallCount,
        reason: result.reason,
      };
      this.draftLastTests.set(ruleKey(draft.rule), lastTest);
      this.renderDraftTestState();
      if (result.ok) {
        this.showStatus('私聊、群聊、动态均通过；写入次数为 0。你仍需点击“保存本地规则”。', 'success');
      } else {
        this.showStatus(`测试失败：${result.reason}；已停止后续请求，写入次数为 0。`, 'error');
      }
    } catch (error) {
      if (error?.name === 'AbortError') this.showStatus('测试已中止；没有 fallback 或持久写入。', 'info');
      else {
        logger.warn('FC zero-write compatibility test failed', error);
        this.showStatus(`测试异常：${trim(error?.message, '未知错误')}`, 'error');
      }
    } finally {
      this.abortController = null;
      this.setTestBusy(false);
    }
  }

  renderRules() {
    const list = this.element?.querySelector('[data-fc-role="rule-list"]');
    const count = this.element?.querySelector('[data-fc-role="rule-count"]');
    const rules = this.store.list();
    if (count) count.textContent = `${rules.length} 条`;
    if (!list) return;
    if (!rules.length) {
      list.innerHTML = '<div class="api-fc-compat-empty">尚未建立本地规则。</div>';
      return;
    }
    list.innerHTML = rules.map(rule => {
      const test = rule.evidence?.lastTest || { status: 'not_run' };
      const circuitOpen = rule.health?.circuitOpen === true;
      const stateLabel = circuitOpen ? '已熔断' : (rule.enabled ? '已启用' : '未启用');
      const healthLabel = circuitOpen
        ? `连续 ${Number(rule.health?.consecutiveDeterministicFailures || 0)} 次结构失败 · ${trim(rule.health?.lastFailureReason, '未知合同错误')}`
        : '';
      return `
        <article class="api-fc-compat-rule ${rule.enabled ? 'is-enabled' : ''} ${circuitOpen ? 'is-circuit-open' : ''}">
          <div class="api-fc-compat-rule-copy">
            <div><strong>${escapeHtml(rule.name)}</strong><span>${stateLabel}</span></div>
            <small>${escapeHtml(rule.identity.providerId)} · ${escapeHtml(rule.identity.modelId)}</small>
            <small title="${escapeHtml(rule.identity.baseUrl)}">${escapeHtml(rule.identity.baseUrl)}</small>
            <small data-state="${escapeHtml(test.status)}">${escapeHtml(TEST_STATUS_LABELS[test.status] || TEST_STATUS_LABELS.not_run)}</small>
            ${healthLabel ? `<small data-state="circuit">${escapeHtml(healthLabel)}</small>` : ''}
          </div>
          <div class="api-fc-compat-rule-actions">
            <button type="button" data-rule-action="edit" data-rule-id="${escapeHtml(rule.ruleId)}">编辑</button>
            <button type="button" data-rule-action="${circuitOpen ? 'recover' : 'toggle'}" data-rule-id="${escapeHtml(rule.ruleId)}">${circuitOpen ? '复测恢复' : (rule.enabled ? '停用' : '启用')}</button>
            <button type="button" class="is-danger" data-rule-action="delete" data-rule-id="${escapeHtml(rule.ruleId)}">删除</button>
          </div>
        </article>
      `;
    }).join('');
  }

  renderEvidence() {
    const list = this.element?.querySelector('[data-fc-role="evidence-list"]');
    const count = this.element?.querySelector('[data-fc-role="evidence-count"]');
    const cells = this.evidenceStore?.list?.() || [];
    if (count) count.textContent = `${cells.length} 个精确单元`;
    if (!list) return;
    if (!cells.length) {
      list.innerHTML = '<div class="api-fc-compat-empty">尚无本机结构化观察证据。</div>';
      return;
    }
    list.innerHTML = cells.map((cell) => {
      const view = formatChatStructuredEvidenceCellForPanel(cell);
      const shape = view.failureShape;
      const shapeLabel = shape
        ? [
            `上次失败长度 ${Number(shape.characterCount || 0)}`,
            shape.truncationSuspected ? '疑似截断' : '非截断',
            shape.finishReason ? `结束原因 ${shape.finishReason}` : '',
            Array.isArray(shape.validationCodes) && shape.validationCodes.length
              ? `校验 ${shape.validationCodes.join(', ')}`
              : '',
          ].filter(Boolean).join(' · ')
        : '';
      return `
        <article class="api-fc-compat-rule ${view.circuitOpen ? 'is-circuit-open' : ''}">
          <div class="api-fc-compat-rule-copy">
            <div><strong>${escapeHtml(view.providerModel || '未知模型')}</strong><span>${escapeHtml(view.modeLabel)} · ${escapeHtml(view.statusLabel)}</span></div>
            <small>${escapeHtml(view.endpoint || '未知 transport')}</small>
            <small title="${escapeHtml(view.scope)}">${escapeHtml(view.scope || '未知能力单元')}</small>
            <small data-state="${view.circuitOpen ? 'circuit' : ''}">严格成功 ${view.successCount} · 确定性失败 ${view.failureCount}${view.cooldownLabel ? ` · ${escapeHtml(view.cooldownLabel)}` : ''}</small>
            ${shapeLabel ? `<small>${escapeHtml(shapeLabel)}</small>` : ''}
          </div>
          <div class="api-fc-compat-rule-actions">
            ${view.circuitOpen ? `<button type="button" data-evidence-action="retry" data-evidence-key="${escapeHtml(view.key)}">${view.halfOpenReady ? '等待真实请求' : '重试'}</button>` : ''}
            <button type="button" class="is-danger" data-evidence-action="clear" data-evidence-key="${escapeHtml(view.key)}">清除</button>
          </div>
        </article>
      `;
    }).join('');
  }

  async clearEvidenceCell(key) {
    const cell = (this.evidenceStore?.list?.() || []).find(item => trim(item?.key) === trim(key));
    if (!cell) return;
    const view = formatChatStructuredEvidenceCellForPanel(cell);
    const confirmed = await this.confirm({
      title: '清除这个观察单元？',
      message: `${view.providerModel || '该模型'} 的 ${view.modeLabel} 计数、冷却与熔断状态都会清除；之后会重新进入试用观察。`,
      confirmText: '清除证据',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.evidenceStore.remove(cell.identity, cell.mode);
      this.renderEvidence();
      this.showStatus('该精确观察单元已清除。', 'success');
    } catch (error) {
      this.showStatus(`清除失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  async retryEvidenceCell(key) {
    const cell = (this.evidenceStore?.list?.() || []).find(item => trim(item?.key) === trim(key));
    if (!cell || cell?.health?.circuitOpen !== true) return;
    try {
      const armed = await this.evidenceStore.armHalfOpen(cell.identity, cell.mode);
      if (!armed) return;
      this.renderEvidence();
      this.showStatus('已安排重试：下一次真实聊天请求会尝试恢复；测试不会单独消耗额度。', 'success');
    } catch (error) {
      this.showStatus(`安排重试失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  async clearAllEvidence() {
    const count = (this.evidenceStore?.list?.() || []).length;
    if (!count) {
      this.showStatus('目前没有本机观察证据。', 'info');
      return;
    }
    const confirmed = await this.confirm({
      title: `清除全部 ${count} 个观察单元？`,
      message: '所有 FC/JSON 本机成功计数、冷却与熔断状态都会清除；官方内建能力目录与手动本地规则不会被删除。',
      confirmText: '全部清除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.evidenceStore.clear();
      this.renderEvidence();
      this.showStatus('本机结构化观察证据已全部清除。', 'success');
    } catch (error) {
      this.showStatus(`清除失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  editRule(ruleId) {
    const rule = this.store.list().find(item => item.ruleId === ruleId);
    if (!rule) return;
    this.renderProfiles(rule.profileId);
    const select = this.element?.querySelector('[data-fc-field="profile"]');
    if (select) select.value = rule.profileId;
    this.fillDraftForSelectedProfile();
    this.element?.querySelector('.api-fc-compat-scroll')?.scrollTo?.({ top: 0, behavior: 'smooth' });
  }

  recoverRule(ruleId) {
    this.editRule(ruleId);
    this.showStatus('该规则已熔断：请运行零写入测试，通过后点击“保存本地规则”恢复。', 'info');
  }

  async toggleRule(ruleId) {
    const current = this.store.list().find(rule => rule.ruleId === ruleId);
    if (!current) return;
    const enabling = current.enabled !== true;
    if (enabling) {
      const tested = current.evidence?.lastTest?.status === 'passed';
      const confirmed = await this.confirm({
        title: tested ? '启用本地实验规则？' : '启用未经测试的规则？',
        message: tested
          ? '启用后，只有精确匹配此 Provider、Base URL 与模型的聊天会使用 FC。'
          : '这项规则没有通过零写入测试，启用后可能回退文本协议。',
        confirmText: tested ? '确认启用' : '仍要启用',
        danger: !tested,
      });
      if (!confirmed) return;
    }
    const normalized = normalizeChatFcLocalRule({
      ...current,
      enabled: enabling,
      updatedAt: Date.now(),
    });
    if (!normalized.ok) {
      this.showStatus(describeRuleError(normalized.reason), 'error');
      return;
    }
    try {
      await this.store.upsert(normalized.rule);
      this.renderRules();
      this.fillDraftForSelectedProfile();
      this.onChanged?.(this.store.list());
    } catch (error) {
      this.showStatus(`更新失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }

  async deleteRule(ruleId) {
    const current = this.store.list().find(rule => rule.ruleId === ruleId);
    if (!current) return;
    const confirmed = await this.confirm({
      title: '删除本地 FC 规则？',
      message: `将删除“${current.name}”。之后该组合会重新依照官方兼容库或文本协议判定。`,
      confirmText: '删除',
      danger: true,
    });
    if (!confirmed) return;
    try {
      await this.store.remove(ruleId);
      this.renderRules();
      this.fillDraftForSelectedProfile();
      this.onChanged?.(this.store.list());
    } catch (error) {
      this.showStatus(`删除失败：${trim(error?.message, '未知错误')}`, 'error');
    }
  }
}
