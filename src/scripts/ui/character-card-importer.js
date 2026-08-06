import { logger } from '../utils/logger.js';
import { convertSTWorld } from '../storage/worldinfo.js';
import { normalizeScopeId } from '../storage/store-scope.js';
import { parseCharacterCardFile } from '../utils/character-card.js';
import { avatarDataUrlFromFile } from '../utils/image.js';
import { safeInvoke } from '../utils/tauri.js';
import { appSettings } from '../storage/app-settings.js';
import { appConfirm, appChoice } from './app-confirm.js';
import { bindBackdropActivation } from './backdrop-activation-utils.js';
import {
  buildCharacterCardMvuConversion,
  extractMvuTavernHelperScripts,
} from '../import/mvu-card-conversion-utils.js';
import { writeImportedMvuConversion } from '../import/mvu-session-write-utils.js';
import { markMvuSchemaOnlyScripts } from '../import/mvu-script-classification.js';
import { buildScriptAuthorizationMessage } from './script-authorization-utils.js';
import { getPresetStore } from './preset-store-runtime-utils.js';
import { createRegexStoreRuntimeAdapter } from './regex-store-runtime-utils.js';
import { allowScriptOnce, getScriptRuntime, waitForScriptStoreReady } from './script-runtime-utils.js';
import { hasStoredWorldInfo, waitForWorldStoreReady } from './world-store-runtime-utils.js';
import { emitWorldInfoChanged } from './world-session-runtime-utils.js';

const buildGreetingList = (card = {}) => {
  const list = [];
  const push = (content, index = 0) => {
    const text = String(content || '').trim();
    if (!text) return;
    const id = `greeting_${index + 1}`;
    const title = index === 0 ? '开场白' : `开场白 ${index + 1}`;
    list.push({ id, title, content: text });
  };
  push(card.first_mes, 0);
  const alts = Array.isArray(card.alternate_greetings) ? card.alternate_greetings : [];
  alts.forEach((g, idx) => push(g, idx + 1));
  return list;
};

