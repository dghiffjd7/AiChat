import { appConfirm } from './app-confirm.js';
import { safeInvoke } from '../utils/tauri.js';
import { logger } from '../utils/logger.js';
import { pickSavePath } from '../utils/save-dialog.js';
import { BUILTIN_PHONE_FORMAT_WORLDBOOK_ID } from '../storage/builtin-worldbooks.js';

const hasTauriRuntime = () => {
  const g = typeof globalThis !== 'undefined' ? globalThis : window;
  return Boolean(g?.__TAURI__ || g?.__TAURI_INTERNALS__ || g?.__TAURI_INVOKE__);
};

const sanitizeExportName = (value, fallback = 'download') => {
  const raw = String(value || '').trim();
  const cleaned = raw.replace(/[\\/:*?"<>|]+/g, '_');
  return cleaned || fallback;
};

const readFileAsArrayBuffer = file => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result || new ArrayBuffer(0));
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsArrayBuffer(file);
  });
};

const readFileAsText = file => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(reader.error || new Error('读取失败'));
    reader.readAsText(file);
  });
};

const bytesToBase64 = (bytes) => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const textToDataUrl = (text, mime = 'application/json') => {
  const bytes = new TextEncoder().encode(String(text || ''));
  return `data:${mime};base64,${bytesToBase64(bytes)}`;
};

const inferImageExtension = (dataUrl, fallback = 'png') => {
  const raw = String(dataUrl || '').trim();
  if (!raw.startsWith('data:')) return fallback;
  const head = raw.slice(5).split(';', 1)[0] || '';
  if (head === 'image/jpeg' || head === 'image/jpg') return 'jpg';
  if (head === 'image/webp') return 'webp';
  if (head === 'image/gif') return 'gif';
  if (head === 'image/png') return 'png';
  return fallback;
};

const inferMimeFromName = (name = '') => {
  const lower = String(name || '').toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.webp')) return 'image/webp';
  if (lower.endsWith('.gif')) return 'image/gif';
  if (lower.endsWith('.json')) return 'application/json';
  if (lower.endsWith('.md') || lower.endsWith('.txt')) return 'text/plain';
  return 'application/octet-stream';
};

const ensureArray = (val) => Array.isArray(val) ? val : [];

export class CharacterCardTransfer {
  constructor({ chatStore, contactsStore, memoryTableStore, memoryTemplateStore, appBridge }) {
    this.chatStore = chatStore;
    this.contactsStore = contactsStore;
    this.memoryTableStore = memoryTableStore;
    this.memoryTemplateStore = memoryTemplateStore;
    this.appBridge = appBridge || window.appBridge;
  }

  async resolveDefaultMemoryTemplateId() {
    const store = this.memoryTemplateStore || this.appBridge?.memoryTemplateStore;
    if (!store?.getTemplates) return '';
    try {
      const list = await store.getTemplates({ is_default: true });
      if (Array.isArray(list) && list.length) return String(list[0]?.id || '').trim();
    } catch {}
    try {
      const fallback = await store.getTemplates({ id: 'default-v1' });
      if (Array.isArray(fallback) && fallback.length) return String(fallback[0]?.id || '').trim();
    } catch {}
    return '';
  }

  async buildMemorySnapshot(sessionId, { isGroup = false } = {}) {
    const memoryTableStore = this.memoryTableStore || this.appBridge?.memoryTableStore;
    if (!memoryTableStore?.getMemories) return null;
    const templateId = await this.resolveDefaultMemoryTemplateId();
    if (!templateId) return null;
    const sid = String(sessionId || '').trim();
    if (!sid) return null;
    let rows = [];
    try {
      rows = await memoryTableStore.getMemories({
        scope: isGroup ? 'group' : 'contact',
        group_id: isGroup ? sid : undefined,
        contact_id: isGroup ? undefined : sid,
        template_id: templateId,
      });
    } catch {
      return null;
    }
    const picked = Array.isArray(rows)
      ? rows.map((row) => {
          const tableId = String(row?.table_id || '').trim();
          if (!tableId) return null;
          return {
            id: String(row?.id || '').trim(),
            table_id: tableId,
            row_data: row?.row_data ?? {},
            is_active: row?.is_active !== false,
            is_pinned: Boolean(row?.is_pinned),
            priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
            sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
          };
        }).filter(Boolean)
      : [];
    return { templateId, rows: picked };
  }

