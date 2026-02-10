/**
 * Rich text renderer (safe, no raw HTML injection)
 * - Supports fenced code blocks (```lang ... ```)
 * - For HTML code blocks containing <body>...</body>, render sandboxed iframe preview (ST 酒馆助手风格)
 */

import { logger } from '../../utils/logger.js';
import { emitDebugLog } from '../../utils/debug-log.js';
import { appSettings } from '../../storage/app-settings.js';
import { buildVariableStatusSnapshot } from '../variable-status-card.js';

const iframeDebugState = new Map();
const directLoadCache = new Map();
const DIRECT_LOAD_CACHE_TTL = 5 * 60 * 1000;
const DIRECT_LOAD_CACHE_LIMIT = 6;
const readDirectLoadCache = (url) => {
    const key = String(url || '').trim();
    if (!key) return null;
    const record = directLoadCache.get(key);
    if (!record) return null;
    const at = Number(record.at || 0);
    if (!Number.isFinite(at) || at <= 0 || (Date.now() - at) > DIRECT_LOAD_CACHE_TTL) {
        directLoadCache.delete(key);
        return null;
    }
    return String(record.html || '');
};
const writeDirectLoadCache = (url, html) => {
    const key = String(url || '').trim();
    if (!key) return;
    directLoadCache.set(key, { html: String(html || ''), at: Date.now() });
    if (directLoadCache.size <= DIRECT_LOAD_CACHE_LIMIT) return;
    const oldest = Array.from(directLoadCache.entries())
        .sort((a, b) => Number(a?.[1]?.at || 0) - Number(b?.[1]?.at || 0))
        .slice(0, Math.max(0, directLoadCache.size - DIRECT_LOAD_CACHE_LIMIT));
    oldest.forEach(([k]) => directLoadCache.delete(k));
};

