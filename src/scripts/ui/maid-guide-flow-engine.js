const IDLE_STATE = Object.freeze({ flowId: '', idx: 0, phase: 'idle' });

const cloneState = state => ({
  flowId: String(state?.flowId || ''),
  idx: Math.max(0, Math.trunc(Number(state?.idx) || 0)),
  phase: state?.phase === 'steps' || state?.phase === 'done' ? state.phase : 'idle',
});

export const createMaidGuideFlowEngine = ({
  getFlow = null,
  onStateChange = null,
  onFallback = null,
} = {}) => {
  let state = cloneState(IDLE_STATE);

  const resolveFlow = () => {
    if (!state.flowId || typeof getFlow !== 'function') return null;
    const flow = getFlow(state.flowId);
    return flow && Array.isArray(flow.steps) && flow.steps.length ? flow : null;
  };

  const publish = (next, reason = '') => {
    state = cloneState(next);
    try {
      onStateChange?.(cloneState(state), { reason });
    } catch {}
    return true;
  };

  const advance = (reason = 'next') => {
    if (state.phase !== 'steps') return false;
    const flow = resolveFlow();
    if (!flow) return false;
    if (state.idx >= flow.steps.length - 1) {
      return publish({ ...state, idx: flow.steps.length - 1, phase: 'done' }, reason);
    }
    return publish({ ...state, idx: state.idx + 1 }, reason);
  };

  return {
    start(flowId = '') {
      const id = String(flowId || '').trim();
      const flow = typeof getFlow === 'function' ? getFlow(id) : null;
      if (!id || !flow || !Array.isArray(flow.steps) || !flow.steps.length) return false;
      return publish({ flowId: id, idx: 0, phase: 'steps' }, 'start');
    },

    emit(event = '', payload = undefined) {
      if (state.phase !== 'steps') return false;
      const flow = resolveFlow();
      const step = flow?.steps?.[state.idx];
      if (!step || typeof step.canAdvance !== 'function') return false;
      let accepted = false;
      try {
        accepted = step.canAdvance(String(event || ''), payload) === true;
      } catch {
        accepted = false;
      }
      return accepted ? advance(`event:${String(event || '')}`) : false;
    },

    next() {
      const flow = resolveFlow();
      const step = flow?.steps?.[state.idx];
      if (!step || step.action !== 'observe') return false;
      return advance('next');
    },

    prev() {
      if (state.phase !== 'steps' || state.idx <= 0 || !resolveFlow()) return false;
      return publish({ ...state, idx: state.idx - 1 }, 'prev');
    },

    skip() {
      if (state.phase === 'idle') return false;
      return publish(IDLE_STATE, 'skip');
    },

    runFallback() {
      if (state.phase !== 'steps') return false;
      const flow = resolveFlow();
      const step = flow?.steps?.[state.idx];
      if (!flow || !step || typeof onFallback !== 'function') return false;
      try {
        onFallback({ flow, step, index: state.idx, state: cloneState(state) });
        return true;
      } catch {
        return false;
      }
    },

    getState() {
      return cloneState(state);
    },
  };
};
