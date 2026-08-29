export function createSillyTavernMacroApi(options = {}) {
  const MacroEngineClass = options.MacroEngineClass;
  if (typeof MacroEngineClass !== 'function') {
    throw new TypeError('MacroEngineClass is required');
  }

  let writeDeniedWarningSent = false;
  const notifyWriteDenied = (scope = '', key = '') => {
    if (writeDeniedWarningSent) return;
    writeDeniedWarningSent = true;
    options.onWriteDenied?.(scope, key);
  };

  const readMessages = () => {
    if (options.canReadMessages?.() === false) return [];
    const messages = options.getMessages?.();
    if (!Array.isArray(messages)) return [];
    return messages.map((message) => {
      if (!message || typeof message !== 'object') return message;
      const content = Array.isArray(message.content)
        ? message.content
          .map(part => (part?.type === 'text' ? String(part.text || '') : ''))
          .filter(Boolean)
          .join('\n')
        : String(message.rawOriginal || message.rawSource || message.raw || message.content || message.mes || message.message || '');
      return { ...message, raw: content };
    });
  };
  const readVariables = (scope) => {
    const value = options.getVariables?.(scope);
    return value && typeof value === 'object' ? value : {};
  };
  const writeVariable = (scope, key, value) => {
    if (options.canWriteVariables?.() === false) {
      notifyWriteDenied(scope, key);
      return false;
    }
    return options.setVariable?.(scope, key, value) ?? false;
  };
  const store = {
    getMessages: readMessages,
    getVariable: key => readVariables('local')[key],
    setVariable: (key, value) => writeVariable('local', key, value),
    getGlobalVariable: key => readVariables('global')[key],
    setGlobalVariable: (key, value) => writeVariable('global', key, value),
  };
  const engine = new MacroEngineClass(store);

  const resolveMacroValues = (source) => {
    const entries = source instanceof Map
      ? Array.from(source.entries())
      : Object.entries(source && typeof source === 'object' ? source : {});
    const values = {};
    entries.forEach(([rawKey, rawValue]) => {
      const key = String(rawKey || '').trim();
      if (!key) return;
      try {
        const value = typeof rawValue === 'function' ? rawValue() : rawValue;
        if (value && typeof value.then === 'function') return;
        values[key] = value;
      } catch {}
    });
    return values;
  };

  function substituteParams(content, rawOptions = {}) {
    if (content === undefined || content === null || content === '') return '';
    const runtime = options.getRuntimeContext?.() || {};
    const canWriteVariables = options.canWriteVariables?.() !== false;
    if (canWriteVariables) {
      writeDeniedWarningSent = false;
    }
    const opts = rawOptions && typeof rawOptions === 'object' && !Array.isArray(rawOptions)
      ? rawOptions
      : {
        name1Override: rawOptions,
        name2Override: arguments[2],
        original: arguments[3],
        groupOverride: arguments[4],
        replaceCharacterCard: arguments[5],
        dynamicMacros: arguments[6],
        postProcessFn: arguments[7],
      };
    const registered = resolveMacroValues(options.getRegisteredMacros?.());
    const dynamic = resolveMacroValues(opts.dynamicMacros || {});
    const user = opts.name1Override ?? runtime.userName ?? runtime.name1 ?? runtime.user ?? 'User';
    const char = opts.name2Override ?? runtime.characterName ?? runtime.name2 ?? runtime.char ?? 'Assistant';
    const model = runtime.model
      ?? runtime.chatCompletionSettings?.model
      ?? runtime.activePreset?.model
      ?? '';
    const input = runtime.input ?? runtime.draft ?? '';
    const extraMacros = {
      ...registered,
      ...dynamic,
      ...(opts.original === undefined ? {} : { original: opts.original }),
    };
    return engine.process(String(content), {
      sessionId: String(runtime.sessionId || ''),
      uiMode: String(runtime.uiMode || ''),
      useGlobalVariables: runtime.sharedVariables === true || runtime.useGlobalVariables === true,
      variableRuntimeEnabled: runtime.variableRuntimeEnabled !== false,
      user,
      char,
      group: opts.groupOverride ?? runtime.group ?? '',
      model,
      input,
      extraMacros,
      macroPostProcess: typeof opts.postProcessFn === 'function' ? opts.postProcessFn : null,
      macroVariableState: canWriteVariables ? null : new Map(),
      onMacroVariableWrite: canWriteVariables ? null : notifyWriteDenied,
    });
  }

  function substituteParamsExtended(content, additionalMacro = {}, postProcessFn = value => value) {
    return substituteParams(content, { dynamicMacros: additionalMacro, postProcessFn });
  }

  function substitudeMacros(content) {
    return substituteParamsExtended(content);
  }

  return { substituteParams, substituteParamsExtended, substitudeMacros };
}