const getIframeState = (id, init) => {
    if (!id) return null;
    if (!iframeDebugState.has(id) && init) iframeDebugState.set(id, init);
    return iframeDebugState.get(id) || null;
};
const warnIframe = (msg, id, extra = '') => {
    const suffix = extra ? ` ${extra}` : '';
    logger.warn(`[iframe] ${msg} id=${id || 'unknown'}${suffix}`);
};
const escapeHtmlText = (value) => String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
const isLikelyBlankStaticDoc = (doc = '') => {
    const raw = String(doc || '');
    if (!raw.trim()) return true;
    const noScript = raw.replace(/<script[\s\S]*?<\/script\s*>/gi, '');
    const noStyle = noScript.replace(/<style[\s\S]*?<\/style\s*>/gi, '');
    const visibleText = noStyle
        .replace(/<[^>]*>/g, ' ')
        .replace(/&nbsp;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const hasRenderableMarkup = /<(img|svg|table|details|pre|code|p|li|h1|h2|h3|article|section|main|canvas)\b/i.test(noStyle);
    const appShellOnly = /<div[^>]+id=["'](?:app|root|__next|__nuxt|status|mount|container)[^"']*["'][^>]*>\s*<\/div>/i.test(noStyle);
    if (appShellOnly && !hasRenderableMarkup && visibleText.length < 12) return true;
    return !hasRenderableMarkup && visibleText.length < 24;
};
const buildStaticFallbackPlaceholderDoc = (reason = '', { canRecover = false, iframeId = '' } = {}) => {
    const msg = String(reason || '').trim().slice(0, 320);
    const safeReason = escapeHtmlText(msg || 'runtime-error');
    const recoverBtn = canRecover
        ? '<button id="__chatapp_recover_btn" type="button" style="margin-top:10px;padding:8px 10px;border-radius:8px;border:1px solid #3b424d;background:#1e2630;color:#dbe7f2;font-size:12px;cursor:pointer;">恢复动态渲染</button>'
        : '';
    const recoverScript = canRecover
        ? `<script>(function(){var id=${JSON.stringify(String(iframeId || ''))};var btn=document.getElementById('__chatapp_recover_btn');if(!btn)return;btn.addEventListener('click',function(){try{parent.postMessage({type:'chatapp:iframe-recover-dynamic',id:id},'*');}catch{}});})();<\/script>`
        : '';
    return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><style>
html,body{margin:0;padding:0;background:#0f1115;color:#e6edf3;font-family:system-ui,-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif}
.box{padding:14px;border:1px solid #2c323a;border-radius:10px;background:#151a20;margin:10px}
.title{font-size:14px;font-weight:700;margin-bottom:8px}
.desc{font-size:12px;opacity:.88;line-height:1.45}
.err{margin-top:10px;padding:8px;border-radius:8px;background:#0f1318;border:1px dashed #3b424d;font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;font-size:11px;white-space:pre-wrap;word-break:break-word}
</style></head><body><div class="box"><div class="title">Static fallback applied</div><div class="desc">This card page depends on runtime scripts and cannot be rendered interactively in fallback mode.</div><div class="err">${safeReason}</div>${recoverBtn}</div>${recoverScript}</body></html>`;
};
const shouldStaticFallbackForIframeError = (message = '') => {
    const msg = String(message || '').toLowerCase();
    if (!msg) return false;
    return /cannot read properties of undefined|is not defined|typeerror|referenceerror|syntaxerror|unhandledrejection|resource-load-failed|failed to fetch|script error/.test(msg);
};
const setIframeStaticFallbackDoc = (id, doc) => {
    const key = String(id || '').trim();
    if (!key) return;
    const st = getIframeState(key, { createdAt: Date.now() });
    if (!st) return;
    st.staticDoc = String(doc || '');
};
const setIframeDynamicDoc = (id, doc, source = 'dynamic-srcdoc') => {
    const key = String(id || '').trim();
    if (!key) return;
    const st = getIframeState(key, { createdAt: Date.now() });
    if (!st) return;
    st.dynamicDoc = String(doc || '');
    st.dynamicSource = String(source || 'dynamic-srcdoc');
};
const applyIframeDynamicRecover = (iframe, id, reason = '') => {
    if (!iframe || !id) return false;
    const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
    const dynamicDoc = String(st?.dynamicDoc || '').trim();
    if (!dynamicDoc) return false;
    try {
        iframe.dataset.staticFallbackApplied = '0';
        iframe.dataset.iframeSource = String(st?.dynamicSource || 'dynamic-srcdoc');
        iframe.dataset.iframeReady = '0';
        iframe.dataset.iframeLoaded = '0';
        iframe.dataset.iframeError = reason || 'dynamic-recover';
        iframe.dataset.iframeDocSent = '1';
        iframe.style.height = '320px';
        iframe.style.minHeight = '220px';
        iframe.style.maxHeight = '1200px';
        iframe.removeAttribute('src');
        iframe.srcdoc = dynamicDoc;
        if (st) st.dynamicRecoverAt = Date.now();
        const msg = `dynamic-recover-applied id=${id}${reason ? ` reason=${reason}` : ''}`;
        emitDebugLog({ source: 'iframe', type: 'warn', message: msg, force: true });
        warnIframe('dynamic-recover', id, reason ? `reason=${reason}` : '');
        return true;
    } catch (err) {
        const errMsg = err?.message ? String(err.message) : String(err || 'recover-failed');
        warnIframe('dynamic-recover-failed', id, `err=${errMsg}`);
        return false;
    }
};
const applyIframeStaticFallback = (iframe, id, reason = '') => {
    if (!iframe || !id) return false;
    if (iframe.dataset.staticFallbackApplied === '1') return false;
    const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
    const staticDoc = String(st?.staticDoc || '').trim();
    if (!staticDoc) return false;
    let nextDoc = staticDoc;
    if (isLikelyBlankStaticDoc(staticDoc)) {
        nextDoc = buildStaticFallbackPlaceholderDoc(reason, { canRecover: Boolean(st?.dynamicDoc), iframeId: id });
        const hint = `static-fallback-placeholder id=${id} reason=${String(reason || '').slice(0, 160)}`;
        emitDebugLog({ source: 'iframe', type: 'warn', message: hint, force: true });
        warnIframe('static-fallback-placeholder', id, reason ? `reason=${reason}` : '');
    }
    try {
        iframe.dataset.staticFallbackApplied = '1';
        iframe.dataset.iframeSource = 'static-srcdoc';
        iframe.dataset.iframeReady = '0';
        iframe.dataset.iframeLoaded = '0';
        iframe.dataset.iframeError = reason || 'static-fallback';
        iframe.dataset.iframeDocSent = '1';
        iframe.style.height = '320px';
        iframe.style.minHeight = '220px';
        iframe.style.maxHeight = '1200px';
        iframe.removeAttribute('src');
        iframe.srcdoc = nextDoc;
        if (st) st.staticFallbackAt = Date.now();
        const msg = `static-fallback-applied id=${id}${reason ? ` reason=${reason}` : ''}`;
        emitDebugLog({ source: 'iframe', type: 'warn', message: msg, force: true });
        warnIframe('static-fallback', id, reason ? `reason=${reason}` : '');
        return true;
    } catch (err) {
        const errMsg = err?.message ? String(err.message) : String(err || 'apply-failed');
        warnIframe('static-fallback-failed', id, `err=${errMsg}`);
        return false;
    }
};
const isLiveIframe = (iframe, iframeId = '') => {
    if (iframe && iframe.isConnected) return true;
    if (iframeId) iframeDebugState.delete(iframeId);
    return false;
};

const buildNestedVars = (flat = {}) => {
    const root = {};
    const toPath = (val) => String(val || '')
        .replace(/\[([^\]]+)\]/g, '.$1')
        .split('.')
        .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    const isIndex = (seg) => /^\d+$/.test(seg);
    const setByPath = (obj, path, value) => {
        const parts = toPath(path);
        if (!parts.length) return;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
            const key = isIndex(parts[i]) ? Number(parts[i]) : parts[i];
            const nextKey = parts[i + 1];
            const shouldArray = isIndex(nextKey);
            if (!cur[key] || typeof cur[key] !== 'object') {
                cur[key] = shouldArray ? [] : {};
            }
            cur = cur[key];
        }
        const lastKey = isIndex(parts[parts.length - 1]) ? Number(parts[parts.length - 1]) : parts[parts.length - 1];
        cur[lastKey] = value;
    };
    Object.entries(flat || {}).forEach(([key, value]) => {
        const name = String(key || '').trim();
        if (!name) return;
        setByPath(root, name, value);
    });
    return root;
};

const getIframeHostUrl = () => {
    try {
        return new URL('iframe-host.html', window.location.href).toString();
    } catch {
        return 'iframe-host.html';
    }
};
const escapeText = (s) => String(s ?? '');
const allowRichIframeScripts = () => appSettings.get().allowRichIframeScripts === true;
const shouldLogRichDebug = () => {
    const settings = appSettings.get();
    return settings.debugExecutionLogs === true || settings.showDebugToggle === true;
};
const stripScriptsForPreview = (html) => String(html ?? '').replace(/<script[\s\S]*?<\/script\s*>/gi, '');
const shouldEnableMvuCompat = (html) => {
    const raw = String(html || '');
    if (!raw) return false;
    return /getAllVariables\s*\(|getVariables\s*\(|waitGlobalInitialized\s*\(|\bMvu\b|StatusPlaceHolderImpl|mag_variable_|\$\(\s*['"]body['"]\s*\)\s*\.load\s*\(/i.test(raw);
};
const shouldInjectFrameworkShim = (html, { directLoad = false } = {}) => {
    const raw = String(html || '');
    if (!raw && !directLoad) return false;
    if (directLoad) return true;
    return /\bVueRouter\b|\bVue\b|\bPinia\b|createApp\s*\(|createRouter\s*\(|createPinia\s*\(/.test(raw);
};
const shouldInjectZodShim = (html) => {
    const raw = String(html || '');
    if (!raw) return false;
    return /\bZod\b|\bz\.\w+\s*\(|registerMvuSchema\s*\(|registerVariableSchema\s*\(|schema\s*:\s*z\./i.test(raw);
};
const analyzeCompatProfile = (html, { directLoad = false } = {}) => {
    const raw = String(html || '');
    const flags = {
        bodyLoad: /\$\(\s*['"]body['"]\s*\)\s*\.load\s*\(/i.test(raw),
        jqueryLoad: /\.load\s*\(/i.test(raw),
        vue: /\bVue\b|createApp\s*\(|from\s+['"]vue['"]/i.test(raw),
        vueRouter: /\bVueRouter\b|createRouter\s*\(|from\s+['"]vue-router['"]/i.test(raw),
        pinia: /\bPinia\b|createPinia\s*\(|from\s+['"]pinia['"]/i.test(raw),
        stGlobals: /\bSillyTavern\b|\bTavernHelper\b|\btoastr\b|\bYAML\b|registerMvuSchema\s*\(|registerVariableSchema\s*\(|mag_variable_/i.test(raw),
        stApi: /getRequestHeaders\s*\(|\/api\/backends\//i.test(raw),
        externalScript: /<script[^>]+src\s*=\s*["']https?:\/\//i.test(raw),
        externalEsmImport: /\bimport\s+[^;]*['"]https?:\/\//i.test(raw),
    };
    let profile = 'basic-inline';
    if (flags.bodyLoad || directLoad) profile = 'direct-load-static';
    if (flags.vue || flags.vueRouter || flags.pinia) profile = flags.bodyLoad || directLoad ? 'direct-load-framework' : 'inline-framework';
    if (flags.stGlobals || flags.stApi) profile = 'st-runtime-dependent';
    return { profile, flags };
};
const summarizeCompatFlags = (flags = {}) => Object.entries(flags)
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .join(',');
const detectVueRuntimePreference = (html) => {
    const raw = String(html || '');
    if (!raw) return 3;
    if (/\bnew\s+Vue\s*\(|\bVue\.use\s*\(|vue-router@3|vue@2/i.test(raw)) return 2;
    return 3;
};
const rewriteDirectLoadAssetPaths = (htmlCode, baseHref) => {
    const html = String(htmlCode || '');
    const base = String(baseHref || '').trim();
    if (!html || !base) return { html, rewritten: 0, failed: false };
    let rewritten = 0;
    try {
        const abs = (path) => {
            try { return new URL(String(path || '').replace(/^\/+/, ''), base).toString(); }
            catch { return `${base}${String(path || '').replace(/^\/+/, '')}`; }
        };
        let next = html;
        // Rewrite common root-relative Vite/static asset refs to the direct-load base path.
        next = next.replace(/(["'])\/(assets\/[^"'`]+)\1/gi, (m, q, p) => {
            rewritten += 1;
            return `${q}${abs(p)}${q}`;
        });
        next = next.replace(/(["'])\/(static\/[^"'`]+)\1/gi, (m, q, p) => {
            rewritten += 1;
            return `${q}${abs(p)}${q}`;
        });
        // CSS url('/assets/...') or url(/assets/...)
        next = next.replace(/url\(\s*(["'])?\/(assets\/[^)"']+)\1?\s*\)/gi, (m, q, p) => {
            rewritten += 1;
            const qq = q || '';
            return `url(${qq}${abs(p)}${qq})`;
        });
        return { html: next, rewritten, failed: false };
    } catch {
        return { html, rewritten: 0, failed: true };
    }
};
const diagnoseIframeError = (message = '') => {
    const msg = String(message || '');
    if (!msg) return '';
    if (/SillyTavern|TavernHelper|getRequestHeaders/i.test(msg)) return 'hint=st-api-missing';
    if (/VueRouter is not defined/i.test(msg)) return 'hint=vue-router-missing-or-cdn-blocked';
    if (/Vue is not defined/i.test(msg)) return 'hint=vue-missing-or-cdn-blocked';
    if (/Pinia is not defined|createPinia is not defined/i.test(msg)) return 'hint=pinia-missing-or-cdn-blocked';
    if (/\$ is not defined|jQuery is not defined/i.test(msg)) return 'hint=jquery-shim-missing-or-overwritten';
    if (/errorCatched is not defined|errorCatched is not a function/i.test(msg)) return 'hint=compat-helper-binding-missing';
    if (/Failed to fetch|NetworkError|CORS|cross-origin/i.test(msg)) return 'hint=network-or-cors';
    if (/Unexpected token|Invalid regular expression|SyntaxError/i.test(msg)) return 'hint=user-script-syntax';
    return '';
};
const buildMvuCompatBridge = ({ iframeId, sessionId, debugTag, messageId } = {}) => {
    const id = String(iframeId || '');
    const sid = String(sessionId || '');
    const tag = String(debugTag || '');
    const mid = String(messageId || '');
    return `
<script>
(() => {
  const CHATAPP_IFRAME_ID = ${JSON.stringify(id)};
  const CHATAPP_SESSION_ID = ${JSON.stringify(sid)};
  const CHATAPP_DEBUG_TAG = ${JSON.stringify(tag)};
  const CHATAPP_MESSAGE_ID = ${JSON.stringify(mid)};
  const listeners = new Map();
  const withTag = (message) => {
    const msg = String(message || '');
    if (!CHATAPP_DEBUG_TAG) return msg;
    return 'tag=' + CHATAPP_DEBUG_TAG + ' ' + msg;
  };
  const postCompatLog = (level, message) => {
    const lv = String(level || 'info');
    const msg = withTag(message);
    try {
      parent.postMessage({ type: 'chatapp:iframe-debug', id: CHATAPP_IFRAME_ID, level: lv, message: msg }, '*');
    } catch {}
    try {
      const fn = (lv === 'warn' || lv === 'error') ? console.warn : console.log;
      fn('[mvu-compat] ' + msg);
    } catch {}
  };

  const ensureEventSet = (event) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    return listeners.get(event);
  };
  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set.values()) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  };
  const eventOn = (event, cb) => {
    if (!event || typeof cb !== 'function') return;
    ensureEventSet(event).add(cb);
  };
  const eventRemoveListener = (event, cb) => {
    if (!event || typeof cb !== 'function') return;
    const set = listeners.get(event);
    if (set) set.delete(cb);
  };
  const normalizeVars = (input) => {
    const vars = input && typeof input === 'object' ? input : {};
    const stat = (vars.stat_data && typeof vars.stat_data === 'object')
      ? vars.stat_data
      : (vars.variables && typeof vars.variables === 'object' ? vars.variables : {});
    const globalVars = (vars.global_variables && typeof vars.global_variables === 'object') ? vars.global_variables : {};
    return {
      ...vars,
      stat_data: stat,
      variables: stat,
      status_current_variables: stat,
      global_variables: globalVars,
    };
  };
  const state = { vars: normalizeVars({}) };
  const cloneVars = (input) => {
    try { return structuredClone(input); } catch {}
    try { return JSON.parse(JSON.stringify(input)); } catch {}
    return input;
  };

  const ensureMvu = () => {
    if (!window.Mvu || typeof window.Mvu !== 'object') {
      window.Mvu = { events: {} };
    }
    if (!window.Mvu.events || typeof window.Mvu.events !== 'object') {
      window.Mvu.events = {};
    }
    if (!window.Mvu.events.VARIABLE_UPDATE_ENDED) {
      window.Mvu.events.VARIABLE_UPDATE_ENDED = 'mag_variable_update_ended';
    }
    if (!window.Mvu.events.VARIABLE_UPDATE_STARTED) {
      window.Mvu.events.VARIABLE_UPDATE_STARTED = 'mag_variable_update_started';
    }
    if (!window.Mvu.events.VARIABLE_INITIALIZED) {
      window.Mvu.events.VARIABLE_INITIALIZED = 'mag_variable_initialized';
    }
    if (typeof window.Mvu.getMvuData !== 'function') {
      window.Mvu.getMvuData = () => cloneVars(state.vars);
    }
    if (typeof window.Mvu.replaceMvuData !== 'function') {
      window.Mvu.replaceMvuData = async (next) => {
        try {
          setVars(normalizeVars(next || {}));
          return true;
        } catch {
          return false;
        }
      };
    }
  };

  const setVars = (vars) => {
    state.vars = normalizeVars(vars);
    emit(window.Mvu?.events?.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', state.vars);
  };

  const safeWaitGlobalInitialized = (name) => new Promise((resolve) => {
    if (name && window[name]) return resolve(window[name]);
    let done = false;
    const tick = () => {
      if (done) return;
      if (name && window[name]) {
        done = true;
        return resolve(window[name]);
      }
      if (!name) {
        done = true;
        return resolve(null);
      }
      setTimeout(tick, 30);
    };
    tick();
    setTimeout(() => { if (!done) resolve(window[name] || null); done = true; }, 3000);
  });
  const safeErrorCatched = (fn) => (...args) => {
    try { return fn?.(...args); } catch (err) { console.error(err); }
  };
  const compatApi = (window.__chatappCompat && typeof window.__chatappCompat === 'object')
    ? window.__chatappCompat
    : {};
  const defaultErrorCatched = (fn) => safeErrorCatched(fn);
  const normalizeErrorCatched = (next) => (typeof next === 'function' ? next : defaultErrorCatched);
  compatApi.getAllVariables = () => state.vars;
  compatApi.getVariables = () => state.vars;
  compatApi.getCurrentMessageId = () => CHATAPP_MESSAGE_ID;
  compatApi.insertOrAssignVariables = async (patch, options = {}) => {
    const next = normalizeVars(cloneVars(state.vars) || {});
    const payload = patch && typeof patch === 'object' ? patch : {};
    const type = String(options?.type || '').toLowerCase();
    if (type === 'message') {
      const stat = (next.stat_data && typeof next.stat_data === 'object') ? next.stat_data : {};
      Object.entries(payload).forEach(([k, v]) => { stat[k] = v; });
      next.stat_data = stat;
      next.variables = stat;
      next.status_current_variables = stat;
    } else {
      Object.entries(payload).forEach(([k, v]) => { next[k] = v; });
    }
    setVars(next);
    return true;
  };
  compatApi.deleteVariable = async (key, options = {}) => {
    const rawKey = String(key || '').trim();
    if (!rawKey) return false;
    const next = normalizeVars(cloneVars(state.vars) || {});
    const type = String(options?.type || '').toLowerCase();
    if (type === 'message') {
      if (next.stat_data && typeof next.stat_data === 'object') {
        try { delete next.stat_data[rawKey]; } catch {}
      }
    } else {
      try { delete next[rawKey]; } catch {}
    }
    setVars(next);
    return true;
  };
  compatApi.eventOn = (event, cb) => eventOn(event, cb);
  compatApi.eventRemoveListener = (event, cb) => eventRemoveListener(event, cb);
  compatApi.waitGlobalInitialized = (name) => safeWaitGlobalInitialized(name);
  compatApi.errorCatched = normalizeErrorCatched(compatApi.errorCatched);
  window.__chatappCompat = compatApi;

  window.getAllVariables = window.getAllVariables || (() => state.vars);
  window.getVariables = window.getVariables || (() => state.vars);
  if (typeof window.getCurrentMessageId !== 'function') window.getCurrentMessageId = () => CHATAPP_MESSAGE_ID;
  if (typeof window.insertOrAssignVariables !== 'function') {
    window.insertOrAssignVariables = (...args) => compatApi.insertOrAssignVariables(...args);
  }
  if (typeof window.deleteVariable !== 'function') {
    window.deleteVariable = (...args) => compatApi.deleteVariable(...args);
  }
  if (typeof window.eventOn !== 'function') window.eventOn = eventOn;
  if (typeof window.eventRemoveListener !== 'function') window.eventRemoveListener = eventRemoveListener;
  if (typeof window.waitGlobalInitialized !== 'function') {
    window.waitGlobalInitialized = (name) => safeWaitGlobalInitialized(name);
  }
  if (typeof window.errorCatched !== 'function') window.errorCatched = defaultErrorCatched;
  try {
    Object.defineProperty(window, 'errorCatched', {
      configurable: false,
      enumerable: true,
      get() { return normalizeErrorCatched(compatApi.errorCatched); },
      set(next) {
        compatApi.errorCatched = normalizeErrorCatched(next);
      },
    });
  } catch {}
  window.getAllVariables = () => compatApi.getAllVariables();
  window.getVariables = () => (typeof compatApi.getVariables === 'function' ? compatApi.getVariables() : compatApi.getAllVariables());
  window.getCurrentMessageId = () => (typeof compatApi.getCurrentMessageId === 'function' ? compatApi.getCurrentMessageId() : CHATAPP_MESSAGE_ID);
  window.insertOrAssignVariables = (...args) => compatApi.insertOrAssignVariables(...args);
  window.deleteVariable = (...args) => compatApi.deleteVariable(...args);
  window.eventOn = (event, cb) => compatApi.eventOn(event, cb);
  window.eventRemoveListener = (event, cb) => compatApi.eventRemoveListener(event, cb);
  window.waitGlobalInitialized = (name) => compatApi.waitGlobalInitialized(name);
  const ensureTavernHelperApi = () => {
    const helper = (window.TavernHelper && typeof window.TavernHelper === 'object')
      ? window.TavernHelper
      : {};
    helper.getAllVariables = (...args) => window.getAllVariables(...args);
    helper.getVariables = (...args) => window.getVariables(...args);
    helper.getCurrentMessageId = (...args) => window.getCurrentMessageId(...args);
    helper.insertOrAssignVariables = (...args) => window.insertOrAssignVariables(...args);
    helper.deleteVariable = (...args) => window.deleteVariable(...args);
    helper.waitGlobalInitialized = (name) => window.waitGlobalInitialized(name);
    helper.replaceVariables = async (next, options = {}) => {
      const type = String(options?.type || '').toLowerCase();
      const payload = (next && typeof next === 'object') ? next : {};
      if (type === 'message') {
        const normalized = normalizeVars(cloneVars(state.vars) || {});
        const stat = (payload.stat_data && typeof payload.stat_data === 'object')
          ? payload.stat_data
          : payload;
        normalized.stat_data = stat;
        normalized.variables = stat;
        normalized.status_current_variables = stat;
        setVars(normalized);
        return true;
      }
      setVars(normalizeVars(payload));
      return true;
    };
    if (typeof helper.getTavernHelperVersion !== 'function') {
      helper.getTavernHelperVersion = async () => '4.0.99-chatapp';
    }
    window.TavernHelper = helper;
    if (!window.SillyTavern || typeof window.SillyTavern !== 'object') {
      window.SillyTavern = {};
    }
    if (!window.SillyTavern.TavernHelper || typeof window.SillyTavern.TavernHelper !== 'object') {
      window.SillyTavern.TavernHelper = helper;
    }
    ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables']
      .forEach((name) => {
        if (typeof helper[name] === 'function' && typeof window.SillyTavern[name] !== 'function') {
          window.SillyTavern[name] = (...args) => helper[name](...args);
        }
      });
    postCompatLog('info', 'tavern-helper-shim-ready');
  };
  ensureTavernHelperApi();
  const exposeAlias = (name, value) => {
    const key = String(name || '').trim();
    if (!key) return;
    try { window[key] = value; } catch {}
    try { window.eval('var ' + key + ' = window["' + key + '"];'); } catch {}
  };
  const exposeCoreAliases = () => {
    exposeAlias('errorCatched', window.errorCatched);
    exposeAlias('getAllVariables', window.getAllVariables);
    exposeAlias('getVariables', window.getVariables);
    exposeAlias('getCurrentMessageId', window.getCurrentMessageId);
    exposeAlias('insertOrAssignVariables', window.insertOrAssignVariables);
    exposeAlias('deleteVariable', window.deleteVariable);
    exposeAlias('eventOn', window.eventOn);
    exposeAlias('eventRemoveListener', window.eventRemoveListener);
    exposeAlias('waitGlobalInitialized', window.waitGlobalInitialized);
    exposeAlias('TavernHelper', window.TavernHelper);
    exposeAlias('SillyTavern', window.SillyTavern);
    exposeAlias('__chatappCompat', window.__chatappCompat);
    exposeAlias('Mvu', window.Mvu);
    exposeAlias('_', window._);
    try { window.eval('var $ = window.$; var jQuery = window.jQuery || window.$; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var TavernHelper = window.TavernHelper; var SillyTavern = window.SillyTavern;'); } catch {}
    postCompatLog('info', 'mvu-alias-ready');
  };

  const ensureLodash = () => {
    if (!window._ || typeof window._ !== 'object') window._ = {};
    const _ = window._;
    if (typeof _.isArray !== 'function') _.isArray = Array.isArray;
    if (typeof _.isObject !== 'function') _.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof _.isNil !== 'function') _.isNil = (v) => v === null || v === undefined;
    if (typeof _.clamp !== 'function') _.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const toPath = (raw) => String(raw || '')
      .replace(/\\[([^\\]]+)\\]/g, '.$1')
      .split('.')
      .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (typeof _.get !== 'function') {
      _.get = (obj, path, defVal) => {
        const parts = toPath(path);
        let cur = obj;
        for (const part of parts) {
          if (cur === null || cur === undefined) return defVal;
          cur = cur[part];
        }
        return cur === undefined ? defVal : cur;
      };
    }
    if (typeof _.set !== 'function') {
      _.set = (obj, path, value) => {
        const parts = toPath(path);
        if (!parts.length) return obj;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
          cur = cur[key];
        }
        cur[parts[parts.length - 1]] = value;
        return obj;
      };
    }
  };

  const ensureMiniQuery = () => {
    const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
    if (hasJq) return;
    if (typeof window.$ === 'function' && window.$.__chatappMini) return;
    const parseLoadTarget = (input) => {
      const raw = String(input || '').trim();
      if (!raw) return { url: '', selector: '' };
      const m = raw.match(/^(\S+)\s+(.+)$/);
      if (!m) return { url: raw, selector: '' };
      return { url: String(m[1] || '').trim(), selector: String(m[2] || '').trim() };
    };
    const toAbsUrl = (url) => {
      const raw = String(url || '').trim();
      if (!raw) return '';
      try {
        return new URL(raw, window.location.href).toString();
      } catch {
        return raw;
      }
    };
    const parseHtml = (html) => {
      try {
        return new DOMParser().parseFromString(String(html || ''), 'text/html');
      } catch {
        return null;
      }
    };
    const pickHtmlBySelector = (html, selector) => {
      const sel = String(selector || '').trim();
      if (!sel) return String(html || '');
      const doc = parseHtml(html);
      if (!doc) return '';
      const hit = doc.querySelector(sel);
      return hit ? String(hit.innerHTML || '') : '';
    };
    const applyHtmlToNodes = (nodes, html) => {
      const text = String(html || '');
      nodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        node.innerHTML = text;
      });
    };
    const mountRemoteFrame = (nodes, url, reason = '') => {
      const absUrl = toAbsUrl(url);
      if (!absUrl || !/^https?:\/\//i.test(absUrl)) return false;
      let mounted = false;
      nodes.forEach((node) => {
        if (!(node instanceof Element)) return;
        const frame = document.createElement('iframe');
        frame.src = absUrl;
        frame.setAttribute('referrerpolicy', 'no-referrer');
        frame.style.cssText = 'width:100%; border:0; display:block; min-height:360px; height:70vh; max-height:720px; background:#fff;';
        node.innerHTML = '';
        node.appendChild(frame);
        mounted = true;
      });
      if (mounted) {
        postCompatLog('warn', '$.load fallback iframe url=' + absUrl + (reason ? ' reason=' + reason : ''));
      }
      return mounted;
    };
    const toNodes = (input) => {
      if (!input) return [];
      if (input instanceof Element || input === window || input === document) return [input];
      if (Array.isArray(input)) return input.filter(Boolean);
      return Array.from(document.querySelectorAll(String(input)));
    };
    const wrap = (nodes) => ({
      __chatappMini: true,
      nodes,
      text(value) {
        if (value === undefined) return nodes[0]?.textContent ?? '';
        nodes.forEach(n => { n.textContent = String(value); });
        return this;
      },
      html(value) {
        if (value === undefined) return nodes[0]?.innerHTML ?? '';
        nodes.forEach(n => { n.innerHTML = String(value); });
        return this;
      },
      css(prop, value) {
        if (!prop) return this;
        if (typeof prop === 'object') {
          nodes.forEach(n => {
            Object.entries(prop).forEach(([k, v]) => { n.style[k] = String(v); });
          });
          return this;
        }
        nodes.forEach(n => { n.style[String(prop)] = String(value); });
        return this;
      },
      addClass(cls) {
        const list = String(cls || '').split(/\s+/).filter(Boolean);
        nodes.forEach(n => n.classList.add(...list));
        return this;
      },
      removeClass(cls) {
        const list = String(cls || '').split(/\s+/).filter(Boolean);
        nodes.forEach(n => n.classList.remove(...list));
        return this;
      },
      empty() {
        nodes.forEach(n => { n.innerHTML = ''; });
        return this;
      },
      append(content) {
        if (content === undefined || content === null) return this;
        nodes.forEach((n, idx) => {
          if (typeof content === 'string') {
            n.insertAdjacentHTML('beforeend', content);
          } else if (content instanceof Node) {
            n.appendChild(idx === 0 ? content : content.cloneNode(true));
          }
        });
        return this;
      },
      load(url, dataOrCb, cb) {
        const target = parseLoadTarget(url);
        const targetUrl = target.url;
        const selector = target.selector;
        const callback = (typeof dataOrCb === 'function')
          ? dataOrCb
          : (typeof cb === 'function' ? cb : null);
        const payload = (dataOrCb && typeof dataOrCb === 'object' && !Array.isArray(dataOrCb) && !(dataOrCb instanceof FormData))
          ? dataOrCb
          : null;
        if (!targetUrl) {
          postCompatLog('warn', '$.load skipped: empty url');
          if (callback) {
            nodes.forEach((n) => {
              try { callback.call(n, '', 'error', new Error('empty url')); } catch {}
            });
          }
          return this;
        }

        const absUrl = toAbsUrl(targetUrl);
        postCompatLog('info', '$.load start url=' + absUrl + (selector ? ' selector=' + selector : ''));

        const done = (responseText, status, err) => {
          if (typeof callback !== 'function') return;
          nodes.forEach((n) => {
            try { callback.call(n, responseText, status, err || null); } catch {}
          });
        };

        const applyResponse = (responseText) => {
          let htmlText = String(responseText || '');
          if (selector) htmlText = pickHtmlBySelector(htmlText, selector);
          const fullDoc = /<html[\s>]/i.test(htmlText) || /<body[\s>]/i.test(htmlText);
          const hasScript = /<script[\s>]/i.test(htmlText);
          if (!selector && fullDoc && hasScript) {
            if (mountRemoteFrame(nodes, absUrl, 'full-document-with-script')) {
              done('', 'success', null);
              return;
            }
          }
          applyHtmlToNodes(nodes, htmlText);
          postCompatLog('info', '$.load success url=' + absUrl + ' len=' + String(htmlText.length));
          done(htmlText, 'success', null);
        };

        const onFailed = (err) => {
          const msg = err?.message ? String(err.message) : String(err || 'unknown');
          if (!selector && /^https?:\/\//i.test(absUrl) && mountRemoteFrame(nodes, absUrl, 'fetch-failed:' + msg)) {
            done('', 'fallback', err || null);
            return;
          }
          postCompatLog('warn', '$.load failed url=' + absUrl + ' err=' + msg);
          done('', 'error', err || null);
        };

        let requestUrl = absUrl;
        if (payload) {
          try {
            const qs = new URLSearchParams();
            Object.entries(payload).forEach(([k, v]) => {
              if (v === undefined || v === null) return;
              qs.append(String(k), String(v));
            });
            const query = qs.toString();
            if (query) requestUrl += (requestUrl.includes('?') ? '&' : '?') + query;
          } catch {}
        }

        fetch(requestUrl, { method: 'GET', mode: 'cors', credentials: 'omit' })
          .then((resp) => {
            if (!resp?.ok) throw new Error('http-' + String(resp?.status ?? '0'));
            return resp.text();
          })
          .then(applyResponse)
          .catch(onFailed);
        return this;
      },
    });
    const mini = (input) => {
      if (typeof input === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
        else setTimeout(input, 0);
        return wrap([]);
      }
      return wrap(toNodes(input));
    };
    mini.__chatappMini = true;
    window.$ = mini;
  };

  ensureMvu();
  ensureLodash();
  ensureMiniQuery();
  exposeCoreAliases();
  postCompatLog('info', 'bridge-ready session=' + (CHATAPP_SESSION_ID || ''));

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || data.type !== 'chatapp:mvu-vars') return;
    if (data.sessionId && CHATAPP_SESSION_ID && String(data.sessionId) !== CHATAPP_SESSION_ID) return;
    setVars(data.vars || {});
    try {
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: 'info',
        message: 'legacy-vars-applied session=' + (CHATAPP_SESSION_ID || '') + ' keys=' + String(Object.keys((data.vars && data.vars.stat_data) || {}).length),
      }, '*');
    } catch {}
  });

  const request = () => {
    try {
      parent.postMessage({ type: 'chatapp:mvu-ready', id: CHATAPP_IFRAME_ID, sessionId: CHATAPP_SESSION_ID }, '*');
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: 'info',
        message: 'legacy-bridge-ready session=' + (CHATAPP_SESSION_ID || ''),
      }, '*');
    } catch {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', request);
  else request();
})();
</script>`;
};
const buildMvuCompatBridgeLegacy = ({ iframeId, sessionId, messageId } = {}) => {
    const id = String(iframeId || '');
    const sid = String(sessionId || '');
    const mid = String(messageId || '');
    return `
<script>
(() => {
  const CHATAPP_IFRAME_ID = ${JSON.stringify(id)};
  const CHATAPP_SESSION_ID = ${JSON.stringify(sid)};
  const CHATAPP_MESSAGE_ID = ${JSON.stringify(mid)};
  const listeners = new Map();

  const ensureEventSet = (event) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    return listeners.get(event);
  };
  const emit = (event, payload) => {
    const set = listeners.get(event);
    if (!set) return;
    for (const fn of set.values()) {
      try { fn(payload); } catch (err) { console.error(err); }
    }
  };
  const eventOn = (event, cb) => {
    if (!event || typeof cb !== 'function') return;
    ensureEventSet(event).add(cb);
  };
  const eventRemoveListener = (event, cb) => {
    if (!event || typeof cb !== 'function') return;
    const set = listeners.get(event);
    if (set) set.delete(cb);
  };
  const normalizeVars = (input) => {
    const vars = input && typeof input === 'object' ? input : {};
    const stat = (vars.stat_data && typeof vars.stat_data === 'object')
      ? vars.stat_data
      : (vars.variables && typeof vars.variables === 'object' ? vars.variables : {});
    const globalVars = (vars.global_variables && typeof vars.global_variables === 'object') ? vars.global_variables : {};
    return {
      ...vars,
      stat_data: stat,
      variables: stat,
      status_current_variables: stat,
      global_variables: globalVars,
    };
  };
  const state = { vars: normalizeVars({}) };
  const cloneVars = (input) => {
    try { return structuredClone(input); } catch {}
    try { return JSON.parse(JSON.stringify(input)); } catch {}
    return input;
  };

  const ensureMvu = () => {
    if (!window.Mvu || typeof window.Mvu !== 'object') window.Mvu = { events: {} };
    if (!window.Mvu.events || typeof window.Mvu.events !== 'object') window.Mvu.events = {};
    if (!window.Mvu.events.VARIABLE_UPDATE_ENDED) window.Mvu.events.VARIABLE_UPDATE_ENDED = 'mag_variable_update_ended';
    if (!window.Mvu.events.VARIABLE_UPDATE_STARTED) window.Mvu.events.VARIABLE_UPDATE_STARTED = 'mag_variable_update_started';
    if (!window.Mvu.events.VARIABLE_INITIALIZED) window.Mvu.events.VARIABLE_INITIALIZED = 'mag_variable_initialized';
    if (typeof window.Mvu.getMvuData !== 'function') {
      window.Mvu.getMvuData = () => cloneVars(state.vars);
    }
    if (typeof window.Mvu.replaceMvuData !== 'function') {
      window.Mvu.replaceMvuData = async (next) => {
        try {
          setVars(normalizeVars(next || {}));
          return true;
        } catch {
          return false;
        }
      };
    }
  };

  const setVars = (vars) => {
    state.vars = normalizeVars(vars);
    emit(window.Mvu?.events?.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', state.vars);
  };

  window.getAllVariables = window.getAllVariables || (() => state.vars);
  window.getVariables = window.getVariables || (() => state.vars);
  if (typeof window.getCurrentMessageId !== 'function') window.getCurrentMessageId = () => CHATAPP_MESSAGE_ID;
  if (typeof window.insertOrAssignVariables !== 'function') {
    window.insertOrAssignVariables = async (patch, options = {}) => {
      const next = normalizeVars(cloneVars(state.vars) || {});
      const payload = patch && typeof patch === 'object' ? patch : {};
      const type = String(options?.type || '').toLowerCase();
      if (type === 'message') {
        const stat = (next.stat_data && typeof next.stat_data === 'object') ? next.stat_data : {};
        Object.entries(payload).forEach(([k, v]) => { stat[k] = v; });
        next.stat_data = stat;
        next.variables = stat;
        next.status_current_variables = stat;
      } else {
        Object.entries(payload).forEach(([k, v]) => { next[k] = v; });
      }
      setVars(next);
      return true;
    };
  }
  if (typeof window.deleteVariable !== 'function') {
    window.deleteVariable = async (key, options = {}) => {
      const rawKey = String(key || '').trim();
      if (!rawKey) return false;
      const next = normalizeVars(cloneVars(state.vars) || {});
      const type = String(options?.type || '').toLowerCase();
      if (type === 'message') {
        if (next.stat_data && typeof next.stat_data === 'object') {
          try { delete next.stat_data[rawKey]; } catch {}
        }
      } else {
        try { delete next[rawKey]; } catch {}
      }
      setVars(next);
      return true;
    };
  }
  if (typeof window.eventOn !== 'function') window.eventOn = eventOn;
  if (typeof window.eventRemoveListener !== 'function') window.eventRemoveListener = eventRemoveListener;
  if (typeof window.waitGlobalInitialized !== 'function') {
    window.waitGlobalInitialized = (name) => new Promise((resolve) => {
      if (name && window[name]) return resolve(window[name]);
      let done = false;
      const tick = () => {
        if (done) return;
        if (name && window[name]) {
          done = true;
          return resolve(window[name]);
        }
        if (!name) {
          done = true;
          return resolve(null);
        }
        setTimeout(tick, 30);
      };
      tick();
      setTimeout(() => { if (!done) resolve(window[name] || null); done = true; }, 3000);
    });
  }
  if (typeof window.errorCatched !== 'function') {
    window.errorCatched = (fn) => (...args) => {
      try { return fn?.(...args); } catch (err) { console.error(err); }
    };
  }
  try {
    window.eval('var errorCatched = window.errorCatched; var getAllVariables = window.getAllVariables; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var eventOn = window.eventOn; var eventRemoveListener = window.eventRemoveListener; var waitGlobalInitialized = window.waitGlobalInitialized;');
  } catch {}

  const ensureLodash = () => {
    if (!window._ || typeof window._ !== 'object') window._ = {};
    const _ = window._;
    if (typeof _.isArray !== 'function') _.isArray = Array.isArray;
    if (typeof _.isObject !== 'function') _.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof _.isNil !== 'function') _.isNil = (v) => v === null || v === undefined;
    if (typeof _.clamp !== 'function') _.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    const toPath = (raw) => String(raw || '')
      .replace(/\\[([^\\]]+)\\]/g, '.$1')
      .split('.')
      .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (typeof _.get !== 'function') {
      _.get = (obj, path, defVal) => {
        const parts = toPath(path);
        let cur = obj;
        for (const part of parts) {
          if (cur === null || cur === undefined) return defVal;
          cur = cur[part];
        }
        return cur === undefined ? defVal : cur;
      };
    }
    if (typeof _.set !== 'function') {
      _.set = (obj, path, value) => {
        const parts = toPath(path);
        if (!parts.length) return obj;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
          cur = cur[key];
        }
        cur[parts[parts.length - 1]] = value;
        return obj;
      };
    }
  };

  const ensureMiniQuery = () => {
    const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
    if (hasJq) return;
    if (typeof window.$ === 'function' && window.$.__chatappMini) return;
    const toNodes = (input) => {
      if (!input) return [];
      if (input instanceof Element || input === window || input === document) return [input];
      if (Array.isArray(input)) return input.filter(Boolean);
      return Array.from(document.querySelectorAll(String(input)));
    };
    const wrap = (nodes) => ({
      __chatappMini: true,
      nodes,
      text(value) {
        if (value === undefined) return nodes[0]?.textContent ?? '';
        nodes.forEach(n => { n.textContent = String(value); });
        return this;
      },
      html(value) {
        if (value === undefined) return nodes[0]?.innerHTML ?? '';
        nodes.forEach(n => { n.innerHTML = String(value); });
        return this;
      },
      css(prop, value) {
        if (!prop) return this;
        if (typeof prop === 'object') {
          nodes.forEach(n => {
            Object.entries(prop).forEach(([k, v]) => { n.style[k] = String(v); });
          });
          return this;
        }
        nodes.forEach(n => { n.style[String(prop)] = String(value); });
        return this;
      },
      addClass(cls) {
        const list = String(cls || '').split(/\\s+/).filter(Boolean);
        nodes.forEach(n => n.classList.add(...list));
        return this;
      },
      removeClass(cls) {
        const list = String(cls || '').split(/\\s+/).filter(Boolean);
        nodes.forEach(n => n.classList.remove(...list));
        return this;
      },
      attr(name, value) {
        const key = String(name || '').trim();
        if (!key) return value === undefined ? undefined : this;
        if (value === undefined) return nodes[0]?.getAttribute?.(key) ?? undefined;
        nodes.forEach((n) => {
          if (!(n instanceof Element)) return;
          if (value === null) n.removeAttribute(key);
          else n.setAttribute(key, String(value));
        });
        return this;
      },
      prop(name, value) {
        const key = String(name || '').trim();
        if (!key) return value === undefined ? undefined : this;
        if (value === undefined) return nodes[0]?.[key];
        nodes.forEach((n) => {
          try { n[key] = value; } catch {}
        });
        return this;
      },
      val(value) {
        if (value === undefined) return nodes[0]?.value;
        nodes.forEach((n) => {
          try { n.value = value; } catch {}
        });
        return this;
      },
      find(selector) {
        const sel = String(selector || '').trim();
        if (!sel) return wrap([]);
        const found = [];
        nodes.forEach((n) => {
          if (!(n instanceof Element) && n !== document) return;
          try {
            found.push(...Array.from(n.querySelectorAll(sel)));
          } catch {}
        });
        return wrap(found);
      },
      on(event, handler) {
        const evt = String(event || '').trim();
        if (!evt || typeof handler !== 'function') return this;
        nodes.forEach((n) => {
          try { n.addEventListener(evt, handler); } catch {}
        });
        return this;
      },
      off(event, handler) {
        const evt = String(event || '').trim();
        if (!evt || typeof handler !== 'function') return this;
        nodes.forEach((n) => {
          try { n.removeEventListener(evt, handler); } catch {}
        });
        return this;
      },
      empty() {
        nodes.forEach(n => { n.innerHTML = ''; });
        return this;
      },
      append(content) {
        if (content === undefined || content === null) return this;
        nodes.forEach((n, idx) => {
          if (typeof content === 'string') n.insertAdjacentHTML('beforeend', content);
          else if (content instanceof Node) n.appendChild(idx === 0 ? content : content.cloneNode(true));
        });
        return this;
      },
    });
    const mini = (input) => {
      if (typeof input === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
        else setTimeout(input, 0);
        return wrap([]);
      }
      return wrap(toNodes(input));
    };
    mini.__chatappMini = true;
    window.$ = mini;
  };

  ensureMvu();
  ensureLodash();
  ensureMiniQuery();

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || data.type !== 'chatapp:mvu-vars') return;
    if (data.sessionId && CHATAPP_SESSION_ID && String(data.sessionId) !== CHATAPP_SESSION_ID) return;
    setVars(data.vars || {});
  });

  const request = () => {
    try {
      parent.postMessage({ type: 'chatapp:mvu-ready', id: CHATAPP_IFRAME_ID, sessionId: CHATAPP_SESSION_ID }, '*');
    } catch {}
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', request);
  else request();
})();
</script>`;
};

let iframeBridgeScriptUrl = '';
const buildIframeBridgeScript = () => `
(() => {
  const getIframeId = () => {
    try {
      const body = document.body;
      const docEl = document.documentElement;
      return (body && body.getAttribute('data-chatapp-iframe-id')) ||
        (docEl && docEl.getAttribute('data-chatapp-iframe-id')) || '';
    } catch {
      return '';
    }
  };
  const id = getIframeId();
  let lastH = 0;
  let pressTimer = null;
  let pressActive = false;
  let pressStartedAt = 0;
  let touchActive = false;
  let touchStartPoint = null;
  const moveThreshold = 12;

  const measureContentHeight = () => {
    try {
      const body = document.body;
      if (!body) return 0;
      const kids = Array.from(body.children || []);
      if (!kids.length) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      let minTop = null;
      let maxBottom = null;
      kids.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;
        if (minTop === null || rect.top < minTop) minTop = rect.top;
        if (maxBottom === null || rect.bottom > maxBottom) maxBottom = rect.bottom;
      });
      if (minTop === null || maxBottom === null) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      const padTop = parseFloat(getComputedStyle(body).paddingTop || '0') || 0;
      const padBottom = parseFloat(getComputedStyle(body).paddingBottom || '0') || 0;
      return Math.max(0, maxBottom - minTop) + padTop + padBottom;
    } catch {
      return 0;
    }
  };

  const postResize = () => {
    try {
      const rawH = measureContentHeight();
      const h = Math.ceil(Math.max(120, rawH || 0));
      if (h && h !== lastH) {
        lastH = h;
        parent.postMessage({ type: 'chatapp:iframe-resize', id, height: h }, '*');
      }
    } catch {}
  };

  const fitToWidth = () => {
    try {
      const docEl = document.documentElement;
      const body = document.body;
      if (!docEl || !body) return;
      body.style.transform = '';
      body.style.width = '';
      docEl.style.overflowX = 'hidden';

      const clientW = Math.max(1, docEl.clientWidth || 1);
      const scrollW = Math.max(body.scrollWidth || 0, docEl.scrollWidth || 0);
      if (scrollW <= clientW + 2) {
        postResize();
        return;
      }
      let scale = clientW / scrollW;
      if (scale > 0.98) {
        postResize();
        return;
      }
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';
      docEl.style.overflowX = 'hidden';
      postResize();
    } catch {}
  };

  const getPoint = (ev) => {
    try {
      if (ev && ev.touches && ev.touches.length) {
        const t = ev.touches[0];
        return { x: t.clientX || 0, y: t.clientY || 0 };
      }
      if (ev && ev.changedTouches && ev.changedTouches.length) {
        const t = ev.changedTouches[0];
        return { x: t.clientX || 0, y: t.clientY || 0 };
      }
      const x = (ev && typeof ev.clientX === 'number') ? ev.clientX : 0;
      const y = (ev && typeof ev.clientY === 'number') ? ev.clientY : 0;
      return { x, y };
    } catch {
      return { x: 0, y: 0 };
    }
  };

  const sendPress = (phase, ev) => {
    try {
      const p = getPoint(ev);
      parent.postMessage({ type: 'chatapp:iframe-press', id, phase, x: p.x, y: p.y }, '*');
    } catch {}
  };

  const requestLayout = (() => {
    let rafId = null;
    return () => {
      if (rafId) return;
      rafId = requestAnimationFrame(() => {
        rafId = null;
        fitToWidth();
        postResize();
      });
    };
  })();

  const start = () => {
    const stripBodyWhitespace = () => {
      try {
        const body = document.body;
        if (!body) return;
        Array.from(body.childNodes || []).forEach((node) => {
          if (node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
            node.remove();
          }
        });
      } catch {}
    };
    const clampOversizedBlocks = () => {
      try {
        const body = document.body;
        const docEl = document.documentElement;
        if (!body || !docEl) return;
        const vh = Math.max(docEl.clientHeight || 0, window.innerHeight || 0);
        if (!vh) return;
        const nodes = body.querySelectorAll('*');
        nodes.forEach((el) => {
          const style = window.getComputedStyle(el);
          const display = String(style.display || '');
          if (display.includes('flex') || display.includes('grid')) {
            const align = String(style.alignItems || '');
            const justify = String(style.justifyContent || '');
            if (align.includes('center')) el.style.alignItems = 'flex-start';
            if (justify.includes('center')) el.style.justifyContent = 'flex-start';
          }
          const minH = parseFloat(style.minHeight || '');
          if (Number.isFinite(minH) && minH >= vh * 0.9) {
            el.style.minHeight = 'auto';
          }
          const h = parseFloat(style.height || '');
          if (Number.isFinite(h) && h >= vh * 0.9) {
            el.style.height = 'auto';
          }
          const maxH = parseFloat(style.maxHeight || '');
          if (Number.isFinite(maxH) && maxH >= vh * 0.9) {
            el.style.maxHeight = 'none';
          }
          const mt = parseFloat(style.marginTop || '');
          const mb = parseFloat(style.marginBottom || '');
          if (Number.isFinite(mt) && mt >= 48) el.style.marginTop = '16px';
          if (Number.isFinite(mb) && mb >= 48) el.style.marginBottom = '16px';
          const pt = parseFloat(style.paddingTop || '');
          const pb = parseFloat(style.paddingBottom || '');
          if (Number.isFinite(pt) && pt >= 64) el.style.paddingTop = '16px';
          if (Number.isFinite(pb) && pb >= 64) el.style.paddingBottom = '16px';
        });
      } catch {}
    };

    document.addEventListener('pointerdown', (ev) => {
      if (touchActive) return;
      pressActive = true;
      pressStartedAt = Date.now();
      sendPress('down', ev);
      pressTimer = setTimeout(() => {
        if (!pressActive || !pressStartedAt) return;
        if (Date.now() - pressStartedAt < 420) return;
        sendPress('longpress', ev);
      }, 520);
    }, { passive: true, capture: true });
    ['pointerup','pointercancel','pointerleave','pointerout'].forEach((t) => {
      document.addEventListener(t, (ev) => {
        if (!pressActive) return;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('up', ev);
        pressActive = false;
        pressStartedAt = 0;
      }, { passive: true, capture: true });
    });
    document.addEventListener('touchstart', (ev) => {
      touchActive = true;
      touchStartPoint = getPoint(ev);
      pressActive = true;
      pressStartedAt = Date.now();
      sendPress('down', ev);
      pressTimer = setTimeout(() => {
        if (!pressActive || !pressStartedAt) return;
        if (Date.now() - pressStartedAt < 420) return;
        sendPress('longpress', ev);
      }, 520);
    }, { passive: true, capture: true });
    document.addEventListener('touchmove', (ev) => {
      if (!pressActive || !touchStartPoint) return;
      const p = getPoint(ev);
      const dx = p.x - touchStartPoint.x;
      const dy = p.y - touchStartPoint.y;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('cancel', ev);
        pressActive = false;
        pressStartedAt = 0;
      }
    }, { passive: true, capture: true });
    document.addEventListener('touchend', (ev) => {
      if (!pressActive) {
        touchActive = false;
        touchStartPoint = null;
        return;
      }
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('up', ev);
      pressActive = false;
      pressStartedAt = 0;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true, capture: true });
    document.addEventListener('touchcancel', (ev) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('cancel', ev);
      pressActive = false;
      pressStartedAt = 0;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true, capture: true });
    document.addEventListener('contextmenu', (ev) => {
      try { ev.preventDefault(); } catch {}
      const elapsed = pressStartedAt ? (Date.now() - pressStartedAt) : 0;
      if (pressActive && elapsed >= 420) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('longpress', ev);
      }
    }, { passive: false, capture: true });
    document.addEventListener('selectstart', (ev) => {
      try { ev.preventDefault(); } catch {}
    }, { passive: false, capture: true });

    requestLayout();
    try {
      parent.postMessage({ type: 'chatapp:iframe-ready', id }, '*');
    } catch {}

    [50, 150, 300, 600].forEach((ms) => {
      setTimeout(() => { requestLayout(); }, ms);
    });
    try {
      const ro = new ResizeObserver(() => { requestLayout(); });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => { requestLayout(); }, 500);
    }
    try {
      const mo = new MutationObserver(() => { requestLayout(); });
      if (document.body) mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    window.addEventListener('load', () => setTimeout(() => { requestLayout(); }, 0));
    window.addEventListener('resize', () => setTimeout(() => { requestLayout(); }, 0));
    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') requestLayout();
    }, true);
    stripBodyWhitespace();
    clampOversizedBlocks();
    requestLayout();
  };

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'chatapp:updateViewportHeight' && typeof data.height === 'number') {
      try {
        document.documentElement.style.setProperty('--viewport-height', data.height + 'px');
      } catch {}
      requestLayout();
      return;
    }
    if (data.type === 'chatapp:ping') {
      try {
        parent.postMessage({ type: 'chatapp:pong', id }, '*');
      } catch {}
    }
  });

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
`;

const getIframeBridgeScriptUrl = () => {
    if (iframeBridgeScriptUrl) return iframeBridgeScriptUrl;
    try {
        const blob = new Blob([buildIframeBridgeScript()], { type: 'application/javascript' });
        iframeBridgeScriptUrl = URL.createObjectURL(blob);
    } catch {
        iframeBridgeScriptUrl = '';
    }
    return iframeBridgeScriptUrl;
};

const iframeResizeState = {
    resizeObserver: null,
    observedElements: new WeakMap(),
    mutationObservers: new WeakMap(),
};

const markIframePostResize = (iframe) => {
    if (!iframe) return;
    iframe.dataset.iframePostResizeAt = String(Date.now());
};

const hasRecentPostResize = (iframe, windowMs = 420) => {
    if (!iframe) return false;
    const ts = Number(iframe.dataset.iframePostResizeAt || 0);
    if (!Number.isFinite(ts) || ts <= 0) return false;
    return (Date.now() - ts) < windowMs;
};

const bindIframeDocumentPressFallback = (iframe, iframeId) => {
    try {
        if (!iframe || !iframe.contentWindow) return;
        if (iframe.dataset.iframePressFallback === '1') return;
        iframe.dataset.iframePressFallback = '1';
        const doc = iframe.contentWindow.document;
        if (!doc) return;
        const msgId = String(iframe.dataset.msgId || '');
        const getPoint = (ev) => {
            try {
                if (ev && ev.touches && ev.touches.length) {
                    const t = ev.touches[0];
                    return { x: t.clientX || 0, y: t.clientY || 0 };
                }
                if (ev && ev.changedTouches && ev.changedTouches.length) {
                    const t = ev.changedTouches[0];
                    return { x: t.clientX || 0, y: t.clientY || 0 };
                }
                const x = (ev && typeof ev.clientX === 'number') ? ev.clientX : 0;
                const y = (ev && typeof ev.clientY === 'number') ? ev.clientY : 0;
                return { x, y };
            } catch {
                return { x: 0, y: 0 };
            }
        };
        const dispatch = (phase, ev) => {
            if (iframe.dataset.iframeReady === '1') return;
            const p = getPoint(ev);
            const rect = iframe.getBoundingClientRect();
            const clientX = rect.left + p.x;
            const clientY = rect.top + p.y;
            window.dispatchEvent(new CustomEvent('chatapp-iframe-press', {
                detail: { id: String(iframeId || ''), phase, clientX, clientY, msgId }
            }));
        };
        doc.addEventListener('pointerdown', (ev) => dispatch('down', ev), { passive: true, capture: true });
        ['pointerup', 'pointercancel', 'pointerleave', 'pointerout'].forEach((t) => {
            doc.addEventListener(t, (ev) => dispatch('up', ev), { passive: true, capture: true });
        });
        doc.addEventListener('contextmenu', (ev) => {
            try { ev.preventDefault(); } catch {}
            dispatch('longpress', ev);
        }, { passive: false, capture: true });
    } catch {}
};

const adjustIframeHeight = (iframe) => {
    try {
        if (!iframe || !iframe.contentWindow) return;
        if (iframe.dataset.iframeAllowScripts === '1' && hasRecentPostResize(iframe)) return;
        const doc = iframe.contentWindow.document;
        const body = doc?.body;
        const docEl = doc?.documentElement;
        if (!body || !docEl) return;
        const bodyHeight = Math.max(body.scrollHeight || 0, body.offsetHeight || 0, body.clientHeight || 0);
        const docHeight = Math.max(docEl.scrollHeight || 0, docEl.offsetHeight || 0, docEl.clientHeight || 0);
        const newHeight = Math.max(120, bodyHeight, docHeight);
        const clamped = Math.min(newHeight + 4, 2000);
        const current = parseFloat(iframe.style.height || '') || 0;
        if (Math.abs(current - clamped) > 2) {
            iframe.style.height = `${clamped}px`;
            markIframePostResize(iframe);
            const id = String(iframe.dataset.iframeId || '');
            if (id) {
                const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
                if (st) {
                    st.resizeCount = (st.resizeCount || 0) + 1;
                    st.lastResizeAt = Date.now();
                }
            }
        }
    } catch {}
};

const observeIframeContent = (iframe) => {
    try {
        if (!iframe || iframe.dataset.iframeAutoResize === '1') return;
        if (!iframe.contentWindow) return;
        const doc = iframe.contentWindow.document;
        const body = doc?.body;
        const docEl = doc?.documentElement;
        if (!body || !docEl) return;
        iframe.dataset.iframeAutoResize = '1';
        if (typeof ResizeObserver !== 'undefined') {
            if (!iframeResizeState.resizeObserver) {
                iframeResizeState.resizeObserver = new ResizeObserver((entries) => {
                    entries.forEach((entry) => {
                        const target = entry?.target;
                        const owner = target ? iframeResizeState.observedElements.get(target) : null;
                        if (owner) adjustIframeHeight(owner);
                    });
                });
            }
            iframeResizeState.observedElements.set(body, iframe);
            iframeResizeState.observedElements.set(docEl, iframe);
            try { iframeResizeState.resizeObserver.observe(body); } catch {}
            try { iframeResizeState.resizeObserver.observe(docEl); } catch {}
        }
        if (!iframeResizeState.mutationObservers.has(iframe)) {
            try {
                const mo = new MutationObserver(() => adjustIframeHeight(iframe));
                mo.observe(body, { subtree: true, childList: true, attributes: true, characterData: true });
                mo.observe(docEl, { subtree: true, childList: true, attributes: true });
                iframeResizeState.mutationObservers.set(iframe, mo);
            } catch {}
        }
        adjustIframeHeight(iframe);
    } catch {}
};

const splitFencedCodeBlocks = (text) => {
    const src = String(text ?? '');
    const out = [];
    const re = /```([^\n`]*)\r?\n([\s\S]*?)```/g;
    let last = 0;
    let m;
    while ((m = re.exec(src))) {
        if (m.index > last) {
            out.push({ type: 'text', text: src.slice(last, m.index) });
        }
        out.push({ type: 'code', lang: String(m[1] || '').trim().toLowerCase(), code: String(m[2] || '') });
        last = re.lastIndex;
    }
    if (last < src.length) out.push({ type: 'text', text: src.slice(last) });
    return out;
};

const copyToClipboard = async (text) => {
    const s = String(text ?? '');
    try {
        if (navigator.clipboard?.writeText) {
            await navigator.clipboard.writeText(s);
            return true;
        }
    } catch {}
    try {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.position = 'fixed';
        ta.style.left = '-9999px';
        ta.style.top = '0';
        ta.setAttribute('readonly', 'true');
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand('copy');
        ta.remove();
        return ok;
    } catch {
        return false;
    }
};

const buildIframeSrcDoc = (
    htmlBodyOrDocument,
    {
        iframeId,
        needsVhHandling,
        preserveNewlines,
        injectBridgeScript = true,
        styleInBody = false,
        baseHref = '',
        bridgeScriptUrl = '',
        headPrepend = '',
    } = {},
) => {
    const content = String(htmlBodyOrDocument ?? '');
    const hasHtml = /<html[\s>]/i.test(content);
    const iframeIdValue = String(iframeId || '');
    const prewrapStyle = preserveNewlines
        ? `
<style id="__chatapp_prewrap">
  .__chatapp-prewrap,
  .__chatapp-prewrap p,
  .__chatapp-prewrap div,
  .__chatapp-prewrap span,
  .__chatapp-prewrap li {
    white-space: pre-wrap !important;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
</style>`
        : '';

    const addBodyClass = (html, className) => {
        if (!className) return html;
        return String(html).replace(/<body([^>]*)>/i, (match, attrs) => {
            const rawAttrs = String(attrs || '');
            if (/class\s*=/i.test(rawAttrs)) {
                return match.replace(/class\s*=\s*(['"])(.*?)\1/i, (m, q, val) => {
                    const next = String(val || '').trim();
                    const merged = next ? `${next} ${className}` : className;
                    return `class=${q}${merged}${q}`;
                });
            }
            return `<body${rawAttrs} class="${className}">`;
        });
    };
    const addBodyAttr = (html, attrName, attrValue) => {
        if (!attrName || !attrValue) return html;
        const attrRe = new RegExp(`\\b${attrName}\\s*=`, 'i');
        return String(html).replace(/<body([^>]*)>/i, (match, attrs) => {
            const rawAttrs = String(attrs || '');
            if (attrRe.test(rawAttrs)) return match;
            return `<body${rawAttrs} ${attrName}="${attrValue}">`;
        });
    };

    let doc = '';
    if (hasHtml) {
        doc = preserveNewlines ? addBodyClass(content, '__chatapp-prewrap') : content;
        if (iframeIdValue) {
            doc = addBodyAttr(doc, 'data-chatapp-iframe-id', iframeIdValue);
        }
    } else {
        const bodyClass = preserveNewlines ? ' class="__chatapp-prewrap"' : '';
        const wrapped = preserveNewlines ? `<div class="__chatapp-prewrap">${content}</div>` : content;
        const iframeAttr = iframeIdValue ? ` data-chatapp-iframe-id="${iframeIdValue}"` : '';
        doc = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"></head><body${bodyClass}${iframeAttr}>${wrapped}</body></html>`;
    }
    const headPrependHtml = headPrepend ? String(headPrepend) : '';
    if (headPrependHtml) {
        if (/<head[^>]*>/i.test(doc)) {
            doc = doc.replace(/<head([^>]*)>/i, `<head$1>${headPrependHtml}`);
        } else if (/<html[^>]*>/i.test(doc)) {
            doc = doc.replace(/<html([^>]*)>/i, `<html$1><head>${headPrependHtml}</head>`);
        } else {
            doc = `${headPrependHtml}${doc}`;
        }
    }

    // Base style: avoid overflowing the phone width; keep layout modern and readable
    const baseStyle = `
<style id="__chatapp_base">
  html, body { margin:0; padding:0; max-width:100% !important; width:100% !important; min-height:0 !important; height:auto !important; overflow-x:hidden !important; box-sizing:border-box; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; }
  body { padding: 12px; background: transparent; transform-origin: top left; overflow-x:hidden !important; -webkit-user-select:none; user-select:none; -webkit-touch-callout:none; display:block !important; align-items:flex-start !important; justify-content:flex-start !important; }
  *, *::before, *::after { box-sizing: border-box; max-width: 100% !important; min-width: 0 !important; }
  details, summary { max-width: 100% !important; }
  details[open] { max-height: none !important; overflow: visible !important; }
  img, video, canvas, svg { max-width: 100%; height: auto; }
  table { max-width: 100%; display:block; overflow:auto; border-collapse: collapse; }
  pre { max-width: 100%; overflow:auto; white-space: pre-wrap; overflow-wrap: anywhere; }
  code, pre { word-break: break-word; overflow-wrap: anywhere; }
</style>`;

    // Resize observer + postMessage to parent + auto-fit width
    const bridge = `
<script>
(() => {
  const id = ${JSON.stringify(String(iframeId || ''))};
  let lastH = 0;
  let pressTimer = null;
  let pressActive = false;

  const measureContentHeight = () => {
    try {
      const body = document.body;
      if (!body) return 0;
      const kids = Array.from(body.children || []);
      if (!kids.length) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      let minTop = null;
      let maxBottom = null;
      kids.forEach((el) => {
        const rect = el.getBoundingClientRect();
        if (!rect || rect.height <= 0) return;
        if (minTop === null || rect.top < minTop) minTop = rect.top;
        if (maxBottom === null || rect.bottom > maxBottom) maxBottom = rect.bottom;
      });
      if (minTop === null || maxBottom === null) {
        const rect = body.getBoundingClientRect();
        return rect ? rect.height : 0;
      }
      const padTop = parseFloat(getComputedStyle(body).paddingTop || '0') || 0;
      const padBottom = parseFloat(getComputedStyle(body).paddingBottom || '0') || 0;
      return Math.max(0, maxBottom - minTop) + padTop + padBottom;
    } catch {
      return 0;
    }
  };

  const post = () => {
    try {
      const rawH = measureContentHeight();
      const h = Math.ceil(Math.max(120, rawH || 0));
      if (h && h !== lastH) {
        lastH = h;
        parent.postMessage({ type: 'chatapp:iframe-resize', id, height: h }, '*');
      }
    } catch {}
  };

  const fitToWidth = () => {
    try {
      const docEl = document.documentElement;
      const body = document.body;
      if (!docEl || !body) return;
      // reset
      body.style.transform = '';
      body.style.width = '';
      docEl.style.overflowX = 'hidden';

      // Prefer making content responsive via CSS, then scale down to fit phone width (avoid long horizontal scroll).
      const clientW = Math.max(1, docEl.clientWidth || 1);
      const scrollW = Math.max(body.scrollWidth || 0, docEl.scrollWidth || 0);
      if (scrollW <= clientW + 2) {
        post();
        return;
      }

      let scale = clientW / scrollW;
      if (scale > 0.98) {
        post();
        return;
      }
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';

      docEl.style.overflowX = 'hidden';
      post();
    } catch {}
  };

  const start = () => {
    const stripBodyWhitespace = () => {
      try {
        const body = document.body;
        if (!body) return;
        Array.from(body.childNodes || []).forEach((node) => {
          if (node && node.nodeType === Node.TEXT_NODE && !String(node.textContent || '').trim()) {
            node.remove();
          }
        });
      } catch {}
    };
    const sendReady = () => {
      try {
        parent.postMessage({ type: 'chatapp:iframe-ready', id }, '*');
      } catch {}
    };
    const clampOversizedBlocks = () => {
      try {
        const body = document.body;
        const docEl = document.documentElement;
        if (!body || !docEl) return;
        const vh = Math.max(docEl.clientHeight || 0, window.innerHeight || 0);
        if (!vh) return;
        const nodes = body.querySelectorAll('*');
        nodes.forEach((el) => {
          const style = window.getComputedStyle(el);
          const display = String(style.display || '');
          if (display.includes('flex') || display.includes('grid')) {
            const align = String(style.alignItems || '');
            const justify = String(style.justifyContent || '');
            if (align.includes('center')) el.style.alignItems = 'flex-start';
            if (justify.includes('center')) el.style.justifyContent = 'flex-start';
          }
          const minH = parseFloat(style.minHeight || '');
          if (Number.isFinite(minH) && minH >= vh * 0.9) {
            el.style.minHeight = 'auto';
          }
          const h = parseFloat(style.height || '');
          if (Number.isFinite(h) && h >= vh * 0.9) {
            el.style.height = 'auto';
          }
          const maxH = parseFloat(style.maxHeight || '');
          if (Number.isFinite(maxH) && maxH >= vh * 0.9) {
            el.style.maxHeight = 'none';
          }
          const mt = parseFloat(style.marginTop || '');
          const mb = parseFloat(style.marginBottom || '');
          if (Number.isFinite(mt) && mt >= 48) el.style.marginTop = '16px';
          if (Number.isFinite(mb) && mb >= 48) el.style.marginBottom = '16px';
          const pt = parseFloat(style.paddingTop || '');
          const pb = parseFloat(style.paddingBottom || '');
          if (Number.isFinite(pt) && pt >= 64) el.style.paddingTop = '16px';
          if (Number.isFinite(pb) && pb >= 64) el.style.paddingBottom = '16px';
        });
      } catch {}
    };

    // Forward long-press gestures to parent (iframe events don't bubble to outer document)
    const getPoint = (ev) => {
      try {
        if (ev && ev.touches && ev.touches.length) {
          const t = ev.touches[0];
          return { x: t.clientX || 0, y: t.clientY || 0 };
        }
        if (ev && ev.changedTouches && ev.changedTouches.length) {
          const t = ev.changedTouches[0];
          return { x: t.clientX || 0, y: t.clientY || 0 };
        }
        const x = (ev && typeof ev.clientX === 'number') ? ev.clientX : 0;
        const y = (ev && typeof ev.clientY === 'number') ? ev.clientY : 0;
        return { x, y };
      } catch {
        return { x: 0, y: 0 };
      }
    };
    const sendPress = (phase, ev) => {
      try {
        const p = getPoint(ev);
        parent.postMessage({ type: 'chatapp:iframe-press', id, phase, x: p.x, y: p.y }, '*');
      } catch {}
    };
    const clear = () => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      if (pressActive) { sendPress('cancel', { clientX: 0, clientY: 0 }); pressActive = false; }
    };
    const allowToggleTarget = (ev) => {
      return !!(ev?.target && (ev.target.closest?.('summary') || ev.target.closest?.('details')));
    };
    const startPress = (ev) => {
      clear();
      pressActive = true;
      sendPress('down', ev);
      pressTimer = setTimeout(() => {
        sendPress('longpress', ev);
      }, 520);
    };
    let touchActive = false;
    let touchStartPoint = null;
    const moveThreshold = 12;
    document.addEventListener('pointerdown', (ev) => {
      if (touchActive) return;
      startPress(ev);
    }, { passive: true });
    ['pointerup','pointercancel','pointerleave','pointerout'].forEach((t) => {
      document.addEventListener(t, (ev) => {
        if (!pressActive) return;
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('up', ev);
        pressActive = false;
      }, { passive: true });
    });
    document.addEventListener('touchstart', (ev) => {
      touchActive = true;
      touchStartPoint = getPoint(ev);
      startPress(ev);
    }, { passive: true });
    document.addEventListener('touchmove', (ev) => {
      if (!pressActive || !touchStartPoint) return;
      const p = getPoint(ev);
      const dx = p.x - touchStartPoint.x;
      const dy = p.y - touchStartPoint.y;
      if (dx * dx + dy * dy > moveThreshold * moveThreshold) {
        if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
        sendPress('cancel', ev);
        pressActive = false;
      }
    }, { passive: true });
    document.addEventListener('touchend', (ev) => {
      if (!pressActive) {
        touchActive = false;
        touchStartPoint = null;
        return;
      }
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('up', ev);
      pressActive = false;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true });
    document.addEventListener('touchcancel', (ev) => {
      if (pressTimer) { clearTimeout(pressTimer); pressTimer = null; }
      sendPress('cancel', ev);
      pressActive = false;
      touchStartPoint = null;
      setTimeout(() => { touchActive = false; }, 120);
    }, { passive: true });
    window.addEventListener('message', (e) => {
      if (!e || !e.data || e.data.type !== 'chatapp:ping') return;
      try {
        parent.postMessage({ type: 'chatapp:pong', id }, '*');
      } catch {}
    });
    // Some WebViews trigger text selection / native menu via contextmenu on long-press
    document.addEventListener('contextmenu', (ev) => {
      try { ev.preventDefault(); } catch {}
      sendPress('longpress', ev);
    }, { passive: false });
    document.addEventListener('selectstart', (ev) => {
      try { ev.preventDefault(); } catch {}
    }, { passive: false });

    const requestLayout = (() => {
      let rafId = null;
      return () => {
        if (rafId) return;
        rafId = requestAnimationFrame(() => {
          rafId = null;
          stripBodyWhitespace();
          clampOversizedBlocks();
          fitToWidth();
          post();
        });
      };
    })();

    requestLayout();
    sendReady();
    // Warm up layout to cover WebViews that delay initial paints.
    [50, 150, 300, 600].forEach((ms) => {
      setTimeout(() => { requestLayout(); }, ms);
    });

    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') requestLayout();
    }, true);

    try {
      const ro = new ResizeObserver(() => { requestLayout(); });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => { requestLayout(); }, 500);
    }
    try {
      const mo = new MutationObserver(() => { requestLayout(); });
      if (document.body) mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    window.addEventListener('load', () => setTimeout(() => { requestLayout(); }, 0));
    window.addEventListener('resize', () => setTimeout(() => { requestLayout(); }, 0));
  };

  window.addEventListener('error', (ev) => {
    try {
      const target = ev?.target;
      if (target && target !== window) {
        const tag = String(target.tagName || '').toLowerCase();
        const src = String(target.src || target.href || target.currentSrc || '').trim();
        if (src) {
          parent.postMessage({
            type: 'chatapp:iframe-error',
            id,
            message: 'resource-load-failed tag=' + tag + ' url=' + src,
          }, '*');
        }
      }
      const message = String(ev?.message || ev?.error?.message || 'iframe error');
      const lineno = Number(ev?.lineno || 0);
      const colno = Number(ev?.colno || 0);
      const file = String(ev?.filename || '');
      const extra = [
        file ? ('file=' + file) : '',
        lineno ? ('line=' + lineno) : '',
        colno ? ('col=' + colno) : '',
      ].filter(Boolean).join(' ');
      parent.postMessage({ type: 'chatapp:iframe-error', id, message: extra ? (message + ' ' + extra) : message }, '*');
    } catch {}
  }, true);
  window.addEventListener('unhandledrejection', (ev) => {
    try {
      const reason = ev?.reason;
      const msg = reason?.message ? String(reason.message) : String(reason || 'unhandledrejection');
      parent.postMessage({ type: 'chatapp:iframe-error', id, message: 'unhandledrejection ' + msg }, '*');
    } catch {}
  });
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
</script>`;

    // If user content uses 100vh, provide a stable CSS var like ST does
    const vh = needsVhHandling ? `<style>:root{--viewport-height:${window.innerHeight}px;}</style>` : '';
    const viewportAdjust = needsVhHandling
        ? `<script>
window.addEventListener('message', (e) => {
  if (e && e.data && e.data.type === 'chatapp:updateViewportHeight' && typeof e.data.height === 'number') {
    document.documentElement.style.setProperty('--viewport-height', e.data.height + 'px');
  }
});
</script>`
        : '';

    const normalizedBaseHref = baseHref ? String(baseHref) : '';
    const baseTag = normalizedBaseHref ? `<base href="${normalizedBaseHref}">` : '';
    const bridgeTag = bridgeScriptUrl ? `<script src="${bridgeScriptUrl}"></script>` : '';
    const bridgeInject = injectBridgeScript
        ? (bridgeTag ? bridgeTag : `${viewportAdjust}${bridge}`)
        : '';
    const headInject = styleInBody ? '' : `${baseTag}${baseStyle}${prewrapStyle}${vh}`;
    const bodyInject = `${styleInBody ? `${baseStyle}${prewrapStyle}${vh}` : ''}${bridgeInject}`;

    // Inject base style + scripts
    if (/<\/body>/i.test(doc)) {
        // Try to put style inside <head> if present, otherwise before </body>
        if (/<\/head>/i.test(doc)) {
            const withHead = doc.replace(/<\/head>/i, `${headInject}</head>`);
            return withHead.replace(/<\/body>/i, `${bodyInject}</body>`);
        }
        return doc.replace(/<\/body>/i, `${headInject}${bodyInject}</body>`);
    }
    return `${headInject}${bodyInject}${doc}`;
};

const injectHtmlNewlines = (html) => {
    const raw = String(html ?? '');
    if (!raw.includes('\n')) return raw;
    const protectedRe = /<(style|script)[^>]*>[\s\S]*?<\/\1>/gi;
    const chunks = [];
    let last = 0;
    let m;
    while ((m = protectedRe.exec(raw))) {
        if (m.index > last) chunks.push({ kind: 'text', value: raw.slice(last, m.index) });
        chunks.push({ kind: 'raw', value: m[0] });
        last = protectedRe.lastIndex;
    }
    if (last < raw.length) chunks.push({ kind: 'text', value: raw.slice(last) });
    return chunks
        .map(chunk => {
            if (chunk.kind !== 'text') return chunk.value;
            const parts = String(chunk.value || '').split(/(<[^>]+>)/g);
            return parts.map(part => {
                if (!part) return part;
                if (part.startsWith('<')) return part;
                if (!part.trim()) return part;
                return part.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
            }).join('');
        })
        .join('');
};

const processAllVhUnits = (htmlContent) => {
    const viewportHeight = window.innerHeight;
    let processed = String(htmlContent ?? '');

    processed = processed.replace(
        /((?:document\.body\.style\.minHeight|\.style\.minHeight|setProperty\s*\(\s*['"]min-height['"])\s*[=,]\s*['"`])([^'"`]*?)(['"`])/g,
        (match, prefix, value, suffix) => {
            if (String(value || '').includes('vh')) {
                const convertedValue = String(value).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
                    const numValue = parseFloat(num);
                    if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
                    return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
                });
                return prefix + convertedValue + suffix;
            }
            return match;
        }
    );

    processed = processed.replace(/min-height:\s*([^;]*vh[^;]*);/g, (expression) => {
        const processedExpression = String(expression).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
            const numValue = parseFloat(num);
            if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
            return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
        });
        return `${processedExpression};`;
    });

    processed = processed.replace(
        /style\s*=\s*["']([^"']*min-height:\s*[^"']*vh[^"']*?)["']/gi,
        (match, styleContent) => {
            const processedStyleContent = String(styleContent).replace(/min-height:\s*([^;]*vh[^;]*)/g, (expression) => {
                const processedExpression = String(expression).replace(/(\d+(?:\.\d+)?)vh/g, (num) => {
                    const numValue = parseFloat(num);
                    if (numValue === 100) return `var(--viewport-height, ${viewportHeight}px)`;
                    return `calc(var(--viewport-height, ${viewportHeight}px) * ${numValue / 100})`;
                });
                return processedExpression;
            });
            return match.replace(styleContent, processedStyleContent);
        }
    );

    return processed;
};

const detectBodyLoadUrl = (htmlCode) => {
    const raw = String(htmlCode || '');
    if (!raw) return '';
    const m = raw.match(/\$\(\s*['"]body['"]\s*\)\s*\.load\s*\(\s*['"]([^'"]+)['"]/i);
    if (!m) return '';
    const url = String(m[1] || '').trim();
    if (!url) return '';
    try {
        return new URL(url, window.location.href).toString();
    } catch {
        return url;
    }
};

const stripInlineCspMeta = (html) => String(html || '')
    .replace(/<meta[^>]+http-equiv\s*=\s*["'](?:content-security-policy|x-content-security-policy|x-webkit-csp)["'][^>]*>/gi, '');

const rewriteStHelperGlobals = (htmlCode) => {
    let html = String(htmlCode || '');
    let replaced = 0;
    const rewriteJs = (jsCode) => {
        let js = String(jsCode || '');
        const resolveCallTarget = (name) => {
            const n = String(name || '');
            if (n === 'getVariables' || n === 'getAllVariables') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.' + n + '==="function")?window.__chatappCompat.' + n + ':(typeof window.' + n + '==="function"?window.' + n + ':(typeof window.getVariables==="function"?window.getVariables:(typeof window.getAllVariables==="function"?window.getAllVariables:function(){return {}; }))))';
            }
            if (n === 'getCurrentMessageId') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.getCurrentMessageId==="function")?window.__chatappCompat.getCurrentMessageId:(typeof window.getCurrentMessageId==="function"?window.getCurrentMessageId:function(){return ""; }))';
            }
            if (n === 'insertOrAssignVariables') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.insertOrAssignVariables==="function")?window.__chatappCompat.insertOrAssignVariables:(typeof window.insertOrAssignVariables==="function"?window.insertOrAssignVariables:async function(){return false;}))';
            }
            if (n === 'deleteVariable') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.deleteVariable==="function")?window.__chatappCompat.deleteVariable:(typeof window.deleteVariable==="function"?window.deleteVariable:async function(){return false;}))';
            }
            if (n === 'waitGlobalInitialized') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.waitGlobalInitialized==="function")?window.__chatappCompat.waitGlobalInitialized:(typeof window.waitGlobalInitialized==="function"?window.waitGlobalInitialized:function(){return Promise.resolve(null);} ))';
            }
            if (n === 'eventOn') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.eventOn==="function")?window.__chatappCompat.eventOn:(typeof window.eventOn==="function"?window.eventOn:function(){}))';
            }
            if (n === 'eventRemoveListener') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.eventRemoveListener==="function")?window.__chatappCompat.eventRemoveListener:(typeof window.eventRemoveListener==="function"?window.eventRemoveListener:function(){}))';
            }
            if (n === 'errorCatched') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.errorCatched==="function")?window.__chatappCompat.errorCatched:(typeof window.errorCatched==="function"?window.errorCatched:function(fn){return fn;}))';
            }
            return '((window.__chatappCompat&&typeof window.__chatappCompat.' + n + '==="function")?window.__chatappCompat.' + n + ':(typeof window.' + n + '==="function"?window.' + n + ':function(){}))';
        };
        const markFnCall = (regex, name) => {
            js = js.replace(regex, (...args) => {
                replaced += 1;
                const prefix = String(args[1] || '');
                return `${prefix}${resolveCallTarget(name)}(`;
            });
        };
        // Keep rewrite minimal to avoid breaking script syntax.
        markFnCall(/(^|[^\w$.])errorCatched\s*\(/g, 'errorCatched');
        markFnCall(/(^|[^\w$.])getAllVariables\s*\(/g, 'getAllVariables');
        markFnCall(/(^|[^\w$.])getVariables\s*\(/g, 'getVariables');
        markFnCall(/(^|[^\w$.])getCurrentMessageId\s*\(/g, 'getCurrentMessageId');
        markFnCall(/(^|[^\w$.])insertOrAssignVariables\s*\(/g, 'insertOrAssignVariables');
        markFnCall(/(^|[^\w$.])deleteVariable\s*\(/g, 'deleteVariable');
        markFnCall(/(^|[^\w$.])waitGlobalInitialized\s*\(/g, 'waitGlobalInitialized');
        markFnCall(/(^|[^\w$.])eventOn\s*\(/g, 'eventOn');
        markFnCall(/(^|[^\w$.])eventRemoveListener\s*\(/g, 'eventRemoveListener');
        return js;
    };
    try {
        html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
            const attrText = String(attrs || '');
            if (/\bsrc\s*=/.test(attrText)) return full;
            if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json|text\/plain)["']/.test(attrText)) return full;
            const nextBody = rewriteJs(String(body || ''));
            return `<script${attrText}>${nextBody}</script>`;
        });
    } catch {
        return { html: String(htmlCode || ''), replaced: 0, failed: true };
    }
    return { html, replaced };
};
const rewriteErrorCatchedOnly = (htmlCode) => {
    let html = String(htmlCode || '');
    let replaced = 0;
    const rewriteJs = (jsCode) => {
        let js = String(jsCode || '');
        js = js.replace(/(^|[^\w$.])errorCatched\s*\(/g, (...args) => {
            replaced += 1;
            const prefix = String(args[1] || '');
            return `${prefix}window.errorCatched(`;
        });
        return js;
    };
    try {
        html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
            const attrText = String(attrs || '');
            if (/\bsrc\s*=/.test(attrText)) return full;
            if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json|text\/plain)["']/.test(attrText)) return full;
            const nextBody = rewriteJs(String(body || ''));
            return `<script${attrText}>${nextBody}</script>`;
        });
    } catch {
        return { html: String(htmlCode || ''), replaced: 0, failed: true };
    }
    return { html, replaced };
};
const maybeRewriteStHelperGlobals = (htmlCode, { directLoad = false } = {}) => {
    const html = String(htmlCode || '');
    if (!directLoad) return { html, replaced: 0, skipped: true };
    return rewriteStHelperGlobals(html);
};
const maybeRewriteMvuInlineHelpers = (htmlCode, { needsMvuCompat = false, directLoad = false } = {}) => {
    const html = String(htmlCode || '');
    if (!needsMvuCompat || directLoad) return { html, replaced: 0, skipped: true };
    return rewriteErrorCatchedOnly(html);
};

const buildFrameworkGlobalShim = ({ iframeId = '', debugTag = '', vueMajor = 3, appOrigin = '' } = {}) => {
    const id = String(iframeId || '');
    const tag = String(debugTag || '');
    const origin = String(appOrigin || '').trim();
    const major = Number(vueMajor) === 2 ? 2 : 3;
    const vueUrls = major === 2
        ? [
            origin ? `${origin}/lib/vue2.min.js` : '',
            'https://testingcf.jsdelivr.net/npm/vue@2/dist/vue.min.js',
            'https://cdn.jsdelivr.net/npm/vue@2/dist/vue.min.js',
            'https://unpkg.com/vue@2/dist/vue.min.js',
        ]
        : [
            origin ? `${origin}/lib/vue3.global.prod.js` : '',
            'https://testingcf.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js',
            'https://cdn.jsdelivr.net/npm/vue@3/dist/vue.global.prod.js',
            'https://unpkg.com/vue@3/dist/vue.global.prod.js',
        ];
    const routerUrls = major === 2
        ? [
            origin ? `${origin}/lib/vue-router3.min.js` : '',
            'https://testingcf.jsdelivr.net/npm/vue-router@3/dist/vue-router.min.js',
            'https://cdn.jsdelivr.net/npm/vue-router@3/dist/vue-router.min.js',
            'https://unpkg.com/vue-router@3/dist/vue-router.min.js',
        ]
        : [
            origin ? `${origin}/lib/vue-router4.global.prod.js` : '',
            'https://testingcf.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js',
            'https://cdn.jsdelivr.net/npm/vue-router@4/dist/vue-router.global.prod.js',
            'https://unpkg.com/vue-router@4/dist/vue-router.global.prod.js',
        ];
    const piniaUrls = [
        origin ? `${origin}/lib/pinia.iife.prod.js` : '',
        'https://testingcf.jsdelivr.net/npm/pinia@2/dist/pinia.iife.prod.js',
        'https://cdn.jsdelivr.net/npm/pinia@2/dist/pinia.iife.prod.js',
        'https://unpkg.com/pinia@2/dist/pinia.iife.prod.js',
    ];
    return `<script>
(() => {
  const CHATAPP_IFRAME_ID = ${JSON.stringify(id)};
  const CHATAPP_DEBUG_TAG = ${JSON.stringify(tag)};
  const withTag = (msg) => CHATAPP_DEBUG_TAG ? ('tag=' + CHATAPP_DEBUG_TAG + ' ' + String(msg || '')) : String(msg || '');
  const log = (level, message) => {
    try {
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: String(level || 'info'),
        message: withTag(message),
      }, '*');
    } catch {}
  };
  const ensureGlobal = (name, urls, readyMsg, missMsg) => {
    if (window[name]) {
      log('info', readyMsg + '-existing');
      return;
    }
    for (let i = 0; i < urls.length; i += 1) {
      if (window[name]) break;
      const u = String(urls[i] || '');
      if (!u) continue;
      log('info', 'compat-load-attempt name=' + name + ' url=' + u);
      document.write('<script src="' + u + '"><\\/script>');
    }
    if (window[name]) log('info', readyMsg);
    else log('warn', missMsg);
  };
  const ensureGlobalAsync = async (name, urls, readyMsg, missMsg) => {
    if (window[name]) {
      log('info', readyMsg + '-existing');
      return true;
    }
    const root = document.head || document.documentElement || document.body;
    if (!root) {
      log('warn', missMsg + '-no-root');
      return false;
    }
    const loadScript = (url) => new Promise((resolve) => {
      try {
        const s = document.createElement('script');
        s.src = String(url || '');
        s.async = false;
        s.onload = () => resolve(true);
        s.onerror = () => resolve(false);
        root.appendChild(s);
      } catch {
        resolve(false);
      }
    });
    for (let i = 0; i < urls.length; i += 1) {
      if (window[name]) break;
      const u = String(urls[i] || '');
      if (!u) continue;
      log('info', 'compat-load-attempt-late name=' + name + ' url=' + u);
      try { await loadScript(u); } catch {}
      if (window[name]) {
        log('info', readyMsg);
        return true;
      }
    }
    if (window[name]) {
      log('info', readyMsg);
      return true;
    }
    log('warn', missMsg);
    return false;
  };
  const setupVueDemi = () => {
    try {
      if (window.VueDemi || !window.Vue || typeof window.Vue !== 'object') return;
      const api = { Vue: window.Vue, isVue2: false, isVue3: true, install() {} };
      try { Object.assign(api, window.Vue); } catch {}
      window.VueDemi = api;
      if (typeof window.VueDemi.set === 'undefined' && typeof window.Vue.set === 'function') window.VueDemi.set = window.Vue.set;
      if (typeof window.VueDemi.del === 'undefined' && typeof window.Vue.delete === 'function') window.VueDemi.del = window.Vue.delete;
      log('info', 'vue-demi-shim-ready');
    } catch {
      log('warn', 'vue-demi-shim-failed');
    }
  };
  log('info', 'vue-shim-mode major=' + ${JSON.stringify(major)});
  ensureGlobal('Vue', ${JSON.stringify(vueUrls)}, 'vue-shim-ready', 'vue-shim-missing');
  setupVueDemi();
  ensureGlobal('VueRouter', ${JSON.stringify(routerUrls)}, 'vue-router-shim-ready', 'vue-router-shim-missing');
  if (${JSON.stringify(major)} === 3) {
    setupVueDemi();
    ensureGlobal('Pinia', ${JSON.stringify(piniaUrls)}, 'pinia-shim-ready', 'pinia-shim-missing');
  }
  setTimeout(async () => {
    try {
      log('info', 'vue-shim-late ' + (window.Vue ? 'ready' : 'missing'));
      log('info', 'vue-router-shim-late ' + (window.VueRouter ? 'ready' : 'missing'));
      if (${JSON.stringify(major)} === 3) {
        log('info', 'pinia-shim-late ' + (window.Pinia ? 'ready' : 'missing'));
      }
      if (window.Vue && !window.VueRouter) {
        await ensureGlobalAsync('VueRouter', ${JSON.stringify(routerUrls)}, 'vue-router-shim-ready-retry', 'vue-router-shim-missing-retry');
      }
      if (${JSON.stringify(major)} === 3 && window.Vue && !window.Pinia) {
        setupVueDemi();
        await ensureGlobalAsync('Pinia', ${JSON.stringify(piniaUrls)}, 'pinia-shim-ready-retry', 'pinia-shim-missing-retry');
      }
      if (${JSON.stringify(major)} === 3 && !window.Pinia) {
        const piniaFallback = {
          createPinia: () => ({}),
          defineStore: (_id, setupOrOpts) => {
            return () => {
              try {
                if (typeof setupOrOpts === 'function') {
                  const out = setupOrOpts();
                  return (out && typeof out === 'object') ? out : {};
                }
                if (setupOrOpts && typeof setupOrOpts === 'object' && typeof setupOrOpts.state === 'function') {
                  const st = setupOrOpts.state();
                  return (st && typeof st === 'object') ? st : {};
                }
              } catch {}
              return {};
            };
          },
          storeToRefs: (store) => {
            const src = (store && typeof store === 'object') ? store : {};
            const out = {};
            Object.keys(src).forEach((k) => {
              out[k] = { value: src[k] };
            });
            return out;
          },
        };
        window.Pinia = piniaFallback;
        if (typeof window.createPinia !== 'function') window.createPinia = piniaFallback.createPinia;
        if (typeof window.defineStore !== 'function') window.defineStore = piniaFallback.defineStore;
        if (typeof window.storeToRefs !== 'function') window.storeToRefs = piniaFallback.storeToRefs;
        log('warn', 'pinia-shim-fallback');
      }
    } catch {}
  }, 1200);
})();
</script>`;
};

const buildDollarGlobalShim = ({ iframeId = '', debugTag = '', appOrigin = '', needsZodShim = false } = {}) => {
    const id = String(iframeId || '');
    const tag = String(debugTag || '');
    const origin = String(appOrigin || '').trim();
    const lodashUrls = [
        origin ? `${origin}/lib/lodash.min.js` : '',
        'https://testingcf.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        'https://unpkg.com/lodash@4.17.21/lodash.min.js',
    ];
    const zodUrls = [
        origin ? `${origin}/lib/zod.min.js` : '',
        'https://testingcf.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js',
        'https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js',
        'https://unpkg.com/zod@3.22.4/lib/index.umd.min.js',
    ];
    return `<script>
(() => {
  const CHATAPP_IFRAME_ID = ${JSON.stringify(id)};
  const CHATAPP_DEBUG_TAG = ${JSON.stringify(tag)};
  const withTag = (msg) => CHATAPP_DEBUG_TAG ? ('tag=' + CHATAPP_DEBUG_TAG + ' ' + String(msg || '')) : String(msg || '');
  const log = (level, message) => {
    try {
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: String(level || 'info'),
        message: withTag(message),
      }, '*');
    } catch {}
  };
  if (!window.__chatappCompat || typeof window.__chatappCompat !== 'object') {
    window.__chatappCompat = {};
  }
  const compat = window.__chatappCompat;
  if (typeof compat.getAllVariables !== 'function') {
    compat.getAllVariables = () => {
      try {
        if (typeof window.getAllVariables === 'function') return window.getAllVariables();
        if (typeof window.getVariables === 'function') return window.getVariables();
      } catch {}
      return {};
    };
  }
  if (typeof compat.getVariables !== 'function') {
    compat.getVariables = (...args) => {
      try {
        if (typeof window.getVariables === 'function') return window.getVariables(...args);
      } catch {}
      return compat.getAllVariables();
    };
  }
  if (typeof compat.getCurrentMessageId !== 'function') {
    compat.getCurrentMessageId = () => '';
  }
  if (typeof compat.insertOrAssignVariables !== 'function') {
    compat.insertOrAssignVariables = async () => false;
  }
  if (typeof compat.deleteVariable !== 'function') {
    compat.deleteVariable = async () => false;
  }
  if (!window.TavernHelper || typeof window.TavernHelper !== 'object') {
    window.TavernHelper = {};
  }
  const helper = window.TavernHelper;
  if (typeof helper.getAllVariables !== 'function') helper.getAllVariables = (...args) => compat.getAllVariables(...args);
  if (typeof helper.getVariables !== 'function') helper.getVariables = (...args) => compat.getVariables(...args);
  if (typeof helper.getCurrentMessageId !== 'function') helper.getCurrentMessageId = (...args) => compat.getCurrentMessageId(...args);
  if (typeof helper.insertOrAssignVariables !== 'function') helper.insertOrAssignVariables = (...args) => compat.insertOrAssignVariables(...args);
  if (typeof helper.deleteVariable !== 'function') helper.deleteVariable = (...args) => compat.deleteVariable(...args);
  if (typeof helper.waitGlobalInitialized !== 'function') helper.waitGlobalInitialized = async () => null;
  if (typeof helper.replaceVariables !== 'function') helper.replaceVariables = async () => false;
  if (typeof helper.getTavernHelperVersion !== 'function') helper.getTavernHelperVersion = async () => '4.0.99-chatapp';
  if (!window.SillyTavern || typeof window.SillyTavern !== 'object') {
    window.SillyTavern = {};
  }
  if (!window.SillyTavern.TavernHelper || typeof window.SillyTavern.TavernHelper !== 'object') {
    window.SillyTavern.TavernHelper = helper;
  }
  ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables']
    .forEach((name) => {
      if (typeof helper[name] === 'function' && typeof window.SillyTavern[name] !== 'function') {
        window.SillyTavern[name] = (...args) => helper[name](...args);
      }
    });
  log('info', 'tavern-helper-shim-bootstrap');
  const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
  if (!hasJq) {
    if (!(typeof window.$ === 'function' && window.$.__chatappMini)) {
      const toNodes = (input) => {
        if (!input) return [];
        if (input instanceof Element || input === window || input === document) return [input];
        if (Array.isArray(input)) return input.filter(Boolean);
        return Array.from(document.querySelectorAll(String(input)));
      };
      const wrap = (nodes) => ({
        __chatappMini: true,
        nodes,
        text(value) {
          if (value === undefined) return nodes[0]?.textContent ?? '';
          nodes.forEach(n => { n.textContent = String(value); });
          return this;
        },
        html(value) {
          if (value === undefined) return nodes[0]?.innerHTML ?? '';
          nodes.forEach(n => { n.innerHTML = String(value); });
          return this;
        },
        append(content) {
          if (content === undefined || content === null) return this;
          nodes.forEach((n, idx) => {
            if (typeof content === 'string') n.insertAdjacentHTML('beforeend', content);
            else if (content instanceof Node) n.appendChild(idx === 0 ? content : content.cloneNode(true));
          });
          return this;
        },
        empty() {
          nodes.forEach(n => { n.innerHTML = ''; });
          return this;
        },
      });
      const mini = (input) => {
        if (typeof input === 'function') {
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
          else setTimeout(input, 0);
          return wrap([]);
        }
        return wrap(toNodes(input));
      };
      mini.__chatappMini = true;
      window.$ = mini;
    }
  }
  if (typeof window.jQuery !== 'function') window.jQuery = window.$;
  const ensureGlobal = (name, urls, readyMsg, missMsg) => {
    if (window[name]) {
      log('info', readyMsg + '-existing');
      return;
    }
    for (let i = 0; i < urls.length; i += 1) {
      if (window[name]) break;
      const u = String(urls[i] || '');
      if (!u) continue;
      log('info', 'compat-load-attempt name=' + name + ' url=' + u);
      document.write('<script src="' + u + '"><\\/script>');
    }
    if (window[name]) log('info', readyMsg);
    else log('warn', missMsg);
  };
  ensureGlobal('_', ${JSON.stringify(lodashUrls)}, 'lodash-shim-ready', 'lodash-shim-missing');
  if (${JSON.stringify(Boolean(needsZodShim))}) {
    ensureGlobal('Zod', ${JSON.stringify(zodUrls)}, 'zod-shim-ready', 'zod-shim-missing');
  }
  if (!window.z) {
    const candidate = window.Zod || window.zod || null;
    if (candidate && typeof candidate === 'object' && candidate.z) window.z = candidate.z;
    else if (candidate) window.z = candidate;
  }
  if (!window.Zod || typeof window.Zod !== 'object') {
    window.Zod = {};
  }
  if (!window.Zod.z && window.z) {
    window.Zod.z = window.z;
  }
  if (${JSON.stringify(Boolean(needsZodShim))} && (!window.z || typeof window.z !== 'object')) {
    const makeChain = () => {
      const fn = (..._args) => proxy;
      const proxy = new Proxy(fn, {
        get(_t, prop) {
          if (prop === 'parse') return (v) => v;
          if (prop === 'safeParse') return (v) => ({ success: true, data: v });
          if (prop === 'spa') return (v) => Promise.resolve({ success: true, data: v });
          if (prop === 'shape') return {};
          if (prop === 'values') return {};
          if (prop === 'options') return [];
          if (prop === 'z') return proxy;
          return proxy;
        },
        apply() { return proxy; },
      });
      return proxy;
    };
    const zFallback = makeChain();
    window.z = zFallback;
    if (!window.Zod || typeof window.Zod !== 'object') {
      window.Zod = { z: zFallback, ZodType: function ZodType() {} };
    } else if (!window.Zod.z) {
      window.Zod.z = zFallback;
    }
    log('warn', 'zod-shim-fallback');
  }
  if (window.z && !window.z.z && typeof window.z === 'object') {
    window.z.z = window.z;
  }
  if (typeof window.getVariables !== 'function') {
    window.getVariables = () => {
      try {
        if (typeof window.getAllVariables === 'function') return window.getAllVariables();
        if (window.__chatappCompat && typeof window.__chatappCompat.getAllVariables === 'function') {
          return window.__chatappCompat.getAllVariables();
        }
      } catch {}
      return {};
    };
  }
  if (!window._ || typeof window._ !== 'object') {
    const toPath = (raw) => String(raw || '')
      .replace(/\\[([^\\]]+)\\]/g, '.$1')
      .split('.')
      .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    window._ = window._ || {};
    if (typeof window._.isArray !== 'function') window._.isArray = Array.isArray;
    if (typeof window._.isObject !== 'function') window._.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof window._.isNil !== 'function') window._.isNil = (v) => v === null || v === undefined;
    if (typeof window._.clamp !== 'function') window._.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    if (typeof window._.get !== 'function') {
      window._.get = (obj, path, defVal) => {
        const parts = toPath(path);
        let cur = obj;
        for (const part of parts) {
          if (cur === null || cur === undefined) return defVal;
          cur = cur[part];
        }
        return cur === undefined ? defVal : cur;
      };
    }
    if (typeof window._.set !== 'function') {
      window._.set = (obj, path, value) => {
        const parts = toPath(path);
        if (!parts.length) return obj;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur[key] || typeof cur[key] !== 'object') cur[key] = {};
          cur = cur[key];
        }
        cur[parts[parts.length - 1]] = value;
        return obj;
      };
    }
    if (typeof window._.mergeWith !== 'function') {
      const isObject = (v) => v !== null && typeof v === 'object';
      window._.mergeWith = (object, ...rest) => {
        if (!isObject(object)) object = {};
        let customizer = null;
        if (rest.length && typeof rest[rest.length - 1] === 'function') {
          customizer = rest.pop();
        }
        const mergeInto = (target, source) => {
          if (!isObject(source)) return target;
          Object.keys(source).forEach((key) => {
            const srcVal = source[key];
            const objVal = target[key];
            let next;
            if (customizer) {
              try { next = customizer(objVal, srcVal, key, target, source); } catch {}
            }
            if (next !== undefined) {
              target[key] = next;
              return;
            }
            if (Array.isArray(objVal) && Array.isArray(srcVal)) {
              target[key] = srcVal.slice();
              return;
            }
            if (isObject(objVal) && isObject(srcVal)) {
              target[key] = mergeInto(objVal, srcVal);
              return;
            }
            if (Array.isArray(srcVal)) {
              target[key] = srcVal.slice();
              return;
            }
            if (isObject(srcVal)) {
              target[key] = mergeInto(isObject(objVal) ? objVal : {}, srcVal);
              return;
            }
            target[key] = srcVal;
          });
          return target;
        };
        rest.forEach((src) => { mergeInto(object, src); });
        return object;
      };
    }
  }
  if (typeof window.errorCatched !== 'function') {
    window.errorCatched = (fn) => (...args) => {
      try { return fn?.(...args); } catch (err) { console.error(err); }
    };
  }
  try {
    window.eval('var $ = window.$; var jQuery = window.jQuery; var _ = window._; var z = window.z; var Zod = window.Zod; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var errorCatched = window.errorCatched;');
  } catch {}
  if (typeof window.$ === 'function') log('info', 'dollar-shim-ready');
  else log('warn', 'dollar-shim-missing');
})();
</script>`;
};

const makeCodeBlock = ({ lang, code, messageId, preserveHtmlNewlines = false, sessionId, debugTag = '' } = {}) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-codeblock';
    wrap.style.cssText = 'border:1px solid rgba(0,0,0,0.10); border-radius:12px; overflow:hidden; margin:8px 0;';
    // Store payload for long-press menu actions (no inline buttons)
    wrap.__chatappCode = String(code ?? '');
    wrap.__chatappLang = String(lang || '');

    // HTML preview (ST 酒馆助手：包含 <body> 且 </body> 才自动渲染)
    const looksLikeHtmlDoc = /<body[\s>]/i.test(code) && /<\/body>/i.test(code);
    const isHtmlLang = lang === 'html' || lang === 'htm';
    const looksLikeHtmlSnippet = /<\/(style|div|details|main|section|article|table|ul|ol|p|span|pre|code)>/i.test(code) ||
        /<style[\s>]/i.test(code) ||
        /<details[\s>]/i.test(code) ||
        /<div[\s>]/i.test(code);
    const allowScripts = allowRichIframeScripts();
    const shouldRenderHtml = looksLikeHtmlDoc || isHtmlLang || looksLikeHtmlSnippet;
    const directBodyLoadUrl = shouldRenderHtml ? detectBodyLoadUrl(code) : '';
    const forceMvuCompat = Boolean(directBodyLoadUrl);
    const needsMvuCompat = allowScripts && (forceMvuCompat || shouldEnableMvuCompat(code));
    const needsFrameworkShim = allowScripts && shouldInjectFrameworkShim(code, { directLoad: Boolean(directBodyLoadUrl) });
    const useLegacyMvuBridge = !directBodyLoadUrl;
    const mvuBridgeBuilder = useLegacyMvuBridge ? buildMvuCompatBridgeLegacy : buildMvuCompatBridge;
    const sourceCompat = analyzeCompatProfile(code, { directLoad: Boolean(directBodyLoadUrl) });
    if (debugTag === 'rp-greeting' && !allowScripts) {
        const tip = 'rp-greeting scripts-disabled: enable `allowRichIframeScripts` to run <script> / $.load()';
        emitDebugLog({ source: 'rich', type: 'warn', message: tip, force: true });
        logger.warn(`[rich] ${tip}`);
    }
    if (Boolean(debugTag) || shouldLogRichDebug()) {
        const hasHtmlHint = /<\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(code) ||
            /&lt;\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(code);
        if (hasHtmlHint || shouldRenderHtml) {
            const msg = `codeblock html?=${shouldRenderHtml} lang=${lang || 'none'} len=${String(code || '').length} msg=${String(messageId || '')} scripts=${allowScripts ? 1 : 0} mvu=${needsMvuCompat ? 1 : 0} forceMvu=${forceMvuCompat ? 1 : 0}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: shouldRenderHtml ? 'info' : 'warn', message: msg, force: true });
            logger.info(`[rich] ${msg}`);
            const compatMsg = `compat-profile=${sourceCompat.profile} flags=${summarizeCompatFlags(sourceCompat.flags) || 'none'}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: 'info', message: compatMsg, force: true });
            logger.info(`[rich] ${compatMsg}`);
            if (directBodyLoadUrl) {
                const bodyLoadMsg = `body-load-detected url=${directBodyLoadUrl}${debugTag ? ` tag=${debugTag}` : ''}`;
                emitDebugLog({ source: 'rich', type: 'info', message: bodyLoadMsg, force: true });
                logger.info(`[rich] ${bodyLoadMsg}`);
            }
        }
    }
    if (shouldRenderHtml) {
        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'background:#fff;';
        const iframe = document.createElement('iframe');
        const iframeId = `msg-${String(messageId || 'x')}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        iframe.dataset.iframeId = iframeId;
        iframe.dataset.msgId = String(messageId || '');
        if (sessionId) iframe.dataset.sessionId = String(sessionId || '');
        iframe.dataset.iframeSource = 'host';
        iframe.dataset.iframeAllowScripts = allowScripts ? '1' : '0';
        iframe.dataset.iframeMvuCompat = needsMvuCompat ? '1' : '0';
        iframe.style.cssText = 'width:100%; border:0; display:block; height:240px; background:#fff;';
        if (!allowScripts) {
            iframe.setAttribute('sandbox', 'allow-scripts');
        }
        getIframeState(iframeId, {
            messageId: String(messageId || ''),
            createdAt: Date.now(),
            readyAt: 0,
            resizeCount: 0,
            lastResizeAt: 0,
            pressCount: 0,
            lastPressAt: 0,
            error: '',
        });

        let html = preserveHtmlNewlines ? injectHtmlNewlines(code) : code;
        if (allowScripts) {
            html = stripInlineCspMeta(html);
            const rewriteResult = maybeRewriteMvuInlineHelpers(html, { needsMvuCompat, directLoad: Boolean(directBodyLoadUrl) });
            html = rewriteResult.html;
            if (rewriteResult.failed) {
                const msg = `helper-rewrite-inline-failed${debugTag ? ` tag=${debugTag}` : ''}`;
                emitDebugLog({ source: 'rich', type: 'warn', message: msg, force: true });
                logger.warn(`[rich] ${msg}`);
            }
            if (rewriteResult.replaced > 0) {
                const msg = `helper-rewrite-inline count=${rewriteResult.replaced}${debugTag ? ` tag=${debugTag}` : ''}`;
                emitDebugLog({ source: 'rich', type: 'info', message: msg, force: true });
                logger.info(`[rich] ${msg}`);
            }
        }
        const hasMinVh = /min-height:\s*[^;]*vh/i.test(html);
        const hasJsVhUsage = /\d+vh/.test(html);
        const needsVhHandling = hasMinVh || hasJsVhUsage;
        if (needsVhHandling) html = processAllVhUnits(html);
        const previewHtml = allowScripts ? html : stripScriptsForPreview(html);
        const staticHtml = stripScriptsForPreview(html);
        const hostDoc = buildIframeSrcDoc(previewHtml, {
            iframeId,
            needsVhHandling,
            preserveNewlines: false,
            injectBridgeScript: false,
            styleInBody: true,
        });
        const fallbackDoc = buildIframeSrcDoc(previewHtml, {
            iframeId,
            needsVhHandling,
            preserveNewlines: false,
            injectBridgeScript: true,
            styleInBody: false,
        });
        const staticDoc = buildIframeSrcDoc(staticHtml, {
            iframeId,
            needsVhHandling,
            preserveNewlines: false,
            injectBridgeScript: false,
            styleInBody: false,
            baseHref: allowScripts ? `${window.location.origin}/` : '',
        });
        setIframeStaticFallbackDoc(iframeId, staticDoc);
        const bridgeScriptUrl = '';
        const baseHref = allowScripts ? `${window.location.origin}/` : '';
        const vueRuntimePreference = detectVueRuntimePreference(html);
        const needsZodShim = allowScripts && shouldInjectZodShim(html);
        const dollarShim = (allowScripts && !useLegacyMvuBridge)
            ? buildDollarGlobalShim({ iframeId, debugTag, appOrigin: window.location.origin, needsZodShim })
            : '';
        const frameworkShim = (allowScripts && !useLegacyMvuBridge && needsFrameworkShim)
            ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: vueRuntimePreference, appOrigin: window.location.origin })
            : '';
        const mvuCompatBridge = needsMvuCompat ? mvuBridgeBuilder({ iframeId, sessionId, debugTag, messageId }) : '';
        if (needsMvuCompat && (Boolean(debugTag) || shouldLogRichDebug())) {
            const modeMsg = `mvu-bridge=${useLegacyMvuBridge ? 'legacy' : 'enhanced'}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: 'info', message: modeMsg, force: true });
            logger.info(`[rich] ${modeMsg}`);
        }
        const scriptDoc = buildIframeSrcDoc(html, {
            iframeId,
            needsVhHandling,
            preserveNewlines: false,
            injectBridgeScript: true,
            styleInBody: false,
            baseHref,
            bridgeScriptUrl,
            headPrepend: `${dollarShim}${frameworkShim}${mvuCompatBridge}`,
        });
        if (allowScripts) {
            setIframeDynamicDoc(iframeId, scriptDoc, directBodyLoadUrl ? 'direct-scriptdoc' : 'inline-scriptdoc');
        }
        previewWrap.appendChild(iframe);
        if (directBodyLoadUrl) {
            iframe.dataset.directLoadUrl = String(directBodyLoadUrl || '');
            iframe.dataset.iframeSource = 'direct-load';
            iframe.dataset.iframeDocSent = '1';
            iframe.style.height = '260px';
            iframe.style.minHeight = '220px';
            iframe.style.maxHeight = '760px';
            const logDirect = (type, message) => {
                const msg = String(message || '');
                emitDebugLog({ source: 'iframe', type, message: msg, force: true });
                if (type === 'warn') warnIframe('direct-load', iframeId, `msg=${msg}`);
                else logger.info(`[iframe] ${msg}`);
            };
            const onDirectReady = (kind) => {
                const curSrc = String(iframe.currentSrc || iframe.src || '').trim();
                if (iframe.dataset.iframeSource === 'direct-load' && (!curSrc || curSrc === 'about:blank')) return;
                iframe.dataset.iframeReady = '1';
                iframe.dataset.iframeLoaded = '1';
                const st = getIframeState(iframeId, { messageId: String(messageId || ''), createdAt: Date.now() });
                if (st) {
                    const now = Date.now();
                    st.readyAt = st.readyAt || now;
                    st.loadedAt = st.loadedAt || now;
                    st.resizeCount = Math.max(Number(st.resizeCount || 0), 1);
                    st.lastResizeAt = st.lastResizeAt || now;
                }
                const msg = `direct-load-${kind} id=${iframeId} source=${String(iframe.dataset.iframeSource || '')} url=${directBodyLoadUrl}`;
                logDirect(kind === 'error' ? 'warn' : 'info', msg);
            };
            iframe.addEventListener('load', () => onDirectReady('load'), { once: false });
            iframe.addEventListener('error', () => onDirectReady('error'), { once: false });
            const runDirectLoad = async () => {
                const baseHref = (() => {
                    try { return new URL('.', directBodyLoadUrl).toString(); } catch { return directBodyLoadUrl; }
                })();
                logDirect('info', `direct-load-fetch-start id=${iframeId} url=${directBodyLoadUrl}`);
                const cachedHtml = readDirectLoadCache(directBodyLoadUrl);
                if (cachedHtml) {
                    let directHtml = stripInlineCspMeta(cachedHtml);
                    const pathRewrite = rewriteDirectLoadAssetPaths(directHtml, baseHref);
                    directHtml = pathRewrite.html;
                    const rewriteResult = maybeRewriteStHelperGlobals(directHtml, { directLoad: true });
                    directHtml = rewriteResult.html;
                    const directProfile = analyzeCompatProfile(directHtml, { directLoad: true });
                    logDirect('info', `direct-load-profile id=${iframeId} profile=${directProfile.profile} flags=${summarizeCompatFlags(directProfile.flags) || 'none'} source=cache`);
                    if (pathRewrite.failed) {
                        logDirect('warn', `direct-load-asset-rewrite-failed id=${iframeId} source=cache`);
                    } else if (pathRewrite.rewritten > 0) {
                        logDirect('info', `direct-load-asset-rewrite id=${iframeId} source=cache count=${pathRewrite.rewritten}`);
                    }
                    if (rewriteResult.failed) {
                        logDirect('warn', `direct-load-rewrite-failed id=${iframeId} source=cache`);
                    }
                    const fetchedNeedsVh = /min-height:\s*[^;]*vh/i.test(directHtml) || /\d+vh/.test(directHtml);
                    if (fetchedNeedsVh) directHtml = processAllVhUnits(directHtml);
                    const directNeedsZodShim = shouldInjectZodShim(directHtml);
                    const directDollarShim = buildDollarGlobalShim({
                        iframeId,
                        debugTag,
                        appOrigin: window.location.origin,
                        needsZodShim: directNeedsZodShim,
                    });
                    const directNeedsFrameworkShim = shouldInjectFrameworkShim(directHtml, { directLoad: true });
                    const directVueRuntimePreference = detectVueRuntimePreference(directHtml);
                    const directFrameworkShim = directNeedsFrameworkShim
                        ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: directVueRuntimePreference, appOrigin: window.location.origin })
                        : '';
                    const directMvuBridge = needsMvuCompat ? buildMvuCompatBridge({ iframeId, sessionId, debugTag, messageId }) : '';
                    const directDoc = buildIframeSrcDoc(directHtml, {
                        iframeId,
                        needsVhHandling: fetchedNeedsVh,
                        preserveNewlines: false,
                        injectBridgeScript: true,
                        styleInBody: false,
                        baseHref,
                        headPrepend: `${directDollarShim}${directFrameworkShim}${directMvuBridge}`,
                    });
                    setIframeDynamicDoc(iframeId, directDoc, 'direct-srcdoc');
                    const directStaticHtml = stripScriptsForPreview(directHtml);
                    const directStaticDoc = buildIframeSrcDoc(directStaticHtml, {
                        iframeId,
                        needsVhHandling: fetchedNeedsVh,
                        preserveNewlines: false,
                        injectBridgeScript: false,
                        styleInBody: false,
                        baseHref,
                    });
                    setIframeStaticFallbackDoc(iframeId, directStaticDoc);
                    iframe.dataset.iframeSource = 'direct-srcdoc';
                    iframe.srcdoc = directDoc;
                    logDirect('info', `direct-load-cache-hit id=${iframeId} len=${directHtml.length} rewrite=${rewriteResult.replaced} base=${baseHref}`);
                    return;
                }
                try {
                    const resp = await fetch(directBodyLoadUrl, { method: 'GET', mode: 'cors', credentials: 'omit' });
                    if (!resp?.ok) throw new Error(`http-${String(resp?.status ?? '0')}`);
                    const fetched = String(await resp.text() || '');
                    const looksHtml = /<html[\s>]|<body[\s>]|<script[\s>]|<!doctype/i.test(fetched);
                    if (!looksHtml || fetched.length < 32) {
                        throw new Error('non-html-response');
                    }
                    let directHtml = stripInlineCspMeta(fetched);
                    const pathRewrite = rewriteDirectLoadAssetPaths(directHtml, baseHref);
                    directHtml = pathRewrite.html;
                    const rewriteResult = maybeRewriteStHelperGlobals(directHtml, { directLoad: true });
                    directHtml = rewriteResult.html;
                    const directProfile = analyzeCompatProfile(directHtml, { directLoad: true });
                    logDirect('info', `direct-load-profile id=${iframeId} profile=${directProfile.profile} flags=${summarizeCompatFlags(directProfile.flags) || 'none'} source=fetch`);
                    if (pathRewrite.failed) {
                        logDirect('warn', `direct-load-asset-rewrite-failed id=${iframeId} source=fetch`);
                    } else if (pathRewrite.rewritten > 0) {
                        logDirect('info', `direct-load-asset-rewrite id=${iframeId} source=fetch count=${pathRewrite.rewritten}`);
                    }
                    if (rewriteResult.failed) {
                        logDirect('warn', `direct-load-rewrite-failed id=${iframeId} source=fetch`);
                    }
                    const fetchedNeedsVh = /min-height:\s*[^;]*vh/i.test(directHtml) || /\d+vh/.test(directHtml);
                    if (fetchedNeedsVh) directHtml = processAllVhUnits(directHtml);
                    writeDirectLoadCache(directBodyLoadUrl, directHtml);
                    const directNeedsZodShim = shouldInjectZodShim(directHtml);
                    const directDollarShim = buildDollarGlobalShim({
                        iframeId,
                        debugTag,
                        appOrigin: window.location.origin,
                        needsZodShim: directNeedsZodShim,
                    });
                    const directNeedsFrameworkShim = shouldInjectFrameworkShim(directHtml, { directLoad: true });
                    const directVueRuntimePreference = detectVueRuntimePreference(directHtml);
                    const directFrameworkShim = directNeedsFrameworkShim
                        ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: directVueRuntimePreference, appOrigin: window.location.origin })
                        : '';
                    const directMvuBridge = needsMvuCompat ? buildMvuCompatBridge({ iframeId, sessionId, debugTag, messageId }) : '';
                    const directDoc = buildIframeSrcDoc(directHtml, {
                        iframeId,
                        needsVhHandling: fetchedNeedsVh,
                        preserveNewlines: false,
                        injectBridgeScript: true,
                        styleInBody: false,
                        baseHref,
                        headPrepend: `${directDollarShim}${directFrameworkShim}${directMvuBridge}`,
                    });
                    setIframeDynamicDoc(iframeId, directDoc, 'direct-srcdoc');
                    const directStaticHtml = stripScriptsForPreview(directHtml);
                    const directStaticDoc = buildIframeSrcDoc(directStaticHtml, {
                        iframeId,
                        needsVhHandling: fetchedNeedsVh,
                        preserveNewlines: false,
                        injectBridgeScript: false,
                        styleInBody: false,
                        baseHref,
                    });
                    setIframeStaticFallbackDoc(iframeId, directStaticDoc);
                    iframe.dataset.iframeSource = 'direct-srcdoc';
                    iframe.srcdoc = directDoc;
                    logDirect('info', `direct-load-fetch-success id=${iframeId} len=${directHtml.length} rewrite=${rewriteResult.replaced} base=${baseHref}`);
                    return;
                } catch (err) {
                    const msg = err?.message ? String(err.message) : String(err || 'unknown');
                    logDirect('warn', `direct-load-fetch-failed id=${iframeId} err=${msg}`);
                }
                iframe.dataset.iframeSource = 'direct-load';
                iframe.src = directBodyLoadUrl;
                logDirect('warn', `direct-load-fallback-src id=${iframeId} url=${directBodyLoadUrl}`);
            };
            runDirectLoad();
        } else if (allowScripts) {
            let blobUrl = '';
            const onLoad = () => {
                iframe.dataset.iframeLoaded = '1';
                const st = getIframeState(iframeId, { messageId: String(messageId || ''), createdAt: Date.now() });
                if (st) st.loadedAt = Date.now();
                if (blobUrl) {
                    try { URL.revokeObjectURL(blobUrl); } catch {}
                }
            };
            iframe.dataset.iframeDocSent = '1';
            try {
                const blob = new Blob([scriptDoc], { type: 'text/html' });
                blobUrl = URL.createObjectURL(blob);
                iframe.dataset.iframeSource = 'blob';
                iframe.src = blobUrl;
                iframe.addEventListener('load', onLoad, { once: true });
            } catch {
                iframe.dataset.iframeSource = 'srcdoc';
                iframe.srcdoc = scriptDoc;
                iframe.addEventListener('load', onLoad, { once: true });
            }
        } else {
            iframe.src = getIframeHostUrl();
            iframe.addEventListener('load', () => {
                iframe.dataset.iframeLoaded = '1';
                const st = getIframeState(iframeId, { messageId: String(messageId || ''), createdAt: Date.now() });
                if (st) st.loadedAt = Date.now();
                if (iframe.dataset.iframeDocSent === '1') return;
                iframe.dataset.iframeDocSent = '1';
                try {
                    iframe.contentWindow?.postMessage({
                        type: 'chatapp:iframe-load',
                        id: iframeId,
                        doc: hostDoc,
                        allowScripts,
                    }, '*');
                } catch {}
            }, { once: false });
            iframe.addEventListener('error', () => {
                const st = getIframeState(iframeId, { messageId: String(messageId || ''), createdAt: Date.now() });
                if (st) st.error = st.error || 'load-error';
                warnIframe('iframe-load-error', iframeId);
            });
        }

        wrap.appendChild(previewWrap);
        // Match ST 酒馆助手体验：渲染后不显示源码（源码/复制转移到长按菜单）

        // 回退观测：脚本桥未就绪时，仍尝试本地测高与长按转发。
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            const st = getIframeState(iframeId);
            if (st && st.lastResizeAt) return;
            if (iframe.dataset.iframePostResizeAt) return;
            observeIframeContent(iframe);
            bindIframeDocumentPressFallback(iframe, iframeId);
        }, 900);

        // Fallback: some WebViews choke on srcdoc; retry via srcdoc if host never reports ready.
        if (!allowScripts) {
            setTimeout(() => {
                if (!isLiveIframe(iframe, iframeId)) return;
                if (iframe.dataset.iframeReady === '1') return;
                if (iframe.dataset.iframeFallbackAttempted === '1') return;
                iframe.dataset.iframeFallbackAttempted = '1';
                if (iframe.dataset.iframeLoaded === '1') return;
                try {
                    iframe.dataset.iframeSource = 'srcdoc';
                    iframe.removeAttribute('src');
                    iframe.srcdoc = fallbackDoc;
                } catch {}
            }, 1200);
        }
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            const st = getIframeState(iframeId);
            if (!st) return;
            if (!st.readyAt && iframe.dataset.iframeWarnedNoReady !== '1') {
                iframe.dataset.iframeWarnedNoReady = '1';
                const msgId = st.messageId || iframe.dataset.msgId || '';
                const fallback = iframe.dataset.iframeFallbackAttempted === '1' ? 'fallback=1' : 'fallback=0';
                const loaded = iframe.dataset.iframeLoaded === '1' ? 'loaded=1' : 'loaded=0';
                const source = iframe.dataset.iframeSource || 'host';
                const sent = iframe.dataset.iframeDocSent === '1' ? 'sent=1' : 'sent=0';
                warnIframe('no-ready-after-2s', iframeId, `msg=${msgId} ${fallback} ${loaded} ${sent} source=${source}`);
            }
            if (!st.lastResizeAt && iframe.dataset.iframeWarnedNoResize !== '1') {
                iframe.dataset.iframeWarnedNoResize = '1';
                const msgId = st.messageId || iframe.dataset.msgId || '';
                const loaded = iframe.dataset.iframeLoaded === '1' ? 'loaded=1' : 'loaded=0';
                const source = iframe.dataset.iframeSource || 'host';
                const sent = iframe.dataset.iframeDocSent === '1' ? 'sent=1' : 'sent=0';
                warnIframe('no-resize-after-2s', iframeId, `msg=${msgId} ${loaded} ${sent} source=${source}`);
            }
        }, 2000);
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            if (iframe.dataset.iframeReady === '1') {
                try { iframe.contentWindow?.postMessage({ type: 'chatapp:ping' }, '*'); } catch {}
            }
        }, 2200);

        // notify iframe about viewport height changes (for vh handling)
        if (needsVhHandling) {
            setTimeout(() => {
                try { iframe.contentWindow?.postMessage({ type: 'chatapp:updateViewportHeight', height: window.innerHeight }, '*'); } catch {}
            }, 0);
        }
    }

    // Default code block (mobile wrapped, no horizontal scrolling)
    if (!(looksLikeHtmlDoc || isHtmlLang)) {
        const body = document.createElement('div');
        body.style.cssText = 'padding:10px; color:#e2e8f0; background:#0b1220;';
        const pre = document.createElement('pre');
        pre.style.cssText = 'margin:0; white-space:pre-wrap; overflow-x:hidden; overflow-y:auto; max-height:420px; font-size:12px; line-height:1.45; overflow-wrap:anywhere; word-break:break-word;';
        const codeEl = document.createElement('code');
        codeEl.textContent = escapeText(code);
        pre.appendChild(codeEl);
        body.appendChild(pre);
        wrap.appendChild(body);
    }

    return wrap;
};