  async applyMemorySnapshot(sessionId, snapshot, { isGroup = false } = {}) {
    if (!snapshot) return false;
    const memoryTableStore = this.memoryTableStore || this.appBridge?.memoryTableStore;
    if (!memoryTableStore?.getMemories) return false;
    const sid = String(sessionId || '').trim();
    if (!sid) return false;
    const templateId = String(snapshot?.templateId || '').trim() || (await this.resolveDefaultMemoryTemplateId());
    if (!templateId) return false;
    let existing = [];
    try {
      existing = await memoryTableStore.getMemories({
        scope: isGroup ? 'group' : 'contact',
        group_id: isGroup ? sid : undefined,
        contact_id: isGroup ? undefined : sid,
        template_id: templateId,
      });
    } catch {}
    const ids = Array.isArray(existing)
      ? existing.map(row => String(row?.id || '').trim()).filter(Boolean)
      : [];
    if (ids.length) {
      try {
        await memoryTableStore.batchDeleteMemories?.(ids);
      } catch {
        for (const id of ids) {
          try { await memoryTableStore.deleteMemory?.(id); } catch {}
        }
      }
    }
    const rows = Array.isArray(snapshot?.rows) ? snapshot.rows : [];
    const inputs = rows.map((row) => {
      const tableId = String(row?.table_id || '').trim();
      if (!tableId) return null;
      return {
        id: row?.id ? String(row.id) : undefined,
        template_id: templateId,
        table_id: tableId,
        contact_id: isGroup ? null : sid,
        group_id: isGroup ? sid : null,
        row_data: row?.row_data ?? {},
        is_active: row?.is_active !== false,
        is_pinned: Boolean(row?.is_pinned),
        priority: Number.isFinite(Number(row?.priority)) ? Number(row.priority) : 0,
        sort_order: Number.isFinite(Number(row?.sort_order)) ? Number(row.sort_order) : 0,
      };
    }).filter(Boolean);
    if (inputs.length) {
      try {
        await memoryTableStore.batchCreateMemories?.(inputs);
      } catch {
        for (const input of inputs) {
          try { await memoryTableStore.createMemory?.(input); } catch {}
        }
      }
    }
    try {
      window.dispatchEvent(new CustomEvent('memory-rows-updated', { detail: { sessionId: sid, templateId } }));
    } catch {}
    return true;
  }

  getUniqueSessionId(base) {
    const name = String(base || '').trim() || '角色';
    const exists = (id) => Boolean(
      this.contactsStore?.getContact?.(id) || this.chatStore?.hasSession?.(id)
    );
    if (!exists(name)) return name;
    let idx = 1;
    while (idx < 9999) {
      const next = `${name}-${idx}`;
      if (!exists(next)) return next;
      idx += 1;
    }
    return `${name}-${Date.now()}`;
  }

  async buildCardPayload(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) throw new Error('未选择聊天');
    const contact = this.contactsStore?.getContact?.(sid) || { id: sid, name: sid };
    const worldIds = ensureArray(this.appBridge?.getWorldIdsForSession?.(sid));
    const globalWorldId = String(this.appBridge?.globalWorldId || '').trim();
    const exportWorldIds = Array.from(new Set([
      ...worldIds,
      ...(globalWorldId && globalWorldId !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID ? [globalWorldId] : []),
    ])).filter(id => id && id !== BUILTIN_PHONE_FORMAT_WORLDBOOK_ID);
    const worldbooks = {};
    for (const id of exportWorldIds) {
      try {
        const data = await this.appBridge?.getWorldInfo?.(id);
        if (data && typeof data === 'object') {
          worldbooks[id] = { ...data, name: String(data?.name || id) };
        }
      } catch (err) {
        logger.warn('export worldbook failed', err);
      }
    }

