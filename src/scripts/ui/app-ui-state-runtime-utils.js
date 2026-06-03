import {
  applySavedUiRestoreState,
  pickSavedUiStateSnapshot,
  readSavedUiStateFastSnapshot,
  restoreSessionShellState,
  runSavedUiRestoreFlow,
  saveUiStateSnapshot,
} from './chat/session-enter-runtime.js';

export const createAppUiStateRuntime = ({
  key = '',
  kvName = '',
  sessionStorageLike = null,
  localStorageLike = null,
  clearTimerFn = (timer) => clearTimeout(timer),
  setTimerFn = (fn, delay) => setTimeout(fn, delay),
  persistDiskState = null,
  loadDiskState = null,
  uiLog = () => {},
  getActivePage = () => 'chat',
  getUiMode = () => 'chat',
  isChatRoomVisible = () => false,
  getCurrentSessionId = () => '',
  nowFn = () => Date.now(),
  hasKnownSession = () => false,
  activateShellStateFn = () => false,
  hasPage = () => false,
  switchPage = () => {},
  setUiMode = null,
  persistUiMode = null,
  applyUiModeUI = null,
  restoreChatRoom = null,
  saveSnapshot = saveUiStateSnapshot,
  pickSnapshot = pickSavedUiStateSnapshot,
  readFastSnapshot = readSavedUiStateFastSnapshot,
  restoreShell = restoreSessionShellState,
  runSavedRestoreFlow = runSavedUiRestoreFlow,
  applySavedState = applySavedUiRestoreState,
} = {}) => {
  const resolveOptionValue = (value) => (typeof value === 'function' ? value() : value);
  const resolveKey = () => String(resolveOptionValue(key) || '').trim();
  const resolveKvName = () => String(resolveOptionValue(kvName) || '').trim();

  const saveUiState = (existingTimer = null) => saveSnapshot({
    state: {
      activePage: getActivePage(),
      uiMode: String(getUiMode?.() || '').trim().toLowerCase() === 'rp' ? 'rp' : 'chat',
      inChatRoom: Boolean(isChatRoomVisible()),
      sessionId: getCurrentSessionId(),
      at: nowFn(),
    },
    key: resolveKey(),
    kvName: resolveKvName(),
    sessionStorageLike,
    localStorageLike,
    clearTimerFn,
    existingTimer,
    setTimerFn,
    persistDiskState,
    uiLog,
    delayMs: 400,
  });

  const pickSavedUiState = async () => pickSnapshot({
    key: resolveKey(),
    sessionStorageLike,
    localStorageLike,
    loadDiskState,
  });

  const applyRestoredSessionShell = (sessionId) => restoreShell({
    sessionId,
    hasKnownSession,
    activateShellStateFn,
  });

  const readSavedUiStateFast = () => readFastSnapshot({
    key: resolveKey(),
    sessionStorageLike,
    localStorageLike,
  });

  const restoreUiState = async () => {
    try {
      const result = await runSavedRestoreFlow({
        pickSavedUiState,
        applySavedState: (savedState) => applySavedState({
          savedState,
          hasPage,
          switchPage,
          setUiMode,
          persistUiMode,
          applyUiModeUI,
          restoreSessionShell: applyRestoredSessionShell,
          restoreChatRoom,
          uiLog,
        }),
        uiLog,
      });
      return result.restored === true;
    } catch {
      return false;
    }
  };

  return {
    applyRestoredSessionShell,
    pickSavedUiState,
    readSavedUiStateFast,
    restoreUiState,
    saveUiState,
  };
};
