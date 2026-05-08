const WORLD_VARIABLE_EDITABLE_TYPE_SET = new Set(['number', 'string', 'boolean']);
const WORLD_VARIABLE_DISPLAY_TYPE_SET = new Set(['number', 'string', 'boolean', 'enum', 'array', 'object']);

const getDefaultBridge = () => {
    if (typeof window !== 'undefined') return window.appBridge || null;
    return globalThis?.window?.appBridge || null;
};

const normalizeEditableWorldVariableType = (rawType = 'number', fallback = 'number') => {
    const type = String(rawType || '').trim().toLowerCase();
    return WORLD_VARIABLE_EDITABLE_TYPE_SET.has(type) ? type : fallback;
};

const normalizeKeyList = (source = {}) => Object.keys(source || {})
    .map(key => String(key || '').trim())
    .filter(Boolean);

export const normalizeWorldVariableType = (rawType = '', value = undefined) => {
    const typeText = String(rawType || '').trim().toLowerCase();
    if (WORLD_VARIABLE_DISPLAY_TYPE_SET.has(typeText)) return typeText;
    if (Array.isArray(value)) return 'array';
    if (value && typeof value === 'object') return 'object';
    if (typeof value === 'number') return 'number';
    if (typeof value === 'boolean') return 'boolean';
    return 'string';
};

export const isWorldVariableEditableType = (type = 'string') => (
    WORLD_VARIABLE_EDITABLE_TYPE_SET.has(String(type || '').trim().toLowerCase())
);

export const resolveWorldVariableSessionContext = (options = {}) => {
    const hasBridge = Object.prototype.hasOwnProperty.call(options || {}, 'bridge');
    const bridge = hasBridge ? options.bridge : getDefaultBridge();
    const chatStore = options?.chatStore || bridge?.chatStore || null;
    const sessionId = String(
        options?.sessionId
        || chatStore?.getCurrent?.()
        || bridge?.getActiveSessionId?.()
        || '',
    ).trim();
    const sharedVariables = typeof options?.sharedVariables === 'boolean'
        ? options.sharedVariables
        : Boolean(
            sessionId
            && typeof bridge?.isSharedVariableSession === 'function'
            && bridge.isSharedVariableSession(sessionId),
        );
    return {
        bridge,
        chatStore,
        sessionId,
        sharedVariables,
        available: Boolean(chatStore && sessionId),
    };
};