const sanitizeId = (value, fallback = 'worldbook') => {
  const raw = String(value || '').trim();
  if (!raw) return fallback;
  if (/^[a-zA-Z0-9_-]+$/.test(raw)) return raw;
  const safe = raw.replace(/[\\/:*?"<>|]/g, '_').replace(/_+/g, '_').slice(0, 48).trim();
  return safe || fallback;
};

const extractRegexScripts = (card = {}) => {
  const ext = card?.extensions && typeof card.extensions === 'object' ? card.extensions : {};
  const list = [];
  const push = (val) => {
    if (Array.isArray(val)) {
      val.forEach(item => {
        if (item && typeof item === 'object') list.push(item);
      });
    }
  };
  push(ext.regex_scripts);
  push(ext.regexScripts);
  push(ext.regex);
  push(ext.regexes);
  return list;
};

const hasSystemPrompt = (card = {}) => {
  const sys = String(card.system_prompt || '').trim();
  const post = String(card.post_history_instructions || '').trim();
  return Boolean(sys || post);
};

const promptImportOptions = ({ displayName, fileName, worldCount, greetingCount, regexCount, scriptCount, allowSystemPrompt } = {}) =>
  new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.style.cssText = `
      position: fixed; inset: 0; z-index: 22050;
      background: rgba(0,0,0,0.38); display: flex; align-items: center; justify-content: center;
      padding: 16px;
    `;
    const panel = document.createElement('div');
    panel.style.cssText = `
      width: min(92vw, 420px); background: var(--app-surface-card); border-radius: 14px; overflow: hidden;
      box-shadow: 0 12px 40px rgba(0,0,0,0.2); display:flex; flex-direction:column;
    `;
    const titleText = displayName ? `导入角色卡：${displayName}` : '导入角色卡';
    const fileText = fileName ? `文件：${fileName}` : '';
    panel.innerHTML = `
      <div style="padding:14px 16px; border-bottom:1px solid var(--app-border-default); background:var(--app-surface-subtle);">
        <div style="font-weight:800; font-size:15px;">${titleText}</div>
        ${fileText ? `<div style="margin-top:4px; font-size:12px; color:var(--app-text-muted);">${fileText}</div>` : ''}
      </div>
      <div style="padding:14px 16px; display:flex; flex-direction:column; gap:10px; font-size:13px;">
        <div style="font-weight:700; color:var(--app-text-primary);">导入选项</div>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="cc-opt-world" ${worldCount ? 'checked' : ''} ${worldCount ? '' : 'disabled'}>
          <span>导入世界书（${worldCount} 条）</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="cc-opt-greeting" ${greetingCount ? 'checked' : ''} ${greetingCount ? '' : 'disabled'}>
          <span>导入开场白（${greetingCount} 条）</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="cc-opt-system" ${allowSystemPrompt ? '' : 'disabled'}>
          <span>导入系统提示词为预设${allowSystemPrompt ? '' : '（无）'}</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="cc-opt-regex" ${regexCount ? 'checked' : ''} ${regexCount ? '' : 'disabled'}>
          <span>导入正则脚本（${regexCount} 条）</span>
        </label>
        <label style="display:flex; align-items:center; gap:8px;">
          <input type="checkbox" id="cc-opt-script" ${scriptCount ? '' : 'disabled'}>
          <span>导入脚本（${scriptCount} 条）</span>
        </label>
      </div>
      <div style="display:flex; gap:8px; justify-content:flex-end; padding:12px 16px; border-top:1px solid var(--app-border-default); background:var(--app-surface-card);">
        <button id="cc-opt-cancel" style="border:1px solid var(--app-border-default); background:var(--app-surface-card); border-radius:10px; padding:8px 12px;">取消</button>
        <button id="cc-opt-confirm" style="border:none; background:var(--app-text-primary); color:var(--app-text-inverse); border-radius:10px; padding:8px 14px;">导入</button>
      </div>
    `;
    overlay.appendChild(panel);
    document.body.appendChild(overlay);

    const cleanup = (result) => {
      unbindBackdropActivation();
      overlay.remove();
      resolve(result);
    };
    const unbindBackdropActivation = bindBackdropActivation(overlay, {
      onActivate: () => cleanup(null),
    });
    const worldEl = panel.querySelector('#cc-opt-world');
    const greetEl = panel.querySelector('#cc-opt-greeting');
    const sysEl = panel.querySelector('#cc-opt-system');
    const regexEl = panel.querySelector('#cc-opt-regex');
    const scriptEl = panel.querySelector('#cc-opt-script');
    panel.querySelector('#cc-opt-cancel')?.addEventListener('click', () => cleanup(null));
    panel.querySelector('#cc-opt-confirm')?.addEventListener('click', () => {
      cleanup({
        importWorld: Boolean(worldEl?.checked),
        importGreetings: Boolean(greetEl?.checked),
        importSystemPrompt: Boolean(sysEl?.checked),
        importRegex: Boolean(regexEl?.checked),
        importScripts: Boolean(scriptEl?.checked),
      });
    });
  });

const buildCharacterDefinitionText = (card) => {
  const parts = [];
  if (card.description) parts.push(`角色描述:\n${card.description}`);
  if (card.personality) parts.push(`性格特点:\n${card.personality}`);
  if (card.scenario) parts.push(`场景设定:\n${card.scenario}`);
  if (card.creator_notes) parts.push(`作者注释:\n${card.creator_notes}`);
  if (card.system_prompt) parts.push(`系统提示:\n${card.system_prompt}`);
  if (card.post_history_instructions) parts.push(`后置指令:\n${card.post_history_instructions}`);
  return parts.filter(Boolean).join('\n\n').trim();
};

const withScope = (entry, scope = []) => {
  const extra = Array.isArray(scope) ? scope.map(s => String(s || '').trim()).filter(Boolean) : [];
  return { ...entry, scope: extra };
};

const buildWorldbookEntries = (card, { defaultScope = [] } = {}) => {
  const entries = [];
  const definitionText = buildCharacterDefinitionText(card);
  if (definitionText) {
    entries.push({
      id: `entry_${Date.now()}_character`,
      comment: '角色设定',
      title: '角色设定',
      content: definitionText,
      key: card.name ? [card.name] : [],
      keysecondary: [],
      order: 100,
      priority: 100,
      depth: 4,
      position: 0,
      selective: false,
      selectiveLogic: 0,
      constant: true,
      disable: false,
      scope: Array.isArray(defaultScope) ? defaultScope.slice() : [],
    });
  }
  if (card.character_book && typeof card.character_book === 'object') {
    try {
      const converted = convertSTWorld(card.character_book, 'imported');
      if (Array.isArray(converted?.entries)) {
        const scoped = converted.entries.map(entry => withScope(entry, defaultScope));
        entries.push(...scoped);
      }
    } catch (err) {
      logger.warn('convert worldbook failed', err);
    }
  }
  return entries;
};

