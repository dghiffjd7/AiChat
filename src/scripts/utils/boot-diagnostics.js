// 启动诊断：零依赖。index.html 内联脚本会先建好 window.__chatappBootDiag 并捕获早期错误，
// 主模块与 safeInvoke 往里写阶段/调用结果；启动超时时内联看门狗把它渲染到 loading 界面。
export const BOOT_DIAG_KEY = '__chatappBootDiag';
const MAX_PHASES = 40;
const MAX_ERRORS = 10;

const now = () => Date.now();

const createBootDiag = () => ({
  startedAt: now(),
  moduleLoaded: false,
  runtimeReady: false,
  phases: [],
  invoke: { ok: 0, timeout: 0, error: 0, lastTimeout: '', lastError: '', lastCommand: '' },
  errors: [],
});

export const getBootDiag = (target = globalThis) => {
  if (!target || typeof target !== 'object') return createBootDiag();
  const existing = target[BOOT_DIAG_KEY];
  if (existing && typeof existing === 'object') {
    if (!Array.isArray(existing.phases)) existing.phases = [];
    if (!Array.isArray(existing.errors)) existing.errors = [];
    if (!existing.invoke || typeof existing.invoke !== 'object') {
      existing.invoke = { ok: 0, timeout: 0, error: 0, lastTimeout: '', lastError: '', lastCommand: '' };
    }
    if (!Number.isFinite(Number(existing.startedAt))) existing.startedAt = now();
    return existing;
  }
  const created = createBootDiag();
  target[BOOT_DIAG_KEY] = created;
  return created;
};

export const markBootPhase = (name, { target = globalThis, detail = '' } = {}) => {
  const diag = getBootDiag(target);
  const phase = String(name || '').trim();
  if (!phase) return diag;
  if (diag.phases.length >= MAX_PHASES) diag.phases.shift();
  diag.phases.push({ name: phase, at: now() - Number(diag.startedAt || now()), detail: String(detail || '').slice(0, 120) });
  if (phase === 'module-evaluated') diag.moduleLoaded = true;
  if (phase === 'done') diag.runtimeReady = true;
  return diag;
};

export const recordInvokeResult = ({ cmd = '', status = 'ok', message = '' } = {}, { target = globalThis } = {}) => {
  const diag = getBootDiag(target);
  const command = String(cmd || '').trim();
  const kind = status === 'timeout' ? 'timeout' : status === 'error' ? 'error' : 'ok';
  diag.invoke[kind] += 1;
  diag.invoke.lastCommand = command;
  if (kind === 'timeout') diag.invoke.lastTimeout = command;
  if (kind === 'error') diag.invoke.lastError = `${command}: ${String(message || '').slice(0, 160)}`;
  return diag;
};

export const recordBootError = (message, { target = globalThis } = {}) => {
  const diag = getBootDiag(target);
  const text = String(message || '').trim();
  if (!text) return diag;
  if (diag.errors.length >= MAX_ERRORS) diag.errors.shift();
  diag.errors.push({ at: now() - Number(diag.startedAt || now()), message: text.slice(0, 300) });
  return diag;
};

export const buildBootDiagReport = (diag = {}, { userAgent = '', version = '', at = now() } = {}) => {
  const elapsed = Math.max(0, Math.round((at - Number(diag.startedAt || at)) / 100) / 10);
  const phases = (Array.isArray(diag.phases) ? diag.phases : [])
    .map(item => `${item.name}@${(Number(item.at) / 1000).toFixed(1)}s${item.detail ? `(${item.detail})` : ''}`)
    .join(' > ') || '(无)';
  const invoke = diag.invoke || {};
  const errors = (Array.isArray(diag.errors) ? diag.errors : [])
    .map(item => `[${(Number(item.at) / 1000).toFixed(1)}s] ${item.message}`)
    .join('\n') || '(无)';
  return [
    `OmniTavern 启动诊断${version ? ` v${version}` : ''}`,
    `耗时: ${elapsed}s | 主模块: ${diag.moduleLoaded ? '已加载' : '未加载'} | 运行时就绪: ${diag.runtimeReady ? '是' : '否'}`,
    `阶段: ${phases}`,
    `原生调用: ok=${invoke.ok || 0} timeout=${invoke.timeout || 0} error=${invoke.error || 0}`
      + (invoke.lastTimeout ? ` | 最近超时=${invoke.lastTimeout}` : '')
      + (invoke.lastError ? ` | 最近错误=${invoke.lastError}` : '')
      + (invoke.lastCommand ? ` | 最近调用=${invoke.lastCommand}` : ''),
    `错误:\n${errors}`,
    `UA: ${String(userAgent || '').slice(0, 240)}`,
  ].join('\n');
};
