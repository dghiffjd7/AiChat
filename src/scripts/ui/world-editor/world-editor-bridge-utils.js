const getDefaultBridge = () => {
    if (typeof window !== 'undefined') return window.appBridge || null;
    return globalThis?.window?.appBridge || null;
};

const bindBridgeMethod = (bridge, name) => (
    typeof bridge?.[name] === 'function' ? bridge[name].bind(bridge) : null
);

const cloneWorldValue = (value) => {
    try {
        return structuredClone(value);
    } catch {
        return JSON.parse(JSON.stringify(value ?? null));
    }
};

const getWorldEntryId = (entry) => String(entry?.id ?? entry?.uid ?? '').trim();

const resolveUniqueWorldEntryId = (candidate, usedIds) => {
    const base = String(candidate || '').trim() || `entry-${Date.now()}`;
    if (!usedIds.has(base)) return base;
    let suffix = 1;
    while (usedIds.has(`${base}_${suffix}`)) suffix += 1;
    return `${base}_${suffix}`;
};

export const buildWorldEntryTransferPlan = (options = {}) => {
    const {
        mode = '',
        sourceWorldId = '',
        targetWorldId = '',
        sourceData = null,
        targetData = null,
        entryId = '',
        entryIndex = -1,
        createEntryId = () => `entry-${Date.now()}`,
    } = options || {};
    const action = String(mode || '').trim().toLowerCase();
    if (action !== 'move' && action !== 'copy') return { ok: false, reason: 'invalid-mode' };
    const sourceId = String(sourceWorldId || '').trim();
    const targetId = String(targetWorldId || '').trim();
    if (!sourceId || !targetId) return { ok: false, reason: 'missing-world' };
    if (sourceId === targetId) return { ok: false, reason: 'same-world' };
    if (!sourceData || typeof sourceData !== 'object') return { ok: false, reason: 'source-missing' };
    if (!targetData || typeof targetData !== 'object') return { ok: false, reason: 'target-missing' };
    if (Array.isArray(targetData.refs) && targetData.refs.length) {
        return { ok: false, reason: 'target-reference-world' };
    }

    const sourceEntries = Array.isArray(sourceData.entries) ? sourceData.entries : [];
    const requestedEntryId = String(entryId || '').trim();
    let sourceEntryIndex = requestedEntryId
        ? sourceEntries.findIndex(entry => getWorldEntryId(entry) === requestedEntryId)
        : -1;
    if (!requestedEntryId
        && Number.isInteger(entryIndex)
        && entryIndex >= 0
        && entryIndex < sourceEntries.length) {
        sourceEntryIndex = entryIndex;
    }
    if (sourceEntryIndex < 0) return { ok: false, reason: 'entry-missing' };

    const sourceEntry = sourceEntries[sourceEntryIndex];
    const originalEntryId = getWorldEntryId(sourceEntry);
    const targetEntries = Array.isArray(targetData.entries) ? targetData.entries : [];
    const usedTargetIds = new Set(targetEntries.map(getWorldEntryId).filter(Boolean));
    const preferredEntryId = action === 'move' && originalEntryId && !usedTargetIds.has(originalEntryId)
        ? originalEntryId
        : createEntryId();
    const transferredEntryId = resolveUniqueWorldEntryId(preferredEntryId, usedTargetIds);
    const transferredEntry = cloneWorldValue(sourceEntry);
    transferredEntry.id = transferredEntryId;
    if (transferredEntryId !== originalEntryId && Object.prototype.hasOwnProperty.call(transferredEntry, 'uid')) {
        delete transferredEntry.uid;
    } else if (transferredEntry.uid == null && /^\d+$/.test(transferredEntryId)) {
        transferredEntry.uid = Number(transferredEntryId);
    }
    delete transferredEntry._refSourceId;
    delete transferredEntry._refWorldId;
    delete transferredEntry._refEntryId;
    delete transferredEntry._refEntryIndex;

    const nextSourceEntries = sourceEntries
        .filter((_, index) => action !== 'move' || index !== sourceEntryIndex)
        .map(entry => cloneWorldValue(entry));
    const nextTargetEntries = [
        ...targetEntries.map(entry => cloneWorldValue(entry)),
        transferredEntry,
    ];
    return {
        ok: true,
        mode: action,
        sourceWorldId: sourceId,
        targetWorldId: targetId,
        sourceEntryIndex,
        originalEntryId,
        transferredEntryId,
        transferredEntry,
        sourceData: { ...cloneWorldValue(sourceData), entries: nextSourceEntries },
        targetData: { ...cloneWorldValue(targetData), entries: nextTargetEntries },
    };
};

