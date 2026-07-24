/**
 * 配置面板 UI
 */

import { ConfigManager } from '../storage/config.js';
import { LLMClient } from '../api/client.js';
import { canInitClient } from '../api/client-config-utils.js';
import { logger } from '../utils/logger.js';
import {
    COMMON_GENERATION_PARAM_FILTERS,
    normalizeGenerationParamFilterList,
    splitGenerationParamFilterInput,
} from '../utils/generation-param-filter-utils.js';
import { appConfirm } from './app-confirm.js';
import { rankModelCandidates } from '../utils/model-candidates.js';
import {
    reloadBridgeConfig,
    syncChatRuntimeConfigToBridge,
} from './config-runtime-utils.js';
import { ImageGenerationParamsPanel } from './image-generation-params-panel.js';

const escapeHtml = (value) => String(value ?? '').replace(/[&<>"]/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
}[ch]));

const apiConfigIconSvg = (content, className = '') => `
    <svg class="api-config-svg ${className}" viewBox="0 0 24 24" aria-hidden="true">
        ${content}
    </svg>
`;

const API_CONFIG_ICONS = Object.freeze({
    chat: apiConfigIconSvg('<path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/>'),
    image: apiConfigIconSvg('<rect x="3" y="5" width="18" height="14" rx="3"/><circle cx="8.5" cy="10.5" r="1.5"/><path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L6 18"/>'),
    images: apiConfigIconSvg('<rect x="4" y="4" width="16" height="14" rx="3"/><path d="M8 20h9a3 3 0 0 0 3-3V9"/><circle cx="9" cy="9" r="1.4"/><path d="m20 14-3.4-3.4a2 2 0 0 0-2.8 0L7 17"/>'),
    close: apiConfigIconSvg('<path d="M18 6 6 18"/><path d="m6 6 12 12"/>'),
    plus: apiConfigIconSvg('<path d="M12 5v14"/><path d="M5 12h14"/>'),
    pencil: apiConfigIconSvg('<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>'),
    trash: apiConfigIconSvg('<path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="m19 6-1 14H6L5 6"/><path d="M10 11v5"/><path d="M14 11v5"/>'),
    key: apiConfigIconSvg('<circle cx="7.5" cy="15.5" r="4.5"/><path d="m11 12 9-9"/><path d="m15 8 3 3"/><path d="m17 6 3 3"/>'),
    eye: apiConfigIconSvg('<path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"/><circle cx="12" cy="12" r="2.5"/>'),
    eyeOff: apiConfigIconSvg('<path d="m3 3 18 18"/><path d="M10.6 6.2A11 11 0 0 1 12 6c6.5 0 10 6 10 6a16 16 0 0 1-2.2 2.8"/><path d="M6.6 6.6C3.6 8.4 2 12 2 12s3.5 6 10 6a10 10 0 0 0 4.4-1"/><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8"/>'),
    refresh: apiConfigIconSvg('<path d="M20 6v5h-5"/><path d="M4 18v-5h5"/><path d="M18.5 9A7 7 0 0 0 6 6.5L4 9"/><path d="M5.5 15A7 7 0 0 0 18 17.5l2-2.5"/>'),
    filter: apiConfigIconSvg('<path d="M22 3H2l8 9.5V19l4 2v-8.5L22 3Z"/>'),
    chevronRight: apiConfigIconSvg('<path d="m9 18 6-6-6-6"/>'),
    chevronDown: apiConfigIconSvg('<path d="m6 9 6 6 6-6"/>'),
    cable: apiConfigIconSvg('<path d="M17 19h1a4 4 0 0 0 4-4V5"/><path d="M2 10v5a4 4 0 0 0 4 4h1"/><path d="M7 9h10v10H7z"/><path d="M9 9V5"/><path d="M15 9V5"/>'),
    zap: apiConfigIconSvg('<path d="M13 2 3 14h9l-1 8 10-12h-9l1-8Z"/>'),
    save: apiConfigIconSvg('<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M17 21v-8H7v8"/><path d="M7 3v5h8"/>'),
    check: apiConfigIconSvg('<path d="m20 6-11 11-5-5"/>'),
    loader: apiConfigIconSvg('<path d="M21 12a9 9 0 1 1-6.2-8.6"/>', 'is-spinning'),
});

const setApiButtonContent = (button, icon, label) => {
    if (!button) return;
    button.innerHTML = `${icon || ''}<span>${escapeHtml(label)}</span>`;
};

const MODEL_FILTER_DEBOUNCE_MS = 80;

const CHAT_PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'makersuite', label: 'Google AI Studio (Makersuite)' },
    { value: 'vertexai', label: 'Google Vertex AI' },
    { value: 'deepseek', label: 'Deepseek' },
    { value: 'openrouter', label: 'OpenRouter' },
    { value: 'anthropic', label: 'Anthropic (Claude)' },
    { value: 'custom', label: '自定义 API' },
];

const IMAGE_PROVIDER_OPTIONS = [
    { value: 'openai', label: 'OpenAI' },
    { value: 'makersuite', label: 'Google AI Studio (Gemini/Imagen)' },
    { value: 'vertexai', label: 'Google Vertex AI' },
    { value: 'novelai', label: 'NovelAI Diffusion' },
    { value: 'stability', label: 'Stability AI' },
    { value: 'togetherai', label: 'Together AI' },
    { value: 'pollinations', label: 'Pollinations' },
    { value: 'automatic1111', label: 'AUTOMATIC1111' },
    { value: 'comfyui', label: 'ComfyUI' },
    { value: 'custom', label: '自定义 OpenAI 兼容 API' },
];

const ALL_PROVIDER_KEYS = Array.from(new Set([
    ...CHAT_PROVIDER_OPTIONS.map(item => item.value),
    ...IMAGE_PROVIDER_OPTIONS.map(item => item.value),
]));

const NO_API_KEY_PROVIDERS = new Set(['pollinations', 'automatic1111', 'a1111', 'comfyui', 'comfy']);
const PROMPT_POST_PROCESSING_VALUES = new Set(['none', 'merge', 'semi', 'strict', 'single']);
const normalizePromptPostProcessingForForm = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    return PROMPT_POST_PROCESSING_VALUES.has(raw) ? raw : 'none';
};

export class ConfigPanel {
    constructor({ onSaved = null } = {}) {
        this.chatConfigManager = new ConfigManager();
        this.imageConfigManager = new ConfigManager({ scope: 'image' });
        this.activeTab = 'chat';
        this.configManager = this.chatConfigManager;
        this.element = null;
        this.overlayElement = null;
        this.saveButton = null;
        this.testButton = null;
        this.modelOptions = [];
        this.modelFilterDebounceTimer = null;
        this.keyOverlay = null;
        this.keyModal = null;
        this.isRefreshingProfile = false; // 防止刷新时触发 onchange
        this.customSelectMenuEl = null;
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        this.transportExpanded = false;
        this.excludedGenerationParams = [];
        this.openOptions = {};
        this.onSaved = typeof onSaved === 'function' ? onSaved : null;
        this.currentPage = 'main';
        this.imageGenerationParamsPanel = new ImageGenerationParamsPanel({
            getImageConfig: async () => {
                const draft = this.getDraftConfig?.({ tab: 'image' });
                if (draft) return draft;
                return await this.imageConfigManager.load();
            },
        });
    }

    /**
     * 初始化并显示配置面板
     */
    async show(options = {}) {
        this.openOptions = options && typeof options === 'object' ? { ...options } : {};
        if (!this.element) {
            this.createUI();
        }

        if (this.openOptions?.tab) {
            await this.setActiveTab(this.openOptions.tab, { skipLoad: true });
        }
        this.updateTabUI();

        // 加载当前配置到表单
        let config = await this.configManager.load();
        if (!config) {
            logger.warn('配置为空，使用默认配置');
            config = this.configManager.getDefault();
        }
        this.refreshProfileOptions();
        this.populateForm(config);
        this.hideImageParamsPage();

        this.element.classList.remove('is-open');
        this.overlayElement.classList.remove('is-open');
        this.element.style.display = 'flex';
        this.overlayElement.style.display = 'block';
        void this.element.offsetWidth;
        this.element.classList.add('is-open');
        this.overlayElement.classList.add('is-open');
    }

    /**
     * 隐藏配置面板
     */
    hide() {
        if (this.modelFilterDebounceTimer !== null) {
            clearTimeout(this.modelFilterDebounceTimer);
            this.modelFilterDebounceTimer = null;
        }
        this.hideImageParamsPage();
        this.imageGenerationParamsPanel.hide();
        if (this.element) {
            this.element.classList.remove('is-open');
            this.overlayElement.classList.remove('is-open');
            this.element.style.display = 'none';
            this.overlayElement.style.display = 'none';
        }
        const options = this.openOptions || {};
        this.openOptions = {};
        if (typeof options.onHide === 'function') {
            try {
                options.onHide();
            } catch (err) {
                logger.warn('config panel onHide failed', err);
            }
        }
    }

    async setActiveTab(tab, { skipLoad = false } = {}) {
        const next = tab === 'image' ? 'image' : 'chat';
        this.hideImageParamsPage();
        this.activeTab = next;
        this.configManager = next === 'image' ? this.imageConfigManager : this.chatConfigManager;
        this.updateTabUI();
        this.clearModelOptions();
        if (skipLoad) return;
        let config = await this.configManager.load();
        if (!config) config = this.configManager.getDefault();
        this.refreshProfileOptions();
        this.populateForm(config);
        this.emitDraftChange();
    }

    emitDraftChange() {
        try {
            window.dispatchEvent(new CustomEvent('config-draft-changed', {
                detail: { tab: this.activeTab },
            }));
        } catch {}
    }

    async syncActiveProfileRuntime(config = null) {
        if (!window.appBridge || this.activeTab !== 'chat') return config;
        let runtime = config;
        try {
            runtime = await reloadBridgeConfig(window.appBridge) || config;
        } catch (err) {
            logger.warn('同步聊天配置切换到运行时失败，回退表单配置', err);
        }
        syncChatRuntimeConfigToBridge({
            bridge: window.appBridge,
            runtime: runtime || config || {},
            canInitClient,
            createClient: nextRuntime => new LLMClient(nextRuntime),
        });
        return runtime || config;
    }

    emitProfileChanged(profileId = '') {
        this.emitDraftChange();
        try {
            window.dispatchEvent(new CustomEvent('config-profile-changed', {
                detail: {
                    tab: this.activeTab,
                    profileId: profileId || this.configManager.getActiveProfileId?.() || '',
                },
            }));
        } catch {}
    }

    getProviderOptions() {
        return this.activeTab === 'image' ? IMAGE_PROVIDER_OPTIONS : CHAT_PROVIDER_OPTIONS;
    }

    refreshProviderOptions() {
        if (!this.element) return;
        const select = this.element.querySelector('#config-provider');
        if (!select) return;
        const options = this.getProviderOptions();
        const current = select.value;
        const allowed = new Set(options.map(item => item.value));
        select.innerHTML = options
            .map(item => `<option value="${escapeHtml(item.value)}">${escapeHtml(item.label)}</option>`)
            .join('');
        select.value = allowed.has(current) ? current : (options[0]?.value || 'openai');
        this.refreshCustomSelect('config-provider');
    }