export const setupIframeResizeListener = () => {
    if (window.__chatappIframeResizeListenerInstalled) return;
    window.__chatappIframeResizeListenerInstalled = true;
    const findIframeBySource = (source) => {
        if (!source) return null;
        const nodes = document.querySelectorAll('iframe[data-iframe-id]');
        for (const iframe of nodes) {
            try {
                if (iframe.contentWindow === source) return iframe;
            } catch {}
        }
        return null;
    };
    const collectMvuVars = (sessionId) => {
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        if (!sid) return null;
        const store = window.appBridge?.chatStore;
        if (!store) return null;
        const localVars = store?.listVariables?.(sid) || {};
        const globalVars = store?.listGlobalVariables?.() || {};
        const isShared = window.appBridge?.isSharedVariableSession
            ? Boolean(window.appBridge.isSharedVariableSession(sid))
            : false;
        const baseVars = isShared ? globalVars : localVars;
        const nestedBase = buildNestedVars(baseVars);
        const nestedGlobal = buildNestedVars(globalVars);
        return {
            stat_data: nestedBase,
            variables: nestedBase,
            status_current_variables: nestedBase,
            global_variables: nestedGlobal,
            local_variables: localVars,
        };
    };
    const postMvuVarsToIframe = (iframe, sessionId) => {
        if (!iframe || iframe.dataset.iframeMvuCompat !== '1' || iframe.dataset.iframeAllowScripts !== '1') return;
        const sid = String(sessionId || iframe.dataset.sessionId || window.appBridge?.activeSessionId || '').trim();
        if (!sid) return;
        const vars = collectMvuVars(sid);
        if (!vars) return;
        try {
            iframe.contentWindow?.postMessage({
                type: 'chatapp:mvu-vars',
                id: String(iframe.dataset.iframeId || ''),
                sessionId: sid,
                vars,
            }, '*');
        } catch {}
    };
    const broadcastMvuVars = (sessionId, { includeAll = false } = {}) => {
        const sid = String(sessionId || '').trim();
        const nodes = document.querySelectorAll('iframe[data-iframe-mvu-compat="1"]');
        for (const iframe of nodes) {
            if (!iframe || iframe.dataset.iframeAllowScripts !== '1') continue;
            const targetSid = String(iframe.dataset.sessionId || '').trim();
            if (!includeAll && sid && targetSid && targetSid !== sid) continue;
            postMvuVarsToIframe(iframe, targetSid || sid);
        }
    };
    const tryRecoverDirectLoadFallback = (iframe, id, reason = '') => {
        if (!iframe || !id) return false;
        const source = String(iframe.dataset.iframeSource || '');
        if (source !== 'direct-srcdoc') return false;
        if (iframe.dataset.directRecoverTried === '1') return false;
        const url = String(iframe.dataset.directLoadUrl || '').trim();
        if (!url) return false;
        iframe.dataset.directRecoverTried = '1';
        iframe.dataset.iframeSource = 'direct-load';
        iframe.dataset.iframeReady = '0';
        iframe.dataset.iframeLoaded = '0';
        iframe.dataset.iframeError = reason || 'direct-recover';
        iframe.style.height = '70vh';
        iframe.style.minHeight = '320px';
        iframe.style.maxHeight = '860px';
        try {
            iframe.removeAttribute('srcdoc');
            iframe.src = url;
            const info = `direct-load-recover-src id=${id} url=${url}${reason ? ` reason=${reason}` : ''}`;
            emitDebugLog({ source: 'iframe', type: 'warn', message: info, force: true });
            warnIframe('direct-load', id, `msg=${info}`);
            return true;
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || 'recover-failed');
            warnIframe('direct-load-recover-failed', id, `err=${msg}`);
            return false;
        }
    };

    window.addEventListener('message', (e) => {
        const data = e?.data;
        if (!data || typeof data !== 'object') return;
        const esc = (CSS && typeof CSS.escape === 'function') ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        if (data.type === 'chatapp:iframe-ready') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            iframe.dataset.iframeReady = '1';
            iframe.dataset.iframeLoaded = iframe.dataset.iframeLoaded || '1';
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st && !st.readyAt) st.readyAt = Date.now();
            if (iframe.dataset.iframeMvuCompat === '1') {
                postMvuVarsToIframe(iframe, iframe.dataset.sessionId || '');
            }
            return;
        }
        if (data.type === 'chatapp:mvu-ready') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            if (data.sessionId && !iframe.dataset.sessionId) {
                iframe.dataset.sessionId = String(data.sessionId || '');
            }
            postMvuVarsToIframe(iframe, data.sessionId || iframe.dataset.sessionId || '');
            return;
        }
        if (data.type === 'chatapp:iframe-host-ready') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) st.hostReadyAt = Date.now();
            logger.info(`[iframe] host-ready id=${id}`);
            return;
        }
        if (data.type === 'chatapp:iframe-host-error') {
            const id = String(data.id || '');
            const message = String(data.message || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) st.error = message || 'host-error';
            warnIframe('iframe-host-error', id, message ? `err=${message}` : '');
            return;
        }
        if (data.type === 'chatapp:iframe-recover-dynamic') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const recovered = applyIframeDynamicRecover(iframe, id, 'manual-button');
            if (!recovered) {
                warnIframe('dynamic-recover-unavailable', id);
            }
            return;
        }
        if (data.type === 'chatapp:pong') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) st.lastPongAt = Date.now();
            return;
        }
        if (data.type === 'chatapp:iframe-error') {
            const id = String(data.id || '');
            const message = String(data.message || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            iframe.dataset.iframeError = message || 'error';
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) st.error = message || 'error';
            warnIframe('iframe-error', id, message ? `err=${message}` : '');
            const hint = diagnoseIframeError(message);
            if (hint) {
                const diag = `diag id=${id} ${hint}`;
                emitDebugLog({ source: 'iframe', type: 'warn', message: diag, force: true });
                warnIframe('diag', id, hint);
            }
            const recoverableRuntimeError = shouldStaticFallbackForIframeError(message);
            const wasPreviouslyHealthy = Boolean(st?.readyAt && st?.lastResizeAt);
            if (recoverableRuntimeError && wasPreviouslyHealthy && st?.dynamicDoc && st?.autoRecoverTried !== 1) {
                st.autoRecoverTried = 1;
                const recovered = applyIframeDynamicRecover(iframe, id, `auto-recover ${message.slice(0, 120)}`);
                if (recovered) return;
            }
            if (
                /VueRouter is not defined|Vue is not defined|Pinia is not defined|createPinia is not defined|_ is not defined|resource-load-failed|unhandledrejection/i.test(message)
            ) {
                const recovered = tryRecoverDirectLoadFallback(iframe, id, message.slice(0, 120));
                if (!recovered && recoverableRuntimeError) {
                    applyIframeStaticFallback(iframe, id, message.slice(0, 160));
                }
            } else if (recoverableRuntimeError) {
                applyIframeStaticFallback(iframe, id, message.slice(0, 160));
            }
            return;
        }
        if (data.type === 'chatapp:iframe-debug') {
            const id = String(data.id || '');
            const level = String(data.level || 'info').toLowerCase();
            const message = String(data.message || '').trim();
            const info = `compat id=${id || 'unknown'}${message ? ` ${message}` : ''}`;
            const warnType = level === 'warn' || level === 'error';
            emitDebugLog({
                source: 'iframe',
                type: warnType ? 'warn' : 'info',
                message: info,
                force: true,
            });
            if (warnType) warnIframe('compat', id, message ? `msg=${message}` : '');
            else logger.info(`[iframe] ${info}`);
            return;
        }
        if (data.type === 'chatapp:iframe-resize') {
            const id = String(data.id || '');
            const height = Number(data.height);
            if (!id || !Number.isFinite(height)) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const clamped = Math.max(120, Math.min(height + 4, 2000));
            iframe.style.height = `${clamped}px`;
            markIframePostResize(iframe);
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) {
                st.resizeCount = (st.resizeCount || 0) + 1;
                st.lastResizeAt = Date.now();
            }
            return;
        }
        if (data.type === 'resizeIframe') {
            const height = Number(data.height ?? data.newHeight);
            if (!Number.isFinite(height)) return;
            const iframe = findIframeBySource(e?.source) || null;
            if (!iframe) return;
            const clamped = Math.max(120, Math.min(height + 4, 2000));
            iframe.style.height = `${clamped}px`;
            markIframePostResize(iframe);
            const id = String(iframe.dataset.iframeId || '');
            if (id) {
                const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
                if (st) {
                    st.resizeCount = (st.resizeCount || 0) + 1;
                    st.lastResizeAt = Date.now();
                }
            }
            return;
        }

        // Forward iframe pointer events to outer UI (for long-press context menu)
        if (data.type === 'chatapp:iframe-press') {
            const id = String(data.id || '');
            const phase = String(data.phase || '');
            const x = Number(data.x);
            const y = Number(data.y);
            if (!id || !phase || !Number.isFinite(x) || !Number.isFinite(y)) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            const rect = iframe.getBoundingClientRect();
            const clientX = rect.left + x;
            const clientY = rect.top + y;
            const msgId = String(iframe.dataset.msgId || '');
            const st = getIframeState(id, { messageId: msgId, createdAt: Date.now() });
            if (st) {
                st.pressCount = (st.pressCount || 0) + 1;
                st.lastPressAt = Date.now();
            }
            window.dispatchEvent(new CustomEvent('chatapp-iframe-press', {
                detail: { id, phase, clientX, clientY, msgId }
            }));
        }
    });

    window.addEventListener('chatapp-variable-changed', (ev) => {
        const sid = String(ev?.detail?.sessionId || '').trim();
        const scope = String(ev?.detail?.scope || '').trim();
        if (scope === 'global') {
            broadcastMvuVars('', { includeAll: true });
            return;
        }
        if (sid) broadcastMvuVars(sid);
    });
    window.addEventListener('chatapp-variable-schema-changed', (ev) => {
        const sid = String(ev?.detail?.sessionId || '').trim();
        if (sid) broadcastMvuVars(sid);
    });
};

