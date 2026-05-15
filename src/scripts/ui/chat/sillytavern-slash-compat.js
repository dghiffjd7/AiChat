import {
  mergeRichCompatInputText,
  parseRichCompatSlashCommand,
  splitRichCompatSlashPipeline,
} from './rich-input-compat.js';

const PROMPT_HIDDEN_META_KEY = 'hiddenFromRpPrompt';

const toStringValue = value => {
  if (value === null || value === undefined) return '';
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
};

const toNumberValue = value => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const hasOwn = (obj, key) => Object.prototype.hasOwnProperty.call(obj || {}, key);

const normalizeKey = value => String(value ?? '').trim();

const parseIndexRange = (token, maxIndex) => {
  const upper = Number.isFinite(maxIndex) ? Number(maxIndex) : -1;
  if (upper < 0) return null;
  const raw = String(token || '').trim();
  if (!raw) return { start: upper, end: upper };
  const single = raw.match(/^(\d+)$/);
  if (single) {
    const index = Number(single[1]);
    if (!Number.isFinite(index) || index < 0 || index > upper) return null;
    return { start: index, end: index };
  }
  const range = raw.match(/^(\d+)\s*-\s*(\d+)$/);
  if (!range) return null;
  const start = Number(range[1]);
  const end = Number(range[2]);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null;
  if (start < 0 || end < 0 || start > end || end > upper) return null;
  return { start, end };
};

const parseBoolish = value => {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return false;
  return raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on';
};

const parseListValue = value => String(value ?? '')
  .split(/[,，]/)
  .map(item => item.trim())
  .filter(Boolean);

const normalizeWorldFieldValue = (field, value) => {
  const key = String(field || '').trim();
  if (key === 'key' || key === 'keys' || key === 'keysecondary' || key === 'secondary') {
    return parseListValue(value);
  }
  if (
    key === 'constant' ||
    key === 'disable' ||
    key === 'excludeRecursion' ||
    key === 'groupOverride' ||
    key === 'useGroupScoring' ||
    key === 'caseSensitive' ||
    key === 'matchWholeWords' ||
    key === 'vectorized'
  ) {
    return parseBoolish(value);
  }
  if (
    key === 'order' ||
    key === 'priority' ||
    key === 'probability' ||
    key === 'depth' ||
    key === 'position' ||
    key === 'role' ||
    key === 'scanDepth' ||
    key === 'groupWeight' ||
    key === 'selectiveLogic'
  ) {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
  }
  return String(value ?? '');
};

const readWorldFieldValue = (entry, field) => {
  const key = String(field || 'content').trim() || 'content';
  const value = entry?.[key];
  if (Array.isArray(value)) return value.join(',');
  return toStringValue(value);
};

const entryMatchesUid = (entry, rawUid) => {
  const uid = String(rawUid ?? '').trim();
  if (!uid) return false;
  return String(entry?.uid ?? '').trim() === uid || String(entry?.id ?? '').trim() === uid;
};

const pickMessageText = message => {
  if (!message) return '';
  if (typeof message.raw === 'string' && message.raw) return message.raw;
  if (typeof message.content === 'string') return message.content;
  return '';
};

const getConversationMessages = (chatStore, sessionId) => {
  const messages = chatStore?.getMessages?.(sessionId) || [];
  return messages.filter(message =>
    message &&
    message.status !== 'pending' &&
    message.status !== 'sending' &&
    (message.role === 'user' || message.role === 'assistant' || message.role === 'system') &&
    message?.meta?.[PROMPT_HIDDEN_META_KEY] !== true
  );
};