    providerRequiresApiKey(provider) {
        const raw = String(provider || '').trim().toLowerCase();
        if (raw === 'vertexai') return false;
        return !NO_API_KEY_PROVIDERS.has(raw);
    }

    updateTabUI() {
        if (!this.element) return;
        this.refreshProviderOptions();
        const title = this.element.querySelector('#config-title');
        if (title) {
            title.textContent = this.activeTab === 'image' ? '图片模型配置' : '聊天模型配置';
        }
        const tabs = Array.from(this.element.querySelectorAll('.config-tab'));
        tabs.forEach(btn => {
            const tab = btn?.dataset?.tab || '';
            btn.classList.toggle('is-active', tab === this.activeTab);
            btn.setAttribute('aria-selected', String(tab === this.activeTab));
        });
        const imageParamsEntry = this.element.querySelector('#image-params-entry');
        if (imageParamsEntry) {
            imageParamsEntry.style.display = this.activeTab === 'image' ? 'block' : 'none';
        }
        const promptPostProcessingSection = this.element.querySelector('#config-prompt-post-processing-section');
        if (promptPostProcessingSection) {
            promptPostProcessingSection.style.display = this.activeTab === 'chat' ? 'block' : 'none';
        }
        const generationParamFilterSection = this.element.querySelector('#config-generation-param-filter-section');
        if (generationParamFilterSection) {
            generationParamFilterSection.style.display = this.activeTab === 'chat' ? 'block' : 'none';
        }
    }

    async showImageParamsPage() {
        if (!this.element) return;
        this.closeCustomSelectMenu();
        if (this.activeTab !== 'image') {
            await this.setActiveTab('image');
        }
        const mainPage = this.element.querySelector('#config-main-page');
        const paramsPage = this.element.querySelector('#config-image-params-page');
        if (!mainPage || !paramsPage) return;
        this.currentPage = 'imageParams';
        this.element.classList.add('is-image-params-page');
        mainPage.style.display = 'none';
        paramsPage.style.display = 'block';
        await this.imageGenerationParamsPanel.showEmbedded({
            container: paramsPage,
            onBack: () => this.hideImageParamsPage(),
        });
    }

    hideImageParamsPage() {
        if (!this.element) return;
        const mainPage = this.element.querySelector('#config-main-page');
        const paramsPage = this.element.querySelector('#config-image-params-page');
        this.currentPage = 'main';
        this.element.classList.remove('is-image-params-page');
        this.imageGenerationParamsPanel.hide();
        if (mainPage) mainPage.style.display = 'flex';
        if (paramsPage) paramsPage.style.display = 'none';
    }