const ensureUniqueWorldbookId = (baseName, hasWorldInfo) => {
  const base = sanitizeId(baseName, 'card_worldbook');
  if (!hasWorldInfo(base)) return base;
  let idx = 1;
  while (idx < 9999) {
    const next = `${base}_${idx}`;
    if (!hasWorldInfo(next)) return next;
    idx += 1;
  }
  return `${base}_${Date.now()}`;
};

export class CharacterCardImporter {
  constructor({
    personaStore,
    appBridge,
    presetStore = null,
    rpSessionStore,
    onPersonaChanged,
    onGreetingsImported,
  } = {}) {
    this.personaStore = personaStore || null;
    this.appBridge = appBridge || window.appBridge;
    this.presetStore = presetStore || getPresetStore(this.appBridge);
    this.regexStore = createRegexStoreRuntimeAdapter(this.appBridge);
    this.rpSessionStore = rpSessionStore || null;
    this.onPersonaChanged = onPersonaChanged;
    this.onGreetingsImported = onGreetingsImported;
  }

  async importFromUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) throw new Error('链接为空');
    let response;
    try {
      response = await fetch(raw, { credentials: 'omit' });
    } catch (err) {
      throw new Error('链接加载失败');
    }
    if (!response?.ok) {
      throw new Error(`链接加载失败（${response?.status || 'unknown'}）`);
    }
    const blob = await response.blob();
    const mime = String(blob?.type || '').toLowerCase();
    let fileName = '';
    try {
      const parsed = new URL(raw);
      const base = parsed.pathname.split('/').pop() || '';
      fileName = base;
    } catch {}
    if (!fileName) {
      if (mime.includes('json')) fileName = 'card.json';
      else if (mime.includes('png')) fileName = 'card.png';
      else fileName = 'card';
    }
    if (!/\.[a-z0-9]+$/i.test(fileName)) {
      if (mime.includes('json')) fileName += '.json';
      else if (mime.includes('png')) fileName += '.png';
    }
    const file = new File([blob], fileName, { type: blob?.type || 'application/octet-stream' });
    return this.importFromFile(file);
  }

  async importFromFile(file) {
    const parsed = await parseCharacterCardFile(file);
    const fileName = String(file?.name || '').trim();
    let avatarDataUrl = parsed.avatarDataUrl || '';
    if (file && avatarDataUrl) {
      try {
        avatarDataUrl = await avatarDataUrlFromFile(file, { maxDim: 256, quality: 0.84, maxBytes: 420_000 });
      } catch {}
    }
    return this.importCard(parsed.card, {
      avatarDataUrl,
      raw: parsed.raw,
      fileName,
    });
  }

  async importCard(card, { avatarDataUrl = '', raw = null, fileName = '' } = {}) {
    if (!card) throw new Error('角色卡解析失败');
    const displayName = String(card.name || '').trim() || '角色卡';
    const greetings = buildGreetingList(card);
    const worldEntries = buildWorldbookEntries(card, { defaultScope: [] });
    const regexScripts = extractRegexScripts(card);
    const tavernScripts = extractMvuTavernHelperScripts(card);
    const options = await promptImportOptions({
      displayName,
      fileName,
      worldCount: worldEntries.length,
      greetingCount: greetings.length,
      regexCount: regexScripts.length,
      scriptCount: tavernScripts.length,
      allowSystemPrompt: hasSystemPrompt(card),
    });
    if (!options) return false;

    if (!this.personaStore) throw new Error('PersonaStore 未就绪');
    const rawCard = raw || card.raw || card;
    const sourceBase = {
      type: 'character_card',
      format: card.format || 'unknown',
      importedAt: new Date().toISOString(),
      originalFile: fileName || '',
      characterName: displayName,
    };
    const persona = await this.personaStore.create({
      name: displayName,
      description: '',
      avatar: avatarDataUrl || '',
      source: sourceBase,
      originalCard: null,
    });
    await this.personaStore.setActive(persona.id);
    await Promise.resolve(this.onPersonaChanged?.());

    let originalCardStored = false;
    let originalCardSize = 0;
    try {
      originalCardSize = JSON.stringify(rawCard).length;
    } catch {}
    try {
      if (this.appBridge?.savePersonaCard) {
        const saved = await this.appBridge.savePersonaCard(persona.id, rawCard);
        originalCardStored = Boolean(saved?.path);
      } else {
        await safeInvoke('save_persona_card', { id: persona.id, data: rawCard });
        originalCardStored = true;
      }
    } catch (err) {
      logger.warn('save persona card failed', err);
    }

    let importedGreetingCount = 0;
    try {
      if (options.importGreetings && this.rpSessionStore && greetings.length) {
        await this.rpSessionStore.ready;
        this.rpSessionStore.setGreetings(greetings, { activeId: greetings[0]?.id || '' });
        importedGreetingCount = greetings.length;
      }
    } catch (err) {
      logger.warn('import rp greetings failed', err);
    }

    let worldId = '';
    if (options.importWorld) {
      await waitForWorldStoreReady(this.appBridge);
      const worldPayload = {
        name: String(card?.name || '').trim() ? displayName : '角色世界书',
        entries: worldEntries,
        source: 'character_card',
      };
      worldId = ensureUniqueWorldbookId(displayName, id => hasStoredWorldInfo(this.appBridge, id));
      await this.appBridge?.saveWorldInfo?.(worldId, worldPayload);
    }

    let mvuConverted = false;
    let mvuVariableCount = 0;
    let mvuSource = 'none';

    // 尝试多种方式提取 MVU 变量定义：
    // 1. TavernHelper Zod Schema 提供精确类型；
    // 2. 角色卡 stat_data 补充真实初值与缺失变量。
    const combinedMvu = buildCharacterCardMvuConversion({ card, rawCard });
    mvuSource = combinedMvu.source;
    if (mvuSource.includes('zod_script')) {
      logger.info(`[character-card] parsed ${Object.keys(combinedMvu.variables).length} variables from Zod scripts`);
    }
    if (combinedMvu.errors.length) {
      logger.warn('[character-card] Zod parse errors:', combinedMvu.errors);
    }

    mvuVariableCount = Object.keys(combinedMvu.variables).length;

    if (mvuVariableCount > 0) {
      const sourceText = mvuSource === 'zod_script' ? '（来自脚本 Schema）' : '（来自角色卡数据）';
      const choice = await appChoice({
        title: '检测到 MVU 变量卡',
        message: `发现 ${mvuVariableCount} 个变量${sourceText}。\n是否转换为原生变量系统并写入创意写作会话？`,
        actions: [
          { id: 'convert', label: '转换', primary: true },
          { id: 'skip', label: '跳过' },
        ],
        defaultActionId: 'convert',
      });
      if (choice === 'convert') {
        try {
          const chatStore = this.appBridge?.chatStore;
          const rpSessionId = `rp:${persona.id}`;
          if (chatStore) {
            writeImportedMvuConversion({
              chatStore,
              sessionId: rpSessionId,
              conversion: combinedMvu,
            });
            mvuConverted = true;
            window.toastr?.success?.('MVU 变量已转换到创意写作会话');
          }
        } catch (err) {
          logger.warn('mvu convert failed', err);
          window.toastr?.warning?.('MVU 转换失败，已跳过');
        }
      }
    }

    let presetId = '';
    if (options.importSystemPrompt && hasSystemPrompt(card)) {
      try {
        const sys = String(card.system_prompt || '').trim();
        const post = String(card.post_history_instructions || '').trim();
        const presetStore = this.presetStore;
        if (presetStore?.ready) await presetStore.ready;
        if (presetStore?.upsert) {
          presetId = await presetStore.upsert('sysprompt', {
            name: `${displayName}·系统提示`,
            data: {
              name: `${displayName}·系统提示`,
              content: sys,
              post_history: post,
            },
            makeActive: false,
          });
          if (presetId) window.toastr?.success?.('系统提示词已导入为预设');
        }
      } catch (err) {
        logger.warn('import system prompt preset failed', err);
      }
    }

    let regexSetId = '';
    if (options.importRegex && regexScripts.length) {
      try {
        const regexStore = this.regexStore;
        if (regexStore?.ready) await regexStore.ready;
        if (regexStore?.upsertLocalSet) {
          regexSetId = await regexStore.upsertLocalSet({
            name: `${displayName}·正则`,
            enabled: true,
            bind: worldId ? { type: 'world', worldId } : null,
            rules: regexScripts,
          });
          if (regexSetId) window.toastr?.success?.('正则脚本已导入');
        }
      } catch (err) {
        logger.warn('import regex scripts failed', err);
      }
    }

    if (options.importScripts && tavernScripts.length) {
      try {
        const scriptStore = await waitForScriptStoreReady(this.appBridge);
        // 原生变量层已接管 Schema 与 MVU 引擎；卡内其余行为脚本仍须正常执行。
        const scriptsWithSchemaFlag = markMvuSchemaOnlyScripts(tavernScripts);
        const result = await scriptStore?.importTavernHelperScripts?.({
          scripts: scriptsWithSchemaFlag,
          scope: 'character',
          scopeId: persona.id,
          source: 'card',
        });
        if (result?.count) {
          const settings = appSettings.get();
          const ids = Array.isArray(result.ids) ? result.ids : [];
          const runnableIds = Array.isArray(result.runnableIds) ? result.runnableIds : ids;
          const compatibility = result.compatibility && typeof result.compatibility === 'object'
            ? result.compatibility
            : null;
          const authorizationMessage = buildScriptAuthorizationMessage({
            leadText: `检测到 ${result.count} 条脚本。`,
            settings,
            compatibility,
          });
          if (runnableIds.length) {
            const choice = await appChoice({
              title: '脚本授权',
              message: authorizationMessage,
              actions: [
                { id: 'allow', label: '允许并启用', primary: true },
                { id: 'once', label: '仅本次允许' },
                { id: 'deny', label: '拒绝', variant: 'danger' },
              ],
              defaultActionId: 'allow',
            });
            if (choice === 'allow') {
              if (settings.scriptEnabled !== true) appSettings.update({ scriptEnabled: true });
              await Promise.all(runnableIds.map((id) => scriptStore.toggleScript('character', persona.id, id, true)));
            } else if (choice === 'once') {
              const sid = this.appBridge?.chatStore?.getCurrent?.() || '';
              const scriptRuntime = getScriptRuntime(this.appBridge);
              if (sid && scriptRuntime?.allowOnce) {
                allowScriptOnce(this.appBridge, sid, runnableIds);
              } else {
                window.toastr?.info?.('当前未打开会话，脚本已导入但未启用');
              }
            }
          } else {
            await appChoice({
              title: '脚本兼容性提示',
              message: authorizationMessage,
              actions: [{ id: 'ok', label: '知道了', primary: true }],
              defaultActionId: 'ok',
            });
          }
          const blockedCount = Math.max(0, Number(compatibility?.blockedCount) || 0);
          if (blockedCount > 0) {
            window.toastr?.warning?.(`脚本已导入；${blockedCount} 条外部扩展加载器已保持禁用`);
          } else {
            window.toastr?.success?.('脚本已导入');
          }
        }
      } catch (err) {
        logger.warn('import tavern helper scripts failed', err);
      }
    }

    try {
      const source = {
        ...(persona?.source || {}),
        worldbookId: worldId || persona?.source?.worldbookId,
        worldbookEnabled: worldId ? true : (persona?.source?.worldbookEnabled !== false),
        systemPresetId: presetId || persona?.source?.systemPresetId,
        regexSetId: regexSetId || persona?.source?.regexSetId,
        mvuConverted,
        mvuVariableCount,
        mvuSource: mvuConverted ? mvuSource : 'none',
        originalCardStored,
        originalCardSize,
      };
      const update = { source };
      if (!originalCardStored) {
        update.originalCard = rawCard;
      }
      await this.personaStore.update?.(persona.id, update);
      emitWorldInfoChanged(this.appBridge, { roleWorldChanged: Boolean(worldId) });
    } catch (err) {
      logger.warn('update persona source failed', err);
    }

    try {
      const scopeId = normalizeScopeId(this.appBridge?.scopeId || '');
      logger.info(`[character-card] imported persona=${persona.id} scope=${scopeId} world=${worldId || 'none'}`);
    } catch {}

    if (importedGreetingCount > 0) {
      try {
        await Promise.resolve(this.onGreetingsImported?.({
          personaId: persona.id,
          greetingCount: importedGreetingCount,
        }));
      } catch (err) {
        logger.warn('refresh imported rp greetings failed', err);
      }
    }

    window.toastr?.success?.('角色卡导入完成（已切换角色卡）');
    return true;
  }
}