export const resolveWorldEditorBridgeContext = (options = {}) => {
    const hasBridge = Object.prototype.hasOwnProperty.call(options || {}, 'bridge');
    const bridge = hasBridge ? options.bridge : getDefaultBridge();
    return {
        bridge,
        worldStore: options?.worldStore || bridge?.worldStore || null,
        contactsStore: options?.contactsStore || bridge?.contactsStore || null,
        chatStore: options?.chatStore || bridge?.chatStore || null,
        regexStore: options?.regexStore || bridge?.regex || null,
        getWorldInfo: options?.getWorldInfo || bindBridgeMethod(bridge, 'getWorldInfo'),
        getWorldInfoSnapshot: options?.getWorldInfoSnapshot || bindBridgeMethod(bridge, 'getWorldInfoSnapshot'),
        saveWorldInfo: options?.saveWorldInfo || bindBridgeMethod(bridge, 'saveWorldInfo'),
        listWorlds: options?.listWorlds || bindBridgeMethod(bridge, 'listWorlds'),
        renameWorldInfo: options?.renameWorldInfo || bindBridgeMethod(bridge, 'renameWorldInfo'),
        bindWorldToSession: options?.bindWorldToSession || bindBridgeMethod(bridge, 'bindWorldToSession'),
        buildWorldDebugLabel: options?.buildWorldDebugLabel || bindBridgeMethod(bridge, 'buildWorldDebugLabel'),
        explainWorldEntryActivation: options?.explainWorldEntryActivation || bindBridgeMethod(bridge, 'explainWorldEntryActivation'),
    };
};

export const sanitizeWorldbookId = (value, { allowUnicode = false, fallback = 'worldbook' } = {}) => {
    const raw = String(value || '').trim();
    if (allowUnicode) return raw || fallback;
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_').slice(0, 48);
    return cleaned || fallback;
};

export const ensureUniqueWorldbookIdCore = async (options = {}) => {
    const {
        worldStore = null,
        baseName = '',
        allowUnicode = false,
        now = () => Date.now(),
    } = options || {};
    try {
        await worldStore?.ready;
    } catch {}
    const base = sanitizeWorldbookId(baseName, { allowUnicode, fallback: 'worldbook' });
    const exists = (id) => (
        typeof worldStore?.has === 'function'
            ? worldStore.has(id)
            : Boolean(worldStore?.load?.(id))
    );
    if (!exists(base)) return base;
    let idx = 1;
    while (idx < 9999) {
        const next = `${base}_${idx}`;
        if (!exists(next)) return next;
        idx += 1;
    }
    return `${base}_${now()}`;
};

export const resolveRefEntriesForDisplayCore = async (options = {}) => {
    const {
        refs = [],
        getWorldInfo = null,
    } = options || {};
    const list = Array.isArray(refs) ? refs : [];
    if (!list.length || typeof getWorldInfo !== 'function') return [];
    const results = [];
    const cache = new Map();
    for (const raw of list) {
        const ref = raw && typeof raw === 'object' ? raw : {};
        const sourceId = String(ref.sourceId || ref.worldId || ref.source || '').trim();
        if (!sourceId) continue;
        if (!cache.has(sourceId)) {
            let sourceData = null;
            try {
                sourceData = await getWorldInfo(sourceId);
            } catch {}
            cache.set(sourceId, sourceData || null);
        }
        const sourceData = cache.get(sourceId);
        const sourceEntries = Array.isArray(sourceData?.entries) ? sourceData.entries : [];
        if (!sourceEntries.length) continue;
        const entryIdRaw = String(ref.entryId || ref.entry || '').trim();
        const entryIds = Array.isArray(ref.entryIds)
            ? ref.entryIds.map(val => String(val || '').trim()).filter(Boolean)
            : [];
        const includeAll = ref.includeAll === true || ref.all === true || entryIdRaw === '*' || entryIds.includes('*');
        let picked = sourceEntries;
        if (!includeAll) {
            const idSet = new Set(entryIds);
            if (entryIdRaw) idSet.add(entryIdRaw);
            picked = idSet.size
                ? sourceEntries.filter(entry => idSet.has(String(entry?.id ?? entry?.uid ?? '').trim()))
                : [];
        }
        picked.forEach((entry, idx) => {
            if (!entry) return;
            const entryId = String(entry?.id ?? entry?.uid ?? `entry-${idx}`).trim();
            results.push({ ...entry, _refSourceId: sourceId, _refEntryId: entryId });
        });
    }
    return results;
};

