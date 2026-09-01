import { isRpSessionId } from '../memory/memory-context-utils.js';
import { translateUiText } from '../i18n/index.js';
import {
    getChatToRpBridgeSourceMeta,
    normalizeBridgeLimit,
    pruneChatToRpBridgeTableSettings,
    pruneRpToChatBridgeTableSettings,
    resolveChatToRpBridgeTableSettings,
    resolveRpToChatBridgeTableSettings,
} from '../memory/memory-bridge-utils.js';
import {
    closeSessionMemoryShareModal,
    finalizeSessionMemoryShareSave,
    mountSessionMemoryShareModal,
    openSessionMemoryShareManager,
    refreshSessionMemoryShareSummary,
    renderSessionMemoryShareManager,
} from './session-memory-share-runtime-utils.js';
import {
    createMemoryShareEmptyState,
    createMemoryShareEntryRow,
} from './session-shared-view-utils.js';

const asObject = (value) => (
    value && typeof value === 'object' && !Array.isArray(value)
        ? value
        : {}
);

export const buildSessionMemoryShareDraft = ({
    sessionId = '',
    sessionSettings = {},
    isRpTarget = false,
} = {}) => {
    const normalizedSessionId = String(sessionId || '').trim();
    const normalizedSettings = asObject(sessionSettings);
    const sourceId = isRpTarget ? String(normalizedSettings.chatBridgeSourceSessionId || '').trim() : '';
    const tableSettings = isRpTarget
        ? {
            ...(sourceId
                ? asObject(normalizedSettings.chatBridgeTableSettings)
                : asObject(normalizedSettings.chatBridgeAllSocialTableSettings)),
        }
        : {
            ...asObject(normalizedSettings.rpBridgeTableSettings),
        };
    return {
        sessionId: normalizedSessionId,
        sourceId,
        tableSettings,
    };
};

export const applyChatToRpMemoryShareSettings = ({
    sessionSettings = {},
    draft = null,
    fallbackEnabled = true,
    fallbackLimit = 0,
    normalizeLimit = normalizeBridgeLimit,
} = {}) => {
    const nextSettings = { ...asObject(sessionSettings) };
    const sourceId = String(draft?.sourceId || '').trim();
    const { sourceMode, sourceIsGroup } = getChatToRpBridgeSourceMeta(sourceId);
    if (sourceMode === 'all_social') {
        const normalizedAllSocialTableSettings = {
            ...asObject(nextSettings.chatBridgeAllSocialTableSettings),
            ...pruneChatToRpBridgeTableSettings(draft?.tableSettings || {}, { sourceMode }),
        };
        const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
            sessionSettings: {
                ...nextSettings,
                chatBridgeSourceSessionId: '',
                chatBridgeAllSocialTableSettings: normalizedAllSocialTableSettings,
            },
            sourceMode,
            fallbackEnabled,
            fallbackLimit,
        });
        nextSettings.chatBridgeSourceSessionId = '';
        nextSettings.chatBridgeAllSocialTableSettings = normalizedAllSocialTableSettings;
        nextSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
        nextSettings.chatBridgeOutlineLimit = Math.max(
            normalizeLimit(resolvedTableSettings?.chat_outline?.limit, 0),
            normalizeLimit(resolvedTableSettings?.group_outline?.limit, 0),
        );
        return nextSettings;
    }

    const normalizedTableSettings = {
        ...asObject(nextSettings.chatBridgeTableSettings),
        ...pruneChatToRpBridgeTableSettings(draft?.tableSettings || {}, { sourceIsGroup, sourceMode }),
    };
    const resolvedTableSettings = resolveChatToRpBridgeTableSettings({
        sessionSettings: {
            ...nextSettings,
            chatBridgeSourceSessionId: sourceId,
            chatBridgeTableSettings: normalizedTableSettings,
        },
        sourceIsGroup,
        sourceMode,
        fallbackEnabled,
        fallbackLimit,
    });
    const outlineTableId = sourceIsGroup ? 'group_outline' : 'chat_outline';
    nextSettings.chatBridgeSourceSessionId = sourceId;
    nextSettings.chatBridgeTableSettings = normalizedTableSettings;
    nextSettings.chatBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
    nextSettings.chatBridgeOutlineLimit = normalizeLimit(resolvedTableSettings?.[outlineTableId]?.limit, 0);
    return nextSettings;
};