export const buildWorldVariableRecords = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        sharedVariables = false,
        scope = 'current',
        searchTerm = '',
        recentIds = [],
    } = options || {};
    const sid = String(sessionId || '').trim();
    if (!chatStore || !sid) return [];
    const localVars = chatStore?.listVariables?.(sid) || {};
    const globalVars = chatStore?.listGlobalVariables?.() || {};
    const initialVars = chatStore?.listInitialVariables?.(sid) || {};
    const schemas = chatStore?.listVariableSchemas?.(sid) || {};
    const query = String(searchTerm || '').trim().toLowerCase();
    const normalizedScope = String(scope || 'current').trim().toLowerCase();
    const recentMarkers = Array.isArray(recentIds) ? recentIds : [];
    const getRecentIndex = (item) => {
        const idIndex = recentMarkers.indexOf(item.id);
        if (idIndex >= 0) return idIndex;
        return recentMarkers.indexOf(item.name);
    };
    const isRecentRecord = (item) => getRecentIndex(item) >= 0;
    const buildRecords = (sourceName, sourceVars = {}, { schemasMap = {}, includeInitial = false, includeSchemaKeys = true } = {}) => {
        const keys = new Set([
            ...normalizeKeyList(sourceVars),
            ...(includeSchemaKeys ? normalizeKeyList(schemasMap) : []),
            ...(includeInitial ? normalizeKeyList(initialVars) : []),
        ]);
        return [...keys].map((key) => {
            const schema = schemasMap[key] || null;
            const type = normalizeWorldVariableType(schema?.type, sourceVars[key]);
            return {
                id: `${sourceName}:${key}`,
                name: key,
                type,
                source: sourceName,
                currentValue: sourceVars[key],
                defaultValue: schema?.default,
                initialValue: includeInitial ? initialVars[key] : undefined,
                schema,
            };
        });
    };
    const sessionRecords = buildRecords('session', localVars, { schemasMap: schemas, includeInitial: true, includeSchemaKeys: true });
    const globalRecords = buildRecords('global', globalVars, { schemasMap: {}, includeInitial: false, includeSchemaKeys: false });
    let records = [];
    if (normalizedScope === 'global') records = globalRecords;
    else if (normalizedScope === 'session') records = sessionRecords;
    else if (normalizedScope === 'recent') records = [...sessionRecords, ...globalRecords].filter(isRecentRecord);
    else records = sharedVariables ? globalRecords : sessionRecords;
    records = records.filter((item) => {
        if (!query) return true;
        const haystack = [
            item.name,
            item.type,
            item.source === 'global' ? '全局' : '会话',
        ].join(' ').toLowerCase();
        return haystack.includes(query);
    });
    records.sort((a, b) => {
        const recentDelta = getRecentIndex(a) - getRecentIndex(b);
        const aRecent = isRecentRecord(a);
        const bRecent = isRecentRecord(b);
        if (aRecent && bRecent && recentDelta !== 0) return recentDelta;
        if (aRecent !== bRecent) return aRecent ? -1 : 1;
        const nameDelta = a.name.localeCompare(b.name, 'zh-CN');
        if (nameDelta !== 0) return nameDelta;
        return a.source.localeCompare(b.source, 'zh-CN');
    });
    return records.map((item) => {
        const schema = item.schema || null;
        const type = normalizeWorldVariableType(item.type || schema?.type || 'string', item.currentValue);
        return {
            ...item,
            type,
        };
    });
};

export const getWorldVariableOptions = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        sharedVariables = false,
    } = options || {};
    const sid = String(sessionId || '').trim();
    if (!chatStore || !sid) return [];
    const vars = sharedVariables
        ? (chatStore?.listGlobalVariables?.() || {})
        : (chatStore?.listVariables?.(sid) || {});
    const schemas = chatStore?.listVariableSchemas?.(sid) || {};
    const keys = new Set([
        ...normalizeKeyList(vars),
        ...normalizeKeyList(schemas),
    ]);
    return [...keys].sort((a, b) => a.localeCompare(b, 'zh-CN')).map((key) => ({
        value: key,
        label: key,
    }));
};

export const ensureWorldVariableInStore = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        sharedVariables = false,
        name = '',
        type = 'number',
        defaultValue = 0,
        source = null,
    } = options || {};
    const key = String(name || '').trim();
    const sid = String(sessionId || '').trim();
    if (!key || !chatStore || !sid) return false;
    const varType = normalizeEditableWorldVariableType(type, 'number');
    const preferredSource = ['global', 'session'].includes(String(source || '').trim().toLowerCase())
        ? String(source).trim().toLowerCase()
        : null;
    const useGlobal = preferredSource ? preferredSource === 'global' : Boolean(sharedVariables);
    chatStore.setVariableSchema?.(key, { type: varType, default: defaultValue }, sid);
    if (useGlobal) {
        const current = chatStore.getGlobalVariable?.(key);
        if (current === undefined || current === null) {
            chatStore.setGlobalVariable?.(key, defaultValue);
        }
    } else {
        const current = chatStore.getVariable?.(key, sid);
        if (current === undefined || current === null) {
            chatStore.setVariable?.(key, defaultValue, sid);
        }
        if (chatStore.getInitialVariable?.(key, sid) === undefined) {
            chatStore.setInitialVariable?.(key, defaultValue, sid);
        }
    }
    return true;
};