export const collectBoundWorldRegexSets = async (options = {}) => {
    const {
        regexStore = null,
        worldId = '',
    } = options || {};
    const targetWorldId = String(worldId || '').trim();
    if (!regexStore || !targetWorldId) return [];
    try {
        await regexStore?.ready;
        const sets = regexStore?.listLocalSets?.() || [];
        return sets
            .filter(item => item?.bind?.type === 'world' && item.bind.worldId === targetWorldId)
            .map(item => ({
                name: item.name,
                enabled: item.enabled !== false,
                rules: item.rules || [],
            }));
    } catch {
        return [];
    }
};

export const saveWorldInfoWithName = async (options = {}) => {
    const {
        currentName = '',
        nextName = '',
        payload = null,
        listWorlds = null,
        renameWorldInfo = null,
        saveWorldInfo = null,
        expectedRevision = null,
        expectedGeneration = null,
    } = options || {};
    const current = String(currentName || '').trim();
    const next = String(nextName || '').trim();
    if (!next) return { ok: false, reason: 'empty-name', worldName: current };
    if (next !== current) {
        const existing = typeof listWorlds === 'function' ? await listWorlds() : undefined;
        if (Array.isArray(existing) && existing.includes(next)) {
            return { ok: false, reason: 'duplicate-name', worldName: current };
        }
        if (typeof renameWorldInfo === 'function') {
            const result = await renameWorldInfo(current, next, payload, {
                expectedRevision,
                expectedGeneration,
                expectedExists: true,
                conflictMode: 'return',
            });
            if (result?.ok === false) return { ...result, worldName: current };
            return {
                ok: true,
                reason: 'renamed',
                worldName: next,
                ...(result?.revision !== undefined ? { revision: result.revision } : {}),
                ...(result?.generation !== undefined ? { generation: result.generation } : {}),
                ...(result?.data !== undefined ? { data: result.data } : {}),
            };
        }
        return { ok: false, reason: 'rename-unavailable', worldName: current };
    }
    if (typeof saveWorldInfo !== 'function') {
        throw new Error('saveWorldInfo is unavailable');
    }
    const result = await saveWorldInfo(current, payload, {
        expectedRevision,
        expectedGeneration,
        expectedExists: true,
        conflictMode: 'return',
    });
    if (result?.ok === false) return { ...result, worldName: current };
    return {
        ok: true,
        reason: 'saved',
        worldName: current,
        ...(result?.revision !== undefined ? { revision: result.revision } : {}),
        ...(result?.generation !== undefined ? { generation: result.generation } : {}),
        ...(result?.data !== undefined ? { data: result.data } : {}),
    };
};

export const getWorldEntryActivationExplanationCore = (options = {}) => {
    const {
        entry = null,
        idx = 0,
        worldName = '',
        getEntryId = null,
        buildWorldDebugLabel = null,
        explainWorldEntryActivation = null,
        logger = null,
    } = options || {};
    const worldId = String(entry?._refSourceId || entry?._sourceWorldId || worldName || '').trim();
    const entryId = typeof getEntryId === 'function'
        ? String(getEntryId(entry, idx) || '').trim()
        : String(entry?.id ?? entry?.uid ?? '').trim();
    if (typeof explainWorldEntryActivation !== 'function' || !worldId || !entryId) return null;
    try {
        const label = typeof buildWorldDebugLabel === 'function' ? (buildWorldDebugLabel() || null) : null;
        return explainWorldEntryActivation(worldId, entryId, label);
    } catch (err) {
        logger?.warn?.('读取世界书条目激活解释失败', err);
        return null;
    }
};