export const renderRichText = (containerEl, text, { messageId, preserveHtmlNewlines = false, sessionId, debugTag = '' } = {}) => {
    if (!containerEl) return;
    containerEl.innerHTML = '';

    const STATUS_TOKEN = '__CHATAPP_STATUS__';
    const rawText = String(text ?? '');
    const decodeHtmlEntities = (input) => {
        const s = String(input ?? '');
        if (!s.includes('&')) return s;
        return s
            .replace(/&lt;/gi, '<')
            .replace(/&gt;/gi, '>')
            .replace(/&quot;/gi, '"')
            .replace(/&#39;|&#x27;/gi, "'")
            .replace(/&amp;/gi, '&');
    };
    const htmlEntityTagRe = /&lt;(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i;
    const htmlEntityCloseRe = /&lt;\/(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i;
    const hasEscapedHtml = htmlEntityTagRe.test(rawText) && htmlEntityCloseRe.test(rawText);
    const htmlCandidateText = hasEscapedHtml ? decodeHtmlEntities(rawText) : rawText;
    const escapeHtml = (value) => (
        String(value ?? '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
    );
    const appendPlainTextToHtml = (html, plainText) => {
        const textRaw = String(plainText ?? '');
        if (!textRaw.trim()) return html;
        const safe = escapeHtml(textRaw).replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n/g, '<br>');
        const tail = `<div class="__chatapp-tail-text">${safe}</div>`;
        if (/<\/body>/i.test(html)) return html.replace(/<\/body>/i, `${tail}</body>`);
        if (/<\/html>/i.test(html)) return html.replace(/<\/html>/i, `${tail}</html>`);
        return `${html}${tail}`;
    };
    // 酒馆助手/正则常见用法：
    // - 直接把可渲染的 HTML 片段塞进消息（例如把 <thinking> 替换为 <style>+<details>）
    // 我们保持默认安全文本渲染，但对“明显是 HTML 的整段消息”提供 iframe 渲染（沙盒）
    const trimmed = htmlCandidateText.trim();
    const htmlTagRe = /<(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i;
    const htmlCloseRe = /<\/(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i;
    const hasHtmlTag = htmlTagRe.test(trimmed) || /^\s*<!doctype\s+html/i.test(trimmed);
    const hasHtmlClose = htmlCloseRe.test(trimmed) || /<\/html\s*>/i.test(trimmed);
    const wholeLooksLikeHtml = hasHtmlTag && hasHtmlClose;
    const textWithBreaks = rawText
        .replace(/&lt;br\s*\/?&gt;/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');
    const hasCodeFence = /```/.test(htmlCandidateText);
    let parts = (hasCodeFence ? splitFencedCodeBlocks(htmlCandidateText)
        : wholeLooksLikeHtml
            ? [{ type: 'code', lang: 'html', code: trimmed }]
            : [{ type: 'text', text: textWithBreaks }]);
    const hasHtmlLikeText = (val) => {
        const raw = String(val || '');
        if (!raw) return false;
        const hasTag = htmlTagRe.test(raw) && htmlCloseRe.test(raw);
        const escapedTag = htmlEntityTagRe.test(raw) && htmlEntityCloseRe.test(raw);
        return hasTag || escapedTag;
    };
    if (hasCodeFence) {
        parts = parts.flatMap((p) => {
            if (p.type !== 'text') return [p];
            if (!hasHtmlLikeText(p.text)) return [p];
            const decoded = decodeHtmlEntities(p.text);
            return [{ type: 'code', lang: 'html', code: decoded }];
        });
    }
    if (Boolean(debugTag) || shouldLogRichDebug()) {
        const htmlHint = /<\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(htmlCandidateText) ||
            /&lt;\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(rawText);
        if (htmlHint || hasCodeFence || wholeLooksLikeHtml) {
            const msg = `render msg=${String(messageId || '')} codeFence=${hasCodeFence} html=${wholeLooksLikeHtml} escaped=${hasEscapedHtml} parts=${parts.length}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: 'info', message: msg, force: true });
            logger.info(`[rich] ${msg}`);
        }
    }
    if (hasCodeFence) {
        const firstCodeIdx = parts.findIndex(p => p.type === 'code' && (p.lang === 'html' || p.lang === 'htm'));
        const hasOtherCode = parts.some((p, idx) => p.type === 'code' && idx !== firstCodeIdx);
        if (firstCodeIdx === 0 && !hasOtherCode) {
            const tailText = parts
                .slice(1)
                .map(p => (p.type === 'text' ? p.text : ''))
                .join('');
            if (String(tailText || '').trim()) {
                const mergedHtml = appendPlainTextToHtml(String(parts[0].code || ''), tailText);
                parts = [{ type: 'code', lang: 'html', code: mergedHtml }];
            }
        }
        parts = parts.map(p => {
            if (p.type !== 'text') return p;
            const normalized = String(p.text || '')
                .replace(/&lt;br\s*\/?&gt;/gi, '\n')
                .replace(/<br\s*\/?>/gi, '\n');
            return { ...p, text: normalized };
        });
    }
    const resolveStatusCard = () => {
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        const store = window.appBridge?.chatStore;
        return buildVariableStatusSnapshot({ chatStore: store, sessionId: sid, inline: true });
    };

    parts.forEach((p) => {
        if (p.type === 'code') {
            containerEl.appendChild(makeCodeBlock({
                lang: p.lang,
                code: p.code,
                messageId,
                preserveHtmlNewlines,
                sessionId,
                debugTag,
            }));
            return;
        }

        // Plain text: preserve newlines safely
        const chunk = String(p.text || '');
        const lines = chunk.split(/\n/);
        lines.forEach((line, idx) => {
            const segments = line.split(STATUS_TOKEN);
            segments.forEach((seg, segIdx) => {
                if (seg) {
                    const span = document.createElement('span');
                    span.textContent = escapeText(seg);
                    containerEl.appendChild(span);
                }
                if (segIdx !== segments.length - 1) {
                    const card = resolveStatusCard();
                    if (card) {
                        containerEl.appendChild(card);
                    }
                }
            });
            if (idx !== lines.length - 1) containerEl.appendChild(document.createElement('br'));
        });
    });
};