    const variables = {
      values: this.chatStore?.listVariables?.(sid) || {},
      schemas: this.chatStore?.listVariableSchemas?.(sid) || {},
      rules: this.chatStore?.listVariableRules?.(sid) || [],
    };

    let sessionRegex = null;
    let localSets = [];
    try {
      const regexStore = this.appBridge?.regex;
      sessionRegex = regexStore?.getSession?.(sid) || null;
      const sets = regexStore?.listLocalSets?.() || [];
      localSets = sets.filter(s => s?.bind?.type === 'world' && exportWorldIds.includes(String(s.bind.worldId || '')));
    } catch (err) {
      logger.warn('export regex failed', err);
    }

    const memory = await this.buildMemorySnapshot(sid, { isGroup: Boolean(contact?.isGroup) });

    const avatarDataUrl = String(contact?.avatar || '');
    const avatarFile = avatarDataUrl.startsWith('data:')
      ? `avatar.${inferImageExtension(avatarDataUrl)}`
      : '';

    const card = {
      format: 'chatapp.card.v1',
      exportedAt: new Date().toISOString(),
      contact: {
        id: String(contact?.id || sid),
        name: String(contact?.name || sid),
        description: String(contact?.description || ''),
        labels: ensureArray(contact?.labels).map(String),
        avatarFile: avatarFile || '',
      },
      session: {
        id: sid,
        worldIds: exportWorldIds,
        globalWorldId: globalWorldId || '',
      },
      variables,
      regex: {
        session: sessionRegex,
        localSets,
      },
      memory,
      worldbooks,
      source: {
        type: 'chatapp',
      },
    };

