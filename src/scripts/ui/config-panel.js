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

        this.element.style.display = 'block';
        this.overlayElement.style.display = 'block';
    }

    /**
     * 隐藏配置面板
     */
    hide() {
        this.hideImageParamsPage();
        this.imageGenerationParamsPanel.hide();
        if (this.element) {
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
            if (tab === this.activeTab) {
                btn.style.background = '#e0f2fe';
                btn.style.borderColor = '#38bdf8';
                btn.style.color = '#0369a1';
            } else {
                btn.style.background = 'var(--app-surface-card)';
                btn.style.borderColor = 'var(--app-border-default)';
                btn.style.color = 'var(--app-text-primary)';
            }
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
        this.imageGenerationParamsPanel.hide();
        if (mainPage) mainPage.style.display = 'block';
        if (paramsPage) paramsPage.style.display = 'none';
    }

    /**
     * 创建 UI 元素
     */
    createUI() {
        // 创建遮罩层
        this.overlayElement = document.createElement('div');
        this.overlayElement.id = 'config-overlay';
        this.overlayElement.style.cssText = `
            display: none;
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0, 0, 0, 0.5);
            z-index: 23000;
        `;
        this.overlayElement.onclick = () => this.hide();

        // 创建配置面板
        this.element = document.createElement('div');
        this.element.id = 'config-panel';
        this.element.innerHTML = `
            <div class="config-modal" style="padding: 20px; background-color: rgb(255, 255, 255); color: var(--app-text-primary); opacity: 1; border: 1px solid var(--app-border-default); border-radius: 10px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                        width: 96vw; max-width: 760px; max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px); overflow-y: auto;">
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:6px;">
                    <h2 id="config-title" style="margin: 0; color: var(--app-text-primary);">聊天模型配置</h2>
                    <span style="color:var(--app-text-muted); font-size:12px;">(保存后立即生效)</span>
                </div>
                <div id="config-main-page" data-maid-guide-target="config-connection-fields">
                <div style="display:flex; gap:8px; margin: 8px 0 16px;">
                    <button type="button" class="config-tab is-active" data-tab="chat"
                            style="border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer;">
                        聊天模型
                    </button>
                    <button type="button" class="config-tab" data-tab="image"
                            style="border:1px solid var(--app-border-default); background:var(--app-surface-card); padding:6px 12px; border-radius:999px; font-size:12px; cursor:pointer;">
                        图片模型
                    </button>
                </div>
                <div id="image-params-entry" style="display:none; margin: -4px 0 16px;">
                    <button type="button" id="open-image-generation-params"
                            style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle); color:var(--app-text-primary); cursor:pointer; text-align:left;">
                        <span style="display:flex; flex-direction:column; gap:3px;">
                            <span style="font-weight:800;">图片生成参数</span>
                            <span style="font-size:12px; color:var(--app-text-muted);">质量、尺寸、输出格式等；所有生图入口共享</span>
                        </span>
                        <span style="color:var(--app-text-muted);">›</span>
                    </button>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span class="has-help" data-help="保存多份连线配置，随时切换">连线设置档</span>
                        <div style="display:flex; gap:6px;">
                            <button id="profile-new" title="新建设置档" style="font-size:12px; border:none; background:var(--app-surface-subtle); padding:4px 8px; border-radius:6px; cursor:pointer;">＋</button>
                            <button id="profile-rename" title="重命名" style="font-size:12px; border:none; background:var(--app-surface-subtle); padding:4px 8px; border-radius:6px; cursor:pointer;">✎</button>
                            <button id="profile-delete" title="删除" style="font-size:12px; border:none; background:#fee2e2; color:#b91c1c; padding:4px 8px; border-radius:6px; cursor:pointer;">🗑</button>
                        </div>
                    </label>
                    <select id="config-profile" data-maid-guide-target="config-profile-select" style="display:none;"></select>
                    <button type="button" id="config-profile-btn" class="world-app-select-btn" data-select-id="config-profile" data-maid-guide-target="config-profile-select" style="margin-top:2px;">
                        <span class="config-custom-select-label">请选择设置档</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: block; margin-bottom: 5px; font-weight: bold;">服务商</label>
                    <select id="config-provider" data-maid-guide-target="config-provider-select" style="display:none;">
                        <option value="openai">OpenAI</option>
                        <option value="makersuite">Google AI Studio (Makersuite)</option>
                        <option value="vertexai">Google Vertex AI</option>
                        <option value="deepseek">Deepseek</option>
                        <option value="openrouter">OpenRouter</option>
                        <option value="anthropic">Anthropic (Claude)</option>
                        <option value="custom">自定义 API</option>
                    </select>
                    <button type="button" id="config-provider-btn" class="world-app-select-btn" data-select-id="config-provider" data-maid-guide-target="config-provider-select" style="margin-top:2px;">
                        <span class="config-custom-select-label">请选择服务商</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>

                <div id="config-custom-fields" data-maid-guide-target="config-custom-fields">
                <div id="config-baseurl-section" style="margin-bottom: 15px;">
                    <label class="has-help" data-help="内建服务商自动使用默认地址；仅自定义 API 需填写" style="display: block; margin-bottom: 5px; font-weight: bold;">API Base URL</label>
                    <input type="text" id="config-baseurl" data-maid-guide-target="config-base-url-input" placeholder="https://api.openai.com/v1"
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                </div>

                <div style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span>API Key</span>
                        <div style="display:flex; gap:6px; align-items:center;">
                            <button id="toggle-apikey" style="font-size:12px; border:none; background:var(--app-surface-subtle); padding:4px 8px; border-radius:6px; cursor:pointer;">显示</button>
                            <button id="manage-keys" title="管理已保存的 Key" style="font-size:12px; border:none; background:var(--app-surface-subtle); padding:4px 8px; border-radius:6px; cursor:pointer;">🔑</button>
                        </div>
                    </label>
                    <input type="password" id="config-apikey" data-maid-guide-target="config-api-key-input" placeholder="sk-..."
                           style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                    <small id="apikey-help" style="color: var(--app-text-secondary);">保存后 Key 以遮罩显示（不可复制）；用 🔑 管理多个 Key</small>
                </div>
                </div>

                <div id="vertexai-fields" style="display: none;">
                    <div style="margin-bottom: 15px;">
                        <label class="has-help" data-help="Vertex AI 区域" style="display: block; margin-bottom: 5px; font-weight: bold;">Region</label>
                        <select id="config-region" style="display:none;">
                            <option value="us-central1">us-central1</option>
                            <option value="us-east1">us-east1</option>
                            <option value="us-west1">us-west1</option>
                            <option value="europe-west1">europe-west1</option>
                            <option value="asia-southeast1">asia-southeast1</option>
                        </select>
                        <button type="button" id="config-region-btn" class="world-app-select-btn" data-select-id="config-region" style="margin-top:2px;">
                            <span class="config-custom-select-label">请选择 Region</span>
                            <span class="world-app-select-btn-chevron">▾</span>
                        </button>
                    </div>

                    <div style="margin-bottom: 15px;">
                        <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                            <span class="has-help" data-help="粘贴 Service Account JSON，Project ID 会自动识别；留空则用 API Key">Service Account JSON</span>
                            <button id="toggle-sa" style="font-size:12px; border:none; background:var(--app-surface-subtle); padding:4px 8px; border-radius:6px; cursor:pointer;">显示</button>
                        </label>
                        <textarea id="config-serviceaccount" data-maid-guide-target="config-service-account-input" placeholder='{"type": "service_account", "project_id": "your-project", ...}'
                                  style="width: 100%; padding: 10px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 12px; box-sizing: border-box; font-family: monospace; min-height: 100px; resize: vertical;"></textarea>
                    </div>
                </div>

                <div id="config-model-section" data-maid-guide-target="config-model-section" style="margin-bottom: 15px;">
                    <label style="display: flex; align-items:center; justify-content:space-between; margin-bottom: 5px; font-weight: bold;">
                        <span>模型</span>
                        <button id="refresh-models" data-maid-guide-target="config-refresh-models" style="font-size:12px; border:none; background:#e3f2fd; color:#1976d2; padding:4px 8px; border-radius:6px; cursor:pointer;">
                            ⟳ 刷新列表
                        </button>
                    </label>
                    <div id="config-model-picker" data-maid-guide-target="config-model-picker" style="position: relative; display: flex; flex-direction: column; gap: 8px;">
                        <input type="text" id="config-model" data-maid-guide-target="config-model-select" list="model-list" placeholder="gpt-3.5-turbo"
                               style="width: 100%; padding: 10px 12px; border-radius: 5px; border: 1px solid var(--app-border-default); font-size: 14px; box-sizing: border-box;">
                        <datalist id="model-list"></datalist>
                        <div id="model-options"
                             style="display:none; max-height: 180px; overflow-y: auto; padding:8px; border:1px solid var(--app-border-default); border-radius:6px; background:var(--app-surface-subtle); gap:6px; flex-wrap: wrap;">
                        </div>
                    </div>
                    <small id="model-help" style="color: var(--app-text-secondary);">要使用的模型 ID（可输入或从列表选择）</small>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
                        <input type="checkbox" id="config-stream" style="width: 18px; height: 18px;">
                        <span class="has-help" data-help="实时显示 AI 的回复过程" data-help-mode="press" style="font-weight: bold;">启用流式响应</span>
                    </label>
                </div>

                <div id="config-prompt-post-processing-section" style="margin-bottom: 18px;">
                    <label class="has-help" data-help="仅聊天请求生效；越靠后兼容性越强，但对原始提示词改动越大。" style="display:block; margin-bottom:5px; font-weight:bold;">提示词后处理</label>
                    <select id="config-prompt-post-processing" style="display:none;">
                        <option value="none">不处理（默认）</option>
                        <option value="merge">合并连续同角色</option>
                        <option value="semi">半严格（强制角色交替）</option>
                        <option value="strict">严格（强制 user 最先、角色交替）</option>
                        <option value="single">单一用户消息</option>
                    </select>
                    <button type="button" id="config-prompt-post-processing-btn" class="world-app-select-btn" data-select-id="config-prompt-post-processing" style="margin-top:2px;">
                        <span class="config-custom-select-label">不处理（默认）</span>
                        <span class="world-app-select-btn-chevron">▾</span>
                    </button>
                </div>

                <div id="config-generation-param-filter-section" style="margin-bottom: 18px;">
                    <button type="button" id="open-generation-param-filter"
                            style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; padding:12px 14px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle); color:var(--app-text-primary); cursor:pointer; text-align:left;">
                        <span style="display:flex; flex-direction:column; gap:3px; min-width:0;">
                            <span style="font-weight:800;">请求参数过滤</span>
                            <span id="generation-param-filter-summary" style="font-size:12px; color:var(--app-text-muted); overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">未排除生成参数</span>
                        </span>
                        <span style="color:var(--app-text-muted); flex:none;">›</span>
                    </button>
                </div>

                <div style="margin-bottom: 20px;">
                    <label style="display:flex; align-items:center; justify-content:space-between; gap:10px; font-weight:bold; margin-bottom:6px;">
                        <span class="has-help" data-help="请求超过此时长将中止（10–9000 秒）">请求超时（秒）</span>
                        <input id="config-timeout" type="number" min="10" max="9000" step="5" value="60" inputmode="numeric"
                               style="width: 120px; padding: 8px 10px; border-radius: 8px; border: 1px solid var(--app-border-default); font-size: 14px; text-align:right;">
                    </label>
                </div>

                <div style="margin-bottom: 18px; border:1px solid var(--app-border-default); border-radius: 12px; background:var(--app-surface-subtle);">
                    <button type="button" id="config-transport-toggle"
                            style="width:100%; display:flex; align-items:center; justify-content:space-between; gap:12px; border:none; background:transparent; padding:12px 14px; cursor:pointer; text-align:left;">
                        <div style="display:flex; flex-direction:column; gap:2px;">
                            <span style="font-weight:800; color:var(--app-text-primary);">高级连线与反代</span>
                            <span id="config-transport-summary" style="font-size:12px; color:var(--app-text-muted);">默认直连，只有需要代理出口时再展开</span>
                        </div>
                        <span id="config-transport-chevron" style="color:var(--app-text-muted); font-size:12px;">▾</span>
                    </button>
                    <div id="config-transport-content" style="display:none; padding:0 14px 14px;">
                        <div style="margin-bottom: 14px;">
                            <label class="has-help" data-help="一般保持直连，需要走代理出口时再改。" style="display:block; margin-bottom:5px; font-weight:bold;">连线模式</label>
                            <select id="config-transport-mode" style="display:none;">
                                <option value="direct">直连</option>
                                <option value="reverse_proxy">反代出口</option>
                            </select>
                            <button type="button" id="config-transport-mode-btn" class="world-app-select-btn" data-select-id="config-transport-mode" style="margin-top:2px;">
                                <span class="config-custom-select-label">直连</span>
                                <span class="world-app-select-btn-chevron">▾</span>
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
                                    <button id="toggle-proxy-token" type="button" style="font-size:12px; border:none; background:var(--app-surface-hover); padding:4px 8px; border-radius:6px; cursor:pointer;">显示</button>
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

                <div id="config-status" style="margin-bottom: 15px; padding: 10px; border-radius: 5px; display: none;"></div>
                <!-- 主要操作按钮 -->
                <div style="display: flex; gap: 8px; justify-content: flex-end;">
                    <button id="config-test" style="padding: 10px 16px; border-radius: 8px; border: 1px solid var(--app-border-default);
                                                     background: var(--app-surface-card); cursor: pointer; font-size: 14px; color: var(--app-text-secondary); min-width: 90px;">
                        测试连接
                    </button>
                    <button id="config-cancel" style="padding: 10px 16px; border-radius: 8px; border: 1px solid var(--app-border-default);
                                                       background: var(--app-surface-subtle); cursor: pointer; font-size: 14px; color: var(--app-text-secondary); min-width: 70px;">
                        取消
                    </button>
                    <button id="config-save" data-maid-guide-target="config-save-btn" style="padding: 10px 16px; border-radius: 8px; border: none;
                                                     background: #019aff; color: var(--app-text-inverse); cursor: pointer; font-size: 14px; font-weight: 600; min-width: 70px;">
                        保存
                    </button>
                </div>
                </div>
                <div id="config-image-params-page" style="display:none;"></div>
            </div>
        `;
        this.element.style.cssText = `
            display: none;
            position: fixed;
            top: calc(env(safe-area-inset-top, 0px) + 10px);
            left: 50%;
            transform: translateX(-50%);
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
        this.element.querySelector('#config-model')?.addEventListener('input', () => this.emitDraftChange());
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
                    <span class="world-app-select-item-check">${selected ? '✓' : ''}</span>
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
        const content = panel.querySelector('#config-transport-content');
        const chevron = panel.querySelector('#config-transport-chevron');
        if (content) content.style.display = this.transportExpanded ? 'block' : 'none';
        if (chevron) chevron.textContent = this.transportExpanded ? '▴' : '▾';
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
            btn.textContent = '隐藏';
        } else {
            input.type = 'password';
            btn.textContent = '显示';
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
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            z-index: 24050;
            background: rgba(0,0,0,.42);
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 16px;
            box-sizing: border-box;
        `;
        overlay.innerHTML = `
            <div role="dialog" aria-modal="true" aria-label="请求参数过滤" style="
                width: min(560px, 100%);
                max-height: min(720px, calc(100vh - 32px));
                overflow: auto;
                background: var(--app-surface-card);
                color: var(--app-text-primary);
                border: 1px solid var(--app-border-default);
                border-radius: 12px;
                box-shadow: 0 18px 48px rgba(15, 23, 42, .28);
                padding: 18px;
                box-sizing: border-box;
            ">
                <div style="display:flex; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:14px;">
                    <div>
                        <div style="font-size:18px; font-weight:800;">请求参数过滤</div>
                        <div style="font-size:12px; color:var(--app-text-muted); margin-top:4px;">保存后仅作用于当前连线设置档</div>
                    </div>
                    <button type="button" data-param-filter-action="cancel" aria-label="关闭" style="border:none; background:var(--app-surface-subtle); color:var(--app-text-secondary); width:32px; height:32px; border-radius:8px; cursor:pointer; font-size:18px; line-height:1;">×</button>
                </div>
                <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin:0 0 8px;">
                    <div style="font-weight:800; font-size:13px;">常用参数</div>
                    <div data-role="count" style="font-size:12px; color:var(--app-text-muted);"></div>
                </div>
                <div data-role="common" style="display:flex; flex-wrap:wrap; gap:8px; margin-bottom:16px;"></div>
                <div style="display:flex; gap:8px; margin-bottom:10px;">
                    <input data-role="custom-input" type="text" placeholder="输入参数名，例如 response_format"
                           style="flex:1; min-width:0; padding:10px 12px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); color:var(--app-text-primary); font-size:14px;">
                    <button type="button" data-param-filter-action="add" style="padding:0 14px; border:none; border-radius:8px; background:#019aff; color:var(--app-text-inverse); font-weight:700; cursor:pointer;">加入</button>
                </div>
                <div data-role="input-error" style="min-height:18px; font-size:12px; color:#b91c1c; margin-bottom:8px;"></div>
                <div style="font-weight:800; font-size:13px; margin-bottom:8px;">已排除</div>
                <div data-role="selected" style="display:flex; flex-wrap:wrap; gap:8px; min-height:42px; padding:10px; border:1px solid var(--app-border-default); border-radius:10px; background:var(--app-surface-subtle);"></div>
                <div style="display:flex; justify-content:flex-end; gap:8px; margin-top:18px;">
                    <button type="button" data-param-filter-action="clear" style="padding:9px 12px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-card); color:var(--app-text-secondary); cursor:pointer;">清空</button>
                    <button type="button" data-param-filter-action="cancel" style="padding:9px 12px; border:1px solid var(--app-border-default); border-radius:8px; background:var(--app-surface-subtle); color:var(--app-text-secondary); cursor:pointer;">取消</button>
                    <button type="button" data-param-filter-action="apply" style="padding:9px 14px; border:none; border-radius:8px; background:#019aff; color:var(--app-text-inverse); font-weight:700; cursor:pointer;">完成</button>
                </div>
            </div>
        `;
        const commonEl = overlay.querySelector('[data-role="common"]');
        const selectedEl = overlay.querySelector('[data-role="selected"]');
        const inputEl = overlay.querySelector('[data-role="custom-input"]');
        const errorEl = overlay.querySelector('[data-role="input-error"]');
        const countEl = overlay.querySelector('[data-role="count"]');
        const hasParam = name => draft.includes(name);
        const addParams = (items = []) => {
            draft = normalizeGenerationParamFilterList([...draft, ...items]);
        };
        const removeParam = (name = '') => {
            draft = draft.filter(item => item !== name);
        };
        const render = () => {
            if (countEl) countEl.textContent = draft.length ? `${draft.length} 项` : '未启用';
            if (commonEl) {
                commonEl.innerHTML = COMMON_GENERATION_PARAM_FILTERS.map((name) => {
                    const active = hasParam(name);
                    return `
                        <button type="button" data-param-filter-action="toggle" data-param="${escapeHtml(name)}"
                                style="padding:7px 10px; border-radius:999px; border:1px solid ${active ? '#0284c7' : 'var(--app-border-default)'}; background:${active ? '#e0f2fe' : 'var(--app-surface-card)'}; color:${active ? '#0369a1' : 'var(--app-text-primary)'}; cursor:pointer; font-size:12px; font-weight:${active ? '800' : '600'};">
                            ${escapeHtml(name)}
                        </button>
                    `;
                }).join('');
            }
            if (selectedEl) {
                selectedEl.innerHTML = draft.length
                    ? draft.map(name => `
                        <button type="button" data-param-filter-action="remove" data-param="${escapeHtml(name)}"
                                title="移除 ${escapeHtml(name)}"
                                style="display:inline-flex; align-items:center; gap:6px; padding:7px 10px; border-radius:999px; border:1px solid var(--app-border-default); background:var(--app-surface-card); color:var(--app-text-primary); cursor:pointer; font-size:12px;">
                            <span>${escapeHtml(name)}</span><span style="color:var(--app-text-muted);">×</span>
                        </button>
                    `).join('')
                    : '<span style="font-size:12px; color:var(--app-text-muted); align-self:center;">未排除任何生成参数</span>';
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
                return;
            }
            if (errorEl) errorEl.textContent = '';
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
                render();
            } else if (action === 'remove') {
                removeParam(param);
                render();
            } else if (action === 'add') {
                addFromInput();
            } else if (action === 'clear') {
                draft = [];
                if (errorEl) errorEl.textContent = '';
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
        const datalist = panel.querySelector('#model-list');

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
        if (datalist) {
            datalist.innerHTML = '';
        }
        this.clearModelOptions();
        this.refreshAllCustomSelects();
    }

    clearModelOptions() {
        const container = (this.element || document).querySelector('#model-options');
        if (container) {
            container.innerHTML = '';
            container.style.display = 'none';
        }
        this.modelOptions = [];
    }

    renderModelOptions(models = []) {
        const container = (this.element || document).querySelector('#model-options');
        if (!container) return;

        if (!models.length) {
            this.clearModelOptions();
            return;
        }

        this.modelOptions = models;
        container.innerHTML = '';
        container.style.display = 'flex';

        models.forEach(modelId => {
            const chip = document.createElement('button');
            chip.textContent = modelId;
            chip.type = 'button';
            chip.style.cssText = `
                border: 1px solid var(--app-border-strong);
                background: var(--app-surface-card);
                border-radius: 6px;
                padding: 6px 10px;
                font-size: 12px;
                cursor: pointer;
                white-space: nowrap;
            `;
            chip.onclick = () => {
                const modelInput = (this.element || document).querySelector('#config-model');
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
        if (proxyToggleBtn) proxyToggleBtn.textContent = '显示';
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
                apiKeyHelp.textContent = '保存后 Key 以遮罩显示（不可复制）；用 🔑 管理多个 Key';
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
        return this.element?.style?.display === 'block';
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
            btn.textContent = '隱藏';
        } else {
            input.type = 'password';
            btn.textContent = '显示';
        }
    }

    toggleServiceAccount() {
        const panel = this.element || document;
        const input = panel.querySelector('#config-serviceaccount');
        const btn = panel.querySelector('#toggle-sa');
        if (!input || !btn) return;

        if (input.style.webkitTextSecurity === 'disc' || input.style.webkitTextSecurity === '') {
            input.style.webkitTextSecurity = 'none';
            btn.textContent = '隱藏';
        } else {
            input.style.webkitTextSecurity = 'disc';
            btn.textContent = '显示';
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
                    <div style="font-weight:800; color:var(--app-text-primary);">🔑 Key 管理</div>
                    <div style="color:var(--app-text-muted); font-size:12px;">Key 以遮罩显示，不可复制；可保存多个并切换当前使用</div>
                </div>
                <button id="keymgr-close" style="font-size:18px; border:none; background:transparent; cursor:pointer;">×</button>
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
        const colors = {
            success: '#d4edda',
            error: '#f8d7da',
            info: '#d1ecf1'
        };
        const textColors = {
            success: '#155724',
            error: '#721c24',
            info: '#0c5460'
        };

        statusEl.style.display = 'block';
        statusEl.style.background = colors[type];
        statusEl.style.color = textColors[type];
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

            // Key：允許「已保存 Key（🔑）」但输入框仍显示遮罩（formData.apiKey 会是 null）
            const active = this.configManager.getActiveProfile?.();
            const keys = this.configManager.listKeys?.(active?.id) || [];
            const hasTypedKey = typeof formData.apiKey === 'string' && formData.apiKey.trim().length > 0;
            const hasSavedKey = keys.length > 0;
            if (!hasTypedKey && !hasSavedKey && this.providerRequiresApiKey(formData.provider)) {
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key 后保存', 'error');
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
                    this.showStatus('已保存，但当前 Key 不可用（请用 🔑 重新保存 Key）', 'error');
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
        const originalText = this.testButton.textContent;

        try {
            this.testButton.textContent = '测试中...';
            this.testButton.disabled = true;

            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再测试连接', 'error');
                    return;
                }
                const tempClient = new LLMClient({ ...formData, apiKey: '' });
                const result = await tempClient.healthCheck();
                if (result.ok) {
                    this.showStatus('✓ 连接成功！', 'success');
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
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            const tempClient = new LLMClient({ ...formData, apiKey: keyToUse });
            const result = await tempClient.healthCheck();

            if (result.ok) {
                this.showStatus('✓ 连接成功！', 'success');
                logger.info('API 连接测试成功');
            } else {
                this.showStatus(`连接失败: ${result.error}`, 'error');
                logger.warn('API 连接测试失败:', result.error);
            }
        } catch (e) {
            this.showStatus(`测试失败: ${e.message}`, 'error');
            logger.error('API 连接测试异常:', e);
        } finally {
            this.testButton.textContent = originalText;
            this.testButton.disabled = false;
        }
    }

    setLoading(isLoading) {
        if (!this.saveButton) return;
        this.saveButton.disabled = isLoading;
        this.testButton.disabled = isLoading;
        this.saveButton.textContent = isLoading ? '保存中...' : '保存';
    }

    /**
     * 刷新模型列表
     */
    async refreshModels() {
        const formData = this.getFormData();
        const refreshBtn = document.getElementById('refresh-models');
        const modelHelp = document.getElementById('model-help');
        const originalText = refreshBtn.textContent;
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
                this.showStatus('请先用 🔑 保存至少一个 API Key，或在此栏贴上 Key', 'error');
                return;
            }
            if (formData.provider === 'vertexai') {
                if (!formData.vertexaiServiceAccount || !String(formData.vertexaiServiceAccount).trim()) {
                    this.showStatus('请填写 Vertex AI Service Account（JSON）后再刷新列表', 'error');
                    return;
                }
            }

            // 设置加载状态
            refreshBtn.textContent = '⟳ 获取中...';
            refreshBtn.disabled = true;
            modelHelp.textContent = '正在从服务器获取可用模型列表...';
            modelHelp.style.color = '#1976d2';

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

            // 填充到 datalist
            const datalist = document.getElementById('model-list');
            datalist.innerHTML = '';

            models.forEach(modelId => {
                const option = document.createElement('option');
                option.value = modelId;
                datalist.appendChild(option);
            });
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
            this.showStatus(`✓ 成功获取 ${models.length} 个可用模型`, 'success');
            modelHelp.textContent = `已加载 ${models.length} 个模型（可输入或从列表选择）`;
            modelHelp.style.color = '#155724';
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
            modelHelp.style.color = '#721c24';

            // 5秒后恢复原始提示
            setTimeout(() => {
                modelHelp.textContent = originalHelpText;
                modelHelp.style.color = 'var(--app-text-secondary)';
            }, 5000);
        } finally {
            refreshBtn.textContent = originalText;
            refreshBtn.disabled = false;
        }
    }
}