export const createSillyTavernSlashCompat = ({
  appBridge = null,
  getChatUI = null,
  getChatStore = null,
  logger = console,
  getWindow = () => (typeof window !== 'undefined' ? window : null),
  getDocument = () => (typeof document !== 'undefined' ? document : null),
  getToastr = () => null,
} = {}) => {
  const state = {
    pipe: '',
    sysName: 'System',
  };

  const getBridge = () => appBridge || getWindow()?.appBridge || null;
  const getStore = () => getChatStore?.(getBridge()) || getBridge()?.getChatStore?.() || null;
  const getSessionId = () => {
    const bridge = getBridge();
    const store = getStore();
    return String(store?.getCurrent?.() || bridge?.getActiveSessionId?.() || 'default').trim() || 'default';
  };
  const getUi = () => {
    const bridge = getBridge();
    return getChatUI?.(bridge) || bridge?.getChatUI?.() || null;
  };
  const getInputEl = () => getUi()?.inputEl || getDocument()?.getElementById?.('composer-input');
  const getSendButton = () => getUi()?.sendBtn || getDocument()?.getElementById?.('send-button');
  const getToaster = () => getToastr?.() || getWindow()?.toastr || null;

  const resolveVar = (key, { global = false } = {}) => {
    const name = normalizeKey(key);
    if (!name) return undefined;
    const store = getStore();
    return global
      ? store?.getGlobalVariable?.(name)
      : store?.getVariable?.(name, getSessionId());
  };

  const setVar = (key, value, { global = false } = {}) => {
    const name = normalizeKey(key);
    if (!name) return false;
    const store = getStore();
    return global
      ? Boolean(store?.setGlobalVariable?.(name, value))
      : Boolean(store?.setVariable?.(name, value, getSessionId()));
  };

  const deleteVar = (key, { global = false } = {}) => {
    const name = normalizeKey(key);
    if (!name) return false;
    const store = getStore();
    return global
      ? Boolean(store?.deleteGlobalVariable?.(name))
      : Boolean(store?.deleteVariable?.(name, getSessionId()));
  };

  const resolveVariableRef = (value) => {
    const token = normalizeKey(value);
    if (!token) return '';
    const local = resolveVar(token);
    if (local !== undefined) return toStringValue(local);
    const global = resolveVar(token, { global: true });
    if (global !== undefined) return toStringValue(global);
    return token;
  };

  const getVariableKey = parsed =>
    normalizeKey(parsed?.named?.key || parsed?.positional?.[0] || parsed?.text || state.pipe);

  const getVariableValue = (parsed, { keyWasNamed = false } = {}) => {
    if (hasOwn(parsed?.named, 'value')) return String(parsed.named.value ?? '');
    if (keyWasNamed) return parsed?.text ? String(parsed.text) : state.pipe;
    const rest = Array.isArray(parsed?.positional) ? parsed.positional.slice(1).join(' ') : '';
    return rest || state.pipe;
  };

  const expandMacros = (text = '') => {
    const bridge = getBridge();
    const store = getStore();
    const sid = getSessionId();
    const messages = store?.getMessages?.(sid) || [];
    const lastMessage = messages.length ? messages[messages.length - 1] : null;
    let output = String(text ?? '');
    output = output.replace(/\{\{\s*pipe\s*\}\}/gi, () => state.pipe);
    output = output.replace(/\{\{\s*newline\s*\}\}/gi, '\n');
    output = output.replace(/\{\{\s*lastMessageId\s*\}\}/gi, () => String(Math.max(0, messages.length - 1)));
    output = output.replace(/\{\{\s*lastMessage\s*\}\}/gi, () => pickMessageText(lastMessage));
    output = output.replace(/\{\{\s*getglobalvar::([^}:]+)(?:::([^}]*))?\s*\}\}/gi, (_m, key, fallback = '') => {
      const value = resolveVar(key, { global: true });
      return value === undefined || value === null ? String(fallback || '') : toStringValue(value);
    });
    output = output.replace(/\{\{\s*(?:getvar|var)::([^}:]+)(?:::([^}]*))?\s*\}\}/gi, (_m, key, fallback = '') => {
      const value = resolveVar(key);
      return value === undefined || value === null ? String(fallback || '') : toStringValue(value);
    });
    try {
      if (typeof bridge?.processTextMacros === 'function') {
        output = bridge.processTextMacros(output, {
          sessionId: sid,
          useGlobalVariables: false,
          uiMode: 'chat',
          pipe: state.pipe,
        });
      }
    } catch (err) {
      logger?.debug?.('[slash-compat] macro expansion failed', err);
    }
    output = output.replace(/\{\{\s*pipe\s*\}\}/gi, () => state.pipe);
    return output;
  };

  const applyInputText = (text, options = {}) => {
    const ui = getUi();
    const inputEl = getInputEl();
    if (!inputEl) return false;
    const current = String(inputEl.value || '');
    const next = mergeRichCompatInputText(current, text || state.pipe, options);
    if (typeof ui?.setInputText === 'function') ui.setInputText(next);
    else inputEl.value = next;
    try {
      inputEl.setSelectionRange(next.length, next.length);
    } catch {}
    try {
      inputEl.dispatchEvent(new Event('input', { bubbles: true }));
    } catch {}
    if (options?.focus !== false) {
      try {
        inputEl.focus();
      } catch {}
    }
    return true;
  };

  const appendMessage = async (role, text, options = {}) => {
    const bridge = getBridge();
    const value = String(text ?? '');
    try {
      if (typeof bridge?.sendMessageFromPlugin === 'function') {
        await bridge.sendMessageFromPlugin(value, {
          role,
          silent: true,
          skipInputRegex: options.skipInputRegex === true,
          name: options.name,
          type: options.type,
          meta: options.meta,
        });
        return true;
      }
    } catch (err) {
      logger?.warn?.('[slash-compat] append message failed', err);
      return false;
    }
    if (role === 'user') return applyInputText(value, { mode: 'replace' });
    return false;
  };

  const triggerGeneration = async () => {
    const ui = getUi();
    if (ui?.isSending || ui?.isStreaming) return false;
    const bridge = getBridge();
    try {
      if (typeof bridge?.triggerAssistantFromSlash === 'function') {
        return Boolean(await bridge.triggerAssistantFromSlash());
      }
    } catch (err) {
      logger?.warn?.('[slash-compat] /trigger failed', err);
      return false;
    }
    const inputEl = getInputEl();
    if (!String(inputEl?.value || '').trim()) return false;
    try {
      getSendButton()?.click?.();
      return true;
    } catch {
      return false;
    }
  };

  const showInfo = (text, { alert = false } = {}) => {
    const value = String(text ?? state.pipe).trim();
    if (!value) return true;
    try {
      if (alert && typeof getWindow()?.alert === 'function') getWindow().alert(value);
      else getToaster()?.info?.(value, { timeOut: 1800 });
    } catch {}
    logger?.info?.('[slash-compat] echo', value);
    return true;
  };

  const chooseFromButtons = (parsed) => {
    const labelsRaw = parsed?.named?.labels || parsed?.named?.label || '';
    let labels = [];
    const fromVar = labelsRaw ? resolveVariableRef(labelsRaw) : '';
    try {
      const parsedLabels = JSON.parse(fromVar);
      if (Array.isArray(parsedLabels)) labels = parsedLabels.map(item => String(item));
    } catch {}
    if (!labels.length) labels = parseListValue(fromVar);
    const question = parsed?.text || 'Choose an option';
    const promptText = labels.length ? `${question}\n${labels.map((item, idx) => `${idx + 1}. ${item}`).join('\n')}` : question;
    const answer = getWindow()?.prompt?.(promptText, labels[0] || '') ?? '';
    const numeric = Number(answer);
    if (Number.isInteger(numeric) && numeric >= 1 && numeric <= labels.length) {
      state.pipe = labels[numeric - 1];
    } else {
      state.pipe = String(answer || '');
    }
    return true;
  };

  const runVariableCommand = (parsed, { global = false, op = 'get' } = {}) => {
    const keyWasNamed = hasOwn(parsed?.named, 'key');
    const key = getVariableKey(parsed);
    if (!key) return false;
    if (op === 'get') {
      state.pipe = toStringValue(resolveVar(key, { global }) ?? '');
      return true;
    }
    if (op === 'flush') {
      deleteVar(key, { global });
      state.pipe = '';
      return true;
    }
    const current = resolveVar(key, { global });
    const rawValue = getVariableValue(parsed, { keyWasNamed });
    if (op === 'set') {
      setVar(key, rawValue, { global });
      state.pipe = toStringValue(rawValue);
      return true;
    }
    if (op === 'add') {
      const left = toNumberValue(current);
      const right = toNumberValue(rawValue);
      const next = left !== null && right !== null
        ? String(left + right)
        : `${toStringValue(current)}${String(rawValue ?? '')}`;
      setVar(key, next, { global });
      state.pipe = next;
      return true;
    }
    if (op === 'inc' || op === 'dec') {
      const stepRaw = rawValue || '1';
      const step = toNumberValue(stepRaw) ?? 1;
      const base = toNumberValue(current) ?? 0;
      const next = String(op === 'inc' ? base + step : base - step);
      setVar(key, next, { global });
      state.pipe = next;
      return true;
    }
    return false;
  };

  const resolveNumberOperand = token => {
    const raw = String(token ?? '').trim();
    if (!raw) return 0;
    const local = resolveVar(raw);
    const global = local === undefined ? resolveVar(raw, { global: true }) : undefined;
    const resolved = local !== undefined ? local : (global !== undefined ? global : raw);
    const n = Number(resolved);
    return Number.isFinite(n) ? n : 0;
  };

  const runMathCommand = (parsed) => {
    const name = parsed.name;
    const operands = parsed.positional?.length
      ? parsed.positional.map(resolveNumberOperand)
      : (state.pipe ? [resolveNumberOperand(state.pipe)] : []);
    if (name === 'rand') {
      const from = Number(parsed.named?.from ?? (operands.length >= 2 ? operands[0] : 0));
      const to = Number(parsed.named?.to ?? (operands.length >= 1 ? operands[operands.length - 1] : 1));
      const low = Number.isFinite(from) ? from : 0;
      const high = Number.isFinite(to) ? to : 1;
      let value = low + Math.random() * (high - low);
      const round = String(parsed.named?.round || '').toLowerCase();
      if (round === 'ceil') value = Math.ceil(value);
      else if (round === 'floor') value = Math.floor(value);
      else if (round === 'round') value = Math.round(value);
      state.pipe = String(value);
      return true;
    }
    if (!operands.length) return false;
    let result = operands[0];
    if (name === 'add') result = operands.reduce((sum, item) => sum + item, 0);
    else if (name === 'mul') result = operands.reduce((product, item) => product * item, 1);
    else if (name === 'sub') result = operands.length >= 2 ? operands[0] - operands[1] : -operands[0];
    else if (name === 'div') result = operands.length >= 2 && operands[1] !== 0 ? operands[0] / operands[1] : 0;
    else if (name === 'mod') result = operands.length >= 2 && operands[1] !== 0 ? operands[0] % operands[1] : 0;
    else if (name === 'pow') result = operands.length >= 2 ? operands[0] ** operands[1] : operands[0];
    else if (name === 'min') result = Math.min(...operands);
    else if (name === 'max') result = Math.max(...operands);
    else if (name === 'round') result = Math.round(operands[0]);
    else if (name === 'abs') result = Math.abs(operands[0]);
    if (!Number.isFinite(result)) result = 0;
    state.pipe = String(result);
    return true;
  };

  const runMessagesCommand = (parsed) => {
    const store = getStore();
    const sid = getSessionId();
    const messages = getConversationMessages(store, sid);
    const range = parseIndexRange(parsed.text || state.pipe, messages.length - 1);
    if (!range) {
      state.pipe = '';
      return true;
    }
    const includeNames = String(parsed.named?.names || 'on').toLowerCase() !== 'off';
    state.pipe = messages.slice(range.start, range.end + 1).map((message) => {
      const text = pickMessageText(message);
      if (!includeNames) return text;
      const name = String(message.name || (message.role === 'user' ? 'User' : 'Assistant')).trim();
      return name ? `${name}: ${text}` : text;
    }).join('\n');
    return true;
  };

  const runHideCommand = (parsed, hidden) => {
    const store = getStore();
    const sid = getSessionId();
    const messages = (store?.getMessages?.(sid) || []).filter(message =>
      message && (message.role === 'user' || message.role === 'assistant')
    );
    const range = parseIndexRange(parsed.text || state.pipe, messages.length - 1);
    if (!range) return false;
    let changed = 0;
    for (let index = range.start; index <= range.end; index += 1) {
      const target = messages[index];
      if (!target?.id) continue;
      const meta = target.meta && typeof target.meta === 'object' ? { ...target.meta } : {};
      if (Boolean(meta[PROMPT_HIDDEN_META_KEY]) === hidden) continue;
      meta[PROMPT_HIDDEN_META_KEY] = hidden;
      store?.updateMessage?.(target.id, { meta }, sid);
      changed += 1;
    }
    if (changed) {
      try {
        getWindow()?.dispatchEvent?.(new CustomEvent('session-changed', { detail: { id: sid } }));
      } catch {}
    }
    return true;
  };

  const getWorld = async (worldId) => {
    const bridge = getBridge();
    const id = normalizeKey(resolveVariableRef(worldId));
    if (!id) return null;
    try {
      if (typeof bridge?.waitForWorldStoreReady === 'function') await bridge.waitForWorldStoreReady();
      return bridge?.loadStoredWorldInfo?.(id) || await bridge?.getWorldInfo?.(id) || null;
    } catch (err) {
      logger?.warn?.('[slash-compat] world load failed', err);
      return null;
    }
  };

  const saveWorld = async (worldId, world) => {
    const bridge = getBridge();
    const id = normalizeKey(resolveVariableRef(worldId));
    if (!id || typeof bridge?.saveWorldInfo !== 'function') return false;
    await bridge.saveWorldInfo(id, { name: id, entries: [], ...(world || {}) });
    return true;
  };

  const runWorldCommand = async (parsed) => {
    const bridge = getBridge();
    if (parsed.name === 'getchatbook') {
      let id = normalizeKey(bridge?.getCurrentWorldId?.() || bridge?.getWorldForSession?.(getSessionId()) || '');
      if (!id) {
        id = `chatbook_${getSessionId().replace(/[^A-Za-z0-9_-]+/g, '_') || 'default'}`;
        await saveWorld(id, { name: id, entries: [] });
        bridge?.setCurrentWorld?.(id, getSessionId());
      }
      state.pipe = id;
      return true;
    }
    const file = normalizeKey(parsed.named?.file || state.pipe);
    const world = await getWorld(file);
    if (!world || typeof world !== 'object') {
      state.pipe = '';
      return true;
    }
    const entries = Array.isArray(world.entries) ? [...world.entries] : [];
    if (parsed.name === 'findentry') {
      const field = String(parsed.named?.field || 'key').trim() || 'key';
      const needle = String(parsed.text || state.pipe || '').trim().toLowerCase();
      const found = entries.find((entry) => {
        const raw = readWorldFieldValue(entry, field).toLowerCase();
        return needle ? raw.includes(needle) : Boolean(raw);
      });
      state.pipe = found ? String(found.uid ?? found.id ?? '') : '';
      return true;
    }
    if (parsed.name === 'getentryfield') {
      const field = String(parsed.named?.field || 'content').trim() || 'content';
      const uid = resolveVariableRef(parsed.positional?.[0] || state.pipe);
      const entry = entries.find(item => entryMatchesUid(item, uid));
      state.pipe = entry ? readWorldFieldValue(entry, field) : '';
      return true;
    }
    if (parsed.name === 'setentryfield') {
      const field = String(parsed.named?.field || 'content').trim() || 'content';
      const uid = resolveVariableRef(parsed.named?.uid || parsed.positional?.[0] || state.pipe);
      const index = entries.findIndex(item => entryMatchesUid(item, uid));
      if (index < 0) {
        state.pipe = '';
        return true;
      }
      const value = parsed.text || state.pipe;
      const nextValue = normalizeWorldFieldValue(field, value);
      const updated = { ...(entries[index] || {}), [field]: nextValue };
      if (field === 'key' || field === 'keys') {
        updated.key = Array.isArray(nextValue) ? nextValue : parseListValue(nextValue);
        updated.triggers = updated.key;
      }
      if (field === 'keysecondary' || field === 'secondary') {
        updated.keysecondary = Array.isArray(nextValue) ? nextValue : parseListValue(nextValue);
        updated.secondary = updated.keysecondary;
      }
      entries[index] = updated;
      await saveWorld(file, { ...world, entries });
      state.pipe = toStringValue(value);
      return true;
    }
    if (parsed.name === 'createentry') {
      const key = parsed.named?.key || '';
      const maxUid = entries.reduce((max, entry) => {
        const n = Number(entry?.uid);
        return Number.isFinite(n) ? Math.max(max, n) : max;
      }, 0);
      const uid = maxUid + 1;
      entries.push({
        id: String(uid),
        uid,
        comment: key || `entry-${uid}`,
        title: key || `entry-${uid}`,
        content: parsed.text || '',
        key: key ? parseListValue(key) : [],
        triggers: key ? parseListValue(key) : [],
        keysecondary: [],
        secondary: [],
        order: 100,
        priority: 100,
        depth: 4,
        position: 0,
        disable: false,
        constant: false,
      });
      await saveWorld(file, { ...world, entries });
      state.pipe = String(uid);
      return true;
    }
    return false;
  };

  const runImageCommand = async (parsed) => {
    const prompt = parsed.text || state.pipe;
    if (!String(prompt || '').trim()) return false;
    const bridge = getBridge();
    if (typeof bridge?.generateImageFromSlash === 'function') {
      await bridge.generateImageFromSlash(prompt);
      return true;
    }
    logger?.debug?.('[slash-compat] image command ignored', parsed.name, prompt);
    return true;
  };

  const runParsedCommand = async (parsed) => {
    if (!parsed) return false;
    if (parsed.command === 'setinput') return applyInputText(parsed.text || state.pipe, parsed);
    if (parsed.command === 'input') {
      state.pipe = String(getWindow()?.prompt?.(parsed.text || '', state.pipe) ?? '');
      return true;
    }
    if (parsed.command === 'send') return appendMessage('user', parsed.text || state.pipe);
    if (parsed.command === 'sendas') {
      const name = String(parsed.named?.name || '').trim() || 'Assistant';
      return appendMessage('assistant', parsed.text || state.pipe, { name });
    }
    if (parsed.command === 'sys') {
      return appendMessage('system', parsed.text || state.pipe, { name: state.sysName, type: 'meta' });
    }
    if (parsed.command === 'comment') {
      return appendMessage('system', parsed.text || state.pipe, {
        name: 'Comment',
        type: 'meta',
        meta: { [PROMPT_HIDDEN_META_KEY]: true, stComment: true },
      });
    }
    if (parsed.command === 'trigger' || parsed.command === 'continue') return triggerGeneration();
    if (parsed.command === 'echo') {
      const text = parsed.text || state.pipe;
      showInfo(text);
      state.pipe = text;
      return true;
    }
    if (parsed.command === 'popup') {
      showInfo(parsed.text || state.pipe, { alert: parsed.named?.blocking === 'true' });
      return true;
    }
    if (parsed.command === 'buttons') return chooseFromButtons(parsed);
    if (parsed.command === 'sysname') {
      state.sysName = parsed.text || 'System';
      return true;
    }
    if (parsed.command === 'help') {
      state.pipe = 'Supported ST compatibility commands: send, sendas, sys, comment, trigger, setinput, input, echo, popup, buttons, variables, math, messages, hide, unhide, world info, imagine/sd.';
      showInfo(state.pipe);
      return true;
    }
    if (parsed.command === 'messages') return runMessagesCommand(parsed);
    if (parsed.command === 'hide') return runHideCommand(parsed, true);
    if (parsed.command === 'unhide') return runHideCommand(parsed, false);
    if (parsed.command === 'pass') {
      state.pipe = parsed.text || state.pipe;
      return true;
    }
    const varMap = {
      getvar: ['get', false],
      setvar: ['set', false],
      addvar: ['add', false],
      incvar: ['inc', false],
      decvar: ['dec', false],
      flushvar: ['flush', false],
      getglobalvar: ['get', true],
      setglobalvar: ['set', true],
      addglobalvar: ['add', true],
      incglobalvar: ['inc', true],
      decglobalvar: ['dec', true],
      flushglobalvar: ['flush', true],
    };
    if (varMap[parsed.name]) {
      const [op, global] = varMap[parsed.name];
      return runVariableCommand(parsed, { op, global });
    }
    if (['add', 'mul', 'sub', 'div', 'mod', 'pow', 'min', 'max', 'round', 'abs', 'rand'].includes(parsed.name)) {
      return runMathCommand(parsed);
    }
    if (['getchatbook', 'findentry', 'getentryfield', 'setentryfield', 'createentry'].includes(parsed.name)) {
      return runWorldCommand(parsed);
    }
    if (parsed.name === 'imagine' || parsed.name === 'sd') return runImageCommand(parsed);
    if (parsed.command === 'audio' || parsed.command === 'extension-noop') {
      logger?.debug?.('[slash-compat] extension command ignored', parsed.name, parsed.argsText);
      return true;
    }
    return false;
  };

  return async (command = '') => {
    const commands = splitRichCompatSlashPipeline(command);
    if (!commands.length) return false;
    let handled = false;
    for (const item of commands) {
      const expanded = expandMacros(item);
      const parsed = parseRichCompatSlashCommand(expanded);
      if (!parsed) {
        logger?.debug?.('[slash-compat] unsupported command', item);
        continue;
      }
      handled = (await runParsedCommand(parsed)) || handled;
    }
    return handled;
  };
};