export const createWorldVariableInStore = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        sharedVariables = false,
        payload = null,
        source = null,
    } = options || {};
    const item = payload && typeof payload === 'object' ? payload : {};
    const key = String(item.name || '').trim();
    const sid = String(sessionId || '').trim();
    if (!key || !chatStore || !sid) return false;
    const targetSource = ['global', 'session'].includes(String(source || '').trim().toLowerCase())
        ? String(source).trim().toLowerCase()
        : null;
    if (targetSource === 'global') {
        chatStore.setGlobalVariable?.(key, item.defaultValue);
        return true;
    }
    return ensureWorldVariableInStore({
        chatStore,
        sessionId: sid,
        sharedVariables,
        name: key,
        type: item.type,
        defaultValue: item.defaultValue,
        source: targetSource,
    });
};

export const deleteWorldVariableDraft = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        draft = null,
    } = options || {};
    const sid = String(sessionId || '').trim();
    const name = String(draft?.name || '').trim();
    if (!chatStore || !sid || !name) return false;
    if (draft?.source === 'global') {
        chatStore.deleteGlobalVariable?.(name);
    } else {
        chatStore.deleteVariable?.(name, sid);
        chatStore.deleteInitialVariable?.(name, sid);
        chatStore.deleteVariableSchema?.(name, sid);
    }
    return true;
};

export const saveWorldVariableDraft = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        draft = null,
        currentValueText = '',
        defaultValueText = '',
        initialValueText = '',
        parseTypedValue = value => value,
    } = options || {};
    const sid = String(sessionId || '').trim();
    const name = String(draft?.name || '').trim();
    if (!chatStore || !sid || !name || !isWorldVariableEditableType(draft?.type)) return false;
    draft.currentValueText = String(currentValueText || '');
    draft.defaultValueText = String(defaultValueText || '');
    draft.initialValueText = String(initialValueText || '');
    const type = normalizeEditableWorldVariableType(draft.type, 'string');
    const defaultValue = parseTypedValue(draft.defaultValueText, type);
    const currentValue = parseTypedValue(draft.currentValueText, type);
    const initialValue = parseTypedValue(draft.initialValueText, type);
    if (draft.source === 'global') {
        chatStore.setGlobalVariable?.(name, currentValue);
    } else {
        chatStore.setVariableSchema?.(name, { type, default: defaultValue }, sid);
        chatStore.setVariable?.(name, currentValue, sid);
        chatStore.setInitialVariable?.(name, initialValue, sid);
    }
    return true;
};

const buildFallbackVariableContext = ({ baseVars = {}, globalVars = {} } = {}) => {
    const variableContext = {
        ...baseVars,
        global_variables: { ...globalVars },
        local_variables: { ...baseVars },
    };
    return {
        baseVars,
        globalVars,
        localVars: baseVars,
        variableContext,
        resolvePathValue: path => variableContext[String(path || '').trim()],
    };
};

export const buildWorldConditionVariableRuntimeContext = (options = {}) => {
    const {
        chatStore = null,
        sessionId = '',
        sharedVariables = false,
        buildVariableContext = buildFallbackVariableContext,
    } = options || {};
    const sid = String(sessionId || '').trim();
    const buildContext = typeof buildVariableContext === 'function'
        ? buildVariableContext
        : buildFallbackVariableContext;
    if (!chatStore || !sid) {
        return buildContext({ baseVars: {}, globalVars: {} });
    }
    const localVars = chatStore?.listVariables?.(sid) || {};
    const globalVars = chatStore?.listGlobalVariables?.() || {};
    const baseVars = sharedVariables ? globalVars : localVars;
    const runtimeContext = buildContext({ baseVars, globalVars });
    if (!runtimeContext.variableContext || typeof runtimeContext.variableContext !== 'object') {
        runtimeContext.variableContext = {};
    }
    runtimeContext.variableContext.local_variables = localVars;
    return runtimeContext;
};
