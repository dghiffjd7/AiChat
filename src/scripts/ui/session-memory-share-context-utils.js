import {
    getBridgeTableShortLabel,
    getChatToMomentsBridgeTableIds,
    getChatToRpBridgeSourceMeta,
    getChatToRpBridgeTableIds,
    getMomentsToChatBridgeTableIds,
    getRpToMomentsBridgeTableIds,
    getRpToChatBridgeTableIds,
    isChatToRpGroupTableId,
    normalizeBridgeLimit,
    resolveChatToMomentsBridgeTableSettings,
    resolveChatToRpBridgeTableSettings,
    resolveMomentsToChatBridgeTableSettings,
    resolveRpToMomentsBridgeTableSettings,
    resolveRpToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import { isRpSessionId } from '../memory/memory-context-utils.js';

const normalizeId = (value) => String(value || '').trim();

export const resolveRpDisplayName = ({
    sessionId = '',
    getRpCharacterNameForSession = null,
    getContact = null,
    fallbackName = '角色',
} = {}) => {
    const sid = normalizeId(sessionId);
    const direct = normalizeId(getRpCharacterNameForSession?.(sid));
    if (direct) return direct;
    const contact = getContact?.(sid);
    const saved = normalizeId(contact?.name);
    if (saved && !saved.startsWith('rp:')) return saved;
    return saved || sid || fallbackName;
};

export const resolveSessionDisplayName = ({
    sessionId = '',
    getContact = null,
    getRpDisplayName = null,
} = {}) => {
    const sid = normalizeId(sessionId);
    if (!sid) return '';
    if (isRpSessionId(sid)) return getRpDisplayName?.(sid) || sid;
    const contact = getContact?.(sid);
    return normalizeId(contact?.name) || sid;
};

export const listSocialSessionIds = ({
    listSessions = null,
} = {}) => {
    return (listSessions?.() || [])
        .map((id) => normalizeId(id))
        .filter(Boolean)
        .filter((id) => !isRpSessionId(id));
};

export const resolveDefaultRpBridgeSourceId = ({
    sessionId = '',
    getRpSessionIdForSession = null,
    getRpSessionIdForActivePersona = null,
} = {}) => {
    return normalizeId(
        getRpSessionIdForSession?.(sessionId)
        || getRpSessionIdForActivePersona?.()
        || '',
    );
};

export const getMemoryShareTableLabel = ({
    table = null,
    tableId = '',
    sourceMode = '',
} = {}) => {
    const base = getBridgeTableShortLabel(table);
    if (sourceMode === 'all_social') {
        return `${isChatToRpGroupTableId(tableId) ? '群聊' : '私聊'}${base}`;
    }
    return base;
};

export const loadMemoryShareRows = async ({
    memoryTableStore = null,
    sourceId = '',
    templateId = '',
    sourceIsGroup = false,
} = {}) => {
    const sid = normalizeId(sourceId);
    if (!sid || !templateId || !memoryTableStore?.getMemories) return [];
    try {
        const rows = await memoryTableStore.getMemories({
            scope: sourceIsGroup ? 'group' : 'contact',
            group_id: sourceIsGroup ? sid : undefined,
            contact_id: sourceIsGroup ? undefined : sid,
            template_id: templateId,
        });
        return Array.isArray(rows) ? rows.filter((row) => row && row.is_active !== false) : [];
    } catch {
        return [];
    }
};

export const loadGlobalMemoryShareRows = async ({
    memoryTableStore = null,
    templateId = '',
} = {}) => {
    if (!templateId || !memoryTableStore?.getMemories) return [];
    try {
        const rows = await memoryTableStore.getMemories({
            scope: 'global',
            template_id: templateId,
        });
        return Array.isArray(rows) ? rows.filter((row) => row && row.is_active !== false) : [];
    } catch {
        return [];
    }
};

const buildBridgeEntriesFromRows = ({
    tableIds = [],
    tableMap = new Map(),
    tableSettings = {},
    rows = [],
    sourceMode = '',
} = {}) => (Array.isArray(tableIds) ? tableIds : [])
    .map((tableId) => {
        const table = tableMap.get(tableId);
        if (!table) return null;
        const enabled = tableSettings?.[tableId]?.enabled === true;
        const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
        const rowCount = (Array.isArray(rows) ? rows : [])
            .filter(row => normalizeId(row?.table_id) === tableId)
            .length;
        return {
            tableId,
            table,
            enabled,
            limit,
            rowCount,
            actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
            shortLabel: getMemoryShareTableLabel({ table, tableId, sourceMode }),
        };
    })
    .filter(Boolean);

const buildBridgeEntriesFromRecords = ({
    tableIds = [],
    tableMap = new Map(),
    tableSettings = {},
    records = [],
    sourceMode = '',
} = {}) => (Array.isArray(tableIds) ? tableIds : [])
    .map((tableId) => {
        const table = tableMap.get(tableId);
        if (!table) return null;
        const enabled = tableSettings?.[tableId]?.enabled === true;
        const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
        const rowCount = (Array.isArray(records) ? records : []).reduce((total, record) => {
            if (!record || !Array.isArray(record.rows)) return total;
            if (sourceMode === 'all_social') {
                const expectsGroup = isChatToRpGroupTableId(tableId);
                if (expectsGroup !== record.sourceIsGroup) return total;
            }
            return total + record.rows.filter(row => normalizeId(row?.table_id) === tableId).length;
        }, 0);
        return {
            tableId,
            table,
            enabled,
            limit,
            rowCount,
            actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
            shortLabel: getMemoryShareTableLabel({ table, tableId, sourceMode }),
        };
    })
    .filter(Boolean);

export const buildChatToRpMemoryShareContext = async ({
    sessionId = '',
    rawSourceId = null,
    rawTableSettings = null,
    resolveTemplateDefinition = null,
    resolveTemplateId = null,
    getSessionSettings = null,
    listSocialSessions = null,
    loadRows = null,
    getSessionDisplayName = null,
    fallbackEnabled = true,
} = {}) => {
    const sid = normalizeId(sessionId);
    const template = await resolveTemplateDefinition?.();
    const templateId = await resolveTemplateId?.();
    const tableMap = new Map((template?.tables || []).map((table) => [normalizeId(table?.id), table]));
    const sessionSettings = getSessionSettings?.(sid) || {};
    const selectedSourceId = rawSourceId === null
        ? normalizeId(sessionSettings.chatBridgeSourceSessionId)
        : normalizeId(rawSourceId);
    const { sourceMode, sourceId, sourceIsGroup } = getChatToRpBridgeSourceMeta(selectedSourceId);
    const mergedSessionSettings = {
        ...sessionSettings,
        chatBridgeSourceSessionId: selectedSourceId,
    };
    if (rawTableSettings && typeof rawTableSettings === 'object') {
        if (sourceMode === 'all_social') mergedSessionSettings.chatBridgeAllSocialTableSettings = rawTableSettings;
        else mergedSessionSettings.chatBridgeTableSettings = rawTableSettings;
    }
    const tableSettings = resolveChatToRpBridgeTableSettings({
        sessionSettings: mergedSessionSettings,
        sourceIsGroup,
        sourceMode,
        fallbackEnabled,
        fallbackLimit: 0,
    });
    const socialSessionIds = listSocialSessions?.() || [];
    const sourceRecords = sourceMode === 'all_social'
        ? await Promise.all(socialSessionIds.map(async (socialId) => ({
            sourceId: socialId,
            sourceIsGroup: socialId.startsWith('group:'),
            rows: await loadRows?.(socialId, {
                templateId,
                sourceIsGroup: socialId.startsWith('group:'),
            }),
        })))
        : [{
            sourceId,
            sourceIsGroup,
            rows: await loadRows?.(sourceId, { templateId, sourceIsGroup }),
        }];
    const entries = getChatToRpBridgeTableIds({ sourceIsGroup, sourceMode })
        .map((tableId) => {
            const table = tableMap.get(tableId);
            if (!table) return null;
            const enabled = tableSettings?.[tableId]?.enabled === true;
            const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
            const rowCount = sourceRecords.reduce((total, record) => {
                if (!record || !Array.isArray(record.rows)) return total;
                if (sourceMode === 'all_social') {
                    const expectsGroup = isChatToRpGroupTableId(tableId);
                    if (expectsGroup !== record.sourceIsGroup) return total;
                }
                return total + record.rows.filter((row) => normalizeId(row?.table_id) === tableId).length;
            }, 0);
            return {
                tableId,
                table,
                enabled,
                limit,
                rowCount,
                actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
                shortLabel: getMemoryShareTableLabel({ table, tableId, sourceMode }),
            };
        })
        .filter(Boolean);
    return {
        mode: 'chat_to_rp',
        sessionSettings,
        sourceMode,
        selectedSourceId,
        sourceId,
        sourceIsGroup,
        sourceLabel: sourceMode === 'all_social'
            ? '所有聊天室（默认）'
            : (sourceId ? getSessionDisplayName?.(sourceId) : ''),
        summarySourceText: sourceMode === 'all_social'
            ? '来源：所有聊天室（默认）'
            : (sourceId ? `来源：${getSessionDisplayName?.(sourceId) || sourceId}` : '来源：指定聊天室（当前为空）'),
        entries,
    };
};

export const buildRpToChatMemoryShareContext = async ({
    sessionId = '',
    rawTableSettings = null,
    resolveTemplateDefinition = null,
    resolveTemplateId = null,
    getSessionSettings = null,
    getDefaultSourceId = null,
    getRpDisplayName = null,
    loadRows = null,
    fallbackEnabled = true,
    fallbackLimit = 0,
} = {}) => {
    const sid = normalizeId(sessionId);
    const template = await resolveTemplateDefinition?.();
    const templateId = await resolveTemplateId?.();
    const tableMap = new Map((template?.tables || []).map((table) => [normalizeId(table?.id), table]));
    const sessionSettings = getSessionSettings?.(sid) || {};
    const sourceId = getDefaultSourceId?.(sid) || '';
    const mergedSessionSettings = { ...sessionSettings };
    if (rawTableSettings && typeof rawTableSettings === 'object') {
        mergedSessionSettings.rpBridgeTableSettings = rawTableSettings;
    }
    const tableSettings = resolveRpToChatBridgeTableSettings({
        sessionSettings: mergedSessionSettings,
        fallbackEnabled,
        fallbackLimit: normalizeBridgeLimit(fallbackLimit, 0),
    });
    const activeRows = await loadRows?.(sourceId, { templateId, sourceIsGroup: false });
    const entries = getRpToChatBridgeTableIds()
        .map((tableId) => {
            const table = tableMap.get(tableId);
            if (!table) return null;
            const enabled = tableSettings?.[tableId]?.enabled === true;
            const limit = normalizeBridgeLimit(tableSettings?.[tableId]?.limit, 0);
            const rowCount = activeRows.filter((row) => normalizeId(row?.table_id) === tableId).length;
            return {
                tableId,
                table,
                enabled,
                limit,
                rowCount,
                actualCount: limit > 0 ? Math.min(rowCount, limit) : rowCount,
                shortLabel: getMemoryShareTableLabel({ table, tableId }),
            };
        })
        .filter(Boolean);
    return {
        mode: 'rp_to_chat',
        sessionSettings,
        sourceId,
        sourceLabel: sourceId ? getRpDisplayName?.(sourceId) : '',
        summarySourceText: sourceId
            ? `来源：${getRpDisplayName?.(sourceId) || sourceId}`
            : '来源：当前角色创意写作会话（当前为空）',
        entries,
    };
};

export const buildMomentsToChatMemoryShareContext = async ({
    resolveTemplateDefinition = null,
    resolveTemplateId = null,
    loadGlobalRows = null,
    getGlobalSettings = () => ({}),
    rawTableSettings = null,
} = {}) => {
    const template = await resolveTemplateDefinition?.();
    const templateId = await resolveTemplateId?.();
    const tableMap = new Map((template?.tables || []).map((table) => [normalizeId(table?.id), table]));
    const globalSettings = getGlobalSettings?.() || {};
    const mergedSettings = {
        ...globalSettings,
        ...(rawTableSettings && typeof rawTableSettings === 'object'
            ? { memoryBridgeMomentsToChatTableSettings: rawTableSettings }
            : {}),
    };
    const tableSettings = resolveMomentsToChatBridgeTableSettings({
        settings: mergedSettings,
        fallbackEnabled: globalSettings.memoryBridgeMomentsToChatEnabled !== false,
        fallbackLimit: normalizeBridgeLimit(globalSettings.memoryBridgeMomentsToChatLimit, 5),
    });
    const rows = await loadGlobalRows?.({ templateId });
    const entries = buildBridgeEntriesFromRows({
        tableIds: getMomentsToChatBridgeTableIds(),
        tableMap,
        tableSettings,
        rows,
    });
    return {
        mode: 'moments_to_chat',
        sourceLabel: '动态',
        summarySourceText: '来源：动态',
        enabled: globalSettings.memoryBridgeMomentsToChatEnabled !== false,
        tableSettings,
        entries,
    };
};

export const buildChatToMomentsMemoryShareContext = async ({
    resolveTemplateDefinition = null,
    resolveTemplateId = null,
    listSocialSessions = null,
    loadRows = null,
    getGlobalSettings = () => ({}),
    rawTableSettings = null,
} = {}) => {
    const template = await resolveTemplateDefinition?.();
    const templateId = await resolveTemplateId?.();
    const tableMap = new Map((template?.tables || []).map((table) => [normalizeId(table?.id), table]));
    const globalSettings = getGlobalSettings?.() || {};
    const mergedSettings = {
        ...globalSettings,
        ...(rawTableSettings && typeof rawTableSettings === 'object'
            ? { memoryBridgeChatToMomentsTableSettings: rawTableSettings }
            : {}),
    };
    const tableSettings = resolveChatToMomentsBridgeTableSettings({
        settings: mergedSettings,
        fallbackEnabled: globalSettings.memoryBridgeChatToMomentsEnabled !== false,
        fallbackLimit: normalizeBridgeLimit(globalSettings.memoryBridgeChatToMomentsLimit, 5),
    });
    const socialSessionIds = listSocialSessions?.() || [];
    const records = await Promise.all(socialSessionIds.map(async (sourceId) => {
        const sourceIsGroup = sourceId.startsWith('group:');
        return {
            sourceId,
            sourceIsGroup,
            rows: await loadRows?.(sourceId, { templateId, sourceIsGroup }),
        };
    }));
    const entries = buildBridgeEntriesFromRecords({
        tableIds: getChatToMomentsBridgeTableIds(),
        tableMap,
        tableSettings,
        records,
        sourceMode: 'all_social',
    });
    return {
        mode: 'chat_to_moments',
        sourceLabel: '聊天室',
        summarySourceText: '来源：全部私聊 / 群聊',
        enabled: globalSettings.memoryBridgeChatToMomentsEnabled !== false,
        tableSettings,
        entries,
    };
};

export const buildRpToMomentsMemoryShareContext = async ({
    resolveTemplateDefinition = null,
    resolveTemplateId = null,
    listRpSessions = null,
    loadRows = null,
    getGlobalSettings = () => ({}),
    rawTableSettings = null,
} = {}) => {
    const template = await resolveTemplateDefinition?.();
    const templateId = await resolveTemplateId?.();
    const tableMap = new Map((template?.tables || []).map((table) => [normalizeId(table?.id), table]));
    const globalSettings = getGlobalSettings?.() || {};
    const mergedSettings = {
        ...globalSettings,
        ...(rawTableSettings && typeof rawTableSettings === 'object'
            ? { memoryBridgeRpToMomentsTableSettings: rawTableSettings }
            : {}),
    };
    const tableSettings = resolveRpToMomentsBridgeTableSettings({
        settings: mergedSettings,
        fallbackEnabled: globalSettings.memoryBridgeRpToMomentsEnabled !== false,
        fallbackLimit: normalizeBridgeLimit(globalSettings.memoryBridgeRpToMomentsLimit, 5),
    });
    const rpSessionIds = listRpSessions?.() || [];
    const records = await Promise.all(rpSessionIds.map(async (sourceId) => ({
        sourceId,
        sourceIsGroup: false,
        rows: await loadRows?.(sourceId, { templateId, sourceIsGroup: false }),
    })));
    const entries = buildBridgeEntriesFromRecords({
        tableIds: getRpToMomentsBridgeTableIds(),
        tableMap,
        tableSettings,
        records,
    });
    return {
        mode: 'rp_to_moments',
        sourceLabel: '创意写作',
        summarySourceText: '来源：全部创意写作',
        enabled: globalSettings.memoryBridgeRpToMomentsEnabled !== false,
        tableSettings,
        entries,
    };
};