    return { card, avatarDataUrl, avatarFile };
  }

  async exportCardPackage(sessionId) {
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持导出');
      return '';
    }
    const { card, avatarDataUrl, avatarFile } = await this.buildCardPayload(sessionId);
    const entries = [];
    const cardText = JSON.stringify(card, null, 2);
    entries.push({ name: 'card.json', data_url: textToDataUrl(cardText, 'application/json') });
    if (avatarDataUrl && avatarFile) {
      entries.push({ name: avatarFile, data_url: avatarDataUrl });
    }
    const fileName = sanitizeExportName(`${card.contact?.name || sessionId}_card.zip`, 'character_card.zip');
    const pick = await pickSavePath({ defaultName: fileName, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    if (pick.cancelled) return '';
    try {
      const resp = await safeInvoke('export_sticker_zip', {
        entries,
        fileName,
        path: pick.path || '',
      });
      const savedPath = String(resp?.path || '').trim();
      if (savedPath) window.toastr?.success?.(`已导出：${savedPath}`);
      return savedPath;
    } catch (err) {
      window.toastr?.error?.(`导出失败：${err?.message || '未知错误'}`);
      return '';
    }
  }

  async exportStCompatPackage(sessionId) {
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持导出');
      return '';
    }
    const { card } = await this.buildCardPayload(sessionId);
    const worldEntries = Object.values(card.worldbooks || {})
      .flatMap(w => {
        if (Array.isArray(w?.entries)) return w.entries;
        if (w?.entries && typeof w.entries === 'object') return Object.values(w.entries);
        return [];
      });
    const worldbook = {
      name: card.contact?.name || card.contact?.id || 'character',
      entries: worldEntries,
    };
    const regexRules = [];
    const localSets = ensureArray(card.regex?.localSets);
    localSets.forEach(set => {
      ensureArray(set?.rules).forEach(rule => {
        if (rule) regexRules.push(rule);
      });
    });
    const sessionRegex = card.regex?.session;
    if (sessionRegex?.enabled !== false) {
      ensureArray(sessionRegex?.rules).forEach(rule => {
        if (rule) regexRules.push(rule);
      });
    }
    const readme = [
      '# ChatApp → SillyTavern 导出包',
      '',
      '此包为简化兼容导出，仅包含：',
      '- worldbook.json（世界书）',
      '- regex-scripts.json（正则脚本）',
      '',
      '不包含：开场白/脚本/角色卡元数据。',
      '如需完整导入，请在 ChatApp 内使用角色卡 ZIP。',
    ].join('\n');
    const entries = [
      { name: 'worldbook.json', data_url: textToDataUrl(JSON.stringify(worldbook, null, 2), 'application/json') },
      { name: 'regex-scripts.json', data_url: textToDataUrl(JSON.stringify(regexRules, null, 2), 'application/json') },
      { name: 'README.md', data_url: textToDataUrl(readme, 'text/plain') },
    ];
    const fileName = sanitizeExportName(`${card.contact?.name || sessionId}_st_pack.zip`, 'st_compat.zip');
    const pick = await pickSavePath({ defaultName: fileName, filters: [{ name: 'ZIP', extensions: ['zip'] }] });
    if (pick.cancelled) return '';
    try {
      const resp = await safeInvoke('export_sticker_zip', {
        entries,
        fileName,
        path: pick.path || '',
      });
      const savedPath = String(resp?.path || '').trim();
      if (savedPath) window.toastr?.success?.(`已导出：${savedPath}`);
      return savedPath;
    } catch (err) {
      window.toastr?.error?.(`导出失败：${err?.message || '未知错误'}`);
      return '';
    }
  }

  async importFromFile(file) {
    if (!file) return false;
    const name = String(file?.name || '').trim().toLowerCase();
    if (name.endsWith('.json')) {
      const text = await readFileAsText(file);
      return this.importFromCardJson(text);
    }
    if (!name.endsWith('.zip')) {
      window.toastr?.warning?.('仅支持导入 .zip 或 .json');
      return false;
    }
    if (!hasTauriRuntime()) {
      window.toastr?.warning?.('当前环境不支持 ZIP 导入');
      return false;
    }
    const buffer = await readFileAsArrayBuffer(file);
    const bytes = Array.from(new Uint8Array(buffer));
    const entries = await safeInvoke('read_zip_entries', { bytes });
    const files = Array.isArray(entries) ? entries : [];
    const cardEntry = files
      .filter(f => String(f?.name || '').toLowerCase().endsWith('card.json'))
      .sort((a, b) => String(a?.name || '').length - String(b?.name || '').length)[0];
    if (!cardEntry) {
      window.toastr?.error?.('未找到 card.json');
      return false;
    }
    let cardText = String(cardEntry?.text || '').trim();
    if (!cardText && cardEntry?.base64) {
      try {
        const bin = atob(String(cardEntry.base64 || ''));
        const bytesArr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytesArr[i] = bin.charCodeAt(i);
        cardText = new TextDecoder().decode(bytesArr);
      } catch {}
    }
    if (!cardText) {
      window.toastr?.error?.('card.json 读取失败');
      return false;
    }
    const card = JSON.parse(cardText);
    const avatarFile = String(card?.contact?.avatarFile || '').trim();
    let avatarDataUrl = String(card?.contact?.avatarDataUrl || '').trim();
    if (!avatarDataUrl && avatarFile) {
      const asset = files.find(f => String(f?.name || '') === avatarFile);
      const base64 = String(asset?.base64 || '');
      if (base64) {
        const mime = inferMimeFromName(avatarFile);
        avatarDataUrl = `data:${mime};base64,${base64}`;
      }
    }
    return this.importCardData(card, { avatarDataUrl });
  }

  async importFromCardJson(text) {
    if (!text) return false;
    const card = JSON.parse(String(text || '{}'));
    return this.importCardData(card, {});
  }

  async importCardData(card, { avatarDataUrl = '' } = {}) {
    const fmt = String(card?.format || '').trim();
    if (!fmt.startsWith('chatapp.card')) {
      window.toastr?.error?.('不支持的角色卡格式');
      return false;
    }
    const ok = await appConfirm({
      title: '导入角色卡',
      message: '将创建新联系人并导入变量/世界书/正则等配置。',
      confirmText: '导入',
      cancelText: '取消',
    });
    if (!ok) return false;

    const baseName = String(card?.contact?.name || card?.contact?.id || '角色').trim() || '角色';
    const newId = this.getUniqueSessionId(baseName);
    const newName = String(card?.contact?.name || newId).trim() || newId;
    const contactPayload = {
      id: newId,
      name: newName,
      avatar: avatarDataUrl || '',
      isGroup: false,
      addedAt: Date.now(),
      labels: ensureArray(card?.contact?.labels).map(String),
      description: String(card?.contact?.description || ''),
      source: 'character_card',
      isUserCreated: true,
    };
    this.contactsStore?.upsertContact?.(contactPayload);
    try {
      if (typeof this.chatStore?._ensureSession === 'function') {
        this.chatStore._ensureSession(newId);
        this.chatStore._persist?.();
      } else {
        const prev = this.chatStore?.getCurrent?.();
        this.chatStore?.switchSession?.(newId);
        if (prev && prev !== newId) {
          this.chatStore?.switchSession?.(prev);
        }
      }
    } catch {}

    const schemas = card?.variables?.schemas || {};
    const values = card?.variables?.values || {};
    const rules = card?.variables?.rules || [];
    Object.entries(schemas).forEach(([key, schema]) => {
      this.chatStore?.setVariableSchema?.(key, schema, newId);
    });
    Object.entries(values).forEach(([key, value]) => {
      this.chatStore?.setVariable?.(key, value, newId);
    });
    if (Array.isArray(rules)) {
      this.chatStore?.setVariableRules?.(rules, newId);
    }

    const worldbooks = card?.worldbooks || {};
    const worldIdMap = {};
    for (const [rawId, data] of Object.entries(worldbooks)) {
      const original = String(rawId || '').trim();
      if (!original || original === BUILTIN_PHONE_FORMAT_WORLDBOOK_ID) continue;
      let nextId = original;
      const existing = this.appBridge?.worldStore?.load?.(nextId);
      if (existing) {
        let idx = 1;
        while (this.appBridge?.worldStore?.load?.(`${original}-${idx}`)) idx += 1;
        nextId = `${original}-${idx}`;
      }
      worldIdMap[original] = nextId;
      try {
        const payload = { ...(data || {}), name: String(data?.name || nextId) };
        await this.appBridge?.saveWorldInfo?.(nextId, payload);
      } catch (err) {
        logger.warn('import worldbook failed', err);
      }
    }
    const rawWorldIds = ensureArray(card?.session?.worldIds);
    const mappedWorldIds = rawWorldIds
      .map(id => worldIdMap[String(id || '').trim()] || String(id || '').trim())
      .filter(Boolean)
      .filter(id => Boolean(this.appBridge?.worldStore?.load?.(id) || worldIdMap[id]));
    if (mappedWorldIds.length) {
      this.appBridge?.setSessionWorldIds?.(newId, mappedWorldIds, { silent: true });
    }

    try {
      const regexStore = this.appBridge?.regex;
      if (regexStore) {
        const localSets = ensureArray(card?.regex?.localSets);
        for (const set of localSets) {
          if (!set) continue;
          let bind = set.bind || null;
          if (bind?.type === 'world') {
            const mapped = worldIdMap[String(bind.worldId || '').trim()] || bind.worldId;
            bind = { ...bind, worldId: mapped };
          }
          await regexStore.upsertLocalSet({
            id: undefined,
            name: set.name,
            enabled: set.enabled !== false,
            bind,
            rules: ensureArray(set.rules),
          });
        }
        if (card?.regex?.session) {
          await regexStore.setSession(newId, card.regex.session);
        }
      }
    } catch (err) {
      logger.warn('import regex failed', err);
    }

    try {
      await this.applyMemorySnapshot(newId, card?.memory, { isGroup: false });
    } catch (err) {
      logger.warn('import memory snapshot failed', err);
    }

    const go = await appConfirm({
      title: '导入完成',
      message: `已导入角色卡：${newName}。是否切换到该联系人？`,
      confirmText: '切换',
      cancelText: '稍后',
    });
    if (go) {
      this.chatStore?.switchSession?.(newId);
      this.appBridge?.setActiveSession?.(newId);
    }
    window.toastr?.success?.('角色卡导入完成');
    return true;
  }
}