export const applyRpToChatMemoryShareSettings = ({
    sessionSettings = {},
    draft = null,
    fallbackEnabled = true,
    fallbackLimit = 0,
    normalizeLimit = normalizeBridgeLimit,
} = {}) => {
    const nextSettings = { ...asObject(sessionSettings) };
    const normalizedTableSettings = {
        ...asObject(nextSettings.rpBridgeTableSettings),
        ...pruneRpToChatBridgeTableSettings(draft?.tableSettings || {}),
    };
    const resolvedTableSettings = resolveRpToChatBridgeTableSettings({
        sessionSettings: {
            ...nextSettings,
            rpBridgeTableSettings: normalizedTableSettings,
        },
        fallbackEnabled,
        fallbackLimit: normalizeLimit(fallbackLimit, 0),
    });
    nextSettings.rpBridgeTableSettings = normalizedTableSettings;
    nextSettings.rpBridgeEnabled = Object.values(resolvedTableSettings).some((entry) => entry?.enabled === true);
    nextSettings.rpBridgeOutlineLimit = normalizeLimit(resolvedTableSettings?.rp_outline?.limit, 0);
    return nextSettings;
};

export const createSessionMemoryShareSectionRuntime = ({
    getSessionId = () => '',
    getSummaryEl = () => null,
    getSessionSettings = () => ({}),
    setSessionSettings = () => {},
    buildDraft = () => null,
    buildMemoryShareContext = async () => null,
    createModal = () => null,
    bodyEl = globalThis.document?.body,
    panelDisplay = 'flex',
    closeSourceMenu = () => {},
    bindSourceButton = null,
    refreshSourceButton = () => {},
    listSourceSessionIds = () => [],
    getSourceSessionLabel = (id) => id,
    getSourceStaticLabel = () => '',
    getHintText = () => '',
    getChatToRpFallbackEnabled = () => true,
    getChatToRpFallbackLimit = () => 0,
    getRpToChatFallbackEnabled = () => true,
    getRpToChatFallbackLimit = () => 0,
    getPrimaryGroupLabel = ({ isRpTarget } = {}) => (isRpTarget ? '聊天室' : '创意写作'),
    buildExtraMemoryShareGroups = null,
    notifySaveSuccess = () => {},
    notifySaveError = () => {},
    logger = null,
    showEmptyState = true,
    defaultSourceButtonLabel = '所有聊天室（默认仅注入大纲）',
    normalizeLimit = normalizeBridgeLimit,
    resolveIsRpTarget = (sessionId) => isRpSessionId(sessionId),
    deps = {},
} = {}) => {
    const runtimeDeps = {
        applyChatToRpMemoryShareSettings,
        applyRpToChatMemoryShareSettings,
        closeSessionMemoryShareModal,
        finalizeSessionMemoryShareSave,
        mountSessionMemoryShareModal,
        openSessionMemoryShareManager,
        refreshSessionMemoryShareSummary,
        renderSessionMemoryShareManager,
        ...deps,
    };

    const state = {
        overlayEl: null,
        panelEl: null,
        hintEl: null,
        sourceWrapEl: null,
        sourceStaticEl: null,
        sourceSelectEl: null,
        sourceButtonEl: null,
        rowsEl: null,
        saveButtonEl: null,
        draft: null,
        view: 'overview',
        detailGroupId: '',
        groupCache: [],
    };

    const setDraft = (draft) => {
        state.draft = draft;
    };

    const getEntriesEnabledCount = (entries = []) =>
        (Array.isArray(entries) ? entries : []).filter(entry => entry?.enabled === true).length;
    const getEntriesActualCount = (entries = []) =>
        (Array.isArray(entries) ? entries : []).reduce((total, entry) => total + (Number(entry?.actualCount || 0) || 0), 0);

    const setPrimaryEntriesEnabled = async (enabled) => {
        const sessionId = String(state.draft?.sessionId || '').trim();
        if (!sessionId) return;
        const context = await buildMemoryShareContext(
            sessionId,
            state.draft?.sourceId || '',
            state.draft?.tableSettings || {},
        );
        const nextSettings = { ...(state.draft?.tableSettings || {}) };
        (Array.isArray(context?.entries) ? context.entries : []).forEach((entry) => {
            const tableId = String(entry?.tableId || '').trim();
            if (!tableId) return;
            nextSettings[tableId] = {
                ...(nextSettings[tableId] || {}),
                enabled: Boolean(enabled),
                limit: normalizeLimit(nextSettings[tableId]?.limit, entry?.limit ?? 0),
            };
        });
        state.draft.tableSettings = nextSettings;
    };

    const buildMemoryShareGroupsForDraft = async () => {
        const sessionId = String(state.draft?.sessionId || '').trim();
        const isRpTarget = resolveIsRpTarget(sessionId);
        const primaryContext = await buildMemoryShareContext(
            sessionId,
            state.draft?.sourceId || '',
            state.draft?.tableSettings || {},
        );
        const primaryGroup = {
            id: 'primary',
            label: getPrimaryGroupLabel({ isRpTarget, sessionId }),
            description: primaryContext?.summarySourceText || '',
            context: primaryContext,
            enabled: getEntriesEnabledCount(primaryContext?.entries) > 0,
            isPrimary: true,
            setEnabled: setPrimaryEntriesEnabled,
        };
        const extraGroups = typeof buildExtraMemoryShareGroups === 'function'
            ? await buildExtraMemoryShareGroups({
                sessionId,
                isRpTarget,
                draft: state.draft,
            }).catch(() => [])
            : [];
        state.groupCache = [primaryGroup, ...(Array.isArray(extraGroups) ? extraGroups : [])].filter(Boolean);
        return state.groupCache;
    };

    const renderOverviewRow = (group) => {
        const documentRef = state.rowsEl?.ownerDocument || globalThis.document;
        const row = documentRef.createElement('div');
        row.style.cssText = 'border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-card); overflow:hidden;';
        const header = documentRef.createElement('label');
        header.style.cssText = 'display:flex; align-items:center; justify-content:space-between; gap:10px; padding:11px 12px; cursor:pointer;';
        const textWrap = documentRef.createElement('div');
        textWrap.style.cssText = 'min-width:0; flex:1;';
        const title = documentRef.createElement('div');
        title.style.cssText = 'font-weight:900; color:var(--app-text-primary);';
        title.textContent = String(group?.label || '来源');
        const entries = Array.isArray(group?.context?.entries) ? group.context.entries : [];
        const desc = documentRef.createElement('div');
        desc.style.cssText = 'font-size:12px; color:var(--app-text-muted); margin-top:4px; line-height:1.4;';
        desc.setAttribute?.('data-i18n-skip', '');
        desc.textContent = translateUiText(`${group?.description || group?.context?.summarySourceText || ''}${group?.description || group?.context?.summarySourceText ? '；' : ''}${getEntriesEnabledCount(entries)} 张表开启，可注入 ${getEntriesActualCount(entries)} 条`);
        textWrap.appendChild(title);
        textWrap.appendChild(desc);
        const toggle = documentRef.createElement('input');
        toggle.type = 'checkbox';
        toggle.style.cssText = 'width:18px; height:18px; flex:0 0 auto;';
        toggle.checked = group?.enabled !== false;
        toggle.addEventListener('change', async (event) => {
            event.stopPropagation?.();
            await group?.setEnabled?.(toggle.checked);
            await renderMemoryShareManagerForDraft();
        });
        header.appendChild(textWrap);
        header.appendChild(toggle);
        const action = documentRef.createElement('button');
        action.type = 'button';
        action.textContent = '管理';
        action.style.cssText = 'width:100%; display:flex; align-items:center; justify-content:space-between; border:none; border-top:1px solid var(--app-border-subtle); background:var(--app-surface-subtle); color:var(--app-text-secondary); padding:9px 12px; font-size:12px; cursor:pointer;';
        const chevron = documentRef.createElement('span');
        chevron.textContent = '›';
        chevron.style.cssText = 'font-size:18px; line-height:1;';
        action.appendChild(chevron);
        action.addEventListener('click', async () => {
            state.view = 'detail';
            state.detailGroupId = String(group?.id || '');
            await renderMemoryShareManagerForDraft();
        });
        row.appendChild(header);
        row.appendChild(action);
        return row;
    };

    const renderOverview = async () => {
        const groups = await buildMemoryShareGroupsForDraft();
        if (state.hintEl) state.hintEl.textContent = '按来源管理跨记忆注入；进入详情后可逐张表控制开关和条数。';
        if (state.sourceWrapEl) state.sourceWrapEl.style.display = 'none';
        if (state.sourceStaticEl) state.sourceStaticEl.style.display = 'none';
        if (state.rowsEl) {
            state.rowsEl.innerHTML = '';
            groups.forEach(group => state.rowsEl.appendChild(renderOverviewRow(group)));
        }
        return { groups };
    };

    const renderEntryDetail = async (group) => {
        const documentRef = state.rowsEl?.ownerDocument || globalThis.document;
        if (!state.rowsEl) return group?.context || null;
        state.rowsEl.innerHTML = '';
        const back = documentRef.createElement('button');
        back.type = 'button';
        back.textContent = `‹ ${group?.label || '返回'}`;
        back.style.cssText = 'width:100%; margin-bottom:10px; padding:9px 10px; border:1px solid var(--app-border-default); border-radius:12px; background:var(--app-surface-subtle); color:var(--app-text-primary); text-align:left; cursor:pointer; font-weight:800;';
        back.addEventListener('click', async () => {
            state.view = 'overview';
            state.detailGroupId = '';
            await renderMemoryShareManagerForDraft();
        });
        state.rowsEl.appendChild(back);

        const sessionId = String(state.draft?.sessionId || '').trim();
        const isRpTarget = resolveIsRpTarget(sessionId);
        if (state.hintEl) {
            state.hintEl.textContent = group?.detailHint || getHintText({ sessionId, isRpTarget });
        }
        if (state.sourceWrapEl) state.sourceWrapEl.style.display = group?.isPrimary && isRpTarget ? 'block' : 'none';
        if (state.sourceStaticEl) {
            state.sourceStaticEl.style.display = group?.isPrimary && !isRpTarget ? 'block' : 'none';
            if (group?.isPrimary && !isRpTarget) {
                const sourceLabel = String(getSourceStaticLabel(sessionId) || '').trim() || '当前为空';
                state.sourceStaticEl.textContent = `来源创意写作会话：${sourceLabel}`;
            }
        }
        if (group?.isPrimary && isRpTarget && state.sourceSelectEl && documentRef?.createElement) {
            const sessionIds = Array.isArray(listSourceSessionIds?.()) ? listSourceSessionIds() : [];
            state.sourceSelectEl.innerHTML = '';
            const appendOption = (value, label) => {
                const option = documentRef.createElement('option');
                option.value = value;
                option.textContent = label;
                state.sourceSelectEl.appendChild(option);
            };
            appendOption('', defaultSourceButtonLabel);
            sessionIds.forEach((id) => appendOption(id, getSourceSessionLabel(id)));
            state.sourceSelectEl.value = String(state.draft?.sourceId || '').trim();
            refreshSourceButton({
                sourceButtonEl: state.sourceButtonEl,
                sourceSelectEl: state.sourceSelectEl,
                fallbackLabel: defaultSourceButtonLabel,
            });
        }
        const entries = Array.isArray(group?.context?.entries) ? group.context.entries : [];
        if (!entries.length) {
            if (showEmptyState) state.rowsEl.appendChild(createMemoryShareEmptyState({ documentRef }));
            return group?.context || null;
        }
        entries.forEach((entry) => {
            const { row } = createMemoryShareEntryRow({
                documentRef,
                entry,
                onToggle: async ({ toggle, limitInput }) => {
                    const tableId = String(entry?.tableId || '').trim();
                    if (!tableId) return;
                    if (group?.isPrimary) {
                        const current = state.draft?.tableSettings?.[tableId] || {};
                        state.draft.tableSettings = {
                            ...(state.draft?.tableSettings || {}),
                            [tableId]: {
                                ...current,
                                enabled: toggle.checked === true,
                                limit: normalizeLimit(current.limit, entry.limit),
                            },
                        };
                    } else {
                        const nextValue = {
                            enabled: toggle.checked === true,
                            limit: normalizeLimit(group?.tableSettings?.[tableId]?.limit, entry.limit),
                        };
                        group.tableSettings = {
                            ...(group?.tableSettings || {}),
                            [tableId]: nextValue,
                        };
                        await group?.setTableSetting?.(tableId, nextValue);
                    }
                    limitInput.disabled = toggle.checked !== true;
                },
                onLimitInput: async ({ limitInput }) => {
                    const tableId = String(entry?.tableId || '').trim();
                    if (!tableId) return;
                    const safe = normalizeLimit(limitInput.value, 0);
                    limitInput.value = String(safe);
                    if (group?.isPrimary) {
                        const current = state.draft?.tableSettings?.[tableId] || {};
                        state.draft.tableSettings = {
                            ...(state.draft?.tableSettings || {}),
                            [tableId]: {
                                ...current,
                                enabled: current.enabled === true,
                                limit: safe,
                            },
                        };
                    } else {
                        const nextValue = {
                            enabled: group?.tableSettings?.[tableId]?.enabled !== false,
                            limit: safe,
                        };
                        group.tableSettings = {
                            ...(group?.tableSettings || {}),
                            [tableId]: nextValue,
                        };
                        await group?.setTableSetting?.(tableId, nextValue);
                    }
                },
            });
            if (row) state.rowsEl.appendChild(row);
        });
        return group?.context || null;
    };

    const renderMemoryShareManagerForDraft = async () => {
        if (typeof buildExtraMemoryShareGroups !== 'function') {
            const sessionId = String(state.draft?.sessionId || '').trim();
            return runtimeDeps.renderSessionMemoryShareManager({
                draft: state.draft,
                rowsEl: state.rowsEl,
                hintEl: state.hintEl,
                sourceWrapEl: state.sourceWrapEl,
                sourceStaticEl: state.sourceStaticEl,
                sourceSelectEl: state.sourceSelectEl,
                sourceButtonEl: state.sourceButtonEl,
                isRpTarget: resolveIsRpTarget(sessionId),
                resolveContext: ({ sessionId, sourceId, tableSettings }) =>
                    buildMemoryShareContext(sessionId, sourceId, tableSettings),
                listSourceSessionIds,
                getSourceSessionLabel,
                getSourceStaticLabel,
                getHintText,
                refreshSourceButton,
                showEmptyState,
                normalizeLimit,
            });
        }
        if (state.view !== 'detail') return renderOverview();
        const groups = await buildMemoryShareGroupsForDraft();
        const target = groups.find(group => String(group?.id || '') === String(state.detailGroupId || '')) || groups[0];
        return renderEntryDetail(target);
    };

    const closeMemoryShareManager = () => runtimeDeps.closeSessionMemoryShareModal({
        overlayEl: state.overlayEl,
        panelEl: state.panelEl,
        beforeClose: closeSourceMenu,
        onClosed: () => {
            state.draft = null;
            state.view = 'overview';
            state.detailGroupId = '';
            state.groupCache = [];
        },
    });

    const saveMemoryShareManager = async () => {
        if (!state.draft) return;
        const sessionId = String(state.draft.sessionId || '').trim();
        if (!sessionId) return;
        const sessionSettings = asObject(getSessionSettings(sessionId));
        const nextSettings = resolveIsRpTarget(sessionId)
            ? runtimeDeps.applyChatToRpMemoryShareSettings({
                sessionSettings,
                draft: state.draft,
                fallbackEnabled: getChatToRpFallbackEnabled(),
                fallbackLimit: normalizeLimit(getChatToRpFallbackLimit(), 0),
                normalizeLimit,
            })
            : runtimeDeps.applyRpToChatMemoryShareSettings({
                sessionSettings,
                draft: state.draft,
                fallbackEnabled: getRpToChatFallbackEnabled(),
                fallbackLimit: normalizeLimit(getRpToChatFallbackLimit(), 0),
                normalizeLimit,
            });
        setSessionSettings(sessionId, nextSettings);
        await runtimeDeps.finalizeSessionMemoryShareSave({
            closeManager: closeMemoryShareManager,
            refreshSummary: () => refreshMemoryShareSummary(sessionId),
            notifySuccess: notifySaveSuccess,
        });
    };

    const ensureMemoryShareModal = () => {
        if (state.panelEl) return state.panelEl;
        const modal = createModal();
        if (!modal) return null;
        state.overlayEl = modal.overlay || null;
        state.panelEl = modal.panel || null;
        state.hintEl = modal.hint || null;
        state.sourceWrapEl = modal.sourceWrap || null;
        state.sourceStaticEl = modal.sourceStatic || null;
        state.sourceSelectEl = modal.sourceSelect || null;
        state.sourceButtonEl = modal.sourceButton || null;
        state.rowsEl = modal.rows || null;
        state.saveButtonEl = modal.saveButton || null;
        runtimeDeps.mountSessionMemoryShareModal({
            modal,
            bodyEl,
            bindSourceButton: typeof bindSourceButton === 'function' ? bindSourceButton : () => {},
            sourceButtonEl: state.sourceButtonEl,
            sourceSelectEl: state.sourceSelectEl,
            sourceButtonFallback: defaultSourceButtonLabel,
            onClose: closeMemoryShareManager,
            onSourceChange: () => {
                if (!state.draft) return;
                state.draft.sourceId = String(state.sourceSelectEl?.value || '').trim();
                renderMemoryShareManagerForDraft().catch((err) => {
                    logger?.warn?.('render memory share manager failed', err);
                });
            },
            onSave: () => {
                saveMemoryShareManager().catch((err) => {
                    logger?.warn?.('save memory share manager failed', err);
                    notifySaveError?.();
                });
            },
        });
        return state.panelEl;
    };

    const openMemoryShareManagerForSession = async () => {
        ensureMemoryShareModal();
        state.view = 'overview';
        state.detailGroupId = '';
        return runtimeDeps.openSessionMemoryShareManager({
            ensureModal: ensureMemoryShareModal,
            buildDraft: () => buildDraft(getSessionId()),
            assignDraft: setDraft,
            renderManager: renderMemoryShareManagerForDraft,
            overlayEl: state.overlayEl,
            panelEl: state.panelEl,
            panelDisplay,
        });
    };

    const refreshMemoryShareSummary = async (sessionId = getSessionId()) => {
        if (typeof buildExtraMemoryShareGroups !== 'function') {
            return runtimeDeps.refreshSessionMemoryShareSummary({
                summaryEl: getSummaryEl(),
                sessionId,
                resolveContext: ({ sessionId }) => buildMemoryShareContext(sessionId),
            });
        }
        const summaryEl = getSummaryEl();
        const sid = String(sessionId || '').trim();
        if (!summaryEl || !sid) return false;
        summaryEl.textContent = '正在计算注入记忆...';
        try {
            const draft = buildDraft(sid);
            const previousDraft = state.draft;
            state.draft = draft;
            const groups = await buildMemoryShareGroupsForDraft();
            state.draft = previousDraft;
            summaryEl.textContent = groups.map((group) => {
                const entries = Array.isArray(group?.context?.entries) ? group.context.entries : [];
                return `${group?.label || '来源'}：${getEntriesEnabledCount(entries)} 张表 / ${getEntriesActualCount(entries)} 条`;
            }).join('；') || '未启用跨模式记忆注入';
            return true;
        } catch {
            summaryEl.textContent = '记忆共享状态读取失败';
            return false;
        }
    };

    return {
        refreshMemoryShareSummary,
        ensureMemoryShareModal,
        closeMemoryShareManager,
        renderMemoryShareManager: renderMemoryShareManagerForDraft,
        openMemoryShareManager: openMemoryShareManagerForSession,
        saveMemoryShareManager,
    };
};