    /**
     * 创建 UI 元素
     */
    createUI() {
        // 创建遮罩层
        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'config-overlay';
        this.overlayElement.className = 'api-config-overlay';
        this.overlayElement.style.cssText = `
            display: none;
            position: fixed;
            z-index: 23000;
        `;
        this.overlayElement.onclick = () => this.hide();

        // 创建配置面板
        this.element = document.createElement('div');
        this.element.id = 'config-panel';
        this.element.className = 'api-config-panel';
        this.element.innerHTML = `
            <div class="config-modal api-config-modal" role="dialog" aria-modal="true" aria-labelledby="config-title">
                <header class="api-config-header">
                    <div class="api-config-heading">
                        <div class="api-config-kicker">Aria / API Connection</div>
                        <h2 id="config-title">聊天模型配置</h2>
                    </div>
                    <div class="api-config-header-actions">
                        <span class="api-config-live-note">保存后立即生效</span>
                        <button type="button" id="config-close" class="api-config-close" aria-label="关闭 API 配置" title="关闭">
                            ${API_CONFIG_ICONS.close}
                        </button>
                    </div>
                </header>
                <div id="config-main-page" class="api-config-main-page" data-maid-guide-target="config-connection-fields">
                <div class="api-config-tabs-shell">
                    <div class="api-config-tabs" role="tablist" aria-label="API 配置类型">
                    <button type="button" class="config-tab api-config-tab is-active" data-tab="chat" role="tab" aria-selected="true">
                        ${API_CONFIG_ICONS.chat}
                        聊天模型
                    </button>
                    <button type="button" class="config-tab api-config-tab" data-tab="image" role="tab" aria-selected="false">
                        ${API_CONFIG_ICONS.image}
                        图片模型
                    </button>
                    </div>
                </div>
                <div class="api-config-scroll">
                <div id="image-params-entry" class="api-config-field" style="display:none;">
                    <button type="button" id="open-image-generation-params" class="api-config-row-card">
                        <span class="api-config-row-main">
                            <span class="api-config-row-icon">${API_CONFIG_ICONS.images}</span>
                            <span class="api-config-row-copy">
                                <strong>图片生成参数</strong>
                                <small>质量、尺寸、输出格式等；所有生图入口共享</small>
                            </span>
                        </span>
                        ${API_CONFIG_ICONS.chevronRight}
                    </button>
                </div>

                <div class="api-config-field">
                    <label class="api-config-field-label">
                        <span class="has-help" data-help="保存多份连线配置，随时切换">连线设置档</span>
                        <div class="api-config-field-tools">
                            <button id="profile-new" class="api-config-icon-action" title="新建设置档" aria-label="新建设置档">${API_CONFIG_ICONS.plus}</button>
                            <button id="profile-rename" class="api-config-icon-action" title="重命名" aria-label="重命名设置档">${API_CONFIG_ICONS.pencil}</button>
                            <button id="profile-delete" class="api-config-icon-action is-danger" title="删除" aria-label="删除设置档">${API_CONFIG_ICONS.trash}</button>
                        </div>
                    </label>
                    <select id="config-profile" data-maid-guide-target="config-profile-select" style="display:none;"></select>
                    <button type="button" id="config-profile-btn" class="world-app-select-btn" data-select-id="config-profile" data-maid-guide-target="config-profile-select">
                        <span class="config-custom-select-label">请选择设置档</span>
                        <span class="world-app-select-btn-chevron">${API_CONFIG_ICONS.chevronDown}</span>
                    </button>
                </div>

                <div class="api-config-field">
                    <label class="api-config-field-label">服务商</label>
                    <select id="config-provider" data-maid-guide-target="config-provider-select" style="display:none;">
                        <option value="openai">OpenAI</option>
                        <option value="makersuite">Google AI Studio (Makersuite)</option>
                        <option value="vertexai">Google Vertex AI</option>
                        <option value="deepseek">Deepseek</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="custom">自定义 API</option>
                    </select>
                    <button type="button" id="config-provider-btn" class="world-app-select-btn" data-select-id="config-provider" data-maid-guide-target="config-provider-select">
                        <span class="config-custom-select-label">请选择服务商</span>
                        <span class="world-app-select-btn-chevron">${API_CONFIG_ICONS.chevronDown}</span>
                    </button>
                </div>

                <div id="config-custom-fields" data-maid-guide-target="config-custom-fields">
                <div id="config-baseurl-section" class="api-config-field">
                    <label class="api-config-field-label has-help" data-help="内建服务商自动使用默认地址；仅自定义 API 需填写">API Base URL</label>
                    <input type="text" id="config-baseurl" data-maid-guide-target="config-base-url-input" placeholder="https://api.openai.com/v1"
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                </div>

                <div class="api-config-field">
                    <label class="api-config-field-label">
                        <span>API Key</span>
                        <div class="api-config-field-tools">
                            <button id="toggle-apikey" class="api-config-text-action">${API_CONFIG_ICONS.eye}<span>显示</span></button>
                            <button id="manage-keys" class="api-config-icon-action" title="管理已保存的 Key" aria-label="管理已保存的 Key">${API_CONFIG_ICONS.key}</button>
                        </div>
                    </label>
                    <input type="password" id="config-apikey" data-maid-guide-target="config-api-key-input" placeholder="sk-..."
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                    <small id="apikey-help" style="color: var(--app-text-secondary);">保存后 Key 以遮罩显示（不可复制）；可在 Key 管理中保存多个</small>
                </div>
                </div>

                <div id="vertexai-fields" style="display: none;">
                    <div class="api-config-field">
                        <label class="api-config-field-label has-help" data-help="Vertex AI 区域">Region</label>
                        <select id="config-region" style="display:none;">
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="us-west1">us-west1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="asia-southeast1">asia-southeast1</option>
                        </select>
                        <button type="button" id="config-region-btn" class="world-app-select-btn" data-select-id="config-region">
                            <span class="config-custom-select-label">请选择 Region</span>
                            <span class="world-app-select-btn-chevron">${API_CONFIG_ICONS.chevronDown}</span>
                        </button>
                    </div>

                    <div class="api-config-field">
                        <label class="api-config-field-label">
                            <span class="has-help" data-help="粘贴 Service Account JSON，Project ID 会自动识别；留空则用 API Key">Service Account JSON</span>
                            <button id="toggle-sa" class="api-config-text-action">${API_CONFIG_ICONS.eye}<span>显示</span></button>
                        </label>
                        <textarea id="config-serviceaccount" data-maid-guide-target="config-service-account-input" placeholder='{"type": "service_account", "project_id": "your-project", ...}'
                                  style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 12px; box-sizing: border-box; font-family: monospace; min-height: 100px; resize: vertical;"></textarea>
                    </div>
                </div>

                <div id="config-model-section" class="api-config-field" data-maid-guide-target="config-model-section">
                    <label class="api-config-field-label">
                        <span>模型</span>
                        <button id="refresh-models" class="api-config-refresh-action" data-maid-guide-target="config-refresh-models">
                            ${API_CONFIG_ICONS.refresh}<span>刷新列表</span>
                        </button>
                    </label>
                    <div id="config-model-picker" data-maid-guide-target="config-model-picker">
                        <input type="text" id="config-model" data-maid-guide-target="config-model-select" placeholder="gpt-3.5-turbo"
                               style="width: 100%; padding: 10px 12px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                        <div id="model-options" class="api-config-model-options" aria-label="可用模型列表" style="display:none;"></div>
                    </div>
                    <small id="model-help" style="color: var(--app-text-secondary);">要使用的模型 ID（可输入或从列表选择）</small>
                </div>

                <div class="api-config-stream-card">
                    <label>
                        <input type="checkbox" id="config-stream" style="width: 18px; height: 18px;">
                        <span>
                            <strong class="has-help" data-help="实时显示 AI 的回复过程" data-help-mode="press">启用流式响应</strong>
                            <small>逐字流式输出，角色回复更自然</small>
                        </span>
                    </label>
                </div>

                <div id="config-prompt-post-processing-section" class="api-config-field">
                    <label class="api-config-field-label has-help" data-help="仅聊天请求生效；越靠后兼容性越强，但对原始提示词改动越大。">提示词后处理</label>
                    <select id="config-prompt-post-processing" style="display:none;">
                        <option value="none">不处理（默认）</option>
                        <option value="merge">合并连续同角色</option>
                        <option value="semi">半严格（强制角色交替）</option>
                        <option value="strict">严格（强制 user 最先、角色交替）</option>
                        <option value="single">单一用户消息</option>
                    </select>
                    <button type="button" id="config-prompt-post-processing-btn" class="world-app-select-btn" data-select-id="config-prompt-post-processing">
                        <span class="config-custom-select-label">不处理（默认）</span>
                        <span class="world-app-select-btn-chevron">${API_CONFIG_ICONS.chevronDown}</span>
                    </button>
                </div>

                <div id="config-generation-param-filter-section" class="api-config-field">
                    <button type="button" id="open-generation-param-filter" class="api-config-row-card">
                        <span class="api-config-row-main">
                            <span class="api-config-row-icon">${API_CONFIG_ICONS.filter}</span>
                            <span class="api-config-row-copy">
                                <strong>请求参数过滤</strong>
                                <small id="generation-param-filter-summary">未排除生成参数</small>
                            </span>
                        </span>
                        ${API_CONFIG_ICONS.chevronRight}
                    </button>
                </div>

                <div class="api-config-timeout-row">
                    <label>
                        <span>
                            <strong class="has-help" data-help="请求超过此时长将中止（10–9000 秒）">请求超时（秒）</strong>
                            <small>长上下文推理或生图任务建议适当放宽</small>
                        </span>
                        <input id="config-timeout" type="number" min="10" max="9000" step="5" value="60" inputmode="numeric"
                               style="width: 120px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--app-border-default); font-size: 14px; text-align:right;">
                    </label>
                </div>

                <div id="config-transport-section" class="api-config-accordion">
                    <button type="button" id="config-transport-toggle" aria-expanded="false">
                        <span class="api-config-row-icon">${API_CONFIG_ICONS.cable}</span>
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="font-weight:800; color:var(--app-text-primary);">高级连线与反代</span>
                            <span id="config-transport-summary" style="font-size:12px; color:var(--app-text-muted);">默认直连，只有需要代理出口时再展开</span>
                        </div>
                        <span id="config-transport-chevron" aria-hidden="true">${API_CONFIG_ICONS.chevronDown}</span>
                    </button>
                    <div id="config-transport-content" class="api-config-accordion-content" aria-hidden="true">
                    <div class="api-config-accordion-inner">
                        <div style="margin-bottom: 14px;">
                            <label class="has-help" data-help="一般保持直连，需要走代理出口时再改。" style="display:block; margin-bottom:5px; font-weight:bold;">连线模式</label>
                            <select id="config-transport-mode" style="display:none;">
                                <option value="direct">直连</option>
                                <option value="reverse_proxy">反代出口</option>
                            </select>
                            <button type="button" id="config-transport-mode-btn" class="world-app-select-btn" data-select-id="config-transport-mode" style="margin-top:2px;">
                                <span class="config-custom-select-label">直连</span>
                                <span class="world-app-select-btn-chevron">${API_CONFIG_ICONS.chevronDown}</span>
                            </button>
                        </div>

                        <div id="config-proxy-fields" style="display:none;">
                            <div style="margin-bottom: 14px;">
                                <label class="has-help" data-help="填这里即可。API Key 照常填写，请求会保留原协议、改走此出口。" style="display:block; margin-bottom:5px; font-weight:bold;">反代 URL</label>
                                <input type="text" id="config-proxy-baseurl" placeholder="https://proxy.example.com/llm"
                                       style="width:100%; padding:10px; border-radius:5px; border:1px solid var(--app-border-default); font-size:14px; box-sizing:border-box;">
                            </div>

                            <div id="config-proxy-auth-header-row" style="margin-bottom: 14px; display:none;">
                                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; font-weight:bold;">
                                    <span class="has-help" data-help="如你的反代需要额外密钥，可填写自定义 Header 名。">代理鉴权 Header</span>
                                    <span style="font-size:12px; color:var(--app-text-muted); font-weight:600;">可选</span>
                                </label>
                                <input type="text" id="config-proxy-auth-header" placeholder="X-Proxy-Auth / Authorization"
                                       style="width:100%; padding:10px; border-radius:5px; border:1px solid var(--app-border-default); font-size:14px; box-sizing:border-box;">
                            </div>

                            <div id="config-proxy-auth-token-row" style="margin-bottom: 14px; display:none;">
                                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:5px; font-weight:bold;">
                                    <span class="has-help" data-help="若反代不要求单独鉴权，这里留空即可。">代理鉴权 Token</span>
                                    <button id="toggle-proxy-token" type="button" class="api-config-text-action">${API_CONFIG_ICONS.eye}<span>显示</span></button>
                                </label>
                                <input type="password" id="config-proxy-auth-token" placeholder="可选"
                                       style="width:100%; padding:10px; border-radius:5px; border:1px solid var(--app-border-default); font-size:14px; box-sizing:border-box;">
                            </div>

                            <div id="config-forward-provider-auth-row" style="margin-bottom: 2px; display:none;">
                                <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                                    <input type="checkbox" id="config-forward-provider-auth" checked style="width:18px; height:18px;">
                                    <span class="has-help" data-help="关闭后，会移除原本的 API Key / Authorization，仅保留反代鉴权。" data-help-mode="press" style="font-weight:700;">同时转发原服务商鉴权信息</span>
                                </label>
                            </div>
                        </div>
                    </div>
                </div>
                </div>
                </div>
                <footer class="api-config-footer">
                <div id="config-status" class="api-config-status" style="display:none;"></div>
                <div class="api-config-footer-actions">
                    <button id="config-test" class="api-config-button is-secondary">
                        ${API_CONFIG_ICONS.zap}<span>测试连接</span>
                    </button>
                    <button id="config-cancel" class="api-config-button is-secondary">
                        取消
                    </button>
                    <button id="config-save" class="api-config-button is-primary" data-maid-guide-target="config-save-btn">
                        ${API_CONFIG_ICONS.save}<span>保存</span>
                    </button>
                </div>
                </footer>
                </div>
                <div id="config-image-params-page" style="display:none;"></div>
            </div>
        `;
        this.element.style.cssText = `
            display: none;
            position: fixed;
            z-index: 23010;
        `;

        // 阻止点击面板时关闭
        this.element.onclick = (e) => e.stopPropagation();

        const tabButtons = Array.from(this.element.querySelectorAll('.config-tab'));
        tabButtons.forEach((btn) => {
            btn.addEventListener('click', async () => {
                const tab = btn?.dataset?.tab || 'chat';
                await this.setActiveTab(tab);
            });
        });
        this.updateTabUI();

        // 绑定事件
        this.saveButton = this.element.querySelector('#config-save');
        this.testButton = this.element.querySelector('#config-test');

        this.saveButton.onclick = () => this.onSave();
        this.element.querySelector('#config-cancel').onclick = () => this.hide();
        this.element.querySelector('#config-close').onclick = () => this.hide();
        this.testButton.onclick = () => this.onTest();
        this.element.querySelector('#toggle-apikey').onclick = () => this.toggleApiKey();
        this.element.querySelector('#manage-keys').onclick = () => this.openKeyManager();
        this.element.querySelector('#profile-new').onclick = () => this.createProfile();
        this.element.querySelector('#profile-rename').onclick = () => this.renameProfile();
        this.element.querySelector('#profile-delete').onclick = () => this.deleteProfile();
        this.element.querySelector('#toggle-sa')?.addEventListener('click', () => this.toggleServiceAccount());
        this.element.querySelector('#refresh-models').onclick = () => this.refreshModels();
        this.element.querySelector('#config-transport-toggle').onclick = () => this.toggleTransportSection();
        this.element.querySelector('#toggle-proxy-token').onclick = () => this.toggleProxyToken();
        this.element.querySelector('#open-generation-param-filter')?.addEventListener('click', () => {
            this.openGenerationParamFilterDialog();
        });
        this.element.querySelector('#open-image-generation-params')?.addEventListener('click', () => {
            this.showImageParamsPage();
        });

        // 连线设置档切换
        this.element.querySelector('#config-profile').onchange = async (e) => {
            // 防止刷新选项时触发 onchange
            if (this.isRefreshingProfile) {
                logger.debug('忽略配置选择器的 onchange（刷新中）');
                return;
            }

            const profileId = e.target.value;
            logger.info(`用户切换配置: ${profileId.slice(0, 20)}...`);
            await this.configManager.setActiveProfile(profileId);
            const config = await this.configManager.load();
            this.populateForm(config);
            await this.syncActiveProfileRuntime(config);
            this.emitProfileChanged(profileId);
        };

        // Provider 切换时更新默认值和字段可见性
        this.element.querySelector('#config-provider').onchange = async (e) => {
            const provider = e.target.value;
            this.updateDefaultsForProvider(provider);
            this.updateFieldVisibility(provider);
            this.emitDraftChange();
        };
        this.element.querySelector('#config-region').onchange = async () => {
            const provider = this.element.querySelector('#config-provider')?.value || 'openai';
            if (provider === 'vertexai') {
                this.updateDefaultsForProvider(provider);
            }
            this.emitDraftChange();
        };
        this.element.querySelector('#config-transport-mode').onchange = async () => {
            this.updateTransportVisibility({ autoExpand: true });
            this.emitDraftChange();
        };
        this.element.querySelector('#config-prompt-post-processing').onchange = async () => {
            this.emitDraftChange();
        };
        this.element.querySelector('#config-model')?.addEventListener('input', () => {
            this.emitDraftChange();
            this.scheduleModelOptionsRender();
        });
        this.element.querySelector('#config-baseurl')?.addEventListener('input', () => this.emitDraftChange());

        this.initCustomSelects();

        document.body.appendChild(this.overlayElement);
        document.body.appendChild(this.element);
    }

    ensureCustomSelectMenu() {
        if (this.customSelectMenuEl) return this.customSelectMenuEl;
        const menu = document.createElement('div');
        menu.className = 'world-app-select-menu';
        menu.style.display = 'none';
        menu.addEventListener('click', (e) => e.stopPropagation());
        document.body.appendChild(menu);
        this.customSelectMenuEl = menu;
        return menu;
    }

    closeCustomSelectMenu() {
        if (typeof this.customSelectMenuCleanup === 'function') {
            try { this.customSelectMenuCleanup(); } catch {}
        }
        this.customSelectMenuCleanup = null;
        this.customSelectMenuAnchor = null;
        if (this.customSelectMenuEl) {
            this.customSelectMenuEl.style.display = 'none';
            this.customSelectMenuEl.innerHTML = '';
            this.customSelectMenuEl.classList.remove('is-maid-guide-menu');
            delete this.customSelectMenuEl.dataset.selectId;
        }
    }

