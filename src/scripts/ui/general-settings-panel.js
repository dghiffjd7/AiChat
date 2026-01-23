import { appSettings } from '../storage/app-settings.js';
import { ConfigManager } from '../storage/config.js';
import { safeInvoke } from '../utils/tauri.js';
import { appConfirm } from './app-confirm.js';

export class GeneralSettingsPanel {
  constructor() {
    this.element = null;
    this.overlayElement = null;
    this.debugToggle = null;
    this.typingDotsToggle = null;
    this.richIframeScriptsToggle = null;
    this.creativeHistoryInput = null;
    this.creativeWideToggle = null;
    this.personaBindToggle = null;
    this.promptTimeToggle = null;
    this.memoryModeSummary = null;
    this.memoryModeTable = null;
    this.memoryAutoToggle = null;
    this.memoryAutoModeInline = null;
    this.memoryAutoModeSeparate = null;
    this.memoryAutoOptions = null;
    this.memoryUpdateApiChat = null;
    this.memoryUpdateApiProfile = null;
    this.memoryUpdateProfileSelect = null;
    this.memoryUpdateApiBlock = null;
    this.memoryUpdateContextInput = null;
    this.memoryBudgetBlock = null;
    this.memoryInjectPositionSelect = null;
    this.memoryInjectDepthWrap = null;
    this.memoryInjectDepthInput = null;
    this.memoryAutoConfirmToggle = null;
    this.memoryAutoStepToggle = null;
    this.cleanWallpapersBtn = null;
    this.cleanWallpapersStatus = null;
    this.bundleExportBtn = null;
    this.bundleImportBtn = null;
    this.bundleStatus = null;
    this.bundleImportInput = null;
    this.configManager = new ConfigManager();
  }

  show() {
    if (!this.element) {
      this.createUI();
    }
    const settings = appSettings.get();
    if (this.debugToggle) {
      this.debugToggle.checked = Boolean(settings.showDebugToggle);
    }
    if (this.typingDotsToggle) {
      this.typingDotsToggle.checked = settings.typingDotsEnabled !== false;
    }
    if (this.richIframeScriptsToggle) {
      this.richIframeScriptsToggle.checked = Boolean(settings.allowRichIframeScripts);
    }
    if (this.creativeHistoryInput) {
      const n = Number(settings.creativeHistoryMax);
      this.creativeHistoryInput.value = String(Number.isFinite(n) ? Math.max(0, Math.trunc(n)) : 3);
    }
    if (this.creativeWideToggle) {
      this.creativeWideToggle.checked = Boolean(settings.creativeWideBubble);
    }
    if (this.personaBindToggle) {
      this.personaBindToggle.checked = settings.personaBindContacts !== false;
    }
    if (this.promptTimeToggle) {
      this.promptTimeToggle.checked = settings.promptCurrentTimeEnabled === true;
    }
    const memoryMode = String(settings.memoryStorageMode || 'table').toLowerCase();
    if (this.memoryModeSummary) {
      this.memoryModeSummary.checked = memoryMode !== 'table';
    }
    if (this.memoryModeTable) {
      this.memoryModeTable.checked = memoryMode === 'table';
    }
    if (this.memoryAutoToggle) {
      this.memoryAutoToggle.checked = Boolean(settings.memoryAutoExtract);
    }
    const memoryAutoMode = String(settings.memoryAutoExtractMode || 'inline').toLowerCase();
    if (this.memoryAutoModeInline) {
      this.memoryAutoModeInline.checked = memoryAutoMode !== 'separate';
    }
    if (this.memoryAutoModeSeparate) {
      this.memoryAutoModeSeparate.checked = memoryAutoMode === 'separate';
    }
    const memoryApiMode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
    if (this.memoryUpdateApiChat) {
      this.memoryUpdateApiChat.checked = memoryApiMode !== 'profile';
    }
    if (this.memoryUpdateApiProfile) {
      this.memoryUpdateApiProfile.checked = memoryApiMode === 'profile';
    }
    if (this.memoryUpdateProfileSelect) {
      this.memoryUpdateProfileSelect.value = String(settings.memoryUpdateProfileId || '');
    }
    if (this.memoryUpdateContextInput) {
      const raw = Math.trunc(Number(settings.memoryUpdateContextRounds ?? settings.memoryUpdateContextCount));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 6;
      this.memoryUpdateContextInput.value = String(safe);
    }
    if (this.memoryAutoConfirmToggle) {
      this.memoryAutoConfirmToggle.checked = settings.memoryAutoConfirm === true;
    }
    if (this.memoryAutoStepToggle) {
      this.memoryAutoStepToggle.checked = settings.memoryAutoStepByStep === true;
    }
    if (this.memoryInjectPositionSelect) {
      const raw = String(settings.memoryInjectPosition || 'template').toLowerCase();
      const allowed = new Set(['template', 'after_persona', 'system_end', 'before_chat', 'history_depth', 'system_end+before_chat']);
      this.memoryInjectPositionSelect.value = allowed.has(raw) ? raw : 'template';
    }
    if (this.memoryInjectDepthInput) {
      const raw = Math.trunc(Number(settings.memoryInjectDepth));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 4;
      this.memoryInjectDepthInput.value = String(safe);
    }
    this.refreshMemoryUpdateProfiles().catch(() => {});
    this.updateMemoryAutoVisibility();
    this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    this.element.style.display = 'block';
    this.overlayElement.style.display = 'block';
  }

