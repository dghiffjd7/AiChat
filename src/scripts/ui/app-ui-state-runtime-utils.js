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
  isChatRoomVisible = () => false,
  getCurrentSessionId = () => '',
  nowFn = () => Date.now(),
  hasKnownSession = () => false,
  activateShellStateFn = () => false,
  hasPage = () => false,
  switchPage = () => {},
  saveSnapshot = saveUiStateSnapshot,
  pickSnapshot = pickSavedUiStateSnapshot,
  readFastSnapshot = readSavedUiStateFastSnapshot,
  restoreShell = restoreSessionShellState,
  runSavedRestoreFlow = runSavedUiRestoreFlow,
  applySavedState = applySavedUiRestoreState,
} = {}) => {
  const saveUiState = (existingTimer = null) => saveSnapshot({
    state: {
      activePage: getActivePage(),
      inChatRoom: Boolean(isChatRoomVisible()),
      sessionId: getCurrentSessionId(),
      at: nowFn(),
    },
    key,
    kvName,
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
    key,
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
    key,
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
          restoreSessionShell: applyRestoredSessionShell,
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