    openCustomSelectMenu({ anchorEl, options = [], currentValue = '', onSelect = null } = {}) {
        if (!anchorEl) return;
        const isSameAnchorOpen =
            this.customSelectMenuAnchor === anchorEl &&
            this.customSelectMenuEl &&
            this.customSelectMenuEl.style.display !== 'none';
        if (isSameAnchorOpen) {
            this.closeCustomSelectMenu();
            return;
        }
        const menu = this.ensureCustomSelectMenu();
        menu.classList.toggle('is-maid-guide-menu', Boolean(anchorEl.dataset.maidGuideTarget));
        menu.dataset.selectId = String(anchorEl.dataset.selectId || '');
        const current = String(currentValue ?? '').trim();
        const opts = Array.isArray(options) ? options : [];
        menu.innerHTML = opts.map((opt) => {
            const value = String(opt?.value ?? '');
            const label = escapeHtml(String(opt?.label ?? value));
            const selected = value === current;
            return `
                <button type="button" class="world-app-select-item ${selected ? 'is-selected' : ''}" data-value="${value.replace(/"/g, '&quot;')}">
                    <span class="world-app-select-item-label">${label}</span>
                    <span class="world-app-select-item-check">${selected ? API_CONFIG_ICONS.check : ''}</span>
                </button>
            `;
        }).join('');

        menu.querySelectorAll('.world-app-select-item').forEach((item) => {
            item.addEventListener('click', () => {
                const value = String(item.dataset.value ?? '');
                if (typeof onSelect === 'function') onSelect(value);
                this.closeCustomSelectMenu();
            });
        });

        menu.style.display = 'block';
        menu.style.visibility = 'hidden';
        menu.style.minWidth = `${Math.max(170, Math.round(anchorEl.getBoundingClientRect().width))}px`;
        menu.style.left = '0px';
        menu.style.top = '0px';

        const anchorRect = anchorEl.getBoundingClientRect();
        const menuRect = menu.getBoundingClientRect();
        const gap = 6;
        let left = anchorRect.left;
        let top = anchorRect.bottom + gap;
        if (left + menuRect.width > window.innerWidth - 8) {
            left = Math.max(8, window.innerWidth - menuRect.width - 8);
        }
        if (top + menuRect.height > window.innerHeight - 8) {
            top = Math.max(8, anchorRect.top - menuRect.height - gap);
        }
        menu.style.left = `${Math.round(left)}px`;
        menu.style.top = `${Math.round(top)}px`;
        menu.style.visibility = 'visible';

        const onDocClick = (ev) => {
            const target = ev?.target;
            if (!target) return;
            if (menu.contains(target) || anchorEl.contains(target)) return;
            this.closeCustomSelectMenu();
        };
        const onResize = () => this.closeCustomSelectMenu();
        const onScroll = (ev) => {
            const target = ev?.target;
            if (target && (menu.contains(target) || anchorEl.contains(target))) return;
            this.closeCustomSelectMenu();
        };
        document.addEventListener('mousedown', onDocClick, true);
        document.addEventListener('touchstart', onDocClick, true);
        window.addEventListener('resize', onResize);
        window.addEventListener('scroll', onScroll, true);
        this.customSelectMenuCleanup = () => {
            document.removeEventListener('mousedown', onDocClick, true);
            document.removeEventListener('touchstart', onDocClick, true);
            window.removeEventListener('resize', onResize);
            window.removeEventListener('scroll', onScroll, true);
        };
        this.customSelectMenuAnchor = anchorEl;
    }

    refreshCustomSelect(selectOrId) {
        const panel = this.element || document;
        const select = typeof selectOrId === 'string'
            ? panel.querySelector(`#${selectOrId}`)
            : selectOrId;
        if (!select) return;
        const button = panel.querySelector(`[data-select-id="${select.id}"]`);
        if (!button) return;
        const labelEl = button.querySelector('.config-custom-select-label');
        const current = Array.from(select.options || []).find((opt) => opt.value === select.value) || select.options?.[select.selectedIndex] || null;
        if (labelEl) {
            labelEl.textContent = current?.textContent?.trim() || button.dataset.placeholder || '请选择';
        }
    }

    refreshAllCustomSelects() {
        ['config-profile', 'config-provider', 'config-region', 'config-transport-mode', 'config-prompt-post-processing'].forEach((id) => this.refreshCustomSelect(id));
    }

    bindCustomSelect(selectId) {
        const panel = this.element || document;
        const select = panel.querySelector(`#${selectId}`);
        const button = panel.querySelector(`[data-select-id="${selectId}"]`);
        if (!select || !button || button.dataset.bound === 'true') return;

        button.dataset.bound = 'true';
        button.addEventListener('click', () => {
            const options = Array.from(select.options || []).map((opt) => ({
                value: opt.value,
                label: opt.textContent || opt.value,
            }));
            this.openCustomSelectMenu({
                anchorEl: button,
                options,
                currentValue: select.value,
                onSelect: (value) => {
                    const changed = select.value !== value;
                    select.value = value;
                    if (changed || selectId === 'config-provider') {
                        select.dispatchEvent(new Event('change', { bubbles: true }));
                    } else {
                        this.refreshCustomSelect(select);
                    }
                },
            });
        });

        select.addEventListener('change', () => this.refreshCustomSelect(select));
        this.refreshCustomSelect(select);
    }

    initCustomSelects() {
        ['config-profile', 'config-provider', 'config-region', 'config-transport-mode', 'config-prompt-post-processing'].forEach((id) => this.bindCustomSelect(id));
        this.refreshAllCustomSelects();
    }

    setTransportSectionExpanded(expanded) {
        this.transportExpanded = Boolean(expanded);
        const panel = this.element || document;
        const section = panel.querySelector('#config-transport-section');
        const toggle = panel.querySelector('#config-transport-toggle');
        const content = panel.querySelector('#config-transport-content');
        section?.classList.toggle('is-expanded', this.transportExpanded);
        toggle?.setAttribute('aria-expanded', String(this.transportExpanded));
        content?.setAttribute('aria-hidden', String(!this.transportExpanded));
    }

    toggleTransportSection() {
        this.setTransportSectionExpanded(!this.transportExpanded);
    }

    updateTransportVisibility({ autoExpand = false } = {}) {
        const panel = this.element || document;
        const mode = panel.querySelector('#config-transport-mode')?.value || 'direct';
        const proxyFields = panel.querySelector('#config-proxy-fields');
        const summary = panel.querySelector('#config-transport-summary');
        if (proxyFields) {
            proxyFields.style.display = mode === 'reverse_proxy' ? 'block' : 'none';
        }
        if (summary) {
            summary.textContent = mode === 'reverse_proxy'
                ? '当前：反代出口。保留服务商原协议，只改请求出口和附加鉴权。'
                : '当前：直连。保持现在的请求方式，不经过反代。';
        }
        if (autoExpand && mode === 'reverse_proxy') {
            this.setTransportSectionExpanded(true);
        }
        if (!autoExpand && mode !== 'reverse_proxy' && !this.transportExpanded) {
            this.setTransportSectionExpanded(false);
        }
        this.refreshCustomSelect('config-transport-mode');
    }

