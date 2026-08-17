const isObject = value => Boolean(value && typeof value === 'object');

export const createDisposableStructuredPreviewRuntime = ({
  generationId = 0,
  sessionId = '',
  getActiveGeneration = () => null,
  isGenerationInterrupted = () => false,
  ensureAssistantStreamCtrl = () => null,
  getStreamCtrl = () => null,
  setStreamCtrl = () => null,
  previewMeta = {},
  showPreviewBubble = true,
  onFallbackPending = () => {},
} = {}) => {
  let baseCtrl = null;
  let wrappedCtrl = null;
  let active = false;
  let disposed = false;
  let text = '';

  const matchingGeneration = () => {
    const generation = getActiveGeneration?.();
    if (!generation || generation.id !== generationId || generation.sessionId !== sessionId) return null;
    return generation;
  };

  const clearGenerationPreviewState = () => {
    const generation = matchingGeneration();
    if (!generation) return;
    if (generation.streamCtrl === wrappedCtrl) generation.streamCtrl = null;
    generation.streamText = '';
    generation.streamPayload = null;
    if (generation.streamMeta?.disposablePreview === true) generation.streamMeta = null;
  };

  const detach = () => {
    if (getStreamCtrl?.() === wrappedCtrl) setStreamCtrl?.(null);
    clearGenerationPreviewState();
    baseCtrl = null;
    wrappedCtrl = null;
    active = false;
    text = '';
  };

  const discard = () => {
    const ctrl = baseCtrl;
    try {
      ctrl?.cancel?.({ keepPartial: false });
    } catch {}
    detach();
    return null;
  };

  const wrapController = (ctrl) => {
    if (!ctrl) return null;
    if (ctrl.__disposableStructuredPreview === true) return ctrl;
    baseCtrl = ctrl;
    wrappedCtrl = {
      id: ctrl.id,
      __disposableStructuredPreview: true,
      isConnected: () => {
        try {
          return typeof ctrl.isConnected === 'function' ? ctrl.isConnected() !== false : true;
        } catch {
          return false;
        }
      },
      update: payload => ctrl.update?.(payload),
      finish: () => discard(),
      cancel: () => {
        disposed = true;
        return discard();
      },
    };
    setStreamCtrl?.(wrappedCtrl);
    const generation = matchingGeneration();
    if (generation) {
      generation.streamCtrl = wrappedCtrl;
      generation.streamText = '';
      generation.streamPayload = null;
      generation.streamMeta = {
        ...(isObject(generation.streamMeta) ? generation.streamMeta : {}),
        ...(isObject(previewMeta) ? previewMeta : {}),
        disposablePreview: true,
        plainTextOnly: true,
      };
    }
    return wrappedCtrl;
  };

  const ensurePreviewCtrl = () => {
    if (wrappedCtrl?.isConnected?.()) return wrappedCtrl;
    if (wrappedCtrl) detach();
    const ctrl = ensureAssistantStreamCtrl?.({
      ...(isObject(previewMeta) ? previewMeta : {}),
      typing: false,
      disposablePreview: true,
      plainTextOnly: true,
    });
    return wrapController(ctrl);
  };

  const dispose = (outcome = 'aborted') => {
    if (disposed && !active && !wrappedCtrl) return false;
    const interrupted = isGenerationInterrupted?.(generationId) === true;
    disposed = true;
    discard();
    if (outcome === 'fallback' && !interrupted) {
      try { onFallbackPending?.(); } catch {}
    }
    return true;
  };

  return {
    handle(event = {}) {
      const phase = String(event?.phase || '').trim();
      if (phase === 'dispose') return dispose(String(event?.outcome || 'aborted').trim());
      if (phase !== 'update' || disposed || isGenerationInterrupted?.(generationId)) return false;
      if (!matchingGeneration()) return false;
      const nextText = String(event?.text ?? '');
      if (!nextText || nextText === text) return false;
      if (showPreviewBubble !== true) {
        text = nextText;
        return true;
      }
      const ctrl = ensurePreviewCtrl();
      if (!ctrl) return false;
      text = nextText;
      active = true;
      ctrl.update({
        content: text,
        raw: '',
        rawOriginal: '',
        rawSource: '',
        meta: {
          disposablePreview: true,
          plainTextOnly: true,
          previewTruncated: event?.truncated === true,
        },
      });
      return true;
    },
    dispose,
    getState: () => ({
      active,
      disposed,
      text,
      controllerId: String(wrappedCtrl?.id || ''),
    }),
  };
};