  hide() {
    if (this.element) this.element.style.display = 'none';
    if (this.overlayElement) this.overlayElement.style.display = 'none';
  }

  applyTypingDotsSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      delete document.body.dataset.typingDots;
    } else {
      document.body.dataset.typingDots = 'off';
    }
  }

  applyCreativeWideSetting(enabled) {
    if (!document?.body) return;
    if (enabled) {
      document.body.dataset.creativeWide = 'on';
    } else {
      delete document.body.dataset.creativeWide;
    }
  }

  updateMemoryAutoVisibility() {
    const settings = appSettings.get();
    const memoryMode = String(settings.memoryStorageMode || 'table').toLowerCase();
    const showMemoryTable = memoryMode === 'table';
    const enabled = settings.memoryAutoExtract === true;
    const mode = String(settings.memoryAutoExtractMode || 'inline').toLowerCase();
    const showAuto = showMemoryTable && Boolean(enabled);
    if (this.memoryAutoOptions) {
      this.memoryAutoOptions.style.display = showAuto ? 'block' : 'none';
    }
    const showApi = showAuto && mode === 'separate';
    if (this.memoryUpdateApiBlock) {
      this.memoryUpdateApiBlock.style.display = showApi ? 'block' : 'none';
    }
    if (this.memoryUpdateContextInput) {
      this.memoryUpdateContextInput.disabled = !showApi;
    }
    const apiMode = String(settings.memoryUpdateApiMode || 'chat').toLowerCase();
    if (this.memoryUpdateProfileSelect) {
      this.memoryUpdateProfileSelect.disabled = !showApi || apiMode !== 'profile';
    }
    if (this.memoryBudgetBlock) {
      this.memoryBudgetBlock.style.display = showMemoryTable ? 'block' : 'none';
    }
    if (this.memoryInjectPositionSelect) {
      this.memoryInjectPositionSelect.disabled = !showMemoryTable;
    }
    const position = String(settings.memoryInjectPosition || 'template').toLowerCase();
    const showDepth = showMemoryTable && position === 'history_depth';
    if (this.memoryInjectDepthWrap) {
      this.memoryInjectDepthWrap.style.display = showDepth ? 'block' : 'none';
    }
    if (this.memoryInjectDepthInput) {
      this.memoryInjectDepthInput.disabled = !showDepth;
    }
  }

  async refreshMemoryUpdateProfiles() {
    if (!this.memoryUpdateProfileSelect) return;
    try {
      await this.configManager.load();
      const profiles = this.configManager.getProfiles();
      const activeId = this.configManager.getActiveProfileId();
      const current = appSettings.get().memoryUpdateProfileId || activeId || '';
      this.memoryUpdateProfileSelect.innerHTML = '';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = profiles.length ? '选择 API 配置…' : '暂无配置';
      this.memoryUpdateProfileSelect.appendChild(placeholder);
      profiles.forEach((profile) => {
        const option = document.createElement('option');
        option.value = profile.id;
        option.textContent = profile.name || profile.id;
        if (profile.id === current) option.selected = true;
        this.memoryUpdateProfileSelect.appendChild(option);
      });
    } catch {}
  }

  createUI() {
    this.overlayElement = document.createElement('div');
    this.overlayElement.id = 'general-settings-overlay';
    this.overlayElement.style.cssText = `
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.5);
      z-index: 20000;
    `;
    this.overlayElement.onclick = () => this.hide();

    this.element = document.createElement('div');
    this.element.id = 'general-settings-panel';
    this.element.innerHTML = `
      <div style="padding: 18px 20px; background: white; border-radius: 12px; box-shadow: 0 4px 20px rgba(0,0,0,0.3);
                  width: 92vw; max-width: 420px; max-height: calc(100vh - env(safe-area-inset-top, 0px) - env(safe-area-inset-bottom, 0px) - 20px); overflow-y: auto;">
        <div style="display:flex; align-items:center; justify-content:space-between; gap:8px; margin-bottom:8px;">
          <h2 style="margin: 0; color: #0f172a; font-size: 18px;">通用设定</h2>
          <button id="general-settings-close" style="border:none; background:transparent; font-size:22px; cursor:pointer; color:#0f172a;">×</button>
        </div>
        <div style="color:#64748b; font-size:12px; margin-bottom:16px;">界面与调试相关</div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-debug-toggle" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">显示 Debug 按钮</span>
          </label>
          <small style="color: #666; margin-left: 26px;">右下角调试按钮，默认隐藏</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-typing-dots" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">流式小点动画</span>
          </label>
          <small style="color: #666; margin-left: 26px;">关闭后保留静态小点</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-rich-iframe-scripts" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">富文本 iframe 执行脚本</span>
          </label>
          <small style="color: #666; margin-left: 26px;">高风险：脚本可访问同源数据并加载外部资源，仅信任来源启用</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
            <input type="checkbox" id="general-creative-wide" style="width: 18px; height: 18px;">
            <span style="font-weight: 700;">创意写作气泡加宽</span>
          </label>
          <small style="color: #666; margin-left: 26px;">仅影响创意写作的回复气泡</small>
        </div>

        <div style="margin-bottom: 16px;">
          <label style="display: flex; align-items: center; gap: 8px;">
            <span style="font-weight: 700;">创意写作注入条数</span>
          </label>
          <div style="margin-top: 6px; display:flex; align-items:center; gap:8px;">
            <input type="number" id="general-creative-history" min="0" step="1"
                   style="width: 120px; padding: 6px 8px; border: 1px solid #e2e8f0; border-radius: 8px; font-size: 14px;">
            <span style="color:#64748b; font-size:12px;">chat_history 中保留的创意写作回复数量</span>
          </div>
        </div>

        <div style="margin: 8px 0 12px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
          <div style="font-size: 12px; color:#64748b; margin-bottom: 10px;">记忆与角色</div>

          <div style="margin-bottom: 14px;">
            <label style="display: flex; align-items: center; gap: 8px; cursor: pointer;">
              <input type="checkbox" id="general-persona-bind" style="width: 18px; height: 18px;">
              <span style="font-weight: 700;">用户角色绑定联系人/聊天记录</span>
            </label>
            <small style="color: #666; margin-left: 26px;">开启后每个 Persona 独立联系人、聊天记录、摘要与动态（互不影响）</small>
          </div>

          <div style="margin-bottom: 14px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="general-prompt-time" style="width: 18px; height: 18px;">
              <span style="font-weight: 700;">发送当前时间给 AI</span>
            </label>
            <small style="color:#666; margin-left: 26px;">开启后每次请求都会附带当前时间（本地时区）</small>
          </div>

          <div style="margin-bottom: 10px;">
            <div style="font-weight: 700; margin-bottom: 8px;">记忆存储方式</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:8px;">
              <input type="radio" name="general-memory-mode" id="general-memory-mode-summary" value="summary">
              <span>摘要模式</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="general-memory-mode" id="general-memory-mode-table" value="table">
              <span>记忆表格模式</span>
            </label>
            <small style="color:#666; margin-left: 26px;">两种方式互斥，切换后立即生效</small>
          </div>

          <div style="margin-bottom: 10px;">
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="checkbox" id="general-memory-auto" style="width: 18px; height: 18px;">
              <span style="font-weight: 700;">AI 自动写入记忆表格</span>
            </label>
            <small style="color:#666; margin-left: 26px;">仅在记忆表格模式生效，AI 会在回复末尾输出 &lt;tableEdit&gt; 指令写入表格</small>
          </div>

          <div id="general-memory-auto-options" style="margin-left: 26px; margin-top: 6px; display: none;">
            <div style="font-size:12px; color:#64748b; margin-bottom:8px;">写表方式</div>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
              <input type="radio" name="general-memory-auto-mode" id="general-memory-auto-inline" value="inline">
              <span>随聊天回复一起（同一请求）</span>
            </label>
            <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
              <input type="radio" name="general-memory-auto-mode" id="general-memory-auto-separate" value="separate">
              <span>聊天后独立请求</span>
            </label>
            <div style="margin-top: 8px; display:flex; flex-direction: column; gap: 6px;">
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-memory-auto-confirm" style="width: 16px; height: 16px;">
                <span>写表前确认</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer;">
                <input type="checkbox" id="general-memory-auto-step" style="width: 16px; height: 16px;">
                <span>逐条执行（每条指令确认）</span>
              </label>
              <small style="color:#94a3b8;">逐条执行会依次弹窗确认每条指令</small>
            </div>

            <div id="general-memory-update-api" style="margin-top: 10px; padding: 8px; border: 1px dashed #e2e8f0; border-radius: 10px; display: none;">
              <div style="font-size:12px; color:#64748b; margin-bottom:8px;">记忆更新 API</div>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
                <input type="radio" name="general-memory-update-api" id="general-memory-update-chat" value="chat">
                <span>使用聊天配置</span>
              </label>
              <label style="display:flex; align-items:center; gap:8px; cursor:pointer; margin-bottom:6px;">
                <input type="radio" name="general-memory-update-api" id="general-memory-update-profile" value="profile">
                <span>选择 API 配置</span>
              </label>
              <select id="general-memory-update-profile-select" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; margin-top:4px;"></select>
              <small style="color:#94a3b8; display:block; margin-top:6px;">可在 API 配置中新增多个配置</small>
              <div id="general-memory-update-context" style="margin-top: 10px;">
                <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#0f172a;">
                  <span>记忆更新上下文轮数</span>
                  <input type="number" id="general-memory-update-context-rounds" min="0" step="1"
                         style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
                </label>
                <small style="color:#94a3b8; display:block; margin-top:4px;">默认 6 轮（用户+助手），0 表示不发送历史</small>
              </div>
            </div>
          </div>

          <div id="general-memory-budget-block" style="margin-left: 26px; margin-top: 10px; padding: 8px; border: 1px dashed #e2e8f0; border-radius: 10px; display: none;">
            <div style="font-size:12px; color:#64748b; margin-bottom:8px;">记忆注入设置</div>

            <div style="margin-top: 10px;">
              <div style="font-size:12px; color:#64748b; margin-bottom:6px;">记忆注入位置</div>
              <select id="general-memory-inject-position" style="width:100%; padding:6px 8px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px;">
                <option value="template">跟随模板</option>
                <option value="after_persona">角色设定后</option>
                <option value="system_end">系统提示末尾</option>
                <option value="before_chat">对话前</option>
                <option value="history_depth">深度注入（插入到聊天记录）</option>
                <option value="system_end+before_chat">双重注入（系统末尾 + 对话前）</option>
              </select>
              <small style="color:#94a3b8; display:block; margin-top:4px;">可覆盖模板注入位置</small>
            </div>

            <div id="general-memory-inject-depth-wrap" style="margin-top: 10px; display:none;">
              <label style="display:flex; align-items:center; justify-content:space-between; gap:8px; font-size:12px; font-weight:700; color:#0f172a;">
                <span>深度注入位置</span>
                <input type="number" id="general-memory-inject-depth" min="0" step="1"
                       style="width: 90px; padding: 4px 6px; border:1px solid #e2e8f0; border-radius:8px; font-size:12px; text-align:right;">
              </label>
              <small style="color:#94a3b8; display:block; margin-top:4px;">距聊天末尾 N 条插入，0 表示追加到末尾</small>
            </div>
          </div>
        </div>

        <div style="margin: 8px 0 12px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
          <div style="font-size: 12px; color:#64748b; margin-bottom: 10px;">资料迁移</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
            <button id="general-bundle-export"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              一键打包
            </button>
            <button id="general-bundle-import"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              导入资料包
            </button>
            <span id="general-bundle-status" style="font-size: 12px; color:#64748b;">
              将聊天记录/联系人/壁纸/记忆表格打包为 ZIP（不包含 API 配置）
            </span>
          </div>
          <small style="color:#94a3b8; display:block; margin-top:6px;">导入会覆盖当前资料，请勿导入来源不明的资料包。</small>
          <input type="file" id="general-bundle-file" accept=".zip,application/zip" style="display:none;">
        </div>

        <div style="margin: 8px 0 12px; padding-top: 6px; border-top: 1px dashed #e2e8f0;">
          <div style="font-size: 12px; color:#64748b; margin-bottom: 10px;">存储清理</div>
          <div style="display:flex; align-items:center; gap:8px; flex-wrap: wrap;">
            <button id="general-clean-wallpapers"
                    style="padding: 6px 10px; border-radius: 8px; border: 1px solid #e2e8f0; background: #fff; cursor: pointer; font-size: 12px; color: #0f172a;">
              清理壁纸残留
            </button>
            <span id="general-clean-wallpapers-status" style="font-size: 12px; color:#64748b;">
              仅清理未被会话引用的旧文件
            </span>
          </div>
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 8px;">
          <button id="general-settings-done" style="padding: 8px 14px; border-radius: 8px; border: 1px solid #e2e8f0;
                                                   background: #f8fafc; cursor: pointer; font-size: 14px; color: #475569;">
            完成
          </button>
        </div>
      </div>
    `;
    this.element.style.cssText = `
      display: none;
      position: fixed;
      top: calc(env(safe-area-inset-top, 0px) + 12px);
      left: 50%;
      transform: translateX(-50%);
      z-index: 21000;
    `;
    this.element.onclick = (e) => e.stopPropagation();

    this.debugToggle = this.element.querySelector('#general-debug-toggle');
    this.typingDotsToggle = this.element.querySelector('#general-typing-dots');
    this.richIframeScriptsToggle = this.element.querySelector('#general-rich-iframe-scripts');
    this.creativeHistoryInput = this.element.querySelector('#general-creative-history');
    this.creativeWideToggle = this.element.querySelector('#general-creative-wide');
    this.personaBindToggle = this.element.querySelector('#general-persona-bind');
    this.promptTimeToggle = this.element.querySelector('#general-prompt-time');
    this.memoryModeSummary = this.element.querySelector('#general-memory-mode-summary');
    this.memoryModeTable = this.element.querySelector('#general-memory-mode-table');
    this.memoryAutoToggle = this.element.querySelector('#general-memory-auto');
    this.memoryAutoModeInline = this.element.querySelector('#general-memory-auto-inline');
    this.memoryAutoModeSeparate = this.element.querySelector('#general-memory-auto-separate');
    this.memoryAutoOptions = this.element.querySelector('#general-memory-auto-options');
    this.memoryUpdateApiChat = this.element.querySelector('#general-memory-update-chat');
    this.memoryUpdateApiProfile = this.element.querySelector('#general-memory-update-profile');
    this.memoryUpdateProfileSelect = this.element.querySelector('#general-memory-update-profile-select');
    this.memoryUpdateApiBlock = this.element.querySelector('#general-memory-update-api');
    this.memoryUpdateContextInput = this.element.querySelector('#general-memory-update-context-rounds');
    this.memoryBudgetBlock = this.element.querySelector('#general-memory-budget-block');
    this.memoryInjectPositionSelect = this.element.querySelector('#general-memory-inject-position');
    this.memoryInjectDepthWrap = this.element.querySelector('#general-memory-inject-depth-wrap');
    this.memoryInjectDepthInput = this.element.querySelector('#general-memory-inject-depth');
    this.memoryAutoConfirmToggle = this.element.querySelector('#general-memory-auto-confirm');
    this.memoryAutoStepToggle = this.element.querySelector('#general-memory-auto-step');
    this.cleanWallpapersBtn = this.element.querySelector('#general-clean-wallpapers');
    this.cleanWallpapersStatus = this.element.querySelector('#general-clean-wallpapers-status');
    this.bundleExportBtn = this.element.querySelector('#general-bundle-export');
    this.bundleImportBtn = this.element.querySelector('#general-bundle-import');
    this.bundleStatus = this.element.querySelector('#general-bundle-status');
    this.bundleImportInput = this.element.querySelector('#general-bundle-file');
    this.debugToggle?.addEventListener('change', async (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ showDebugToggle: enabled });
      try {
        const { getDebugPanel } = await import('./debug-panel.js');
        const panel = getDebugPanel();
        panel.setEnabled(Boolean(settings.showDebugToggle));
      } catch {}
    });
    this.typingDotsToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ typingDotsEnabled: enabled });
      this.applyTypingDotsSetting(settings.typingDotsEnabled !== false);
    });
    this.richIframeScriptsToggle?.addEventListener('change', async (e) => {
      const target = e?.target;
      const enabled = Boolean(target?.checked);
      if (enabled) {
        const ok = await appConfirm({
          title: '安全提示',
          message:
            '启用后，富文本 iframe 将执行其中的脚本并放宽安全限制，脚本可能访问同源数据、加载外部资源，导致敏感信息泄露或设置被篡改。仅在信任来源时启用。确定继续吗？',
        });
        if (!ok) {
          if (target) target.checked = false;
          return;
        }
      }
      appSettings.update({ allowRichIframeScripts: enabled });
    });
    this.creativeWideToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      const settings = appSettings.update({ creativeWideBubble: enabled });
      this.applyCreativeWideSetting(Boolean(settings.creativeWideBubble));
    });
    this.creativeHistoryInput?.addEventListener('input', (e) => {
      const raw = e?.target?.value;
      const n = Math.trunc(Number(raw));
      const safe = Number.isFinite(n) ? Math.max(0, n) : 3;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ creativeHistoryMax: safe });
    });

    this.personaBindToggle?.addEventListener('change', async (e) => {
      const target = e?.target;
      const enabled = Boolean(target?.checked);
      if (!enabled) {
        const ok = await appConfirm({
          title: '关闭绑定',
          message:
            '关闭后，所有 Persona 将共享同一份联系人/聊天记录（共享区）。已绑定的数据不会丢失，但需切回绑定模式才能查看各自内容。确定继续吗？',
        });
        if (!ok) {
          if (target) target.checked = true;
          return;
        }
      }
      appSettings.update({ personaBindContacts: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'personaBindContacts', value: enabled } }));
    });

    this.promptTimeToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ promptCurrentTimeEnabled: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'promptCurrentTimeEnabled', value: enabled } }));
    });

    const applyMemoryMode = (mode) => {
      const next = mode === 'table' ? 'table' : 'summary';
      appSettings.update({ memoryStorageMode: next });
      window.dispatchEvent(new CustomEvent('memory-storage-mode-changed', { detail: { mode: next } }));
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryStorageMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryModeSummary?.addEventListener('change', (e) => {
      const checked = Boolean(e?.target?.checked);
      if (!checked) return;
      applyMemoryMode('summary');
    });
    this.memoryAutoToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoExtract: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoExtract', value: enabled } }));
      this.updateMemoryAutoVisibility();
    });
    const applyAutoMode = (mode) => {
      const next = mode === 'separate' ? 'separate' : 'inline';
      appSettings.update({ memoryAutoExtractMode: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoExtractMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryAutoModeInline?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyAutoMode('inline');
    });
    this.memoryAutoModeSeparate?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyAutoMode('separate');
    });
    const applyMemoryApiMode = (mode) => {
      const next = mode === 'profile' ? 'profile' : 'chat';
      appSettings.update({ memoryUpdateApiMode: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateApiMode', value: next } }));
      this.updateMemoryAutoVisibility();
    };
    this.memoryUpdateApiChat?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyMemoryApiMode('chat');
    });
    this.memoryUpdateApiProfile?.addEventListener('change', (e) => {
      if (!e?.target?.checked) return;
      applyMemoryApiMode('profile');
    });
    this.memoryUpdateProfileSelect?.addEventListener('change', (e) => {
      const value = String(e?.target?.value || '').trim();
      appSettings.update({ memoryUpdateProfileId: value });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateProfileId', value } }));
    });
    this.memoryUpdateContextInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 6;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryUpdateContextRounds: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryUpdateContextRounds', value: safe } }));
    });
    this.memoryAutoConfirmToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoConfirm: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoConfirm', value: enabled } }));
    });
    this.memoryAutoStepToggle?.addEventListener('change', (e) => {
      const enabled = Boolean(e?.target?.checked);
      appSettings.update({ memoryAutoStepByStep: enabled });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryAutoStepByStep', value: enabled } }));
    });

    const setBundleStatus = (text) => {
      if (this.bundleStatus) this.bundleStatus.textContent = text;
    };

    const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = () => reject(reader.error || new Error('读取文件失败'));
      reader.readAsDataURL(file);
    });

    const buildBundleFileName = () => {
      const now = new Date();
      const pad = (value) => String(value).padStart(2, '0');
      const ts = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
      return `chatapp_backup_${ts}.zip`;
    };

    const pickBundleExportPath = async () => {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const fileName = buildBundleFileName();
        const result = await save({
          defaultPath: fileName,
          filters: [{ name: 'ZIP', extensions: ['zip'] }],
        });
        if (!result) return { path: '', cancelled: true, fallback: false };
        return { path: result, cancelled: false, fallback: false };
      } catch (err) {
        console.warn('bundle export: save dialog unavailable', err);
        return { path: '', cancelled: false, fallback: true };
      }
    };

    this.bundleExportBtn?.addEventListener('click', async () => {
      if (this.bundleExportBtn) this.bundleExportBtn.disabled = true;
      setBundleStatus('正在打包...');
      try {
        await safeInvoke('save_kv', { name: 'app_settings_v1', data: appSettings.get() });
        const bridge = window?.appBridge;
        await bridge?.chatStore?.flush?.();
        await bridge?.momentsStore?.flush?.();
      } catch {}
      try {
        const pick = await pickBundleExportPath();
        if (pick.cancelled) {
          setBundleStatus('已取消导出');
          return;
        }
        const result = pick.fallback
          ? await safeInvoke('export_data_bundle', {})
          : await safeInvoke('export_data_bundle', { path: pick.path });
        const path = String(result?.path || '').trim();
        const bytes = Number(result?.bytes || 0);
        const size = bytes ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : '';
        setBundleStatus(path ? `已导出：${path}${size ? `（${size}）` : ''}` : '导出完成');
        window.toastr?.success?.('资料包导出完成');
      } catch (err) {
        const message = String(err?.message || err || '导出失败').trim();
        setBundleStatus(`导出失败: ${message}`);
        window.toastr?.error?.('资料包导出失败');
      } finally {
        if (this.bundleExportBtn) this.bundleExportBtn.disabled = false;
      }
    });

    this.bundleImportBtn?.addEventListener('click', async () => {
      const confirmed = await appConfirm({
        title: '导入资料包',
        message:
          '导入会覆盖当前所有资料（不包含 API 配置），且无法撤销。\n请确认资料包来源可信，避免泄露隐私。\n确定继续吗？',
        danger: true,
      });
      if (!confirmed) return;
      if (this.bundleImportInput) this.bundleImportInput.value = '';
      this.bundleImportInput?.click();
    });

    this.bundleImportInput?.addEventListener('change', async () => {
      const file = this.bundleImportInput?.files?.[0];
      if (!file) return;
      if (this.bundleImportBtn) this.bundleImportBtn.disabled = true;
      setBundleStatus('正在导入...');
      try {
        const mode = 'replace';
        const filePath = typeof file.path === 'string' ? file.path : '';
        let result = null;
        if (filePath) {
          result = await safeInvoke('import_data_bundle', { path: filePath, mode });
        } else {
          const dataUrl = await readFileAsDataUrl(file);
          result = await safeInvoke('import_data_bundle_bytes', { data: dataUrl, mode });
        }
        try {
          const prefs = await safeInvoke('load_kv', { name: 'app_settings_v1' });
          if (prefs && typeof prefs === 'object' && !prefs._tooLarge) {
            appSettings.update(prefs);
          }
        } catch {}
        const skipped = Number(result?.skipped || 0);
        const suffix = skipped ? `（跳过 ${skipped} 项）` : '';
        setBundleStatus(`导入完成${suffix}，请重启应用以加载新资料`);
        window.toastr?.success?.(`资料包导入完成${suffix}`);
        const restart = await appConfirm({
          title: '重启应用',
          message: '资料导入完成，是否立即重启应用？',
          confirmText: '立即重启',
          cancelText: '稍后',
        });
        if (restart) window.location.reload();
      } catch (err) {
        const message = String(err?.message || err || '导入失败').trim();
        setBundleStatus(`导入失败: ${message}`);
        window.toastr?.error?.('资料包导入失败');
      } finally {
        if (this.bundleImportBtn) this.bundleImportBtn.disabled = false;
      }
    });

    this.cleanWallpapersBtn?.addEventListener('click', async () => {
      const confirmed = await appConfirm({
        title: '清理壁纸',
        message: '将清理未被会话引用的壁纸文件，是否继续？',
        danger: true,
      });
      if (!confirmed) return;
      const store = window?.appBridge?.chatStore || null;
      const sessionIds = store?.listSessions?.() || [];
      const referenced = sessionIds
        .map((sid) => store?.getSessionSettings?.(sid)?.wallpaper?.path || '')
        .map((val) => String(val || '').trim())
        .filter(Boolean);
      const unique = Array.from(new Set(referenced));
      if (this.cleanWallpapersBtn) {
        this.cleanWallpapersBtn.disabled = true;
        this.cleanWallpapersBtn.textContent = '清理中...';
      }
      if (this.cleanWallpapersStatus) {
        this.cleanWallpapersStatus.textContent = `已引用 ${unique.length} 个壁纸文件`;
      }
      try {
        const result = await safeInvoke('cleanup_wallpapers', { referencedPaths: unique });
        const removed = Number(result?.removed || 0);
        const kept = Number(result?.kept || 0);
        if (this.cleanWallpapersStatus) {
          this.cleanWallpapersStatus.textContent = `已清理 ${removed} 个残留文件，保留 ${kept} 个在用壁纸`;
        }
      } catch (err) {
        const message = String(err?.message || err || '清理失败').trim();
        if (this.cleanWallpapersStatus) {
          this.cleanWallpapersStatus.textContent = `清理失败: ${message}`;
        }
      } finally {
        if (this.cleanWallpapersBtn) {
          this.cleanWallpapersBtn.disabled = false;
          this.cleanWallpapersBtn.textContent = '清理壁纸残留';
        }
      }
    });
    this.memoryInjectPositionSelect?.addEventListener('change', (e) => {
      const raw = String(e?.target?.value || 'template').toLowerCase();
      const allowed = new Set(['template', 'after_persona', 'system_end', 'before_chat', 'history_depth', 'system_end+before_chat']);
      const next = allowed.has(raw) ? raw : 'template';
      appSettings.update({ memoryInjectPosition: next });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryInjectPosition', value: next } }));
      this.updateMemoryAutoVisibility();
    });
    this.memoryInjectDepthInput?.addEventListener('input', (e) => {
      const raw = Math.trunc(Number(e?.target?.value));
      const safe = Number.isFinite(raw) ? Math.max(0, raw) : 4;
      if (e?.target) e.target.value = String(safe);
      appSettings.update({ memoryInjectDepth: safe });
      window.dispatchEvent(new CustomEvent('app-settings-changed', { detail: { key: 'memoryInjectDepth', value: safe } }));
    });
    this.memoryModeTable?.addEventListener('change', async (e) => {
      const target = e?.target;
      const checked = Boolean(target?.checked);
      if (!checked) return;
      const ok = await appConfirm({
        title: '切换记忆模式',
        message:
          '切换到记忆表格模式？\n\n• 新对话将使用记忆表格\n• 历史摘要数据保留，不会丢失\n• 你可以随时切换回摘要模式\n\n确定切换？',
      });
      if (!ok) {
        if (target) target.checked = false;
        if (this.memoryModeSummary) this.memoryModeSummary.checked = true;
        return;
      }
      applyMemoryMode('table');
    });

    this.element.querySelector('#general-settings-close')?.addEventListener('click', () => this.hide());
    this.element.querySelector('#general-settings-done')?.addEventListener('click', () => this.hide());

    document.body.appendChild(this.overlayElement);
    document.body.appendChild(this.element);
  }
}
