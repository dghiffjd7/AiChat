const truncate = (text, max = 18) => {
  const raw = String(text || '').trim();
  if (raw.length <= max) return raw;
  return `${raw.slice(0, max)}…`;
};

export class StageTimeline {
  constructor({ stageManager } = {}) {
    this.stageManager = stageManager;
    this.el = null;
    this.listEl = null;
    this.metaEl = null;
    this.sessionId = '';
    this._bound = false;
  }

  mount({ container, before } = {}) {
    if (this.el || !container) return;
    const root = document.createElement('div');
    root.className = 'stage-timeline';
    root.setAttribute('aria-hidden', 'true');
    root.innerHTML = `
      <div class="stage-timeline-header">
        <span class="stage-timeline-title">阶段</span>
        <span class="stage-timeline-meta"></span>
      </div>
      <div class="stage-timeline-list"></div>
    `;
    const list = root.querySelector('.stage-timeline-list');
    const meta = root.querySelector('.stage-timeline-meta');
    if (before) container.insertBefore(root, before);
    else container.appendChild(root);
    this.el = root;
    this.listEl = list;
    this.metaEl = meta;
    this.bindEvents();
  }

  bindEvents() {
    if (this._bound) return;
    this._bound = true;
    window.addEventListener('chatapp-stage-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      if (!sid || sid !== this.sessionId) return;
      this.render(sid);
    });
    window.addEventListener('chatapp-stage-schema-changed', (ev) => {
      const sid = String(ev?.detail?.sessionId || '').trim();
      if (!sid || sid !== this.sessionId) return;
      this.render(sid);
    });
  }

  setSession(sessionId) {
    const sid = String(sessionId || '').trim();
    if (!sid) return;
    this.sessionId = sid;
    this.render(sid);
  }

  render(sessionId = this.sessionId) {
    if (!this.el || !this.listEl) return;
    const sid = String(sessionId || '').trim();
    if (!sid) {
      this.el.classList.remove('is-active');
      this.el.setAttribute('aria-hidden', 'true');
      this.listEl.innerHTML = '';
      if (this.metaEl) this.metaEl.textContent = '';
      return;
    }
    const state = this.stageManager?.getStageState?.(sid) || null;
    if (!state || !state.schema || !Array.isArray(state.schema.stages) || !state.schema.stages.length) {
      this.el.classList.remove('is-active');
      this.el.setAttribute('aria-hidden', 'true');
      this.listEl.innerHTML = '';
      if (this.metaEl) this.metaEl.textContent = '';
      return;
    }
    const display = String(state.schema?.ui?.display || 'timeline');
    if (display === 'hidden') {
      this.el.classList.remove('is-active');
      this.el.setAttribute('aria-hidden', 'true');
      this.listEl.innerHTML = '';
      if (this.metaEl) this.metaEl.textContent = '';
      return;
    }

    this.listEl.innerHTML = '';
    const stages = state.schema.stages;
    stages.forEach((stage, idx) => {
      const item = document.createElement('div');
      item.className = 'stage-timeline-item';
      if (stage.id === state.currentId) item.classList.add('is-active');
      if (idx < state.index) item.classList.add('is-done');
      item.textContent = truncate(stage.name || stage.id || `阶段${idx + 1}`);
      item.title = String(stage.name || stage.id || '').trim();
      this.listEl.appendChild(item);
    });

    if (this.metaEl && state.schema?.ui?.showProgress !== false) {
      const total = stages.length;
      const current = state.index >= 0 ? state.index + 1 : 0;
      this.metaEl.textContent = total ? `${current}/${total}` : '';
    }

    this.el.classList.add('is-active');
    this.el.setAttribute('aria-hidden', 'false');
  }
}