    toggleProxyToken() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-proxy-auth-token');
        const btn = panel.querySelector('#toggle-proxy-token');
        if (!input || !btn) return;
        if (input.type === 'password') {
            input.type = 'text';
            setApiButtonContent(btn, API_CONFIG_ICONS.eyeOff, '隐藏');
        } else {
            input.type = 'password';
            setApiButtonContent(btn, API_CONFIG_ICONS.eye, '显示');
        }
    }

    setExcludedGenerationParams(params = [], { emit = false } = {}) {
        this.excludedGenerationParams = normalizeGenerationParamFilterList(params);
        this.refreshGenerationParamFilterSummary();
        if (emit) this.emitDraftChange();
    }

    refreshGenerationParamFilterSummary() {
        const summary = this.element?.querySelector?.('#generation-param-filter-summary');
        if (!summary) return;
        const list = normalizeGenerationParamFilterList(this.excludedGenerationParams);
        if (!list.length) {
            summary.textContent = '未排除生成参数';
            summary.title = '';
            return;
        }
        const visible = list.slice(0, 4).join(', ');
        const suffix = list.length > 4 ? ` 等 ${list.length} 项` : '';
        summary.textContent = `已排除：${visible}${suffix}`;
        summary.title = list.join(', ');
    }

    openGenerationParamFilterDialog() {
        const initial = normalizeGenerationParamFilterList(this.excludedGenerationParams);
        let draft = initial.slice();
        const overlay = document.createElement('div');
        overlay.className = 'api-param-filter-overlay';
        overlay.innerHTML = `
            <div class="api-param-filter-dialog" role="dialog" aria-modal="true" aria-labelledby="api-param-filter-title">
                <header class="api-param-filter-header">
                    <div>
                        <h3 id="api-param-filter-title">请求参数过滤</h3>
                        <p>保存后仅作用于当前连线设置档</p>
                    </div>
                    <button type="button" class="api-param-filter-icon-button" data-param-filter-action="cancel" aria-label="关闭">
                        ${API_CONFIG_ICONS.close}
                    </button>
                </header>
                <div class="api-param-filter-body">
                    <div class="api-param-filter-section-heading">
                        <span>常用参数</span>
                        <span class="api-param-filter-count">${COMMON_GENERATION_PARAM_FILTERS.length} 项</span>
                    </div>
                    <div class="api-param-filter-common" data-role="common"></div>
                    <div class="api-param-filter-custom">
                        <input class="api-param-filter-input" data-role="custom-input" type="text"
                               placeholder="输入参数名，例如 response_format">
                        <button type="button" class="api-param-filter-button is-primary" data-param-filter-action="add">
                            ${API_CONFIG_ICONS.plus}<span>加入</span>
                        </button>
                    </div>
                    <div class="api-param-filter-error" data-role="input-error" aria-live="polite"></div>
                    <div class="api-param-filter-section-heading is-selected-heading">
                        <span>已排除</span>
                        <span class="api-param-filter-hint">请求发出前将剥除这些字段</span>
                    </div>
                    <div class="api-param-filter-selected" data-role="selected"></div>
                </div>
                <footer class="api-param-filter-footer">
                    <button type="button" class="api-param-filter-button is-clear" data-param-filter-action="clear">清空</button>
                    <div class="api-param-filter-footer-actions">
                        <button type="button" class="api-param-filter-button is-secondary" data-param-filter-action="cancel">取消</button>
                        <button type="button" class="api-param-filter-button is-primary is-apply" data-param-filter-action="apply">
                            <span>完成</span><span class="api-param-filter-apply-count" data-role="apply-count"></span>
                        </button>
                    </div>
                </footer>
            </div>
        `;
        const commonEl = overlay.querySelector('[data-role="common"]');
        const selectedEl = overlay.querySelector('[data-role="selected"]');
        const inputEl = overlay.querySelector('[data-role="custom-input"]');
        const errorEl = overlay.querySelector('[data-role="input-error"]');
        const applyCountEl = overlay.querySelector('[data-role="apply-count"]');
        const clearButton = overlay.querySelector('[data-param-filter-action="clear"]');
        const hasParam = name => draft.includes(name);
        const addParams = (items = []) => {
            draft = normalizeGenerationParamFilterList([...draft, ...items]);
        };
        const removeParam = (name = '') => {
            draft = draft.filter(item => item !== name);
        };
        const render = () => {
            if (applyCountEl) applyCountEl.textContent = draft.length ? `· ${draft.length}` : '';
            if (clearButton) clearButton.disabled = draft.length === 0;
            if (commonEl) {
                commonEl.innerHTML = COMMON_GENERATION_PARAM_FILTERS.map((name) => {
                    const active = hasParam(name);
                    return `
                        <button type="button" data-param-filter-action="toggle" data-param="${escapeHtml(name)}"
                                class="api-param-filter-common-chip${active ? ' is-active' : ''}"
                                aria-pressed="${active}">
                            <span>${escapeHtml(name)}</span>${active ? API_CONFIG_ICONS.check : ''}
                        </button>
                    `;
                }).join('');
            }
            if (selectedEl) {
                selectedEl.innerHTML = draft.length
                    ? draft.map(name => `
                        <span class="api-param-filter-selected-chip">
                            <span>${escapeHtml(name)}</span>
                            <button type="button" data-param-filter-action="remove" data-param="${escapeHtml(name)}"
                                    aria-label="移除 ${escapeHtml(name)}" title="移除 ${escapeHtml(name)}">
                                ${API_CONFIG_ICONS.close}
                            </button>
                        </span>
                    `).join('')
                    : '<div class="api-param-filter-empty">暂无排除项 · 点击上方参数或手动输入加入</div>';
            }
        };
        const close = (apply = false) => {
            if (apply) this.setExcludedGenerationParams(draft, { emit: true });
            overlay.remove();
        };
        const addFromInput = () => {
            const items = splitGenerationParamFilterInput(inputEl?.value || '');
            if (!items.length) {
                if (errorEl) errorEl.textContent = '请输入有效参数名：以字母或下划线开头，只包含字母、数字、下划线、点、冒号或短横线。';
                inputEl?.classList?.add('is-invalid');
                return;
            }
            if (errorEl) errorEl.textContent = '';
            inputEl?.classList?.remove('is-invalid');
            addParams(items);
            if (inputEl) inputEl.value = '';
            render();
        };

        overlay.addEventListener('click', (event) => {
            if (event.target === overlay) {
                close(false);
                return;
            }
            const btn = event.target?.closest?.('[data-param-filter-action]');
            if (!btn || !overlay.contains(btn)) return;
            const action = btn.dataset.paramFilterAction || '';
            const param = btn.dataset.param || '';
            if (action === 'toggle') {
                if (hasParam(param)) removeParam(param);
                else addParams([param]);
                if (errorEl) errorEl.textContent = '';
                inputEl?.classList?.remove('is-invalid');
                render();
            } else if (action === 'remove') {
                removeParam(param);
                render();
            } else if (action === 'add') {
                addFromInput();
            } else if (action === 'clear') {
                draft = [];
                if (errorEl) errorEl.textContent = '';
                inputEl?.classList?.remove('is-invalid');
                render();
            } else if (action === 'apply') {
                close(true);
            } else if (action === 'cancel') {
                close(false);
            }
        });
        inputEl?.addEventListener?.('keydown', (event) => {
            if (event.key === 'Enter') {
                event.preventDefault();
                addFromInput();
            }
        });
        inputEl?.addEventListener?.('input', () => {
            if (errorEl) errorEl.textContent = '';
            inputEl.classList.remove('is-invalid');
        });
        render();
        document.body.appendChild(overlay);
        inputEl?.focus?.();
    }

    /**
     * 获取指定 provider 的默认配置
     */
    getProviderDefaults(provider, options = {}) {
        const isImage = this.activeTab === 'image';
        const regionRaw = String(options?.region || 'us-central1').trim();
        const region = regionRaw || 'us-central1';
        const defaults = {
            openai: {
                baseUrl: 'https://api.openai.com/v1',
                model: isImage ? 'gpt-image-2' : 'gpt-3.5-turbo',
                urlHelp: 'OpenAI API 基础 URL'
            },
            makersuite: {
                baseUrl: 'https://generativelanguage.googleapis.com',
                model: 'gemini-2.0-flash-exp',
                urlHelp: 'Google AI Studio API URL'
            },
            vertexai: {
                baseUrl: `https://${region}-aiplatform.googleapis.com`,
                model: 'gemini-2.0-flash-exp',
                urlHelp: 'Vertex AI API URL (根据 Region 自动调整)'
            },
            deepseek: {
                baseUrl: 'https://api.deepseek.com/v1',
                model: 'deepseek-chat',
                urlHelp: 'Deepseek API URL'
            },
            openrouter: {
                baseUrl: 'https://openrouter.ai/api/v1',
                model: 'openrouter/auto',
                urlHelp: 'OpenRouter API 基础 URL'
            },
            anthropic: {
                baseUrl: 'https://api.anthropic.com/v1',
                model: 'claude-3-5-sonnet-20241022',
                urlHelp: 'Anthropic API 基础 URL'
            },
            novelai: {
                baseUrl: 'https://image.novelai.net',
                model: 'nai-diffusion-4-5-full',
                urlHelp: 'NovelAI Image API URL'
            },
            stability: {
                baseUrl: 'https://api.stability.ai',
                model: 'stable-image-core',
                urlHelp: 'Stability AI API URL'
            },
            togetherai: {
                baseUrl: 'https://api.together.xyz/v1',
                model: 'black-forest-labs/FLUX.1-schnell',
                urlHelp: 'Together AI API URL'
            },
            pollinations: {
                baseUrl: 'https://gen.pollinations.ai',
                model: 'flux',
                urlHelp: 'Pollinations 图片 API URL'
            },
            automatic1111: {
                baseUrl: 'http://127.0.0.1:7860',
                model: 'default',
                urlHelp: 'AUTOMATIC1111 WebUI URL（需要启动 --api）'
            },
            comfyui: {
                baseUrl: 'http://127.0.0.1:8188',
                model: 'workflow',
                urlHelp: 'ComfyUI URL（需要在图片参数中填写 API Format workflow JSON）'
            },
            custom: {
                baseUrl: 'http://localhost:8000/v1',
                model: isImage ? 'image-model' : 'default',
                urlHelp: '自定义 API 的基础 URL'
            }
        };

        return defaults[provider] || defaults.openai;
    }

    usesEditableBaseUrl(provider) {
        return ['custom', 'automatic1111', 'a1111', 'comfyui', 'comfy'].includes(String(provider || '').trim().toLowerCase());
    }

    resetFormForProvider(provider) {
        const panel = this.element || document;
        const baseEl = panel.querySelector('#config-baseurl');
        const modelEl = panel.querySelector('#config-model');
        const apiKeyEl = panel.querySelector('#config-apikey');
        const streamEl = panel.querySelector('#config-stream');
        const promptPostProcessingEl = panel.querySelector('#config-prompt-post-processing');
        const regionEl = panel.querySelector('#config-region');
        const saEl = panel.querySelector('#config-serviceaccount');

        const defaults = this.getProviderDefaults(provider, { region: regionEl?.value || 'us-central1' });

        if (baseEl) {
            baseEl.value = defaults.baseUrl;
            baseEl.placeholder = defaults.baseUrl;
        }
        if (modelEl) {
            modelEl.value = defaults.model;
            modelEl.placeholder = defaults.model;
        }
        if (apiKeyEl) {
            apiKeyEl.value = '';
            apiKeyEl.dataset.hasKey = 'false';
            apiKeyEl.dataset.originalKey = '';
        }
        if (streamEl) {
            streamEl.checked = true;
        }
        if (promptPostProcessingEl) {
            promptPostProcessingEl.value = 'none';
        }
        if (regionEl) {
            regionEl.value = 'us-central1';
        }
        if (saEl) {
            saEl.value = '';
            saEl.dataset.hasKey = 'false';
            saEl.dataset.originalKey = '';
            saEl.style.webkitTextSecurity = 'none';
        }
        this.clearModelOptions();
        this.refreshAllCustomSelects();
    }

    scheduleModelOptionsRender() {
        if (this.modelFilterDebounceTimer !== null) {
            clearTimeout(this.modelFilterDebounceTimer);
            this.modelFilterDebounceTimer = null;
        }
        if (!this.modelOptions.length) return;
        this.modelFilterDebounceTimer = setTimeout(() => {
            this.modelFilterDebounceTimer = null;
            if (this.modelOptions.length) {
                this.renderModelOptions(this.modelOptions);
            }
        }, MODEL_FILTER_DEBOUNCE_MS);
    }

    clearModelOptions() {
        if (this.modelFilterDebounceTimer !== null) {
            clearTimeout(this.modelFilterDebounceTimer);
            this.modelFilterDebounceTimer = null;
        }
        const container = (this.element || document).querySelector('#model-options');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        this.modelOptions = [];
    }

    renderModelOptions(models = []) {
        if (this.modelFilterDebounceTimer !== null) {
            clearTimeout(this.modelFilterDebounceTimer);
            this.modelFilterDebounceTimer = null;
        }
        const panel = this.element || document;
        const container = panel.querySelector('#model-options');
        if (!container) return;

        if (!models.length) {
            this.clearModelOptions();
            return;
        }

        this.modelOptions = Array.from(models);
        const modelInput = panel.querySelector('#config-model');
        const query = String(modelInput?.value || '').trim();
        const normalizedQuery = query.toLowerCase();
        const rankedModels = rankModelCandidates(this.modelOptions, query);
        container.innerHTML = '';
        container.style.display = 'flex';

        rankedModels.forEach(modelId => {
            const normalizedModelId = String(modelId).toLowerCase();
            const isMatch = Boolean(normalizedQuery && normalizedModelId.includes(normalizedQuery));
            const isSelected = String(modelInput?.value || '').trim() === modelId;
            const chip = document.createElement('button');
            chip.textContent = modelId;
            chip.type = 'button';
            chip.className = 'api-config-model-chip';
            chip.classList.toggle('is-match', isMatch);
            chip.classList.toggle('is-selected', isSelected);
            chip.ariaPressed = String(isSelected);
            chip.title = isMatch ? `匹配“${query}”` : modelId;
            chip.onclick = () => {
                if (modelInput) {
                    modelInput.value = modelId;
                    modelInput.dispatchEvent(new Event('input', { bubbles: true }));
                }
            };
            container.appendChild(chip);
        });
    }

    /**
     * 加载特定 provider 的配置
     */
    async loadProviderConfig(provider) {
        try {
            // 每次切换先回到该 provider 的默认值，避免泄漏其他 provider 的配置
            this.resetFormForProvider(provider);

            // 从 localStorage 加载所有配置
            const stored = localStorage.getItem('llm_configs');
            if (!stored) {
                this.updateDefaultsForProvider(provider);
                this.updateFieldVisibility(provider);
                return; // 没有存储的配置，使用默认值
            }

            const allConfigs = JSON.parse(stored);
            const providerConfig = allConfigs[provider];

            if (!providerConfig) {
                this.updateDefaultsForProvider(provider);
                this.updateFieldVisibility(provider);
                return; // 该 provider 没有配置，使用默认值
            }

            // 解密配置
            const config = { ...providerConfig, provider };

            // 解密 API Key
            if (config._encrypted && config.apiKey) {
                try {
                    config.apiKey = atob(config.apiKey);
                } catch (e) {
                    logger.error('解密 API Key 失败:', e);
                }
                delete config._encrypted;
            }

            // 解密 Service Account JSON
            if (config._saEncrypted && config.vertexaiServiceAccount) {
                try {
                    config.vertexaiServiceAccount = atob(config.vertexaiServiceAccount);
                } catch (e) {
                    logger.error('解密 Service Account 失败:', e);
                }
                delete config._saEncrypted;
            }

            // 填充表单
            const panel = this.element || document;
            const baseEl = panel.querySelector('#config-baseurl');
            const modelEl = panel.querySelector('#config-model');
            const streamEl = panel.querySelector('#config-stream');
            const promptPostProcessingEl = panel.querySelector('#config-prompt-post-processing');
            const apiKeyInput = panel.querySelector('#config-apikey');

            if (baseEl) baseEl.value = config.baseUrl || '';
            if (modelEl) modelEl.value = config.model || '';
            if (streamEl) streamEl.checked = config.stream !== false;
            if (promptPostProcessingEl) promptPostProcessingEl.value = normalizePromptPostProcessingForForm(config.promptPostProcessing);

            // API Key 显示为 masked
            if (apiKeyInput) {
                if (config.apiKey) {
                    apiKeyInput.value = '••••••••••••••••';
                    apiKeyInput.dataset.hasKey = 'true';
                    apiKeyInput.dataset.originalKey = config.apiKey;
                } else {
                    apiKeyInput.value = '';
                    apiKeyInput.dataset.hasKey = 'false';
                }
            }

            // 填充 Vertex AI 特定字段
            if (provider === 'vertexai') {
                const regionInput = panel.querySelector('#config-region');
                const saInput = panel.querySelector('#config-serviceaccount');

                if (regionInput) {
                    regionInput.value = config.vertexaiRegion || 'us-central1';
                }

                if (saInput) {
                    if (config.vertexaiServiceAccount) {
                        saInput.value = '••••••••••••••••';
                        saInput.dataset.hasKey = 'true';
                        saInput.dataset.originalKey = config.vertexaiServiceAccount;
                        saInput.style.webkitTextSecurity = 'disc';
                    } else {
                        saInput.value = '';
                        saInput.dataset.hasKey = 'false';
                        saInput.style.webkitTextSecurity = 'none';
                    }
                }
            }

            logger.info(`已加载 ${provider} 的配置`);
            this.updateFieldVisibility(provider);
            this.refreshAllCustomSelects();

        } catch (e) {
            logger.error('加载 provider 配置失败:', e);
        }
    }

    /**
     * 填充表单
     */
    populateForm(config) {
        if (!this.element) {
            this.createUI();
        }
        const panel = this.element || document;
        const providerEl = panel.querySelector('#config-provider');
        const baseEl = panel.querySelector('#config-baseurl');
        const modelEl = panel.querySelector('#config-model');
        const streamEl = panel.querySelector('#config-stream');
        const promptPostProcessingEl = panel.querySelector('#config-prompt-post-processing');
        const transportModeEl = panel.querySelector('#config-transport-mode');
        const proxyBaseEl = panel.querySelector('#config-proxy-baseurl');
        const proxyHeaderEl = panel.querySelector('#config-proxy-auth-header');
        const proxyTokenEl = panel.querySelector('#config-proxy-auth-token');
        const forwardProviderAuthEl = panel.querySelector('#config-forward-provider-auth');
        const apiKeyInput = panel.querySelector('#config-apikey');
        if (!providerEl || !baseEl || !modelEl || !streamEl || !apiKeyInput) {
            logger.error('配置面板元素缺失，填充表单中止');
            return;
        }

        const allowedProviders = new Set(this.getProviderOptions().map(item => item.value));
        const selectedProvider = allowedProviders.has(config.provider) ? config.provider : 'openai';
        providerEl.value = selectedProvider;
        const currentProvider = providerEl.value || 'openai';
        const currentRegion = config.vertexaiRegion || 'us-central1';
        const defaultBaseUrl = this.getProviderDefaults(currentProvider, { region: currentRegion }).baseUrl;
        const storedBaseUrl = String(config.baseUrl || '').trim();
        const legacyProxyBaseUrl =
            !this.usesEditableBaseUrl(currentProvider) &&
            storedBaseUrl &&
            storedBaseUrl !== defaultBaseUrl &&
            config.connectionMode !== 'reverse_proxy'
                ? storedBaseUrl
                : '';
        baseEl.value = this.usesEditableBaseUrl(currentProvider)
            ? (config.baseUrl || '')
            : defaultBaseUrl;
        modelEl.value = config.model || '';
        streamEl.checked = config.stream !== false;
        this.setExcludedGenerationParams(config.excludedGenerationParams || [], { emit: false });
        if (promptPostProcessingEl) promptPostProcessingEl.value = normalizePromptPostProcessingForForm(config.promptPostProcessing);
        if (transportModeEl) {
            transportModeEl.value = (config.connectionMode === 'reverse_proxy' || legacyProxyBaseUrl)
                ? 'reverse_proxy'
                : 'direct';
        }
        if (proxyBaseEl) proxyBaseEl.value = config.proxyBaseUrl || legacyProxyBaseUrl || '';
        if (proxyHeaderEl) proxyHeaderEl.value = config.proxyAuthHeaderName || '';
        if (proxyTokenEl) {
            proxyTokenEl.type = 'password';
            proxyTokenEl.value = config.proxyAuthToken || '';
        }
        const proxyToggleBtn = panel.querySelector('#toggle-proxy-token');
        setApiButtonContent(proxyToggleBtn, API_CONFIG_ICONS.eye, '显示');
        if (forwardProviderAuthEl) forwardProviderAuthEl.checked = config.forwardProviderAuth !== false;
        const timeoutEl = panel.querySelector('#config-timeout');
        if (timeoutEl) {
            const ms = Number(config.timeout);
            const sec = Number.isFinite(ms) ? Math.round(ms / 1000) : 60;
            timeoutEl.value = String(Math.min(9000, Math.max(10, sec)));
        }

        // Profile selector
        this.refreshProfileOptions();

        // API Key：仅显示遮罩（不把明文塞进 DOM / dataset）
        const masked = this.getMaskedActiveKey();
        apiKeyInput.type = 'password';
        setApiButtonContent(panel.querySelector('#toggle-apikey'), API_CONFIG_ICONS.eye, '显示');
        if (masked) {
            apiKeyInput.value = masked;
            apiKeyInput.dataset.hasKey = 'true';
            apiKeyInput.dataset.masked = masked;
        } else {
            apiKeyInput.value = '';
            apiKeyInput.dataset.hasKey = 'false';
            apiKeyInput.dataset.masked = '';
        }

        apiKeyInput.onfocus = function() {
            if (this.dataset.hasKey === 'true' && this.dataset.masked && this.value === this.dataset.masked) {
                this.value = '';
            }
        };
        apiKeyInput.onblur = function() {
            if (!this.value && this.dataset.masked) {
                this.value = this.dataset.masked;
                this.dataset.hasKey = 'true';
            }
        };

        // 填充 Vertex AI 特定字段
        if (config.provider === 'vertexai') {
            const regionInput = panel.querySelector('#config-region');
            const saInput = panel.querySelector('#config-serviceaccount');

            if (regionInput) {
                regionInput.value = config.vertexaiRegion || 'us-central1';
            }

            // Mask Service Account JSON
            if (saInput) {
                setApiButtonContent(panel.querySelector('#toggle-sa'), API_CONFIG_ICONS.eye, '显示');
                if (config.vertexaiServiceAccount) {
                    saInput.value = '••••••••••••••••';
                    saInput.dataset.hasKey = 'true';
                    saInput.dataset.originalKey = config.vertexaiServiceAccount;
                    saInput.style.webkitTextSecurity = 'disc';
                } else {
                    saInput.value = '';
                    saInput.dataset.hasKey = 'false';
                    saInput.style.webkitTextSecurity = 'none';
                }

                // Clear on focus
                saInput.onfocus = function() {
                    if (this.dataset.hasKey === 'true' && this.value === '••••••••••••••••') {
                        this.value = '';
                        this.style.webkitTextSecurity = 'none';
                    }
                };
                saInput.onblur = function() {
                    if (!this.value) {
                        this.dataset.hasKey = 'false';
                    }
                };
            }
        }

        // 更新字段可见性
        this.updateFieldVisibility(config.provider || 'openai');
        this.updateTransportVisibility();
        this.setTransportSectionExpanded(config.connectionMode === 'reverse_proxy' || Boolean(legacyProxyBaseUrl));
        this.refreshAllCustomSelects();
    }

    refreshProfileOptions() {
        const panel = this.element || document;
        const select = panel.querySelector('#config-profile');
        if (!select) return;

        // 设置标志防止触发 onchange
        this.isRefreshingProfile = true;

        try {
            const profiles = this.configManager.getProfiles?.() || [];
            const activeId = this.configManager.getActiveProfileId?.();
            select.innerHTML = '';
            profiles.forEach((p) => {
                const opt = document.createElement('option');
                opt.value = p.id;
                opt.textContent = p.name;
                select.appendChild(opt);
            });
            if (activeId) {
                select.value = activeId;
                logger.debug(`刷新配置选择器，当前: ${activeId.slice(0, 20)}...`);
            }
            this.refreshCustomSelect(select);
        } finally {
            // 延迟重置标志，确保 onchange 事件不会触发
            setTimeout(() => {
                this.isRefreshingProfile = false;
            }, 100);
        }
    }

    getMaskedActiveKey() {
        const active = this.configManager.getActiveProfile?.();
        if (!active?.activeKeyId) return '';
        const keys = this.configManager.listKeys?.(active.id) || [];
        const key = keys.find(k => k.id === active.activeKeyId);
        return key?.preview || '';
    }

    /**
     * 更新不同 provider 的默认值
     */
    updateDefaultsForProvider(provider) {
        const panel = this.element || document;
        const defaults = this.getProviderDefaults(provider, {
            region: panel.querySelector('#config-region')?.value || 'us-central1',
        });
        const baseUrlInput = panel.querySelector('#config-baseurl');
        const baseUrlSection = panel.querySelector('#config-baseurl-section');
        const modelInput = panel.querySelector('#config-model');
        const editableBaseUrl = this.usesEditableBaseUrl(provider);

        if (baseUrlInput) {
            // 内建服务商固定使用默认协议地址；custom 保持可编辑。
            const currentUrl = baseUrlInput.value.trim();
            const selectedRegion = panel.querySelector('#config-region')?.value || 'us-central1';
            const allDefaults = ALL_PROVIDER_KEYS
                .map((name) => this.getProviderDefaults(name, { region: selectedRegion }).baseUrl);
            const isDefaultUrl = allDefaults.includes(currentUrl);
            if (!editableBaseUrl || !currentUrl || isDefaultUrl) {
                baseUrlInput.value = defaults.baseUrl;
            }
            baseUrlInput.placeholder = defaults.baseUrl;

            const helpText = baseUrlInput.nextElementSibling;
            if (helpText && helpText.tagName === 'SMALL') {
                helpText.textContent = defaults.urlHelp;
            }
        }
        if (baseUrlSection) {
            baseUrlSection.style.display = editableBaseUrl ? 'block' : 'none';
        }

        if (modelInput) {
            // 自动填写模型（如果当前为空或为其他服务商的默认值）
            const currentModel = modelInput.value.trim();
            const allDefaults = ALL_PROVIDER_KEYS.map(p => this.getProviderDefaults(p).model);
            const isDefaultModel = allDefaults.includes(currentModel);
            if (!currentModel || isDefaultModel) {
                modelInput.value = defaults.model;
            }
            modelInput.placeholder = defaults.model;
        }
    }

    /**
     * 更新字段可见性（根据服务商）
     */
    updateFieldVisibility(provider) {
        const panel = this.element || document;
        const baseUrlSection = panel.querySelector('#config-baseurl-section');
        const vertexaiFields = panel.querySelector('#vertexai-fields');
        const apiKeyHelp = panel.querySelector('#apikey-help');
        if (baseUrlSection) {
            baseUrlSection.style.display = this.usesEditableBaseUrl(provider) ? 'block' : 'none';
        }

        if (provider === 'vertexai') {
            vertexaiFields.style.display = 'block';
            if (apiKeyHelp) {
                apiKeyHelp.textContent = 'Vertex AI 需 Service Account 后端签名；纯前端建议改用 Google AI Studio (Makersuite)';
            }
        } else if (!this.providerRequiresApiKey(provider)) {
            vertexaiFields.style.display = 'none';
            if (apiKeyHelp) {
                apiKeyHelp.textContent = '此图片渠道可不填写 API Key；若服务端启用鉴权再保存 Key。';
            }
        } else {
            vertexaiFields.style.display = 'none';
            if (apiKeyHelp) {
                apiKeyHelp.textContent = '保存后 Key 以遮罩显示（不可复制）；可在 Key 管理中保存多个';
            }
        }
        this.refreshAllCustomSelects();
    }

    /**
     * 获取表单数据
     */
    getFormData({ commitActiveInput = true } = {}) {
        const panel = this.element || document;

        // 在部分移动端输入法下，点击按钮时输入可能还在 composition 状态；先 blur 提交文本
        if (commitActiveInput) {
            try {
                const activeEl = panel?.ownerDocument?.activeElement || document.activeElement;
                if (activeEl && panel?.contains?.(activeEl) && typeof activeEl.blur === 'function') {
                    activeEl.blur();
                }
            } catch {}
        }

        const provider = panel.querySelector('#config-provider')?.value;
        const region = panel.querySelector('#config-region')?.value || 'us-central1';
        const apiKeyInput = panel.querySelector('#config-apikey');
        const rawKey = (apiKeyInput?.value || '').trim();
        const masked = apiKeyInput?.dataset?.masked || '';
        // apiKey 为 null => 不修改 key（继续使用已保存的 active key）
        const apiKey = (!rawKey || (masked && rawKey === masked)) ? null : rawKey;

        const formData = {
            provider: provider,
            baseUrl: this.usesEditableBaseUrl(provider)
                ? (panel.querySelector('#config-baseurl')?.value || '').trim()
                : this.getProviderDefaults(provider, { region }).baseUrl,
            connectionMode: panel.querySelector('#config-transport-mode')?.value === 'reverse_proxy' ? 'reverse_proxy' : 'direct',
            proxyBaseUrl: (panel.querySelector('#config-proxy-baseurl')?.value || '').trim(),
            proxyAuthHeaderName: (panel.querySelector('#config-proxy-auth-header')?.value || '').trim(),
            proxyAuthToken: panel.querySelector('#config-proxy-auth-token')?.value || '',
            forwardProviderAuth: Boolean(panel.querySelector('#config-forward-provider-auth')?.checked),
            promptPostProcessing: normalizePromptPostProcessingForForm(panel.querySelector('#config-prompt-post-processing')?.value),
            apiKey: apiKey,
            model: (panel.querySelector('#config-model')?.value || '').trim(),
            stream: Boolean(panel.querySelector('#config-stream')?.checked),
            excludedGenerationParams: normalizeGenerationParamFilterList(this.excludedGenerationParams),
            timeout: (() => {
                const secRaw = (panel.querySelector('#config-timeout')?.value || '').trim();
                const sec = Number(secRaw);
                const clamped = Number.isFinite(sec) ? Math.min(9000, Math.max(10, Math.trunc(sec))) : 60;
                return clamped * 1000;
            })(),
            maxRetries: 3
        };

        // Add Vertex AI specific fields
        if (provider === 'vertexai') {
            const saInput = panel.querySelector('#config-serviceaccount');
            let serviceAccount = saInput?.value;

            // Handle masked Service Account JSON
            if (serviceAccount === '••••••••••••••••' && saInput?.dataset.hasKey === 'true') {
                serviceAccount = saInput.dataset.originalKey;
            }

            if (region) formData.vertexaiRegion = region;
            if (serviceAccount && serviceAccount.trim()) {
                formData.vertexaiServiceAccount = serviceAccount;
            }
        }

        return formData;
    }

    isOpen() {
        return Boolean(this.element && this.element.style.display !== 'none');
    }

    getActiveTab() {
        return this.activeTab;
    }

    getDraftConfig({ tab = '' } = {}) {
        const targetTab = tab === 'image' ? 'image' : tab === 'chat' ? 'chat' : this.activeTab;
        if (!this.isOpen() || targetTab !== this.activeTab) return null;
        return this.getFormData({ commitActiveInput: false });
    }

    toggleApiKey() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-apikey');
        const btn = panel.querySelector('#toggle-apikey');
        if (input.type === 'password') {
            input.type = 'text';
            setApiButtonContent(btn, API_CONFIG_ICONS.eyeOff, '隐藏');
        } else {
            input.type = 'password';
            setApiButtonContent(btn, API_CONFIG_ICONS.eye, '显示');
        }
    }

    toggleServiceAccount() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-serviceaccount');
        const btn = panel.querySelector('#toggle-sa');
        if (!input || !btn) return;

        if (input.style.webkitTextSecurity === 'disc' || input.style.webkitTextSecurity === '') {
            input.style.webkitTextSecurity = 'none';
            setApiButtonContent(btn, API_CONFIG_ICONS.eyeOff, '隐藏');
        } else {
            input.style.webkitTextSecurity = 'disc';
            setApiButtonContent(btn, API_CONFIG_ICONS.eye, '显示');
        }
    }

    async createProfile() {
        const name = prompt('新设置档名称', '新配置');
        if (!name) return;
        await this.configManager.createProfile(name);
        const config = await this.configManager.load();
        this.refreshProfileOptions();
        this.populateForm(config);
        await this.syncActiveProfileRuntime(config);
        this.emitProfileChanged();
        window.toastr?.success(`已创建：${name}`);
    }

    async renameProfile() {
        const active = this.configManager.getActiveProfile?.();
        if (!active) return;
        const name = prompt('重命名设置档', active.name || '');
        if (!name) return;
        await this.configManager.renameProfile(active.id, name);
        this.refreshProfileOptions();
        this.emitProfileChanged(active.id);
        window.toastr?.success('已重命名');
    }

    async deleteProfile() {
        const profiles = this.configManager.getProfiles?.() || [];
        if (profiles.length <= 1) {
            window.toastr?.warning('至少保留一个设置档');
            return;
        }
        const active = this.configManager.getActiveProfile?.();
        if (!active) return;
        const ok = await appConfirm({
            title: '删除设置档',
            message: `删除设置档「${active.name}」？此操作不可恢复。`,
            danger: true,
        });
        if (!ok) return;
        await this.configManager.deleteProfile(active.id);
        const config = await this.configManager.load();
        this.refreshProfileOptions();
        this.populateForm(config);
        await this.syncActiveProfileRuntime(config);
        this.emitProfileChanged();
    }

    openKeyManager() {
        if (!this.keyOverlay) {
            this.createKeyManagerUI();
        }
        this.refreshKeyManagerList();
        this.keyOverlay.style.display = 'block';
        this.keyModal.style.display = 'block';
    }

    closeKeyManager() {
        if (this.keyOverlay) this.keyOverlay.style.display = 'none';
        if (this.keyModal) this.keyModal.style.display = 'none';
    }

    createKeyManagerUI() {
        this.keyOverlay = document.createElement('div');
        this.keyOverlay.id = 'config-key-overlay';
        this.keyOverlay.className = 'app-themed-overlay';
        this.keyOverlay.style.cssText = 'display:none; position:fixed; inset:0; background:rgba(0,0,0,0.5); z-index: 23100;';
        this.keyOverlay.onclick = () => this.closeKeyManager();

        this.keyModal = document.createElement('div');
        this.keyModal.id = 'config-key-modal';
        this.keyModal.className = 'app-themed-panel';
        this.keyModal.style.cssText = `
            display:none; position:fixed; top:50%; left:50%; transform:translate(-50%,-50%);
            width:min(560px,92vw); max-height:80vh; overflow:auto;
            background:var(--app-surface-card); border-radius:12px; box-shadow:0 10px 40px rgba(0,0,0,0.25);
            z-index: 23110; padding:16px;
        `;
        this.keyModal.onclick = (e) => e.stopPropagation();
        this.keyModal.innerHTML = `
            <div style="display:flex; align-items:center; justify-content:space-between; gap:8px;">
                <div>
                    <div style="display:flex; align-items:center; gap:7px; font-weight:800; color:var(--app-text-primary);">${API_CONFIG_ICONS.key}<span>Key 管理</span></div>
                    <div style="color:var(--app-text-muted); font-size:12px;">Key 以遮罩显示，不可复制；可保存多个并切换当前使用</div>
                </div>
                <button id="keymgr-close" aria-label="关闭 Key 管理" style="width:32px; height:32px; display:inline-flex; align-items:center; justify-content:center; border:none; border-radius:8px; background:var(--app-surface-subtle); color:var(--app-text-secondary); cursor:pointer;">${API_CONFIG_ICONS.close}</button>
            </div>
            <div style="margin-top:12px; border-top:1px solid var(--app-border-subtle); padding-top:12px;">
                <div style="font-weight:700; margin-bottom:6px;">已保存的 Keys</div>
                <ul id="keymgr-list" style="list-style:none; padding:0; margin:0; border:1px solid var(--app-border-subtle); border-radius:10px; overflow:hidden;"></ul>
            </div>
            <div style="margin-top:12px; border-top:1px solid var(--app-border-subtle); padding-top:12px;">
                <div style="font-weight:700; margin-bottom:6px;">新增 Key</div>
                <div style="display:flex; gap:8px; align-items:center;">
                    <input id="keymgr-input" type="password" placeholder="贴上 API Key" style="flex:1; padding:10px; border:1px solid var(--app-border-default); border-radius:10px;">
                    <button id="keymgr-add" style="padding:10px 12px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer;">保存</button>
                </div>
                <small style="color:var(--app-text-muted);">保存后将自動设为当前 Key</small>
            </div>
        `;

        this.keyModal.querySelector('#keymgr-close').onclick = () => this.closeKeyManager();
        this.keyModal.querySelector('#keymgr-add').onclick = async () => {
            const input = this.keyModal.querySelector('#keymgr-input');
            const key = (input?.value || '').trim();
            if (!key) {
                window.toastr?.warning('请输入 Key');
                return;
            }
            const active = this.configManager.getActiveProfile?.();
            try {
                const keyId = await this.configManager.addKey(active?.id, key, 'API Key');
                await this.configManager.setActiveKey(active?.id, keyId);
                input.value = '';
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
                window.toastr?.success('Key 已保存并设为当前');
            } catch (err) {
                window.toastr?.error(err.message || '保存 Key 失败');
            }
        };

        document.body.appendChild(this.keyOverlay);
        document.body.appendChild(this.keyModal);
    }

    syncMaskedKeyToForm() {
        const masked = this.getMaskedActiveKey();
        const apiKeyInput = (this.element || document).querySelector('#config-apikey');
        if (!apiKeyInput) return;
        apiKeyInput.value = masked || '';
        apiKeyInput.dataset.masked = masked || '';
        apiKeyInput.dataset.hasKey = masked ? 'true' : 'false';
    }

    async syncRuntimeToAppBridge() {
        if (this.activeTab !== 'chat') return;
        const runtime = await this.configManager.load();
        if (window.appBridge) {
            syncChatRuntimeConfigToBridge({
                bridge: window.appBridge,
                runtime,
                canInitClient,
                createClient: config => new LLMClient(config),
            });
        }
    }

    refreshKeyManagerList() {
        const list = this.keyModal?.querySelector('#keymgr-list');
        if (!list) return;
        const active = this.configManager.getActiveProfile?.();
        const keys = this.configManager.listKeys?.(active?.id) || [];
        list.innerHTML = '';
        if (!keys.length) {
            const li = document.createElement('li');
            li.style.cssText = 'padding:10px 12px; color:var(--app-text-muted);';
            li.textContent = '（尚无 Key）';
            list.appendChild(li);
            return;
        }
        keys.forEach((k) => {
            const li = document.createElement('li');
            li.style.cssText = 'padding:10px 12px; border-bottom:1px solid var(--app-surface-hover); display:flex; align-items:center; justify-content:space-between; gap:10px;';
            const left = document.createElement('div');
            const isActive = active?.activeKeyId === k.id;
            left.innerHTML = `<div style="font-weight:700; color:var(--app-text-primary);">${k.preview || '••••'}</div><div style="color:var(--app-text-muted); font-size:12px;">${k.label || 'API Key'}${isActive ? ' · 当前' : ''}</div>`;
            const right = document.createElement('div');
            right.style.display = 'flex';
            right.style.gap = '6px';

            const useBtn = document.createElement('button');
            useBtn.textContent = isActive ? '当前' : '使用';
            useBtn.disabled = isActive;
            useBtn.style.cssText = 'padding:6px 10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle); cursor:pointer;';
            useBtn.onclick = async () => {
                await this.configManager.setActiveKey(active?.id, k.id);
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
            };

            const delBtn = document.createElement('button');
            delBtn.textContent = '删除';
            delBtn.style.cssText = 'padding:6px 10px; border:1px solid #fca5a5; border-radius:10px; background:#fee2e2; color:#b91c1c; cursor:pointer;';
            delBtn.onclick = async () => {
                const ok = await appConfirm({ title: '删除 Key', message: '删除该 Key？', danger: true });
                if (!ok) return;
                await this.configManager.removeKey(active?.id, k.id);
                this.refreshKeyManagerList();
                this.syncMaskedKeyToForm();
                await this.syncRuntimeToAppBridge();
            };

            right.appendChild(useBtn);
            right.appendChild(delBtn);
            li.appendChild(left);
            li.appendChild(right);
            list.appendChild(li);
        });
    }

    /**
     * 显示状态消息
     */
    showStatus(message, type = 'info') {
        const statusEl = (this.element || document).querySelector('#config-status');
        if (!statusEl) return;
        const state = ['success', 'error', 'info'].includes(type) ? type : 'info';
        statusEl.className = `api-config-status is-${state}`;
        statusEl.style.display = 'flex';
        statusEl.style.background = '';
        statusEl.style.color = '';
        statusEl.textContent = message;

        setTimeout(() => {
            statusEl.style.display = 'none';
        }, 5000);
    }

    /**
     * 保存配置
     */
    async onSave() {
        const formData = this.getFormData();

        try {
            if (!formData.model || (this.usesEditableBaseUrl(formData.provider) && !formData.baseUrl)) {
                this.showStatus(this.usesEditableBaseUrl(formData.provider) ? '请填写 Base URL / 模型' : '请填写模型', 'error');
                return;
            }

            // 已保存 Key 存在时，输入框仍显示遮罩（formData.apiKey 会是 null）。
            const active = this.configManager.getActiveProfile?.();
            const keys = this.configManager.listKeys?.(active?.id) || [];
            const hasTypedKey = typeof formData.apiKey === 'string' && formData.apiKey.trim().length > 0;
            const hasSavedKey = keys.length > 0;
            if (!hasTypedKey && !hasSavedKey && this.providerRequiresApiKey(formData.provider)) {
                this.showStatus('请先在 Key 管理中保存至少一个 API Key，或在此栏贴上 Key 后保存', 'error');
                return;
            }
            this.setLoading(true);
            // 验证配置
            await this.configManager.validate({ ...formData, apiKey: hasTypedKey ? formData.apiKey.trim() : null });

            // 保存
            await this.configManager.save(formData);

            // 重新初始化客户端（仅聊天配置）
            if (window.appBridge && this.activeTab === 'chat') {
                const runtime = await this.configManager.load();
                const syncResult = syncChatRuntimeConfigToBridge({
                    bridge: window.appBridge,
                    runtime,
                    canInitClient,
                    createClient: config => new LLMClient(config),
                });
                await reloadBridgeConfig(window.appBridge);

                // 若保存后仍拿不到 key（解密/保存失败），給出明確提示并不自動关闭
                if (!syncResult.configured) {
                    this.showStatus('已保存，但当前 Key 不可用（请在 Key 管理中重新保存）', 'error');
                    return;
                }
            }

            this.showStatus('配置保存成功！', 'success');
            logger.info('配置保存成功');
            this.emitProfileChanged();
            const savedPayload = {
                tab: this.activeTab,
                profileId: this.configManager.getActiveProfileId?.() || '',
                profile: this.configManager.getActiveProfile?.() || null,
                config: this.configManager.get?.() || null,
            };
            const callbacks = new Set([this.onSaved, this.openOptions?.onSaved].filter(callback => typeof callback === 'function'));
            for (const callback of callbacks) {
                try {
                    await callback(savedPayload);
                } catch (callbackError) {
                    logger.warn('config panel onSaved failed', callbackError);
                }
            }

            setTimeout(() => this.hide(), 1500);
        } catch (e) {
            this.showStatus(`保存失败: ${e.message}`, 'error');
            logger.error('保存配置失败:', e);
        } finally {
            this.setLoading(false);
        }
    }

    /**
     * 测试连接
     */
    async onTest() {
        const formData = this.getFormData();

        try {
            setApiButtonContent(this.testButton, API_CONFIG_ICONS.loader, '测试中...');
            this.testButton.disabled = true;

            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再测试连接', 'error');
                    return;
                }
                const tempClient = new LLMClient({ ...formData, apiKey: '' });
                const result = await tempClient.healthCheck();
                if (result.ok) {
                    this.showStatus('连接成功！', 'success');
                    logger.info('API 连接测试成功');
                } else {
                    this.showStatus(`连接失败: ${result.error}`, 'error');
                    logger.warn('API 连接测试失败:', result.error);
                }
                return;
            }

            const runtime = await this.configManager.load();
            const existingKey = (runtime?.apiKey || '').trim();
            const keyToUse = (typeof formData.apiKey === 'string') ? formData.apiKey.trim() : existingKey;
            if (!keyToUse && this.providerRequiresApiKey(formData.provider)) {
                this.showStatus('请先在 Key 管理中保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            const tempClient = new LLMClient({ ...formData, apiKey: keyToUse });
            const result = await tempClient.healthCheck();

            if (result.ok) {
                this.showStatus('连接成功！', 'success');
                logger.info('API 连接测试成功');
            } else {
                this.showStatus(`连接失败: ${result.error}`, 'error');
                logger.warn('API 连接测试失败:', result.error);
            }
        } catch (e) {
            this.showStatus(`测试失败: ${e.message}`, 'error');
            logger.error('API 连接测试异常:', e);
        } finally {
            setApiButtonContent(this.testButton, API_CONFIG_ICONS.zap, '测试连接');
            this.testButton.disabled = false;
        }
    }

    setLoading(isLoading) {
        if (!this.saveButton) return;
        this.saveButton.disabled = isLoading;
        this.testButton.disabled = isLoading;
        setApiButtonContent(
            this.saveButton,
            isLoading ? API_CONFIG_ICONS.loader : API_CONFIG_ICONS.save,
            isLoading ? '保存中...' : '保存',
        );
    }

    /**
     * 刷新模型列表
     */
    async refreshModels() {
        const formData = this.getFormData();
        const refreshBtn = document.getElementById('refresh-models');
        const modelHelp = document.getElementById('model-help');
        const originalHelpText = modelHelp.textContent;

        try {
            // 验证必填字段
            if (this.usesEditableBaseUrl(formData.provider) && !formData.baseUrl) {
                this.showStatus('请先填写 Base URL', 'error');
                return;
            }
            const runtime = await this.configManager.load();
            const existingKey = (runtime?.apiKey || '').trim();
            const keyToUse = (typeof formData.apiKey === 'string') ? formData.apiKey.trim() : existingKey;
            if (!keyToUse && formData.provider !== 'vertexai') {
                this.showStatus('请先在 Key 管理中保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再刷新列表', 'error');
                    return;
                }
            }

            // 设置加载状态
            setApiButtonContent(refreshBtn, API_CONFIG_ICONS.loader, '获取中...');
            refreshBtn.disabled = true;
            modelHelp.textContent = '正在从服务器获取可用模型列表...';
            modelHelp.style.color = 'var(--app-accent-strong)';

            // 创建临时客户端
            const tempClient = new LLMClient({ ...formData, apiKey: formData.provider === 'vertexai' ? '' : keyToUse });

            // 获取模型列表
            logger.info(`正在获取 ${formData.provider} 的模型列表...`);
            const models = await tempClient.listModels();
            const needsGoogleImageModels = this.activeTab === 'image'
                && (formData.provider === 'makersuite' || formData.provider === 'vertexai');
            if (needsGoogleImageModels) {
                const googleImageModels = [
                    'imagen-4.0-generate-preview-06-06',
                    'imagen-4.0-fast-generate-preview-06-06',
                    'imagen-4.0-ultra-generate-preview-06-06',
                    'imagen-3.0-generate-002',
                    'imagen-3.0-generate-001',
                    'imagen-3.0-fast-generate-001',
                    'imagen-3.0-capability-001',
                    'imagegeneration@006',
                    'imagegeneration@005',
                    'imagegeneration@002',
                ];
                const merged = Array.from(new Set([...(models || []), ...googleImageModels]));
                models.length = 0;
                merged.forEach(model => models.push(model));
            }

            if (!models || models.length === 0) {
                throw new Error('未获取到模型列表');
            }

            this.renderModelOptions(models);
            try {
                window.dispatchEvent(new CustomEvent('config-models-refreshed', {
                    detail: {
                        tab: this.activeTab,
                        provider: formData.provider,
                        count: models.length,
                    },
                }));
            } catch {}

            // 成功提示
            this.showStatus(`成功获取 ${models.length} 个可用模型`, 'success');
            modelHelp.textContent = `已加载 ${models.length} 个模型（可输入或从列表选择）`;
            modelHelp.style.color = 'var(--app-accent-strong)';
            logger.info(`成功获取 ${models.length} 个模型:`, models);

            // 3秒后恢复原始提示
            setTimeout(() => {
                modelHelp.textContent = originalHelpText;
                modelHelp.style.color = 'var(--app-text-secondary)';
            }, 3000);

        } catch (e) {
            this.showStatus(`获取模型列表失败: ${e.message}`, 'error');
            logger.error('获取模型列表失败:', e);
            modelHelp.textContent = '获取失败，请检查配置后重试';
            modelHelp.style.color = 'var(--app-danger-text)';

            // 5秒后恢复原始提示
            setTimeout(() => {
                modelHelp.textContent = originalHelpText;
                modelHelp.style.color = 'var(--app-text-secondary)';
            }, 5000);
        } finally {
            setApiButtonContent(refreshBtn, API_CONFIG_ICONS.refresh, '刷新列表');
            refreshBtn.disabled = false;
        }
    }
}
