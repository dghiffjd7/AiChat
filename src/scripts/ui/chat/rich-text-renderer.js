/**
 * Rich text renderer (safe, no raw HTML injection)
 * - Supports fenced code blocks (```lang ... ```)
 * - For HTML code blocks containing <body>...</body>, render sandboxed iframe preview (ST 酒馆助手风格)
 */

import { logger } from '../../utils/logger.js';
import { emitDebugLog } from '../../utils/debug-log.js';
import { appSettings } from '../../storage/app-settings.js';
import { serializeForInlineScript } from '../../utils/inline-script.js';
import { buildVariableStatusSnapshot } from '../variable-status-card.js';
import { buildVariableContext } from '../../variables/variable-path-utils.js';
import {
    buildMvuCompatWindowContext,
    cloneMvuCompatValue,
    deleteMvuCompatScopedVariable,
    deleteMvuCompatValueAtPath,
    flattenMvuCompatVariables,
    getMvuCompatScopeRootKey,
    getMvuCompatScopedVariables,
    isMvuCompatContainer,
    mergeMvuCompatScopedVariables,
    mergeMvuCompatValues,
    normalizeMvuCompatVars,
    normalizeMvuCompatOptionType,
    normalizeMvuCompatPath,
    pickMvuCompatSeedVars,
    replaceMvuCompatScopedVariables,
    setMvuCompatScopedVariables,
} from './iframe-variable-compat.js';

const iframeDebugState = new Map();
const directLoadCache = new Map();
const DIRECT_LOAD_CACHE_TTL = 5 * 60 * 1000;
const DIRECT_LOAD_CACHE_LIMIT = 6;
const MVU_IFRAME_VARIABLE_COMPAT_SOURCE = `
${cloneMvuCompatValue.toString()}
${isMvuCompatContainer.toString()}
${normalizeMvuCompatVars.toString()}
${normalizeMvuCompatOptionType.toString()}
${getMvuCompatScopeRootKey.toString()}
${getMvuCompatScopedVariables.toString()}
${normalizeMvuCompatPath.toString()}
${mergeMvuCompatValues.toString()}
${deleteMvuCompatValueAtPath.toString()}
${setMvuCompatScopedVariables.toString()}
${replaceMvuCompatScopedVariables.toString()}
${mergeMvuCompatScopedVariables.toString()}
${deleteMvuCompatScopedVariable.toString()}
${buildMvuCompatWindowContext.toString()}
const normalizeVars = (input) => normalizeMvuCompatVars(input);
const getScopedVars = (input, option) => getMvuCompatScopedVariables(input, option);
const replaceScopedVars = (input, next, option) => replaceMvuCompatScopedVariables(input, next, option);
const mergeScopedVars = (input, patch, option) => mergeMvuCompatScopedVariables(input, patch, option);
const deleteScopedVar = (input, path, option) => deleteMvuCompatScopedVariable(input, path, option);
`;
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
        ? `<script>(function(){var id=${serializeForInlineScript(String(iframeId || ''))};var btn=document.getElementById('__chatapp_recover_btn');if(!btn)return;btn.addEventListener('click',function(){try{parent.postMessage({type:'chatapp:iframe-recover-dynamic',id:id},'*');}catch{}});})();<\/script>`
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
try {
    localStorage.removeItem('chatapp_rich_script_guard_v1');
} catch {}
const inspectIframeBlankState = (iframe) => {
    try {
        const win = iframe?.contentWindow;
        const doc = win?.document;
        const body = doc?.body;
        const docEl = doc?.documentElement;
        if (!body || !docEl) return { isBlank: false, reason: 'doc-unavailable' };

        let bodyStyle = null;
        let docElStyle = null;
        try {
            bodyStyle = win?.getComputedStyle?.(body) || null;
            docElStyle = win?.getComputedStyle?.(docEl) || null;
        } catch {}
        const hidden = (
            (bodyStyle && (
                bodyStyle.display === 'none' ||
                bodyStyle.visibility === 'hidden' ||
                Number.parseFloat(bodyStyle.opacity || '1') <= 0.01
            )) ||
            (docElStyle && (
                docElStyle.display === 'none' ||
                docElStyle.visibility === 'hidden' ||
                Number.parseFloat(docElStyle.opacity || '1') <= 0.01
            ))
        );
        if (hidden) return { isBlank: true, reason: 'hidden-root' };

        const rawHtml = String(body.innerHTML || docEl.innerHTML || '');
        const rawText = String(body.innerText || docEl.innerText || '')
            .replace(/\s+/g, '')
            .trim();
        const hasVisualNode = Boolean(
            body.querySelector?.(
                'img,svg,canvas,video,audio,table,details,pre,code,p,li,h1,h2,h3,h4,' +
                'article,section,main,blockquote,[role="img"]',
            ),
        );
        const scrollH = Math.max(
            Number(body.scrollHeight || 0),
            Number(body.offsetHeight || 0),
            Number(body.clientHeight || 0),
            Number(docEl.scrollHeight || 0),
            Number(docEl.offsetHeight || 0),
            Number(docEl.clientHeight || 0),
        );

        if (isLikelyBlankStaticDoc(rawHtml)) {
            return { isBlank: true, reason: 'blank-markup' };
        }
        if (!hasVisualNode && rawText.length === 0 && scrollH <= 140) {
            return { isBlank: true, reason: 'empty-no-content' };
        }
        if (!hasVisualNode && rawText.length <= 4 && scrollH <= 100) {
            return { isBlank: true, reason: 'tiny-content' };
        }
        return { isBlank: false, reason: 'ok' };
    } catch (err) {
        const msg = String(err?.message || err || 'inspect-error');
        if (/cross-origin|permission denied|securityerror|blocked a frame/i.test(msg)) {
            return { isBlank: false, reason: 'cross-origin' };
        }
        return { isBlank: false, reason: 'inspect-error' };
    }
};
const applyIframeBlankFallbackIfNeeded = (
    iframe,
    id,
    reason = '',
    {
        assumeBlank = false,
        requireLoaded = false,
        tryDirectRecover = true,
    } = {},
) => {
    if (!iframe || !id) return false;
    if (iframe.dataset.staticFallbackApplied === '1') return false;
    if (requireLoaded && iframe.dataset.iframeLoaded !== '1') return false;

    const blankState = inspectIframeBlankState(iframe);
    const shouldFallback = assumeBlank || blankState.isBlank;
    if (!shouldFallback) return false;

    const shortReason = String(reason || '').trim();
    const detailReason = blankState?.reason ? `blank=${blankState.reason}` : 'blank=unknown';
    const finalReason = [shortReason, detailReason].filter(Boolean).join(' ').slice(0, 180);

    if (tryDirectRecover && String(iframe.dataset.iframeSource || '') === 'direct-srcdoc') {
        const recovered = tryRecoverDirectLoadFallback(iframe, id, finalReason.slice(0, 120));
        if (recovered) return true;
    }
    return applyIframeStaticFallback(iframe, id, finalReason);
};
const isLiveIframe = (iframe, iframeId = '') => {
    if (iframe && iframe.isConnected) return true;
    if (iframeId) iframeDebugState.delete(iframeId);
    return false;
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
    return /getAllVariables\s*\(|getVariables\s*\(|getCurrentMessageId\s*\(|getChatMessages\s*\(|getChatMessage\s*\(|setChatMessage\s*\(|setChatMessages\s*\(|replaceVariables\s*\(|insertOrAssignVariables\s*\(|deleteVariable\s*\(|getContext\s*\(|waitGlobalInitialized\s*\(|\bMvu\b|StatusPlaceHolderImpl|mag_variable_|\$\(\s*['"]body['"]\s*\)\s*\.load\s*\(/i.test(raw);
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
        stGlobals: /\bSillyTavern\b|\bTavernHelper\b|\btoastr\b|\bYAML\b|registerMvuSchema\s*\(|registerVariableSchema\s*\(|mag_variable_|setChatMessage\s*\(|setChatMessages\s*\(|replaceVariables\s*\(|insertOrAssignVariables\s*\(|deleteVariable\s*\(|getCurrentMessageId\s*\(|getChatMessages\s*\(|getChatMessage\s*\(|getContext\s*\(/i.test(raw),
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
const buildMvuCompatBridge = ({ iframeId, sessionId, debugTag, messageId, messageIndex, seedVars } = {}) => {
    const id = String(iframeId || '');
    const sid = String(sessionId || '');
    const tag = String(debugTag || '');
    const mid = String(messageId || '');
    const rawIdx = Number(messageIndex);
    const midx = Number.isFinite(rawIdx) ? Math.trunc(rawIdx) : null;
    const seed = seedVars && typeof seedVars === 'object' ? seedVars : {};
    return `
<script>
(() => {
  const CHATAPP_IFRAME_ID = ${serializeForInlineScript(id)};
  const CHATAPP_SESSION_ID = ${serializeForInlineScript(sid)};
  const CHATAPP_DEBUG_TAG = ${serializeForInlineScript(tag)};
  const CHATAPP_MESSAGE_ID = ${serializeForInlineScript(mid)};
  const CHATAPP_MESSAGE_INDEX = ${midx === null ? 'null' : String(midx)};
  const CHATAPP_SEED_VARS = ${serializeForInlineScript(seed)};
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
  ${MVU_IFRAME_VARIABLE_COMPAT_SOURCE}
  const state = { vars: normalizeVars(CHATAPP_SEED_VARS || {}) };
  const cloneVars = (input) => {
    try { return structuredClone(input); } catch {}
    try { return JSON.parse(JSON.stringify(input)); } catch {}
    return input;
  };
  let hostReqSeq = 0;
  const hostReqResolvers = new Map();
  const makeHostRequestId = () => {
    hostReqSeq += 1;
    return String(CHATAPP_IFRAME_ID || 'iframe') + ':' + String(Date.now()) + ':' + String(hostReqSeq);
  };
  const waitHostResult = (requestId, timeoutMs = 2600) => new Promise((resolve) => {
    const reqId = String(requestId || '').trim();
    if (!reqId) return resolve({ ok: false, reason: 'missing-request-id' });
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      hostReqResolvers.delete(reqId);
      resolve({ ok: false, reason: 'timeout' });
    }, Math.max(400, Number(timeoutMs) || 2600));
    hostReqResolvers.set(reqId, (payload) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      hostReqResolvers.delete(reqId);
      resolve(payload && typeof payload === 'object' ? payload : { ok: false, reason: 'invalid-result' });
    });
  });
  const postHostRequest = async (type, payload = {}, timeoutMs = 2600) => {
    const requestId = makeHostRequestId();
    const waiter = waitHostResult(requestId, timeoutMs);
    try {
      parent.postMessage({
        type: String(type || ''),
        id: CHATAPP_IFRAME_ID,
        requestId,
        sessionId: CHATAPP_SESSION_ID,
        ...payload,
      }, '*');
    } catch (err) {
      hostReqResolvers.delete(requestId);
      return { ok: false, reason: String(err?.message || err || 'post-message-failed') };
    }
    return await waiter;
  };
  const normalizeChatMessageFieldValues = (input) => {
    if (typeof input === 'string') return { message: input };
    if (!input || typeof input !== 'object') return {};
    return { ...input };
  };
  const normalizeChatMessageRef = (input) => {
    if (input === undefined || input === null || input === '') return String(CHATAPP_MESSAGE_ID || '');
    return String(input);
  };
  const chatState = {
    currentRef: String(CHATAPP_MESSAGE_ID || ''),
    currentIndex: Number.isInteger(CHATAPP_MESSAGE_INDEX) ? CHATAPP_MESSAGE_INDEX : null,
    entries: new Map(),
  };
  const getCurrentCompatRef = () => String(chatState.currentRef || CHATAPP_MESSAGE_ID || '');
  const normalizeCompatRef = (input) => {
    const ref = normalizeChatMessageRef(input);
    const idx = Number(ref);
    if (Number.isInteger(idx) && Number.isInteger(chatState.currentIndex) && idx === chatState.currentIndex) {
      return getCurrentCompatRef();
    }
    return ref;
  };
  const normalizeCompatEntry = (entry = {}, fallbackRef = '') => {
    const ref = normalizeCompatRef(entry.message_id ?? entry.messageId ?? entry.id ?? fallbackRef ?? '');
    const numericId = Number(ref);
    const messageId = Number.isInteger(numericId) ? numericId : ref;
    const role = String(entry.role || 'assistant');
    const message = String(entry.message ?? entry.content ?? entry.raw ?? '');
    const data = entry.data && typeof entry.data === 'object' ? cloneVars(entry.data) : {};
    const extra = entry.extra && typeof entry.extra === 'object' ? cloneVars(entry.extra) : {};
    return {
      message_id: messageId,
      role,
      message,
      data,
      extra,
      is_hidden: Boolean(entry.is_hidden),
      name: String(entry.name || ''),
    };
  };
  const upsertCompatEntry = (refInput, patch = {}) => {
    const ref = normalizeCompatRef(refInput);
    if (!ref) return null;
    const prev = chatState.entries.get(ref) || normalizeCompatEntry({ message_id: ref }, ref);
    const merged = normalizeCompatEntry({ ...prev, ...patch, message_id: patch?.message_id ?? prev.message_id }, ref);
    chatState.entries.set(ref, merged);
    return merged;
  };
  const exportCompatEntries = () => Array.from(chatState.entries.values()).map((entry) => normalizeCompatEntry(entry, ''));
  const sortCompatEntries = (items) => (Array.isArray(items) ? items.slice() : [])
    .sort((a, b) => {
      const an = Number(a?.message_id);
      const bn = Number(b?.message_id);
      const ai = Number.isFinite(an) && Number.isInteger(an);
      const bi = Number.isFinite(bn) && Number.isInteger(bn);
      if (ai && bi) return an - bn;
      if (ai) return -1;
      if (bi) return 1;
      return String(a?.message_id ?? '').localeCompare(String(b?.message_id ?? ''));
    });
  const toLegacyChatMessage = (entry = {}) => {
    const message = String(entry?.message || '');
    const role = String(entry?.role || 'assistant').trim().toLowerCase();
    const data = entry?.data && typeof entry.data === 'object' ? entry.data : {};
    const extra = entry?.extra && typeof entry.extra === 'object' ? entry.extra : {};
    const swipes = Array.isArray(entry?.swipes) && entry.swipes.length
      ? entry.swipes.slice()
      : [message];
    const swipeVars = Array.isArray(entry?.swipes_data) && entry.swipes_data.length
      ? entry.swipes_data.slice()
      : [data];
    return {
      mes: message,
      name: String(entry?.name || (role === 'user' ? 'user' : 'assistant')),
      is_user: role === 'user',
      is_system: Boolean(entry?.is_hidden),
      swipe_id: Number.isInteger(Number(entry?.swipe_id)) ? Number(entry.swipe_id) : 0,
      swipes,
      variables: swipeVars,
      extra,
    };
  };
  const syncLegacyChatGlobals = () => {
    const legacy = sortCompatEntries(exportCompatEntries()).map((entry) => toLegacyChatMessage(entry));
    const currentId = Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : 0;
    const mirrorHost = (host) => {
      try {
        if (!host) return;
        host.chat = legacy;
        host.this_chid = currentId;
        if (!host.chat_metadata || typeof host.chat_metadata !== 'object') host.chat_metadata = {};
      } catch {}
    };
    mirrorHost(window);
    mirrorHost(window.parent);
    mirrorHost(window.top);
    return legacy;
  };
  const resolveCompatCurrentMessageId = () =>
    Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : getCurrentCompatRef();
  const applyCompatSetMessageCache = (messageRef, fieldValues = {}) => {
    const ref = normalizeCompatRef(messageRef);
    const fields = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'message')) patch.message = String(fields.message ?? '');
    if (Object.prototype.hasOwnProperty.call(fields, 'data')) {
      patch.data = fields.data && typeof fields.data === 'object' ? cloneVars(fields.data) : {};
    }
    const next = upsertCompatEntry(ref, patch);
    syncLegacyChatGlobals();
    return next;
  };
  {
    const currentRef = getCurrentCompatRef();
    if (currentRef && !chatState.entries.has(currentRef)) {
      upsertCompatEntry(currentRef, {
        message_id: Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : currentRef,
        role: 'assistant',
        message: '',
        data: {},
        extra: {},
      });
    }
    const seededCurrent = currentRef ? chatState.entries.get(currentRef) : null;
    log('info', 'tavern-helper-shim-seed-current has=' + (seededCurrent ? '1' : '0') + ' len=' + String(seededCurrent ? String(seededCurrent.message || '').length : 0));
  }
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
  const emitInitialVarEvents = () => {
    try {
      emit(window.Mvu?.events?.VARIABLE_INITIALIZED || 'mag_variable_initialized', state.vars);
    } catch {}
    try {
      emit(window.Mvu?.events?.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', state.vars);
    } catch {}
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
  const applyCompatVarsResult = (result, fallbackVars, option = {}) => {
    const vars = (result?.vars && typeof result.vars === 'object')
      ? normalizeVars(result.vars)
      : normalizeVars(fallbackVars || state.vars || {});
    setVars(vars);
    return getScopedVars(vars, option);
  };
  compatApi.getAllVariables = () => state.vars;
  compatApi.getVariables = (option = { type: 'message' }) => getScopedVars(state.vars, option);
  compatApi.getCurrentMessageId = () => resolveCompatCurrentMessageId();
  compatApi.getChatMessages = (...args) => {
    const all = exportCompatEntries()
      .slice()
      .sort((a, b) => {
        const an = Number(a?.message_id);
        const bn = Number(b?.message_id);
        const ai = Number.isFinite(an) && Number.isInteger(an);
        const bi = Number.isFinite(bn) && Number.isInteger(bn);
        if (ai && bi) return an - bn;
        if (ai) return -1;
        if (bi) return 1;
        return String(a?.message_id ?? '').localeCompare(String(b?.message_id ?? ''));
      });
    if (!all.length) return [];
    const first = args[0];
    let range = first;
    let options = {};
    if (first && typeof first === 'object' && !Array.isArray(first)) {
      options = { ...first };
      range = undefined;
    } else {
      const second = args[1];
      const third = args[2];
      if (second && typeof second === 'object' && !Array.isArray(second)) options = { ...second };
      else if (typeof second === 'string') options.role = second;
      if (third && typeof third === 'object' && !Array.isArray(third)) options = { ...options, ...third };
      else if (typeof third === 'string' && !options.role) options.role = third;
    }
    const roleKey = String(options?.role || 'all').trim().toLowerCase();
    const hideState = String(options?.hide_state || 'all').trim().toLowerCase();
    const applyFilters = (items) => items.filter((item) => {
      const msgRole = String(item?.role || '').trim().toLowerCase();
      if (roleKey && roleKey !== 'all' && roleKey !== 'any' && msgRole !== roleKey) return false;
      if (hideState === 'hidden' && !Boolean(item?.is_hidden)) return false;
      if (hideState === 'unhidden' && Boolean(item?.is_hidden)) return false;
      return true;
    });
    if (range === undefined || range === null || range === '') return applyFilters(all);
    const numericIds = all
      .map((item) => Number(item?.message_id))
      .filter((n) => Number.isFinite(n) && Number.isInteger(n));
    const fallbackMax = Number.isInteger(state.currentIndex) ? state.currentIndex : -1;
    const maxId = numericIds.length ? Math.max(...numericIds) : fallbackMax;
    const clamp = (value) => {
      if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
      if (maxId < 0) return value;
      const normalized = value < 0 ? maxId + value + 1 : value;
      return Math.max(0, Math.min(maxId, normalized));
    };
    const parseRange = (raw) => {
      if (typeof raw === 'number' && Number.isInteger(raw)) {
        const one = clamp(raw);
        return one === null ? null : { start: one, end: one };
      }
      const text = String(raw ?? '').trim();
      const oneMatch = text.match(/^(-?\d+)$/);
      if (oneMatch) {
        const one = clamp(Number(oneMatch[1]));
        return one === null ? null : { start: one, end: one };
      }
      const rangeMatch = text.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
      if (!rangeMatch) return null;
      const a = clamp(Number(rangeMatch[1]));
      const b = clamp(Number(rangeMatch[2]));
      if (a === null || b === null) return null;
      return a <= b ? { start: a, end: b } : { start: b, end: a };
    };
    const parsed = parseRange(range);
    if (parsed) {
      const matched = all.filter((item) => {
        const id = Number(item?.message_id);
        if (!Number.isFinite(id) || !Number.isInteger(id)) return false;
        return id >= parsed.start && id <= parsed.end;
      });
      return applyFilters(matched);
    }
    const ref = normalizeCompatRef(range);
    return applyFilters(all.filter((item) => String(item?.message_id) === ref || String(item?.id || '') === ref));
  };
  compatApi.getChatMessage = (idx, role) => {
    const list = compatApi.getChatMessages();
    const roleKey = String(role || '').trim().toLowerCase();
    const filtered = roleKey && roleKey !== 'any'
      ? list.filter((item) => String(item?.role || '').trim().toLowerCase() === roleKey)
      : list;
    if (!filtered.length) return '';
    const asId = Number(idx);
    if (Number.isFinite(asId) && Number.isInteger(asId)) {
      const hitById = filtered.find((item) => Number(item?.message_id) === asId || String(item?.message_id) === String(asId));
      if (hitById) return String(hitById?.message || '');
    }
    let index = Number(idx);
    if (!Number.isFinite(index) || !Number.isInteger(index)) return '';
    if (index < 0) index = filtered.length + index;
    if (index < 0 || index >= filtered.length) return '';
    return String(filtered[index]?.message || '');
  };
  compatApi.setChatMessage = async (fieldValues, messageId, options = {}) => {
    const payload = normalizeChatMessageFieldValues(fieldValues);
    const targetMessageId = normalizeCompatRef(messageId);
    const safeOptions = options && typeof options === 'object' ? options : {};
    applyCompatSetMessageCache(targetMessageId, payload);
    const result = await postHostRequest('chatapp:set-chat-message', {
      messageId: targetMessageId,
      fieldValues: payload,
      options: safeOptions,
    });
    if (!result?.ok) {
      postCompatLog('warn', 'set-chat-message failed reason=' + String(result?.reason || 'unknown'));
      return false;
    }
    return true;
  };
  compatApi.setChatMessages = async (messages = [], options = {}) => {
    const list = Array.isArray(messages) ? messages : [];
    const safeOptions = options && typeof options === 'object' ? options : {};
    const normalized = list
      .map((item) => (item && typeof item === 'object' ? { ...item } : null))
      .filter(Boolean);
    normalized.forEach((item) => {
      const ref = item?.message_id ?? item?.messageId ?? item?.id ?? item?.mid ?? '';
      applyCompatSetMessageCache(ref, item);
    });
    const result = await postHostRequest('chatapp:set-chat-messages', {
      messages: normalized,
      options: safeOptions,
    });
    if (!result?.ok) {
      postCompatLog('warn', 'set-chat-messages failed reason=' + String(result?.reason || 'unknown'));
      return false;
    }
    return true;
  };
  compatApi.replaceVariables = async (nextScoped, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? { ...options } : {};
    const payload = nextScoped && typeof nextScoped === 'object' ? cloneVars(nextScoped) : {};
    const fallback = replaceScopedVars(state.vars, payload, safeOptions);
    const result = await postHostRequest('chatapp:replace-variables', {
      variables: payload,
      options: safeOptions,
    });
    if (!result?.ok) {
      postCompatLog('warn', 'replace-variables failed reason=' + String(result?.reason || 'unknown'));
      return false;
    }
    return applyCompatVarsResult(result, fallback, safeOptions);
  };
  compatApi.insertOrAssignVariables = async (patch, options = {}) => {
    const safeOptions = options && typeof options === 'object' ? { ...options } : {};
    const payload = patch && typeof patch === 'object' ? cloneVars(patch) : {};
    const fallback = mergeScopedVars(state.vars, payload, safeOptions);
    const result = await postHostRequest('chatapp:merge-variables', {
      patch: payload,
      options: safeOptions,
    });
    if (!result?.ok) {
      postCompatLog('warn', 'merge-variables failed reason=' + String(result?.reason || 'unknown'));
      return false;
    }
    return applyCompatVarsResult(result, fallback, safeOptions);
  };
  compatApi.deleteVariable = async (key, options = {}) => {
    const rawKey = String(key || '').trim();
    if (!rawKey) return false;
    const safeOptions = options && typeof options === 'object' ? { ...options } : {};
    const fallback = deleteScopedVar(state.vars, rawKey, safeOptions);
    const result = await postHostRequest('chatapp:delete-variable', {
      key: rawKey,
      options: safeOptions,
    });
    if (!result?.ok) {
      postCompatLog('warn', 'delete-variable failed reason=' + String(result?.reason || 'unknown'));
      return false;
    }
    const variables = applyCompatVarsResult(result, fallback, safeOptions);
    return {
      variables,
      delete_occurred: result?.deleted !== false,
    };
  };
  compatApi.eventOn = (event, cb) => eventOn(event, cb);
  compatApi.eventRemoveListener = (event, cb) => eventRemoveListener(event, cb);
  compatApi.waitGlobalInitialized = (name) => safeWaitGlobalInitialized(name);
  compatApi.errorCatched = normalizeErrorCatched(compatApi.errorCatched);
  window.__chatappCompat = compatApi;

  window.getAllVariables = window.getAllVariables || (() => state.vars);
  window.getVariables = window.getVariables || (() => state.vars);
  if (typeof window.getCurrentMessageId !== 'function') window.getCurrentMessageId = () => resolveCompatCurrentMessageId();
  if (typeof window.getChatMessages !== 'function') {
    window.getChatMessages = (...args) => compatApi.getChatMessages(...args);
  }
  if (typeof window.getChatMessage !== 'function') {
    window.getChatMessage = (...args) => compatApi.getChatMessage(...args);
  }
  if (typeof window.setChatMessage !== 'function') {
    window.setChatMessage = (...args) => compatApi.setChatMessage(...args);
  }
  if (typeof window.setChatMessages !== 'function') {
    window.setChatMessages = (...args) => compatApi.setChatMessages(...args);
  }
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
  window.getVariables = (...args) => (typeof compatApi.getVariables === 'function' ? compatApi.getVariables(...args) : compatApi.getAllVariables());
  window.getCurrentMessageId = () => (typeof compatApi.getCurrentMessageId === 'function' ? compatApi.getCurrentMessageId() : resolveCompatCurrentMessageId());
  window.getChatMessages = (...args) => compatApi.getChatMessages(...args);
  window.getChatMessage = (...args) => compatApi.getChatMessage(...args);
  window.getContext = () => {
    const vars = (typeof compatApi.getAllVariables === 'function' ? compatApi.getAllVariables() : state.vars) || {};
    const chat = (typeof compatApi.getChatMessages === 'function' ? compatApi.getChatMessages() : []) || [];
    return buildMvuCompatWindowContext({
      vars,
      chat,
      currentMessageId: (typeof compatApi.getCurrentMessageId === 'function' ? compatApi.getCurrentMessageId() : resolveCompatCurrentMessageId()),
    });
  };
  window.setChatMessage = (...args) => compatApi.setChatMessage(...args);
  window.setChatMessages = (...args) => compatApi.setChatMessages(...args);
  window.replaceVariables = (...args) => compatApi.replaceVariables(...args);
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
    helper.getChatMessages = (...args) => window.getChatMessages(...args);
    helper.getChatMessage = (...args) => window.getChatMessage(...args);
    helper.getContext = (...args) => window.getContext(...args);
    helper.setChatMessage = (...args) => window.setChatMessage(...args);
    helper.setChatMessages = (...args) => window.setChatMessages(...args);
    helper.replaceVariables = (...args) => window.replaceVariables(...args);
    helper.insertOrAssignVariables = (...args) => window.insertOrAssignVariables(...args);
    helper.deleteVariable = (...args) => window.deleteVariable(...args);
    helper.waitGlobalInitialized = (name) => window.waitGlobalInitialized(name);
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
    ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'getChatMessages', 'getChatMessage', 'getContext', 'setChatMessage', 'setChatMessages', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables']
      .forEach((name) => {
        if (typeof helper[name] === 'function') {
          window.SillyTavern[name] = (...args) => helper[name](...args);
        }
      });
    const bridgeHostCompat = (host) => {
      try {
        if (!host || host === window) return false;
        if (!host.TavernHelper || typeof host.TavernHelper !== 'object') host.TavernHelper = helper;
        if (!host.SillyTavern || typeof host.SillyTavern !== 'object') host.SillyTavern = {};
        if (!host.SillyTavern.TavernHelper || typeof host.SillyTavern.TavernHelper !== 'object') host.SillyTavern.TavernHelper = helper;
        ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'getChatMessages', 'getChatMessage', 'getContext', 'setChatMessage', 'setChatMessages', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables']
          .forEach((name) => {
            if (typeof helper[name] === 'function') {
              host.SillyTavern[name] = (...args) => helper[name](...args);
            }
            if (typeof helper[name] === 'function') {
              host[name] = (...args) => helper[name](...args);
            }
          });
        return true;
      } catch {
        return false;
      }
    };
    const bridgedParent = bridgeHostCompat(window.parent);
    const bridgedTop = bridgeHostCompat(window.top);
    postCompatLog('info', 'tavern-helper-shim-host-bridge parent=' + (bridgedParent ? '1' : '0') + ' top=' + (bridgedTop ? '1' : '0'));
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
    exposeAlias('getChatMessages', window.getChatMessages);
    exposeAlias('getChatMessage', window.getChatMessage);
    exposeAlias('getContext', window.getContext);
    exposeAlias('setChatMessage', window.setChatMessage);
    exposeAlias('setChatMessages', window.setChatMessages);
    exposeAlias('replaceVariables', window.replaceVariables);
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
    try { window.eval('var $ = window.$; var jQuery = window.jQuery || window.$; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var getChatMessages = window.getChatMessages; var getChatMessage = window.getChatMessage; var getContext = window.getContext; var setChatMessage = window.setChatMessage; var setChatMessages = window.setChatMessages; var replaceVariables = window.replaceVariables; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var TavernHelper = window.TavernHelper; var SillyTavern = window.SillyTavern;'); } catch {}
    postCompatLog('info', 'mvu-alias-ready');
  };

  const ensureLodash = () => {
    const toPath = (raw) => String(raw || '')
      .replace(/\\[([^\\]]+)\\]/g, '.$1')
      .split('.')
      .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    if (typeof window._ !== 'function') {
      const existing = (window._ && typeof window._ === 'object') ? window._ : {};
      const makeChain = (initial) => {
        let current = initial;
        const api = {
          value() { return current; },
          map(fn) {
            if (Array.isArray(current)) current = current.map((v, i) => fn(v, i));
            else if (current && typeof current === 'object') current = Object.keys(current).map((k) => fn(current[k], k));
            else current = [];
            return api;
          },
          filter(fn) {
            current = Array.isArray(current) ? current.filter((v, i) => fn(v, i)) : [];
            return api;
          },
          sortBy(iteratee) {
            const arr = Array.isArray(current) ? current.slice() : [];
            const getter = typeof iteratee === 'function'
              ? iteratee
              : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
            arr.sort((a, b) => {
              const av = getter(a);
              const bv = getter(b);
              if (av > bv) return 1;
              if (av < bv) return -1;
              return 0;
            });
            current = arr;
            return api;
          },
          sortedUniq() {
            const out = [];
            (Array.isArray(current) ? current : []).forEach((v) => {
              if (!out.some((x) => x === v)) out.push(v);
            });
            current = out;
            return api;
          },
          uniq() { return api.sortedUniq(); },
          find(fn) {
            current = Array.isArray(current) ? current.find((v, i) => fn(v, i)) : undefined;
            return api;
          },
          findLast(fn) {
            if (!Array.isArray(current)) {
              current = undefined;
              return api;
            }
            for (let i = current.length - 1; i >= 0; i -= 1) {
              if (fn(current[i], i)) {
                current = current[i];
                return api;
              }
            }
            current = undefined;
            return api;
          },
          forEach(fn) {
            if (Array.isArray(current)) current.forEach((v, i) => fn(v, i));
            else if (current && typeof current === 'object') Object.keys(current).forEach((k) => fn(current[k], k));
            return api;
          },
          each(fn) { return api.forEach(fn); },
          reduce(fn, init) {
            current = (Array.isArray(current) ? current : []).reduce((acc, v, i) => fn(acc, v, i), init);
            return api;
          },
        };
        return api;
      };
      const lodashLite = (value) => makeChain(value);
      Object.assign(lodashLite, existing);
      lodashLite.chain = (value) => makeChain(value);
      window._ = lodashLite;
    }
    const _ = window._;
    if (typeof _.isArray !== 'function') _.isArray = Array.isArray;
    if (typeof _.isObject !== 'function') _.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof _.isNil !== 'function') _.isNil = (v) => v === null || v === undefined;
    if (typeof _.clamp !== 'function') _.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    if (typeof _.map !== 'function') _.map = (list, fn) => (Array.isArray(list) ? list.map(fn) : Object.keys(list || {}).map((k) => fn(list[k], k)));
    if (typeof _.filter !== 'function') _.filter = (list, fn) => (Array.isArray(list) ? list.filter(fn) : []);
    if (typeof _.sortBy !== 'function') _.sortBy = (list, iteratee) => {
      const getter = typeof iteratee === 'function'
        ? iteratee
        : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
      return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
        const av = getter(a);
        const bv = getter(b);
        if (av > bv) return 1;
        if (av < bv) return -1;
        return 0;
      });
    };
    if (typeof _.sortedUniq !== 'function') _.sortedUniq = (list) => {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((v) => {
        if (!out.some((x) => x === v)) out.push(v);
      });
      return out;
    };
    if (typeof _.uniq !== 'function') _.uniq = (list) => _.sortedUniq(list);
    if (typeof _.find !== 'function') _.find = (list, fn) => (Array.isArray(list) ? list.find(fn) : undefined);
    if (typeof _.findLast !== 'function') _.findLast = (list, fn) => {
      if (!Array.isArray(list)) return undefined;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (fn(list[i], i)) return list[i];
      }
      return undefined;
    };
    if (typeof _.range !== 'function') _.range = (start, end, step = 1) => {
      let s = Number(start);
      let e = Number(end);
      if (!Number.isFinite(e)) {
        e = s;
        s = 0;
      }
      const st = Number(step) || 1;
      const out = [];
      if (st > 0) for (let i = s; i < e; i += st) out.push(i);
      else for (let i = s; i > e; i += st) out.push(i);
      return out;
    };
    if (typeof _.times !== 'function') _.times = (n, fn) => {
      const len = Math.max(0, Number(n) || 0);
      const out = [];
      for (let i = 0; i < len; i += 1) out.push(typeof fn === 'function' ? fn(i) : undefined);
      return out;
    };
    if (typeof _.constant !== 'function') _.constant = (v) => () => v;
    if (typeof _.debounce !== 'function') {
      _.debounce = (fn, wait = 0) => {
        let timer = 0;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), Number(wait) || 0);
        };
      };
    }
    if (typeof _.throttle !== 'function') {
      _.throttle = (fn, wait = 0) => {
        let last = 0;
        let timer = 0;
        return (...args) => {
          const now = Date.now();
          const gap = Number(wait) || 0;
          if (now - last >= gap) {
            last = now;
            fn(...args);
            return;
          }
          clearTimeout(timer);
          timer = setTimeout(() => {
            last = Date.now();
            fn(...args);
          }, Math.max(0, gap - (now - last)));
        };
      };
    }
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
    if (typeof _.has !== 'function') _.has = (obj, path) => _.get(obj, path, undefined) !== undefined;
    if (typeof _.unset !== 'function') {
      _.unset = (obj, path) => {
        const parts = toPath(path);
        if (!parts.length) return false;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur || typeof cur !== 'object') return false;
          cur = cur[key];
        }
        if (!cur || typeof cur !== 'object') return false;
        return delete cur[parts[parts.length - 1]];
      };
    }
    if (typeof _.cloneDeep !== 'function') {
      _.cloneDeep = (v) => {
        try { return structuredClone(v); } catch {}
        try { return JSON.parse(JSON.stringify(v)); } catch {}
        return v;
      };
    }
  };

  const ensureMiniQuery = () => {
    const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
    if (hasJq) return;
    if (typeof window.$ === 'function' && window.$.__chatappMini && window.$.__chatappMiniRich) return;
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
    const asIndexedApi = (api, nodes) => {
      try {
        api.length = Array.isArray(nodes) ? nodes.length : 0;
        (Array.isArray(nodes) ? nodes : []).forEach((n, i) => {
          api[i] = n;
        });
      } catch {}
      return api;
    };
    const wrap = (nodes) => asIndexedApi({
      __chatappMini: true,
      __chatappMiniRich: true,
      nodes,
      length: Array.isArray(nodes) ? nodes.length : 0,
      ready(handler) {
        if (typeof handler !== 'function') return this;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handler, { once: true });
        else setTimeout(() => {
          try { handler.call(document); } catch {}
        }, 0);
        return this;
      },
      get(index) {
        if (index === undefined) return Array.isArray(nodes) ? nodes.slice() : [];
        let idx = Number(index);
        if (!Number.isFinite(idx) || !Number.isInteger(idx)) return undefined;
        if (idx < 0) idx = (Array.isArray(nodes) ? nodes.length : 0) + idx;
        return (Array.isArray(nodes) && idx >= 0 && idx < nodes.length) ? nodes[idx] : undefined;
      },
      eq(index) {
        const hit = this.get(index);
        return wrap(hit ? [hit] : []);
      },
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
    }, nodes);
    const mini = (input) => {
      if (typeof input === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
        else setTimeout(input, 0);
        return wrap([]);
      }
      return wrap(toNodes(input));
    };
    mini.__chatappMini = true;
    mini.__chatappMiniRich = true;
    window.$ = mini;
  };

  ensureMvu();
  ensureLodash();
  ensureMiniQuery();
  exposeCoreAliases();
  postCompatLog('info', 'bridge-ready session=' + (CHATAPP_SESSION_ID || ''));

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (
      data.type === 'chatapp:set-chat-message-result' ||
      data.type === 'chatapp:set-chat-messages-result' ||
      data.type === 'chatapp:replace-variables-result' ||
      data.type === 'chatapp:merge-variables-result' ||
      data.type === 'chatapp:delete-variable-result'
    ) {
      if (data.id && CHATAPP_IFRAME_ID && String(data.id) !== CHATAPP_IFRAME_ID) return;
      const requestId = String(data.requestId || '').trim();
      if (!requestId) return;
      const resolver = hostReqResolvers.get(requestId);
      if (typeof resolver === 'function') resolver(data);
      return;
    }
    if (data.type !== 'chatapp:mvu-vars') return;
    if (data.sessionId && CHATAPP_SESSION_ID && String(data.sessionId) !== CHATAPP_SESSION_ID) {
      try {
        parent.postMessage({
          type: 'chatapp:iframe-debug',
          id: CHATAPP_IFRAME_ID,
          level: 'warn',
          message: 'legacy-vars-skip-session expected=' + String(CHATAPP_SESSION_ID || '') + ' got=' + String(data.sessionId || ''),
        }, '*');
      } catch {}
      return;
    }
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
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: 'info',
        message: 'legacy-seed-vars keys=' + String(Object.keys((state.vars && state.vars.stat_data) || {}).length),
      }, '*');
      parent.postMessage({ type: 'chatapp:iframe-ready', id: CHATAPP_IFRAME_ID }, '*');
    } catch {}
    setTimeout(() => {
      emitInitialVarEvents();
    }, 0);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', request);
  else request();
})();
</script>`;
};
const buildMvuCompatBridgeLegacy = ({ iframeId, sessionId, messageId, messageIndex, seedVars } = {}) => {
    const id = String(iframeId || '');
    const sid = String(sessionId || '');
    const mid = String(messageId || '');
    const rawIdx = Number(messageIndex);
    const midx = Number.isFinite(rawIdx) ? Math.trunc(rawIdx) : null;
    const seed = seedVars && typeof seedVars === 'object' ? seedVars : {};
    return `
<script>
(() => {
  const CHATAPP_IFRAME_ID = ${serializeForInlineScript(id)};
  const CHATAPP_SESSION_ID = ${serializeForInlineScript(sid)};
  const CHATAPP_MESSAGE_ID = ${serializeForInlineScript(mid)};
  const CHATAPP_MESSAGE_INDEX = ${midx === null ? 'null' : String(midx)};
  const CHATAPP_SEED_VARS = ${serializeForInlineScript(seed)};
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
  ${MVU_IFRAME_VARIABLE_COMPAT_SOURCE}
  const state = { vars: normalizeVars(CHATAPP_SEED_VARS || {}) };
  const cloneVars = (input) => {
    try { return structuredClone(input); } catch {}
    try { return JSON.parse(JSON.stringify(input)); } catch {}
    return input;
  };
  let hostReqSeq = 0;
  const hostReqResolvers = new Map();
  const makeHostRequestId = () => {
    hostReqSeq += 1;
    return String(CHATAPP_IFRAME_ID || 'iframe') + ':' + String(Date.now()) + ':' + String(hostReqSeq);
  };
  const waitHostResult = (requestId, timeoutMs = 2600) => new Promise((resolve) => {
    const reqId = String(requestId || '').trim();
    if (!reqId) return resolve({ ok: false, reason: 'missing-request-id' });
    let done = false;
    const timer = setTimeout(() => {
      if (done) return;
      done = true;
      hostReqResolvers.delete(reqId);
      resolve({ ok: false, reason: 'timeout' });
    }, Math.max(400, Number(timeoutMs) || 2600));
    hostReqResolvers.set(reqId, (payload) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      hostReqResolvers.delete(reqId);
      resolve(payload && typeof payload === 'object' ? payload : { ok: false, reason: 'invalid-result' });
    });
  });
  const postHostRequest = async (type, payload = {}, timeoutMs = 2600) => {
    const requestId = makeHostRequestId();
    const waiter = waitHostResult(requestId, timeoutMs);
    try {
      parent.postMessage({
        type: String(type || ''),
        id: CHATAPP_IFRAME_ID,
        requestId,
        sessionId: CHATAPP_SESSION_ID,
        ...payload,
      }, '*');
    } catch (err) {
      hostReqResolvers.delete(requestId);
      return { ok: false, reason: String(err?.message || err || 'post-message-failed') };
    }
    return await waiter;
  };
  const normalizeChatMessageFieldValues = (input) => {
    if (typeof input === 'string') return { message: input };
    if (!input || typeof input !== 'object') return {};
    return { ...input };
  };
  const normalizeChatMessageRef = (input) => {
    if (input === undefined || input === null || input === '') return String(CHATAPP_MESSAGE_ID || '');
    return String(input);
  };
  const chatState = {
    currentRef: String(CHATAPP_MESSAGE_ID || ''),
    currentIndex: Number.isInteger(CHATAPP_MESSAGE_INDEX) ? CHATAPP_MESSAGE_INDEX : null,
    entries: new Map(),
  };
  const getCurrentCompatRef = () => String(chatState.currentRef || CHATAPP_MESSAGE_ID || '');
  const normalizeCompatRef = (input) => {
    const ref = normalizeChatMessageRef(input);
    const idx = Number(ref);
    if (Number.isInteger(idx) && Number.isInteger(chatState.currentIndex) && idx === chatState.currentIndex) {
      return getCurrentCompatRef();
    }
    return ref;
  };
  const normalizeCompatEntry = (entry = {}, fallbackRef = '') => {
    const ref = normalizeCompatRef(entry.message_id ?? entry.messageId ?? entry.id ?? fallbackRef ?? '');
    const numericId = Number(ref);
    const messageId = Number.isInteger(numericId) ? numericId : ref;
    const role = String(entry.role || 'assistant');
    const message = String(entry.message ?? entry.content ?? entry.raw ?? '');
    const data = entry.data && typeof entry.data === 'object' ? cloneVars(entry.data) : {};
    const extra = entry.extra && typeof entry.extra === 'object' ? cloneVars(entry.extra) : {};
    return {
      message_id: messageId,
      role,
      message,
      data,
      extra,
      is_hidden: Boolean(entry.is_hidden),
      name: String(entry.name || ''),
    };
  };
  const upsertCompatEntry = (refInput, patch = {}) => {
    const ref = normalizeCompatRef(refInput);
    if (!ref) return null;
    const prev = chatState.entries.get(ref) || normalizeCompatEntry({ message_id: ref }, ref);
    const merged = normalizeCompatEntry({ ...prev, ...patch, message_id: patch?.message_id ?? prev.message_id }, ref);
    chatState.entries.set(ref, merged);
    return merged;
  };
  const exportCompatEntries = () => Array.from(chatState.entries.values()).map((entry) => normalizeCompatEntry(entry, ''));
  const applyCompatSetMessageCache = (messageRef, fieldValues = {}) => {
    const ref = normalizeCompatRef(messageRef);
    const fields = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'message')) patch.message = String(fields.message ?? '');
    if (Object.prototype.hasOwnProperty.call(fields, 'data')) {
      patch.data = fields.data && typeof fields.data === 'object' ? cloneVars(fields.data) : {};
    }
    return upsertCompatEntry(ref, patch);
  };
  {
    const currentRef = getCurrentCompatRef();
    if (currentRef && !chatState.entries.has(currentRef)) {
      upsertCompatEntry(currentRef, {
        message_id: Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : currentRef,
        role: 'assistant',
        message: '',
        data: {},
        extra: {},
      });
    }
  }

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
  const emitInitialVarEvents = () => {
    try {
      emit(window.Mvu?.events?.VARIABLE_INITIALIZED || 'mag_variable_initialized', state.vars);
    } catch {}
    try {
      emit(window.Mvu?.events?.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', state.vars);
    } catch {}
  };

  window.getAllVariables = window.getAllVariables || (() => state.vars);
  window.getVariables = window.getVariables || ((option = { type: 'message' }) => getScopedVars(state.vars, option));
  const applyCompatVarsResult = (result, fallbackVars, option = {}) => {
    const vars = (result?.vars && typeof result.vars === 'object')
      ? normalizeVars(result.vars)
      : normalizeVars(fallbackVars || state.vars || {});
    setVars(vars);
    return getScopedVars(vars, option);
  };
  const resolveCompatCurrentMessageId = () =>
    Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : getCurrentCompatRef();
  const getCompatChatMessages = (...args) => {
    const all = exportCompatEntries();
    if (!all.length) return [];
    const [range] = args;
    if (range === undefined || range === null || range === '') return all;
    const num = Number(range);
    if (Number.isFinite(num) && Number.isInteger(num)) {
      return all.filter((item) => Number(item?.message_id) === num || String(item?.message_id) === String(num));
    }
    const ref = normalizeCompatRef(range);
    return all.filter((item) => String(item?.message_id) === ref || String(item?.id || '') === ref);
  };
  const getCompatChatMessage = (idx, role) => {
    const list = getCompatChatMessages();
    const roleKey = String(role || '').trim().toLowerCase();
    const filtered = roleKey && roleKey !== 'any'
      ? list.filter((item) => String(item?.role || '').trim().toLowerCase() === roleKey)
      : list;
    if (!filtered.length) return '';
    let index = Number(idx);
    if (!Number.isFinite(index) || !Number.isInteger(index)) return '';
    if (index < 0) index = filtered.length + index;
    if (index < 0 || index >= filtered.length) return '';
    return String(filtered[index]?.message || '');
  };
  if (typeof window.getCurrentMessageId !== 'function') window.getCurrentMessageId = () => resolveCompatCurrentMessageId();
  if (typeof window.getChatMessages !== 'function') window.getChatMessages = (...args) => getCompatChatMessages(...args);
  if (typeof window.getChatMessage !== 'function') window.getChatMessage = (...args) => getCompatChatMessage(...args);
  if (typeof window.getContext !== 'function') {
    window.getContext = () => {
      const vars = (typeof window.getAllVariables === 'function' ? window.getAllVariables() : state.vars) || {};
      const chat = getCompatChatMessages();
      return buildMvuCompatWindowContext({
        vars,
        chat,
        currentMessageId: resolveCompatCurrentMessageId(),
      });
    };
  }
  if (typeof window.setChatMessage !== 'function') {
    window.setChatMessage = async (fieldValues, messageId, options = {}) => {
      const payload = normalizeChatMessageFieldValues(fieldValues);
      const targetMessageId = normalizeCompatRef(messageId);
      const safeOptions = options && typeof options === 'object' ? options : {};
      applyCompatSetMessageCache(targetMessageId, payload);
      const result = await postHostRequest('chatapp:set-chat-message', {
        messageId: targetMessageId,
        fieldValues: payload,
        options: safeOptions,
      });
      return Boolean(result?.ok);
    };
  }
  if (typeof window.setChatMessages !== 'function') {
    window.setChatMessages = async (messages = [], options = {}) => {
      const list = Array.isArray(messages) ? messages : [];
      const safeOptions = options && typeof options === 'object' ? options : {};
      const normalized = list
        .map((item) => (item && typeof item === 'object' ? { ...item } : null))
        .filter(Boolean);
      normalized.forEach((item) => {
        const ref = item?.message_id ?? item?.messageId ?? item?.id ?? item?.mid ?? '';
        applyCompatSetMessageCache(ref, item);
      });
      const result = await postHostRequest('chatapp:set-chat-messages', {
        messages: normalized,
        options: safeOptions,
      });
      return Boolean(result?.ok);
    };
  }
  if (typeof window.replaceVariables !== 'function') {
    window.replaceVariables = async (nextScoped, options = {}) => {
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const payload = nextScoped && typeof nextScoped === 'object' ? cloneVars(nextScoped) : {};
      const fallback = replaceScopedVars(state.vars, payload, safeOptions);
      const result = await postHostRequest('chatapp:replace-variables', {
        variables: payload,
        options: safeOptions,
      });
      if (!result?.ok) return false;
      return applyCompatVarsResult(result, fallback, safeOptions);
    };
  }
  if (typeof window.insertOrAssignVariables !== 'function') {
    window.insertOrAssignVariables = async (patch, options = {}) => {
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const payload = patch && typeof patch === 'object' ? cloneVars(patch) : {};
      const fallback = mergeScopedVars(state.vars, payload, safeOptions);
      const result = await postHostRequest('chatapp:merge-variables', {
        patch: payload,
        options: safeOptions,
      });
      if (!result?.ok) return false;
      return applyCompatVarsResult(result, fallback, safeOptions);
    };
  }
  if (typeof window.deleteVariable !== 'function') {
    window.deleteVariable = async (key, options = {}) => {
      const rawKey = String(key || '').trim();
      if (!rawKey) return false;
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const fallback = deleteScopedVar(state.vars, rawKey, safeOptions);
      const result = await postHostRequest('chatapp:delete-variable', {
        key: rawKey,
        options: safeOptions,
      });
      if (!result?.ok) return false;
      const variables = applyCompatVarsResult(result, fallback, safeOptions);
      return {
        variables,
        delete_occurred: result?.deleted !== false,
      };
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
    window.eval('var errorCatched = window.errorCatched; var getAllVariables = window.getAllVariables; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var getChatMessages = window.getChatMessages; var getChatMessage = window.getChatMessage; var getContext = window.getContext; var setChatMessage = window.setChatMessage; var setChatMessages = window.setChatMessages; var replaceVariables = window.replaceVariables; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var eventOn = window.eventOn; var eventRemoveListener = window.eventRemoveListener; var waitGlobalInitialized = window.waitGlobalInitialized;');
  } catch {}

  const ensureLodash = () => {
    if (typeof window._ !== 'function') {
      const existing = (window._ && typeof window._ === 'object') ? window._ : {};
      const makeChain = (initial) => {
        let current = initial;
        const api = {
          value() { return current; },
          map(fn) {
            if (Array.isArray(current)) current = current.map((v, i) => fn(v, i));
            else if (current && typeof current === 'object') current = Object.keys(current).map((k) => fn(current[k], k));
            else current = [];
            return api;
          },
          filter(fn) {
            current = Array.isArray(current) ? current.filter((v, i) => fn(v, i)) : [];
            return api;
          },
          sortBy(iteratee) {
            const arr = Array.isArray(current) ? current.slice() : [];
            const getter = typeof iteratee === 'function'
              ? iteratee
              : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
            arr.sort((a, b) => {
              const av = getter(a);
              const bv = getter(b);
              if (av > bv) return 1;
              if (av < bv) return -1;
              return 0;
            });
            current = arr;
            return api;
          },
          find(fn) {
            current = Array.isArray(current) ? current.find((v, i) => fn(v, i)) : undefined;
            return api;
          },
          forEach(fn) {
            if (Array.isArray(current)) current.forEach((v, i) => fn(v, i));
            else if (current && typeof current === 'object') Object.keys(current).forEach((k) => fn(current[k], k));
            return api;
          },
          each(fn) { return api.forEach(fn); },
        };
        return api;
      };
      const lodashLite = (value) => makeChain(value);
      Object.assign(lodashLite, existing);
      lodashLite.chain = (value) => makeChain(value);
      window._ = lodashLite;
    }
    const _ = window._;
    if (typeof _.isArray !== 'function') _.isArray = Array.isArray;
    if (typeof _.isObject !== 'function') _.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof _.isNil !== 'function') _.isNil = (v) => v === null || v === undefined;
    if (typeof _.clamp !== 'function') _.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    if (typeof _.map !== 'function') _.map = (list, fn) => (Array.isArray(list) ? list.map(fn) : Object.keys(list || {}).map((k) => fn(list[k], k)));
    if (typeof _.filter !== 'function') _.filter = (list, fn) => (Array.isArray(list) ? list.filter(fn) : []);
    if (typeof _.sortBy !== 'function') _.sortBy = (list, iteratee) => {
      const getter = typeof iteratee === 'function'
        ? iteratee
        : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
      return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
        const av = getter(a);
        const bv = getter(b);
        if (av > bv) return 1;
        if (av < bv) return -1;
        return 0;
      });
    };
    if (typeof _.sortedUniq !== 'function') _.sortedUniq = (list) => {
      const out = [];
      (Array.isArray(list) ? list : []).forEach((v) => {
        if (!out.some((x) => x === v)) out.push(v);
      });
      return out;
    };
    if (typeof _.uniq !== 'function') _.uniq = (list) => _.sortedUniq(list);
    if (typeof _.find !== 'function') _.find = (list, fn) => (Array.isArray(list) ? list.find(fn) : undefined);
    if (typeof _.findLast !== 'function') _.findLast = (list, fn) => {
      if (!Array.isArray(list)) return undefined;
      for (let i = list.length - 1; i >= 0; i -= 1) {
        if (fn(list[i], i)) return list[i];
      }
      return undefined;
    };
    if (typeof _.range !== 'function') _.range = (start, end, step = 1) => {
      let s = Number(start);
      let e = Number(end);
      if (!Number.isFinite(e)) {
        e = s;
        s = 0;
      }
      const st = Number(step) || 1;
      const out = [];
      if (st > 0) for (let i = s; i < e; i += st) out.push(i);
      else for (let i = s; i > e; i += st) out.push(i);
      return out;
    };
    if (typeof _.times !== 'function') _.times = (n, fn) => {
      const len = Math.max(0, Number(n) || 0);
      const out = [];
      for (let i = 0; i < len; i += 1) out.push(typeof fn === 'function' ? fn(i) : undefined);
      return out;
    };
    if (typeof _.constant !== 'function') _.constant = (v) => () => v;
    if (typeof _.debounce !== 'function') {
      _.debounce = (fn, wait = 0) => {
        let timer = 0;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), Number(wait) || 0);
        };
      };
    }
    if (typeof _.throttle !== 'function') {
      _.throttle = (fn, wait = 0) => {
        let last = 0;
        let timer = 0;
        return (...args) => {
          const now = Date.now();
          const gap = Number(wait) || 0;
          if (now - last >= gap) {
            last = now;
            fn(...args);
            return;
          }
          clearTimeout(timer);
          timer = setTimeout(() => {
            last = Date.now();
            fn(...args);
          }, Math.max(0, gap - (now - last)));
        };
      };
    }
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
    if (typeof _.has !== 'function') _.has = (obj, path) => _.get(obj, path, undefined) !== undefined;
    if (typeof _.unset !== 'function') {
      _.unset = (obj, path) => {
        const parts = toPath(path);
        if (!parts.length) return false;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur || typeof cur !== 'object') return false;
          cur = cur[key];
        }
        if (!cur || typeof cur !== 'object') return false;
        return delete cur[parts[parts.length - 1]];
      };
    }
    if (typeof _.cloneDeep !== 'function') {
      _.cloneDeep = (v) => {
        try { return structuredClone(v); } catch {}
        try { return JSON.parse(JSON.stringify(v)); } catch {}
        return v;
      };
    }
    if (typeof _.mergeWith !== 'function') {
      const isObject = (v) => v !== null && typeof v === 'object';
      _.mergeWith = (object, ...rest) => {
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
  };

  const ensureMiniQuery = () => {
    const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
    if (hasJq) return;
    if (typeof window.$ === 'function' && window.$.__chatappMini && window.$.__chatappMiniRich) return;
    const toNodes = (input) => {
      if (!input) return [];
      if (input instanceof Element || input === window || input === document) return [input];
      if (Array.isArray(input)) return input.filter(Boolean);
      return Array.from(document.querySelectorAll(String(input)));
    };
    const asIndexedApi = (api, nodes) => {
      try {
        api.length = Array.isArray(nodes) ? nodes.length : 0;
        (Array.isArray(nodes) ? nodes : []).forEach((n, i) => {
          api[i] = n;
        });
      } catch {}
      return api;
    };
    const wrap = (nodes) => asIndexedApi({
      __chatappMini: true,
      __chatappMiniRich: true,
      nodes,
      length: Array.isArray(nodes) ? nodes.length : 0,
      ready(handler) {
        if (typeof handler !== 'function') return this;
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handler, { once: true });
        else setTimeout(() => {
          try { handler.call(document); } catch {}
        }, 0);
        return this;
      },
      get(index) {
        if (index === undefined) return Array.isArray(nodes) ? nodes.slice() : [];
        let idx = Number(index);
        if (!Number.isFinite(idx) || !Number.isInteger(idx)) return undefined;
        if (idx < 0) idx = (Array.isArray(nodes) ? nodes.length : 0) + idx;
        return (Array.isArray(nodes) && idx >= 0 && idx < nodes.length) ? nodes[idx] : undefined;
      },
      eq(index) {
        const hit = this.get(index);
        return wrap(hit ? [hit] : []);
      },
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
    }, nodes);
    const mini = (input) => {
      if (typeof input === 'function') {
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
        else setTimeout(input, 0);
        return wrap([]);
      }
      return wrap(toNodes(input));
    };
    mini.__chatappMini = true;
    mini.__chatappMiniRich = true;
    window.$ = mini;
  };

  ensureMvu();
  ensureLodash();
  ensureMiniQuery();

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (
      data.type === 'chatapp:set-chat-message-result' ||
      data.type === 'chatapp:set-chat-messages-result' ||
      data.type === 'chatapp:replace-variables-result' ||
      data.type === 'chatapp:merge-variables-result' ||
      data.type === 'chatapp:delete-variable-result'
    ) {
      if (data.id && CHATAPP_IFRAME_ID && String(data.id) !== CHATAPP_IFRAME_ID) return;
      const requestId = String(data.requestId || '').trim();
      if (!requestId) return;
      const resolver = hostReqResolvers.get(requestId);
      if (typeof resolver === 'function') resolver(data);
      return;
    }
    if (data.type !== 'chatapp:mvu-vars') return;
    if (data.sessionId && CHATAPP_SESSION_ID && String(data.sessionId) !== CHATAPP_SESSION_ID) {
      try {
        parent.postMessage({
          type: 'chatapp:iframe-debug',
          id: CHATAPP_IFRAME_ID,
          level: 'warn',
          message: 'legacy-vars-skip-session expected=' + String(CHATAPP_SESSION_ID || '') + ' got=' + String(data.sessionId || ''),
        }, '*');
      } catch {}
      return;
    }
    setVars(data.vars || {});
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
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id: CHATAPP_IFRAME_ID,
        level: 'info',
        message: 'legacy-seed-vars keys=' + String(Object.keys((state.vars && state.vars.stat_data) || {}).length),
      }, '*');
      parent.postMessage({ type: 'chatapp:iframe-ready', id: CHATAPP_IFRAME_ID }, '*');
    } catch {}
    setTimeout(() => {
      emitInitialVarEvents();
    }, 0);
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
  let lastSentHeight = 0;
  let lastSentMode = 'document';
  let lastSentLock = false;
  let seq = 0;
  let rafId = null;
  let pendingSource = 'bridge';
  let pendingForce = false;
  let forceNextResize = false;
  let pressTimer = null;
  let pressActive = false;
  let pressStartedAt = 0;
  let touchActive = false;
  let touchStartPoint = null;
  const moveThreshold = 12;
  let viewportLogged = false;
  let lockLogged = false;

  const normalizeSource = (source) => {
    const raw = String(source || '').trim().toLowerCase();
    if (raw === 'observer' || raw === 'fallback') return raw;
    return 'bridge';
  };
  const sendDebug = (level, message) => {
    try {
      parent.postMessage({ type: 'chatapp:iframe-debug', id, level: String(level || 'info'), message: String(message || '') }, '*');
    } catch {}
  };
  const readMetaPolicy = () => {
    try {
      const metaHeight = document.querySelector('meta[name="chatapp-height"]');
      const metaResize = document.querySelector('meta[name="chatapp-resize"]');
      const rawHeight = String(metaHeight?.getAttribute('content') || '').trim();
      const parsedHeight = Number(rawHeight);
      const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 0;
      const resize = String(metaResize?.getAttribute('content') || '').trim().toLowerCase();
      let mode = '';
      if (resize.includes('viewport')) mode = 'viewport';
      else if (resize.includes('document')) mode = 'document';
      const lock = resize === 'none' || resize === 'lock' || resize === 'locked';
      return { height, mode, lock };
    } catch {
      return { height: 0, mode: '', lock: false };
    }
  };
  const detectViewportMode = () => {
    try {
      const body = document.body;
      const docEl = document.documentElement;
      if (!body || !docEl) return false;
      const bodyStyle = getComputedStyle(body);
      const docStyle = getComputedStyle(docEl);
      const overflowHidden = /hidden|clip/i.test(String(bodyStyle.overflowY || '')) ||
        /hidden|clip/i.test(String(docStyle.overflowY || ''));
      const fixedBody = String(bodyStyle.position || '').toLowerCase() === 'fixed';
      const vhDecl = String(body.style.height || '') + ';' + String(body.style.minHeight || '') +
        ';' + String(docEl.style.height || '') + ';' + String(docEl.style.minHeight || '');
      const hasVhDecl = /\\b\\d+(?:\\.\\d+)?vh\\b/i.test(vhDecl);
      const viewportH = Math.max(window.innerHeight || 0, docEl.clientHeight || 0);
      const bodyH = Math.max(body.scrollHeight || 0, body.offsetHeight || 0, body.clientHeight || 0);
      const docH = Math.max(docEl.scrollHeight || 0, docEl.offsetHeight || 0, docEl.clientHeight || 0);
      const closeToViewport = viewportH > 0 && Math.abs(bodyH - viewportH) <= 28 && Math.abs(docH - viewportH) <= 28;
      if (overflowHidden && (fixedBody || hasVhDecl || closeToViewport)) return true;
      if (fixedBody && closeToViewport) return true;
      return false;
    } catch {
      return false;
    }
  };
  const measureDocumentHeight = () => {
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
  const measureViewportHeight = () => {
    try {
      const body = document.body;
      const docEl = document.documentElement;
      const viewport = Math.max(window.innerHeight || 0, docEl?.clientHeight || 0);
      const bodyRect = body?.getBoundingClientRect?.();
      const bodyH = bodyRect ? bodyRect.height : 0;
      const docH = Math.max(docEl?.clientHeight || 0, docEl?.offsetHeight || 0);
      return Math.max(viewport, bodyH, docH);
    } catch {
      return 0;
    }
  };
  const postResize = ({ source = 'bridge', force = false } = {}) => {
    try {
      const meta = readMetaPolicy();
      const mode = meta.mode || (detectViewportMode() ? 'viewport' : 'document');
      const lock = Boolean(meta.lock);
      const measured = meta.height > 0
        ? meta.height
        : (mode === 'viewport' ? measureViewportHeight() : measureDocumentHeight());
      const raw = lock && lastSentHeight > 0 && meta.height <= 0 ? lastSentHeight : measured;
      const height = Math.ceil(Math.max(120, raw || 0));
      if (mode === 'viewport' && !viewportLogged) {
        viewportLogged = true;
        sendDebug('info', 'height-mode=viewport');
      }
      if (lock !== lockLogged) {
        lockLogged = lock;
        sendDebug('info', 'height-lock=' + (lock ? '1' : '0'));
      }
      if (!force && !forceNextResize && height === lastSentHeight && mode === lastSentMode && lock === lastSentLock) {
        return;
      }
      forceNextResize = false;
      seq += 1;
      lastSentHeight = height;
      lastSentMode = mode;
      lastSentLock = lock;
      parent.postMessage({
        type: 'chatapp:iframe-resize',
        id,
        height,
        seq,
        source: normalizeSource(source),
        mode,
        lock,
        ts: Date.now(),
      }, '*');
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
      if (scrollW <= clientW + 2) return;
      let scale = clientW / scrollW;
      if (scale > 0.98) return;
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';
      docEl.style.overflowX = 'hidden';
    } catch {}
  };
  const requestLayout = (source = 'bridge', force = false) => {
    pendingSource = normalizeSource(source);
    if (force) pendingForce = true;
    if (rafId) return;
    rafId = requestAnimationFrame(() => {
      rafId = null;
      const sourceToSend = pendingSource;
      const forceToSend = pendingForce;
      pendingSource = 'bridge';
      pendingForce = false;
      fitToWidth();
      postResize({ source: sourceToSend, force: forceToSend });
    });
  };
  const triggerBurstLayout = (source = 'observer') => {
    forceNextResize = true;
    [0, 60, 180, 360].forEach((ms) => {
      setTimeout(() => { requestLayout(source, true); }, ms);
    });
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
          if (Number.isFinite(minH) && minH >= vh * 0.9) el.style.minHeight = 'auto';
          const h = parseFloat(style.height || '');
          if (Number.isFinite(h) && h >= vh * 0.9) el.style.height = 'auto';
          const maxH = parseFloat(style.maxHeight || '');
          if (Number.isFinite(maxH) && maxH >= vh * 0.9) el.style.maxHeight = 'none';
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
    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') triggerBurstLayout('observer');
    }, true);
    document.addEventListener('transitionend', (ev) => {
      const target = ev?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('details')) return;
      triggerBurstLayout('observer');
    }, true);
    document.addEventListener('animationend', (ev) => {
      const target = ev?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('details')) return;
      triggerBurstLayout('observer');
    }, true);

    try { parent.postMessage({ type: 'chatapp:iframe-ready', id }, '*'); } catch {}
    stripBodyWhitespace();
    clampOversizedBlocks();
    requestLayout('bridge', true);
    [50, 150, 300, 600].forEach((ms) => {
      setTimeout(() => { requestLayout('observer', true); }, ms);
    });
    try {
      const ro = new ResizeObserver(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('observer');
      });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('fallback');
      }, 500);
    }
    try {
      const mo = new MutationObserver(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('observer');
      });
      if (document.body) mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    window.addEventListener('load', () => {
      forceNextResize = true;
      requestLayout('observer', true);
    });
    window.addEventListener('resize', () => {
      forceNextResize = true;
      requestLayout('observer', true);
    });
  };

  window.addEventListener('message', (e) => {
    const data = e?.data;
    if (!data || typeof data !== 'object') return;
    if (data.type === 'chatapp:updateViewportHeight' && typeof data.height === 'number') {
      try {
        document.documentElement.style.setProperty('--viewport-height', data.height + 'px');
      } catch {}
      forceNextResize = true;
      requestLayout('observer', true);
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

const IFRAME_HEIGHT_MIN = 120;
const IFRAME_HEIGHT_MAX = 2000;
const IFRAME_HEIGHT_PAD = 4;
const IFRAME_AUTHORITY_HOST = 'host';
const IFRAME_AUTHORITY_IFRAME = 'iframe';
const IFRAME_AUTHORITY_LOCKED = 'locked';
const IFRAME_HEIGHT_SOURCE_PRIORITY = {
    bridge: 3,
    observer: 2,
    fallback: 1,
    legacy: 1,
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

const normalizeHeightSource = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'bridge' || raw === 'observer' || raw === 'fallback' || raw === 'legacy') return raw;
    return 'bridge';
};

const normalizeHeightMode = (value) => {
    const raw = String(value || '').trim().toLowerCase();
    if (raw === 'viewport') return 'viewport';
    return 'document';
};

const getHeightSourcePriority = (source) => {
    const key = normalizeHeightSource(source);
    return Number(IFRAME_HEIGHT_SOURCE_PRIORITY[key] || 0);
};

const clampIframeHeight = (height) => {
    const raw = Number(height);
    if (!Number.isFinite(raw)) return IFRAME_HEIGHT_MIN;
    return Math.max(IFRAME_HEIGHT_MIN, Math.min(Math.ceil(raw + IFRAME_HEIGHT_PAD), IFRAME_HEIGHT_MAX));
};

const logIframeHeight = ({
    id,
    seq,
    source,
    mode,
    raw,
    applied,
    authority,
    lock,
    event = 'apply',
    level = 'info',
    extra = '',
}) => {
    const msg = [
        `[iframe-height] event=${event}`,
        `id=${id || 'unknown'}`,
        `seq=${Number.isFinite(Number(seq)) ? String(Math.trunc(Number(seq))) : 'na'}`,
        `source=${normalizeHeightSource(source)}`,
        `mode=${normalizeHeightMode(mode)}`,
        `raw=${Number.isFinite(Number(raw)) ? String(Math.round(Number(raw))) : 'na'}`,
        `applied=${Number.isFinite(Number(applied)) ? String(Math.round(Number(applied))) : 'na'}`,
        `authority=${String(authority || IFRAME_AUTHORITY_HOST)}`,
        `lock=${lock ? 1 : 0}`,
        String(extra || '').trim(),
    ].filter(Boolean).join(' ');
    emitDebugLog({
        source: 'iframe',
        type: level === 'warn' ? 'warn' : 'info',
        message: msg,
        force: true,
    });
    if (level === 'warn') logger.warn(msg);
    else logger.info(msg);
};

const clearIframeAutoResizeObservers = (iframe) => {
    try {
        if (!iframe) return;
        const doc = iframe.contentWindow?.document;
        const body = doc?.body;
        const docEl = doc?.documentElement;
        if (iframeResizeState.resizeObserver) {
            if (body) {
                try { iframeResizeState.resizeObserver.unobserve(body); } catch {}
                try { iframeResizeState.observedElements.delete(body); } catch {}
            }
            if (docEl) {
                try { iframeResizeState.resizeObserver.unobserve(docEl); } catch {}
                try { iframeResizeState.observedElements.delete(docEl); } catch {}
            }
        }
        const mo = iframeResizeState.mutationObservers.get(iframe);
        if (mo) {
            try { mo.disconnect(); } catch {}
            iframeResizeState.mutationObservers.delete(iframe);
        }
        delete iframe.dataset.iframeAutoResize;
    } catch {}
};

const switchIframeAuthority = (iframe, st, nextAuthority, reason = '') => {
    if (!iframe || !st) return;
    const prev = String(st.authority || IFRAME_AUTHORITY_HOST);
    const next = String(nextAuthority || IFRAME_AUTHORITY_HOST);
    if (prev === next) return;
    st.authority = next;
    iframe.dataset.iframeAuthority = next;
    if (next !== IFRAME_AUTHORITY_HOST) {
        clearIframeAutoResizeObservers(iframe);
    }
    logIframeHeight({
        id: String(iframe.dataset.iframeId || ''),
        seq: st.lastSeq,
        source: st.lastResizeSource || 'bridge',
        mode: st.lastResizeMode || 'document',
        raw: st.lastRawHeight || 0,
        applied: st.lastAppliedHeight || 0,
        authority: next,
        lock: Boolean(st.lock),
        event: 'authority-switch',
        level: 'info',
        extra: `from=${prev}${reason ? ` reason=${reason}` : ''}`,
    });
};

const appendHeightHistory = (st, appliedHeight, at = Date.now(), {
    source = 'observer',
    mode = 'document',
} = {}) => {
    if (!st) return;
    const next = Array.isArray(st.heightHistory) ? st.heightHistory.slice() : [];
    next.push({
        value: Number(appliedHeight) || 0,
        at,
        source: normalizeHeightSource(source),
        mode: normalizeHeightMode(mode),
    });
    const pruned = next.filter((entry) => (at - Number(entry?.at || 0)) <= 3000);
    while (pruned.length > 24) pruned.shift();
    st.heightHistory = pruned;
};

const detectHeightFeedbackLoop = (st, now = Date.now(), {
    source = 'observer',
    mode = 'document',
} = {}) => {
    if (!st) return false;
    const currentSource = normalizeHeightSource(source);
    const currentMode = normalizeHeightMode(mode);
    if (currentMode !== 'document') return false;
    if (currentSource !== 'observer' && currentSource !== 'fallback') return false;
    const history = Array.isArray(st.heightHistory)
        ? st.heightHistory.filter((entry) => (now - Number(entry?.at || 0)) <= 3000)
        : [];
    if (history.length < 3) return false;
    const tail = history.slice(-10);
    let monotonic = true;
    let totalIncrease = 0;
    let smallStepGrow = true;
    for (let i = 1; i < tail.length; i += 1) {
        const prev = Number(tail[i - 1]?.value || 0);
        const cur = Number(tail[i]?.value || 0);
        const delta = cur - prev;
        if (delta < 1 || delta > 280) {
            monotonic = false;
            break;
        }
        if (delta > 12) smallStepGrow = false;
        totalIncrease += delta;
    }
    if (!monotonic) return false;
    const lastPressAt = Number(st.lastPressAt || 0);
    const hasRecentPress = Number.isFinite(lastPressAt) && (now - lastPressAt) <= 1800;
    // 点击驱动场景：尽早止损（避免“先涨几次再停”）
    if (hasRecentPress && tail.length >= 3 && smallStepGrow && totalIncrease >= 8) {
        return true;
    }
    // 普通场景：更保守，避免误判正常布局收敛
    return tail.length >= 7 && smallStepGrow && totalIncrease >= 24;
};

const getIframeAuthority = (iframe, st) => {
    const fromState = String(st?.authority || '').trim();
    if (fromState) return fromState;
    const fromDataset = String(iframe?.dataset?.iframeAuthority || '').trim();
    if (fromDataset) return fromDataset;
    return IFRAME_AUTHORITY_HOST;
};

const canHostAutoResize = (iframe) => {
    if (!iframe) return false;
    const id = String(iframe.dataset.iframeId || '');
    const st = id ? getIframeState(id) : null;
    const authority = getIframeAuthority(iframe, st);
    if (authority !== IFRAME_AUTHORITY_HOST) return false;
    if (Boolean(st?.lock)) return false;
    return true;
};

const applyIframeResizeUpdate = (iframe, {
    rawHeight,
    source = 'bridge',
    mode = 'document',
    seq = null,
    lock = false,
    unlock = false,
    ts = Date.now(),
    canTakeAuthority = true,
} = {}) => {
    if (!iframe) return false;
    const id = String(iframe.dataset.iframeId || '');
    if (!id) return false;
    const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
    if (!st) return false;

    const normalizedSource = normalizeHeightSource(source);
    const normalizedMode = normalizeHeightMode(mode);
    const raw = Number(rawHeight);
    if (!Number.isFinite(raw)) return false;
    const appliedHeight = clampIframeHeight(raw);

    const hasIncomingSeq = (
        seq !== null &&
        seq !== undefined &&
        seq !== '' &&
        Number.isFinite(Number(seq))
    );
    const prevSeqBase = (st.lastSeq ?? -1);
    const incomingSeq = hasIncomingSeq ? Math.trunc(Number(seq)) : (Math.trunc(Number(prevSeqBase)) + 1);
    const prevSeq = Number.isFinite(Number(st.lastSeq)) ? Math.trunc(Number(st.lastSeq)) : -1;
    if (incomingSeq < prevSeq) {
        logIframeHeight({
            id,
            seq: incomingSeq,
            source: normalizedSource,
            mode: normalizedMode,
            raw,
            applied: appliedHeight,
            authority: getIframeAuthority(iframe, st),
            lock: Boolean(st.lock),
            event: 'seq-drop',
            level: 'warn',
            extra: `lastSeq=${prevSeq}`,
        });
        return false;
    }

    if (incomingSeq === prevSeq) {
        const prevApplied = Number(st.lastAppliedHeight || 0);
        const sameHeight = Math.abs(prevApplied - appliedHeight) <= 1;
        const sameMode = normalizeHeightMode(st.lastResizeMode) === normalizedMode;
        const prevLock = Boolean(st.lock);
        const nextLock = unlock ? false : (Boolean(lock) || prevLock);
        const sameLock = prevLock === nextLock;
        const prevSourcePrio = getHeightSourcePriority(st.lastResizeSource || 'fallback');
        const incomingPrio = getHeightSourcePriority(normalizedSource);
        if (sameHeight && sameMode && sameLock) return false;
        if (incomingPrio < prevSourcePrio) {
            logIframeHeight({
                id,
                seq: incomingSeq,
                source: normalizedSource,
                mode: normalizedMode,
                raw,
                applied: appliedHeight,
                authority: getIframeAuthority(iframe, st),
                lock: Boolean(st.lock),
                event: 'seq-tie-drop',
                level: 'warn',
                extra: `prevSource=${normalizeHeightSource(st.lastResizeSource)}`,
            });
            return false;
        }
    }

    if (unlock) st.lock = false;
    if (lock) st.lock = true;

    let authority = getIframeAuthority(iframe, st);
    if (st.lock) {
        authority = IFRAME_AUTHORITY_LOCKED;
        switchIframeAuthority(iframe, st, IFRAME_AUTHORITY_LOCKED, lock ? 'lock-message' : 'locked');
    } else if (authority === IFRAME_AUTHORITY_HOST && canTakeAuthority) {
        switchIframeAuthority(iframe, st, IFRAME_AUTHORITY_IFRAME, 'first-valid-resize');
        authority = IFRAME_AUTHORITY_IFRAME;
    }

    if (authority === IFRAME_AUTHORITY_LOCKED && !(lock || unlock)) {
        logIframeHeight({
            id,
            seq: incomingSeq,
            source: normalizedSource,
            mode: normalizedMode,
            raw,
            applied: appliedHeight,
            authority,
            lock: Boolean(st.lock),
            event: 'locked-drop',
            level: 'info',
        });
        return false;
    }

    const current = parseFloat(iframe.style.height || '') || 0;
    if (Math.abs(current - appliedHeight) > 1) {
        iframe.style.height = `${appliedHeight}px`;
    }
    markIframePostResize(iframe);
    const now = Number.isFinite(Number(ts)) ? Math.trunc(Number(ts)) : Date.now();
    const previousAppliedHeight = Number(st.lastAppliedHeight || 0);

    st.lastSeq = incomingSeq;
    st.lastResizeSource = normalizedSource;
    st.lastResizeMode = normalizedMode;
    st.lastRawHeight = raw;
    st.lastAppliedHeight = appliedHeight;
    st.lastResizeAt = now;
    st.resizeCount = (st.resizeCount || 0) + 1;
    st.authority = getIframeAuthority(iframe, st);
    iframe.dataset.iframeMode = normalizedMode;
    iframe.dataset.iframeLock = st.lock ? '1' : '0';

    appendHeightHistory(st, appliedHeight, now, {
        source: normalizedSource,
        mode: normalizedMode,
    });
    if (detectHeightFeedbackLoop(st, now, {
        source: normalizedSource,
        mode: normalizedMode,
    })) {
        const recentValues = (Array.isArray(st.heightHistory) ? st.heightHistory : [])
            .slice(-10)
            .map((entry) => Number(entry?.value))
            .filter((value) => Number.isFinite(value) && value > 0);
        const minRecent = recentValues.length ? Math.min(...recentValues) : appliedHeight;
        const freezeHeight = Math.max(
            IFRAME_HEIGHT_MIN,
            Math.min(
                appliedHeight,
                previousAppliedHeight > 0 ? previousAppliedHeight : appliedHeight,
                minRecent,
            ),
        );
        if (Math.abs((parseFloat(iframe.style.height || '') || 0) - freezeHeight) > 1) {
            iframe.style.height = `${freezeHeight}px`;
        }
        st.lastAppliedHeight = freezeHeight;
        st.lock = true;
        switchIframeAuthority(iframe, st, IFRAME_AUTHORITY_LOCKED, 'feedback-loop');
        logIframeHeight({
            id,
            seq: incomingSeq,
            source: normalizedSource,
            mode: normalizedMode,
            raw,
            applied: freezeHeight,
            authority: IFRAME_AUTHORITY_LOCKED,
            lock: true,
            event: 'feedback-loop',
            level: 'warn',
        });
    } else {
        logIframeHeight({
            id,
            seq: incomingSeq,
            source: normalizedSource,
            mode: normalizedMode,
            raw,
            applied: appliedHeight,
            authority: getIframeAuthority(iframe, st),
            lock: Boolean(st.lock),
            event: 'apply',
            level: 'info',
        });
    }
    return true;
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
        if (!canHostAutoResize(iframe)) return;
        if (iframe.dataset.iframeLoaded !== '1') return;
        if (iframe.dataset.iframeAllowScripts === '1' && hasRecentPostResize(iframe)) return;
        const doc = iframe.contentWindow.document;
        const body = doc?.body;
        const docEl = doc?.documentElement;
        if (!body || !docEl) return;
        const id = String(iframe.dataset.iframeId || '');
        const st = id ? getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() }) : null;
        const bodyHeight = Math.max(body.scrollHeight || 0, body.offsetHeight || 0, body.clientHeight || 0);
        const docHeight = Math.max(docEl.scrollHeight || 0, docEl.offsetHeight || 0, docEl.clientHeight || 0);
        const newHeight = Math.max(IFRAME_HEIGHT_MIN, bodyHeight, docHeight);
        const currentApplied = parseFloat(iframe.style.height || '') || 0;
        const selfMeasured = currentApplied > 0 && Math.abs(newHeight - currentApplied) <= 2;
        if (selfMeasured) {
            const freezeRaw = Math.max(IFRAME_HEIGHT_MIN, currentApplied - IFRAME_HEIGHT_PAD);
            const nextHits = Number(st?.selfMeasureHits || 0) + 1;
            if (st) st.selfMeasureHits = nextHits;
            applyIframeResizeUpdate(iframe, {
                rawHeight: freezeRaw,
                source: 'observer',
                mode: nextHits >= 2 ? 'viewport' : 'document',
                lock: nextHits >= 2,
                ts: Date.now(),
                canTakeAuthority: false,
            });
            return;
        }
        if (st) st.selfMeasureHits = 0;
        applyIframeResizeUpdate(iframe, {
            rawHeight: newHeight,
            source: 'observer',
            mode: 'document',
            lock: false,
            ts: Date.now(),
            canTakeAuthority: false,
        });
    } catch {}
};

const observeIframeContent = (iframe) => {
    try {
        if (!iframe || iframe.dataset.iframeAutoResize === '1') return;
        if (!canHostAutoResize(iframe)) return;
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

const RICH_FRAGMENT_SCOPE_ATTR = 'data-chat-rich-scope';
const RICH_FRAGMENT_CLASS_PREFIX = 'chat-rich-';
const RICH_FRAGMENT_ID_PREFIX = 'chat-rich-id-';
const RICH_FRAGMENT_TAG_NAMES = [
    'a', 'article', 'blockquote', 'br', 'code', 'del', 'details', 'div', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'hr', 'i', 'ins', 'kbd', 'li', 'main', 'mark', 'ol', 'p', 'pre', 's', 'section', 'small', 'span', 'strong',
    'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'th', 'thead', 'tr', 'u', 'ul', 'style',
];
const RICH_FRAGMENT_ALLOWED_TAGS = new Set(RICH_FRAGMENT_TAG_NAMES);
const RICH_FRAGMENT_DROP_TAGS = new Set(['script', 'iframe', 'object', 'embed', 'link', 'meta', 'base', 'form', 'input', 'button', 'textarea', 'select', 'option']);
const RICH_FRAGMENT_RAW_TEXT_TAGS = new Set(['pre', 'code']);
const RICH_FRAGMENT_INLINE_MODE_TAGS = new Set(['a', 'code', 'del', 'em', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'i', 'ins', 'kbd', 'mark', 'p', 's', 'small', 'span', 'strong', 'sub', 'summary', 'sup', 'th', 'td', 'u']);
const RICH_FRAGMENT_VOID_TAGS = new Set(['br', 'hr']);
const RICH_FRAGMENT_ALLOWED_STYLE_PROPS = new Set([
    'align-items',
    'align-self',
    'aspect-ratio',
    'background',
    'background-color',
    'border',
    'border-bottom',
    'border-bottom-color',
    'border-bottom-left-radius',
    'border-bottom-right-radius',
    'border-bottom-style',
    'border-bottom-width',
    'border-color',
    'border-left',
    'border-left-color',
    'border-left-style',
    'border-left-width',
    'border-radius',
    'border-right',
    'border-right-color',
    'border-right-style',
    'border-right-width',
    'border-style',
    'border-top',
    'border-top-color',
    'border-top-left-radius',
    'border-top-right-radius',
    'border-top-style',
    'border-top-width',
    'border-width',
    'box-shadow',
    'box-sizing',
    'color',
    'column-gap',
    'display',
    'flex',
    'flex-basis',
    'flex-direction',
    'flex-grow',
    'flex-shrink',
    'flex-wrap',
    'font-family',
    'font-size',
    'font-style',
    'font-weight',
    'gap',
    'height',
    'justify-content',
    'letter-spacing',
    'line-height',
    'list-style',
    'list-style-position',
    'list-style-type',
    'margin',
    'margin-bottom',
    'margin-left',
    'margin-right',
    'margin-top',
    'max-height',
    'max-width',
    'min-height',
    'min-width',
    'opacity',
    'overflow',
    'overflow-x',
    'overflow-y',
    'padding',
    'padding-bottom',
    'padding-left',
    'padding-right',
    'padding-top',
    'position',
    'row-gap',
    'text-align',
    'text-decoration',
    'text-indent',
    'text-transform',
    'vertical-align',
    'white-space',
    'width',
    'word-break',
]);
const RICH_FRAGMENT_TAG_RE = new RegExp(`<(${RICH_FRAGMENT_TAG_NAMES.join('|')})\\b`, 'i');
const RICH_FRAGMENT_ESCAPED_TAG_RE = new RegExp(`&lt;(${RICH_FRAGMENT_TAG_NAMES.join('|')})\\b`, 'i');
const RICH_FRAGMENT_ESCAPED_CLOSE_RE = new RegExp(`&lt;\\/(${RICH_FRAGMENT_TAG_NAMES.join('|')})\\b`, 'i');
const RICH_INTERACTIVE_HTML_RE = /<!doctype\s+html|<(script|iframe|html|body)\b/i;
const RICH_INTERACTIVE_ESCAPED_HTML_RE = /&lt;!doctype\s+html|&lt;(script|iframe|html|body)\b/i;
const RICH_MARKDOWN_BLOCK_HINT_RE = /(^|\n)\s*(#{1,6}\s+\S|>+\s*\S|[-*+]\s+\S|\d+\.\s+\S|(?:-{3,}|_{3,}|\*{3,})\s*$)/m;
const RICH_MARKDOWN_INLINE_HINT_RE = /(\*\*[^*]+\*\*|__[^_]+__|~~[^~]+~~|`[^`]+`|\[[^\]]+\]\(([^)]+)\))/;
const RICH_INLINE_MD_RE = /(`[^`]+`|\[[^\]]+\]\(([^)]+)\)|\*\*[\s\S]+?\*\*|__[\s\S]+?__|~~[\s\S]+?~~|\*[^*\n]+\*|_[^_\n]+_)/g;

const decodeBasicHtmlEntities = (input) => {
    const s = String(input ?? '');
    if (!s.includes('&')) return s;
    return s
        .replace(/&lt;/gi, '<')
        .replace(/&gt;/gi, '>')
        .replace(/&quot;/gi, '"')
        .replace(/&#39;|&#x27;/gi, '\'')
        .replace(/&amp;/gi, '&');
};

const maybeDecodeRichFragmentEntities = (input) => {
    const raw = String(input ?? '');
    if (!raw) return raw;
    if (RICH_FRAGMENT_ESCAPED_TAG_RE.test(raw) && (RICH_FRAGMENT_ESCAPED_CLOSE_RE.test(raw) || /&lt;br\b/i.test(raw))) {
        return decodeBasicHtmlEntities(raw);
    }
    if (RICH_INTERACTIVE_ESCAPED_HTML_RE.test(raw)) {
        return decodeBasicHtmlEntities(raw);
    }
    return raw;
};

const hasInteractiveHtmlHint = (input) => {
    const raw = String(input ?? '');
    return Boolean(raw) && (RICH_INTERACTIVE_HTML_RE.test(raw) || RICH_INTERACTIVE_ESCAPED_HTML_RE.test(raw));
};

const hasRichFragmentHint = (input) => {
    const decoded = maybeDecodeRichFragmentEntities(input);
    if (!decoded) return false;
    if (hasInteractiveHtmlHint(decoded)) return true;
    return RICH_FRAGMENT_TAG_RE.test(decoded) ||
        RICH_FRAGMENT_ESCAPED_TAG_RE.test(String(input ?? '')) ||
        RICH_MARKDOWN_BLOCK_HINT_RE.test(decoded) ||
        RICH_MARKDOWN_INLINE_HINT_RE.test(decoded);
};

const prefixRichFragmentClassName = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.startsWith(RICH_FRAGMENT_CLASS_PREFIX) ? raw : `${RICH_FRAGMENT_CLASS_PREFIX}${raw}`;
};

const prefixRichFragmentId = (name) => {
    const raw = String(name || '').trim();
    if (!raw) return '';
    return raw.startsWith(RICH_FRAGMENT_ID_PREFIX) ? raw : `${RICH_FRAGMENT_ID_PREFIX}${raw}`;
};

const normalizeRichFragmentClassList = (raw) => String(raw || '')
    .split(/\s+/)
    .map((name) => name.trim())
    .filter((name) => /^[_a-zA-Z][\w-]{0,79}$/.test(name))
    .map(prefixRichFragmentClassName)
    .filter(Boolean)
    .join(' ');

const normalizeRichFragmentId = (raw) => {
    const id = String(raw || '').trim();
    if (!/^[_a-zA-Z][\w-]{0,79}$/.test(id)) return '';
    return prefixRichFragmentId(id);
};

const sanitizeFragmentUrl = (raw) => {
    const value = String(raw || '').trim();
    if (!value) return '';
    if (value.startsWith('#')) {
        const fragId = normalizeRichFragmentId(value.slice(1));
        return fragId ? `#${fragId}` : '';
    }
    if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
    return '';
};

const sanitizeRichFragmentCssValue = (property, rawValue) => {
    const prop = String(property || '').trim().toLowerCase();
    if (!RICH_FRAGMENT_ALLOWED_STYLE_PROPS.has(prop)) return '';
    const value = String(rawValue || '').trim();
    if (!value) return '';
    if (/url\s*\(|expression\s*\(|javascript:|@import|-moz-binding|behavior\s*:|<\/?style/i.test(value)) return '';
    if (prop === 'position' && !/^(static|relative)$/i.test(value)) return '';
    return value.replace(/\s+/g, ' ').trim();
};

const sanitizeInlineStyleAttribute = (rawStyle) => {
    const src = String(rawStyle || '').trim();
    if (!src) return '';
    const out = [];
    src.split(';').forEach((chunk) => {
        const idx = chunk.indexOf(':');
        if (idx <= 0) return;
        const prop = chunk.slice(0, idx).trim().toLowerCase();
        const value = chunk.slice(idx + 1).trim();
        const nextValue = sanitizeRichFragmentCssValue(prop, value);
        if (!nextValue) return;
        out.push(`${prop}: ${nextValue}`);
    });
    return out.join('; ');
};

const splitCssSelectorList = (selectorText) => {
    const src = String(selectorText || '');
    const out = [];
    let current = '';
    let parenDepth = 0;
    let bracketDepth = 0;
    let quote = '';
    for (let i = 0; i < src.length; i += 1) {
        const ch = src[i];
        const prev = i > 0 ? src[i - 1] : '';
        if (quote) {
            current += ch;
            if (ch === quote && prev !== '\\') quote = '';
            continue;
        }
        if (ch === '\'' || ch === '"') {
            quote = ch;
            current += ch;
            continue;
        }
        if (ch === '(') {
            parenDepth += 1;
            current += ch;
            continue;
        }
        if (ch === ')') {
            parenDepth = Math.max(0, parenDepth - 1);
            current += ch;
            continue;
        }
        if (ch === '[') {
            bracketDepth += 1;
            current += ch;
            continue;
        }
        if (ch === ']') {
            bracketDepth = Math.max(0, bracketDepth - 1);
            current += ch;
            continue;
        }
        if (ch === ',' && parenDepth === 0 && bracketDepth === 0) {
            if (current.trim()) out.push(current.trim());
            current = '';
            continue;
        }
        current += ch;
    }
    if (current.trim()) out.push(current.trim());
    return out;
};

const prefixRichFragmentSelectorClasses = (selector) => String(selector || '')
    .replace(/\.([_a-zA-Z][\w-]*)/g, (_, name) => `.${prefixRichFragmentClassName(name)}`)
    .replace(/#([_a-zA-Z][\w-]*)/g, (_, name) => `#${prefixRichFragmentId(name)}`);

const scopeRichFragmentSelector = (selector, scopeSelector) => {
    let next = prefixRichFragmentSelectorClasses(String(selector || '').trim());
    if (!next) return '';
    next = next.replace(/\b(:root|html|body)\b/gi, ' ').replace(/\s+/g, ' ').trim();
    next = next.replace(/^[>+~\s]+/, '').trim();
    if (!next) return scopeSelector;
    if (next.startsWith(scopeSelector)) return next;
    return `${scopeSelector} ${next}`;
};

const collectSanitizedCssDeclarations = (styleDecl) => {
    const out = [];
    if (!styleDecl) return out;
    for (let i = 0; i < styleDecl.length; i += 1) {
        const prop = styleDecl[i];
        const value = styleDecl.getPropertyValue(prop);
        const sanitized = sanitizeRichFragmentCssValue(prop, value);
        if (!sanitized) continue;
        const important = String(styleDecl.getPropertyPriority(prop) || '').toLowerCase() === 'important';
        out.push(`${prop}: ${sanitized}${important ? ' !important' : ''}`);
    }
    return out;
};

const sanitizeScopedCssText = (cssText, { scopeSelector = '' } = {}) => {
    const raw = String(cssText || '').trim();
    const scope = String(scopeSelector || '').trim();
    if (!raw || !scope) return '';
    if (typeof document === 'undefined' || !document.implementation?.createHTMLDocument) return '';
    const STYLE_RULE = typeof CSSRule !== 'undefined' ? CSSRule.STYLE_RULE : 1;
    const MEDIA_RULE = typeof CSSRule !== 'undefined' ? CSSRule.MEDIA_RULE : 4;
    try {
        const doc = document.implementation.createHTMLDocument('chat-rich-style');
        const styleEl = doc.createElement('style');
        styleEl.textContent = raw;
        doc.head.appendChild(styleEl);
        const renderRule = (rule) => {
            if (!rule) return '';
            if (rule.type === STYLE_RULE) {
                const selectors = splitCssSelectorList(rule.selectorText)
                    .map((selector) => scopeRichFragmentSelector(selector, scope))
                    .filter(Boolean);
                const declarations = collectSanitizedCssDeclarations(rule.style);
                if (!selectors.length || !declarations.length) return '';
                return `${selectors.join(', ')} { ${declarations.join('; ')}; }`;
            }
            if (rule.type === MEDIA_RULE) {
                const children = Array.from(rule.cssRules || [])
                    .map(renderRule)
                    .filter(Boolean)
                    .join('\n');
                if (!children) return '';
                return `@media ${rule.conditionText} {\n${children}\n}`;
            }
            return '';
        };
        const cssRules = Array.from(styleEl.sheet?.cssRules || [])
            .map(renderRule)
            .filter(Boolean)
            .join('\n');
        styleEl.remove();
        return cssRules.trim();
    } catch (err) {
        logger.warn('rich fragment style sanitize failed', err);
        return '';
    }
};

const renderInlineMarkdownHtml = (text) => {
    const src = String(text ?? '');
    if (!src) return '';
    const inlineRe = new RegExp(RICH_INLINE_MD_RE.source, 'g');
    let out = '';
    let last = 0;
    let match;
    while ((match = inlineRe.exec(src))) {
        if (match.index > last) {
            out += escapeHtmlText(src.slice(last, match.index));
        }
        const token = String(match[0] || '');
        if (token.startsWith('`') && token.endsWith('`')) {
            out += `<code>${escapeHtmlText(token.slice(1, -1))}</code>`;
        } else if (token.startsWith('[') && token.includes('](') && token.endsWith(')')) {
            const linkMatch = token.match(/^\[([\s\S]+)\]\(([^)]+)\)$/);
            const href = sanitizeFragmentUrl(linkMatch?.[2] || '');
            const label = renderInlineMarkdownHtml(linkMatch?.[1] || '');
            out += href ? `<a href="${escapeHtmlText(href)}" target="_blank" rel="noopener noreferrer">${label}</a>` : label;
        } else if ((token.startsWith('**') && token.endsWith('**')) || (token.startsWith('__') && token.endsWith('__'))) {
            out += `<strong>${renderInlineMarkdownHtml(token.slice(2, -2))}</strong>`;
        } else if ((token.startsWith('~~') && token.endsWith('~~'))) {
            out += `<s>${renderInlineMarkdownHtml(token.slice(2, -2))}</s>`;
        } else if ((token.startsWith('*') && token.endsWith('*')) || (token.startsWith('_') && token.endsWith('_'))) {
            out += `<em>${renderInlineMarkdownHtml(token.slice(1, -1))}</em>`;
        } else {
            out += escapeHtmlText(token);
        }
        last = inlineRe.lastIndex;
    }
    if (last < src.length) {
        out += escapeHtmlText(src.slice(last));
    }
    return out;
};

const renderMarkdownBlocksHtml = (text) => {
    const lines = String(text ?? '').replace(/\r\n?/g, '\n').split('\n');
    const out = [];
    const isBlank = (line) => !String(line || '').trim();
    const isHr = (line) => /^\s*(?:-{3,}|_{3,}|\*{3,})\s*$/.test(line);
    const isHeading = (line) => /^\s{0,3}#{1,6}\s+\S/.test(line);
    const isBlockquote = (line) => /^\s*>+\s*/.test(line);
    const isUnordered = (line) => /^\s*[-*+]\s+\S/.test(line);
    const isOrdered = (line) => /^\s*\d+\.\s+\S/.test(line);
    const renderLinesInline = (parts) => parts.map((line) => renderInlineMarkdownHtml(line)).join('<br>');
    let i = 0;
    while (i < lines.length) {
        const line = lines[i];
        if (isBlank(line)) {
            i += 1;
            continue;
        }
        if (isHr(line)) {
            out.push('<hr>');
            i += 1;
            continue;
        }
        if (isHeading(line)) {
            const m = line.match(/^\s{0,3}(#{1,6})\s+([\s\S]+)$/);
            const level = Math.max(1, Math.min(6, String(m?.[1] || '').length || 1));
            out.push(`<h${level}>${renderInlineMarkdownHtml(m?.[2] || '')}</h${level}>`);
            i += 1;
            continue;
        }
        if (isBlockquote(line)) {
            const quoteLines = [];
            while (i < lines.length && (isBlockquote(lines[i]) || isBlank(lines[i]))) {
                const current = lines[i];
                quoteLines.push(isBlank(current) ? '' : current.replace(/^\s*>+\s?/, ''));
                i += 1;
            }
            out.push(`<blockquote>${renderMarkdownBlocksHtml(quoteLines.join('\n'))}</blockquote>`);
            continue;
        }
        if (isUnordered(line) || isOrdered(line)) {
            const ordered = isOrdered(line);
            const tag = ordered ? 'ol' : 'ul';
            const items = [];
            while (i < lines.length) {
                const current = lines[i];
                const itemMatch = ordered
                    ? current.match(/^\s*\d+\.\s+([\s\S]+)$/)
                    : current.match(/^\s*[-*+]\s+([\s\S]+)$/);
                if (itemMatch) {
                    items.push([itemMatch[1]]);
                    i += 1;
                    continue;
                }
                if (isBlank(current)) break;
                if (items.length && /^\s{2,}\S/.test(current)) {
                    items[items.length - 1].push(current.trim());
                    i += 1;
                    continue;
                }
                break;
            }
            out.push(`<${tag}>${items.map((parts) => `<li>${renderLinesInline(parts)}</li>`).join('')}</${tag}>`);
            continue;
        }
        const paraLines = [];
        while (i < lines.length && !isBlank(lines[i]) && !isHr(lines[i]) && !isHeading(lines[i]) && !isBlockquote(lines[i]) && !isUnordered(lines[i]) && !isOrdered(lines[i])) {
            paraLines.push(lines[i]);
            i += 1;
        }
        if (paraLines.length) {
            out.push(`<p>${renderLinesInline(paraLines)}</p>`);
        }
    }
    return out.join('');
};

const appendHtmlFragment = (parent, html) => {
    const raw = String(html || '').trim();
    if (!parent || !raw) return;
    const temp = document.createElement('div');
    temp.innerHTML = raw;
    while (temp.firstChild) {
        parent.appendChild(temp.firstChild);
    }
};

const appendMarkdownText = (parent, text, { blockMode = true, allowStatusCards = true, resolveStatusCard = null } = {}) => {
    const raw = String(text ?? '');
    if (!raw) return;
    const segments = raw.split('__CHATAPP_STATUS__');
    segments.forEach((segment, index) => {
        const html = blockMode
            ? renderMarkdownBlocksHtml(segment)
            : renderInlineMarkdownHtml(segment).replace(/\r\n?/g, '\n').replace(/\n/g, '<br>');
        if (html.trim()) appendHtmlFragment(parent, html);
        if (allowStatusCards && index !== segments.length - 1) {
            const card = typeof resolveStatusCard === 'function' ? resolveStatusCard() : null;
            if (card) parent.appendChild(card);
        }
    });
};

const ensureRichFragmentScope = (containerEl, messageId = '') => {
    if (!containerEl) return '';
    let scopeId = String(containerEl.getAttribute(RICH_FRAGMENT_SCOPE_ATTR) || '').trim();
    if (!scopeId) {
        const base = String(messageId || '').trim().replace(/[^\w-]+/g, '-');
        scopeId = base ? `msg-${base}` : `frag-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        containerEl.setAttribute(RICH_FRAGMENT_SCOPE_ATTR, scopeId);
    }
    containerEl.classList.add('chat-rich-fragment');
    return scopeId;
};

const sanitizeRichFragmentAttributes = (sourceEl, targetEl) => {
    Array.from(sourceEl.attributes || []).forEach((attr) => {
        const name = String(attr?.name || '').toLowerCase();
        const value = String(attr?.value || '');
        if (!name) return;
        if (name === 'class') {
            const next = normalizeRichFragmentClassList(value);
            if (next) targetEl.setAttribute('class', next);
            return;
        }
        if (name === 'id') {
            const next = normalizeRichFragmentId(value);
            if (next) targetEl.setAttribute('id', next);
            return;
        }
        if (name === 'style') {
            const next = sanitizeInlineStyleAttribute(value);
            if (next) targetEl.setAttribute('style', next);
            return;
        }
        if (name.startsWith('data-') || name.startsWith('aria-')) {
            targetEl.setAttribute(name, value);
            return;
        }
        if (name === 'title') {
            targetEl.setAttribute(name, value);
            return;
        }
        if (targetEl.tagName === 'A' && name === 'href') {
            const next = sanitizeFragmentUrl(value);
            if (next) targetEl.setAttribute('href', next);
            return;
        }
        if (targetEl.tagName === 'A' && name === 'target') {
            if (String(value || '').toLowerCase() === '_blank') targetEl.setAttribute('target', '_blank');
            return;
        }
        if (targetEl.tagName === 'A' && name === 'rel') {
            targetEl.setAttribute('rel', 'noopener noreferrer');
            return;
        }
        if (targetEl.tagName === 'DETAILS' && name === 'open') {
            targetEl.setAttribute('open', '');
            return;
        }
        if ((targetEl.tagName === 'TD' || targetEl.tagName === 'TH') && (name === 'colspan' || name === 'rowspan')) {
            const num = Math.max(1, Math.min(24, Math.trunc(Number(value) || 1)));
            targetEl.setAttribute(name, String(num));
            return;
        }
        if (targetEl.tagName === 'TH' && name === 'scope') {
            const scope = String(value || '').toLowerCase();
            if (scope === 'col' || scope === 'row') targetEl.setAttribute('scope', scope);
            return;
        }
    });
    if (targetEl.tagName === 'A' && targetEl.getAttribute('href') && !targetEl.getAttribute('target')) {
        targetEl.setAttribute('target', '_blank');
        targetEl.setAttribute('rel', 'noopener noreferrer');
    }
};

const appendRichFragmentNode = (sourceNode, targetParent, state, mode = 'block') => {
    if (!sourceNode || !targetParent) return;
    const doc = targetParent.ownerDocument || document;
    if (mode === 'raw') {
        const text = String(sourceNode.textContent || '');
        if (text) targetParent.appendChild(doc.createTextNode(text));
        return;
    }
    if (sourceNode.nodeType === Node.TEXT_NODE) {
        const text = String(sourceNode.textContent || '');
        if (!text) return;
        appendMarkdownText(targetParent, text, {
            blockMode: mode !== 'inline',
            allowStatusCards: state.allowStatusCards,
            resolveStatusCard: state.resolveStatusCard,
        });
        return;
    }
    if (sourceNode.nodeType !== Node.ELEMENT_NODE) return;
    const tag = String(sourceNode.tagName || '').toLowerCase();
    if (!tag) return;
    if (RICH_FRAGMENT_DROP_TAGS.has(tag)) return;
    if (tag === 'style') {
        const scopedCss = sanitizeScopedCssText(sourceNode.textContent || '', { scopeSelector: state.scopeSelector });
        if (scopedCss) state.styles.push(scopedCss);
        return;
    }
    if (!RICH_FRAGMENT_ALLOWED_TAGS.has(tag)) {
        Array.from(sourceNode.childNodes || []).forEach((child) => appendRichFragmentNode(child, targetParent, state, mode));
        return;
    }
    const nextEl = doc.createElement(tag);
    sanitizeRichFragmentAttributes(sourceNode, nextEl);
    if (RICH_FRAGMENT_VOID_TAGS.has(tag)) {
        targetParent.appendChild(nextEl);
        return;
    }
    const childMode = RICH_FRAGMENT_RAW_TEXT_TAGS.has(tag)
        ? 'raw'
        : (RICH_FRAGMENT_INLINE_MODE_TAGS.has(tag) ? 'inline' : 'block');
    Array.from(sourceNode.childNodes || []).forEach((child) => appendRichFragmentNode(child, nextEl, state, childMode));
    targetParent.appendChild(nextEl);
};

const renderScopedRichFragment = (
    containerEl,
    text,
    { messageId = '', resolveStatusCard = null, allowStatusCards = true, debugTag = '', source = 'message' } = {},
) => {
    if (!containerEl) return false;
    const normalized = maybeDecodeRichFragmentEntities(text);
    if (!normalized.trim()) return false;
    if (typeof DOMParser === 'undefined') return false;
    try {
        const scopeId = ensureRichFragmentScope(containerEl, messageId);
        const scopeSelector = `[${RICH_FRAGMENT_SCOPE_ATTR}="${escapeHtmlText(scopeId)}"]`;
        const parser = new DOMParser();
        const parsed = parser.parseFromString(`<div>${normalized}</div>`, 'text/html');
        const root = parsed.body?.firstElementChild;
        if (!root) return false;
        const fragment = document.createDocumentFragment();
        const state = {
            styles: [],
            scopeSelector,
            allowStatusCards,
            resolveStatusCard,
        };
        Array.from(root.childNodes || []).forEach((node) => appendRichFragmentNode(node, fragment, state, 'block'));
        if (state.styles.length) {
            const styleEl = document.createElement('style');
            styleEl.className = 'chat-rich-scoped-style';
            styleEl.textContent = state.styles.join('\n');
            fragment.insertBefore(styleEl, fragment.firstChild || null);
        }
        if (!fragment.childNodes.length) return false;
        containerEl.classList.add('chat-rich-fragment');
        containerEl.appendChild(fragment);
        if (Boolean(debugTag) || shouldLogRichDebug()) {
            const info = `fragment source=${source} msg=${String(messageId || '')} len=${normalized.length} styles=${state.styles.length}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: 'info', message: info, force: true });
            logger.info(`[rich] ${info}`);
        }
        return true;
    } catch (err) {
        logger.warn('render rich fragment failed', err);
        return false;
    }
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
  const id = ${serializeForInlineScript(String(iframeId || ''))};
  let lastSentHeight = 0;
  let lastSentMode = 'document';
  let lastSentLock = false;
  let seq = 0;
  let pendingSource = 'bridge';
  let pendingForce = false;
  let forceNextResize = false;
  let layoutRafId = null;
  let pressTimer = null;
  let pressActive = false;
  let viewportLogged = false;
  let lockLogged = false;

  const normalizeSource = (source) => {
    const raw = String(source || '').trim().toLowerCase();
    if (raw === 'observer' || raw === 'fallback') return raw;
    return 'bridge';
  };

  const sendDebug = (level, message) => {
    try {
      parent.postMessage({ type: 'chatapp:iframe-debug', id, level: String(level || 'info'), message: String(message || '') }, '*');
    } catch {}
  };

  const readMetaPolicy = () => {
    try {
      const metaHeight = document.querySelector('meta[name="chatapp-height"]');
      const metaResize = document.querySelector('meta[name="chatapp-resize"]');
      const rawHeight = String(metaHeight?.getAttribute('content') || '').trim();
      const parsedHeight = Number(rawHeight);
      const height = Number.isFinite(parsedHeight) && parsedHeight > 0 ? parsedHeight : 0;
      const resize = String(metaResize?.getAttribute('content') || '').trim().toLowerCase();
      let mode = '';
      if (resize.includes('viewport')) mode = 'viewport';
      else if (resize.includes('document')) mode = 'document';
      const lock = resize === 'none' || resize === 'lock' || resize === 'locked';
      return { height, mode, lock };
    } catch {
      return { height: 0, mode: '', lock: false };
    }
  };

  const detectViewportMode = () => {
    try {
      const body = document.body;
      const docEl = document.documentElement;
      if (!body || !docEl) return false;
      const bodyStyle = getComputedStyle(body);
      const docStyle = getComputedStyle(docEl);
      const overflowHidden = /hidden|clip/i.test(String(bodyStyle.overflowY || '')) ||
        /hidden|clip/i.test(String(docStyle.overflowY || ''));
      const fixedBody = String(bodyStyle.position || '').toLowerCase() === 'fixed';
      const vhDecl = String(body.style.height || '') + ';' + String(body.style.minHeight || '') +
        ';' + String(docEl.style.height || '') + ';' + String(docEl.style.minHeight || '');
      const hasVhDecl = /\\b\\d+(?:\\.\\d+)?vh\\b/i.test(vhDecl);
      const viewportH = Math.max(window.innerHeight || 0, docEl.clientHeight || 0);
      const bodyH = Math.max(body.scrollHeight || 0, body.offsetHeight || 0, body.clientHeight || 0);
      const docH = Math.max(docEl.scrollHeight || 0, docEl.offsetHeight || 0, docEl.clientHeight || 0);
      const closeToViewport = viewportH > 0 && Math.abs(bodyH - viewportH) <= 28 && Math.abs(docH - viewportH) <= 28;
      if (overflowHidden && (fixedBody || hasVhDecl || closeToViewport)) return true;
      if (fixedBody && closeToViewport) return true;
      return false;
    } catch {
      return false;
    }
  };

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

  const measureViewportHeight = () => {
    try {
      const body = document.body;
      const docEl = document.documentElement;
      const viewport = Math.max(window.innerHeight || 0, docEl?.clientHeight || 0);
      const bodyRect = body?.getBoundingClientRect?.();
      const bodyH = bodyRect ? bodyRect.height : 0;
      const docH = Math.max(docEl?.clientHeight || 0, docEl?.offsetHeight || 0);
      return Math.max(viewport, bodyH, docH);
    } catch {
      return 0;
    }
  };

  const post = ({ source = 'bridge', force = false } = {}) => {
    try {
      const meta = readMetaPolicy();
      const mode = meta.mode || (detectViewportMode() ? 'viewport' : 'document');
      const lock = Boolean(meta.lock);
      const measured = meta.height > 0
        ? meta.height
        : (mode === 'viewport' ? measureViewportHeight() : measureContentHeight());
      const rawH = lock && lastSentHeight > 0 && meta.height <= 0 ? lastSentHeight : measured;
      const h = Math.ceil(Math.max(120, rawH || 0));
      if (mode === 'viewport' && !viewportLogged) {
        viewportLogged = true;
        sendDebug('info', 'height-mode=viewport');
      }
      if (lock !== lockLogged) {
        lockLogged = lock;
        sendDebug('info', 'height-lock=' + (lock ? '1' : '0'));
      }
      if (!force && !forceNextResize && h === lastSentHeight && mode === lastSentMode && lock === lastSentLock) {
        return;
      }
      forceNextResize = false;
      seq += 1;
      lastSentHeight = h;
      lastSentMode = mode;
      lastSentLock = lock;
      parent.postMessage({
        type: 'chatapp:iframe-resize',
        id,
        height: h,
        seq,
        source: normalizeSource(source),
        mode,
        lock,
        ts: Date.now(),
      }, '*');
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
      if (scrollW <= clientW + 2) return;

      let scale = clientW / scrollW;
      if (scale > 0.98) return;
      const minScale = 0.55;
      scale = Math.max(minScale, Math.min(1, scale));
      body.style.transformOrigin = 'top left';
      body.style.transform = 'scale(' + scale + ')';
      body.style.width = (100 / scale) + '%';

      docEl.style.overflowX = 'hidden';
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
      if (!e || !e.data || typeof e.data !== 'object') return;
      if (e.data.type === 'chatapp:updateViewportHeight' && typeof e.data.height === 'number') {
        try {
          document.documentElement.style.setProperty('--viewport-height', e.data.height + 'px');
        } catch {}
        forceNextResize = true;
        requestLayout('observer', true);
        return;
      }
      if (e.data.type !== 'chatapp:ping') return;
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

    const requestLayout = (source = 'bridge', force = false) => {
      pendingSource = normalizeSource(source);
      if (force) pendingForce = true;
      if (layoutRafId) return;
      layoutRafId = requestAnimationFrame(() => {
        layoutRafId = null;
        const sourceToSend = pendingSource;
        const forceToSend = pendingForce;
        pendingSource = 'bridge';
        pendingForce = false;
        stripBodyWhitespace();
        clampOversizedBlocks();
        fitToWidth();
        post({ source: sourceToSend, force: forceToSend });
      });
    };
    const triggerBurstLayout = (source = 'observer') => {
      forceNextResize = true;
      [0, 60, 180, 360].forEach((ms) => {
        setTimeout(() => { requestLayout(source, true); }, ms);
      });
    };

    requestLayout('bridge', true);
    sendReady();
    // Warm up layout to cover WebViews that delay initial paints.
    [50, 150, 300, 600].forEach((ms) => {
      setTimeout(() => { requestLayout('observer', true); }, ms);
    });

    document.addEventListener('toggle', (ev) => {
      if (ev && ev.target && ev.target.tagName === 'DETAILS') triggerBurstLayout('observer');
    }, true);
    document.addEventListener('transitionend', (ev) => {
      const target = ev?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('details')) return;
      triggerBurstLayout('observer');
    }, true);
    document.addEventListener('animationend', (ev) => {
      const target = ev?.target;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('details')) return;
      triggerBurstLayout('observer');
    }, true);

    try {
      const ro = new ResizeObserver(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('observer');
      });
      ro.observe(document.documentElement);
      if (document.body) ro.observe(document.body);
    } catch {
      setInterval(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('fallback');
      }, 500);
    }
    try {
      const mo = new MutationObserver(() => {
        if (lastSentLock && lastSentMode === 'viewport') return;
        requestLayout('observer');
      });
      if (document.body) mo.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
    } catch {}
    window.addEventListener('load', () => {
      forceNextResize = true;
      setTimeout(() => { requestLayout('observer', true); }, 0);
    });
    window.addEventListener('resize', () => {
      forceNextResize = true;
      setTimeout(() => { requestLayout('observer', true); }, 0);
    });
  };

  const isIgnorableNoise = (value) => /resizeobserver loop (limit exceeded|completed with (?:undelivered|delivered) notifications)/i.test(String(value || ''));
  const formatConsoleArg = (value) => {
    try {
      if (value instanceof Error) return value.stack || value.message || String(value);
      if (typeof value === 'string') return value;
      if (typeof value === 'number' || typeof value === 'boolean' || value == null) return String(value);
      return JSON.stringify(value);
    } catch {
      try { return String(value); } catch { return '[unserializable]'; }
    }
  };
  const setupConsoleForwarder = () => {
    if (window.__chatappConsoleForwarded) return;
    window.__chatappConsoleForwarded = true;
    const c = window.console || {};
    const levels = ['error', 'warn', 'info', 'log', 'debug'];
    let sent = 0;
    const maxLogs = 80;
    levels.forEach((level) => {
      const orig = typeof c[level] === 'function' ? c[level].bind(c) : null;
      c[level] = (...args) => {
        try { orig?.(...args); } catch {}
        try {
          if (sent >= maxLogs) return;
          const text = (Array.isArray(args) ? args : []).map((a) => formatConsoleArg(a)).join(' ');
          if (!text || isIgnorableNoise(text)) return;
          sent += 1;
          parent.postMessage({
            type: 'chatapp:iframe-debug',
            id,
            level: level === 'log' || level === 'debug' ? 'info' : level,
            message: 'console-' + level + ' ' + text,
          }, '*');
        } catch {}
      };
    });
    window.console = c;
  };
  setupConsoleForwarder();

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
      if (isIgnorableNoise(message)) return;
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
      if (isIgnorableNoise(msg)) return;
      parent.postMessage({ type: 'chatapp:iframe-error', id, message: 'unhandledrejection ' + msg }, '*');
    } catch {}
  });
  setTimeout(() => {
    try {
      const title = String(document.title || '');
      const scriptCount = document.scripts ? Number(document.scripts.length || 0) : 0;
      const textLen = String(document.body?.innerText || '').trim().length;
      const srcScripts = Array.from(document.scripts || [])
        .map((s) => String(s?.src || '').trim())
        .filter(Boolean)
        .slice(0, 6);
      const inlineScripts = Array.from(document.scripts || [])
        .filter((s) => !s?.src)
        .map((s) => String(s?.textContent || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean);
      const contentNode = document.querySelector('content');
      const stateBarNode = document.querySelector('state_bar');
      const contentTextLen = String(contentNode?.textContent || '').trim().length;
      const stateBarTextLen = String(stateBarNode?.textContent || '').trim().length;
      const contentHtml = String(contentNode?.innerHTML || '');
      const contentHasBr = /<br\s*\/?>/i.test(contentHtml) ? 1 : 0;
      const narrationCount = (String(contentNode?.textContent || '').match(/\[旁白\]\|/g) || []).length;
      parent.postMessage({
        type: 'chatapp:iframe-debug',
        id,
        level: 'info',
        message:
          'dom-snapshot title=' + (title || '(empty)') +
          ' scripts=' + String(scriptCount) +
          ' textLen=' + String(textLen) +
          ' hasContentNode=' + (contentNode ? '1' : '0') +
          ' contentTextLen=' + String(contentTextLen) +
          ' contentHasBr=' + String(contentHasBr) +
          ' narrationCount=' + String(narrationCount) +
          ' hasStateBarNode=' + (stateBarNode ? '1' : '0') +
          ' stateBarTextLen=' + String(stateBarTextLen),
      }, '*');
      if (srcScripts.length) {
        parent.postMessage({
          type: 'chatapp:iframe-debug',
          id,
          level: 'info',
          message: 'dom-script-src ' + srcScripts.join(' | ') + (document.scripts.length > srcScripts.length ? ' | ...' : ''),
        }, '*');
      }
      if (inlineScripts.length) {
        const inlinePreview = inlineScripts[0].slice(0, 220);
        parent.postMessage({
          type: 'chatapp:iframe-debug',
          id,
          level: 'info',
          message: 'dom-inline-script-preview ' + inlinePreview + (inlineScripts[0].length > 220 ? '...' : ''),
        }, '*');
      }
    } catch {}
  }, 1500);
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
    const resolvedBridgeScriptUrl = String(bridgeScriptUrl || '').trim();
    const bridgeTag = resolvedBridgeScriptUrl ? `<script src="${resolvedBridgeScriptUrl}"></script>` : '';
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
            if (n === 'getChatMessages') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.getChatMessages==="function")?window.__chatappCompat.getChatMessages:(typeof window.getChatMessages==="function"?window.getChatMessages:function(){return []; }))';
            }
            if (n === 'getChatMessage') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.getChatMessage==="function")?window.__chatappCompat.getChatMessage:(typeof window.getChatMessage==="function"?window.getChatMessage:function(){return ""; }))';
            }
            if (n === 'getContext') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.getContext==="function")?window.__chatappCompat.getContext:(typeof window.getContext==="function"?window.getContext:function(){return {}; }))';
            }
            if (n === 'setChatMessage') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.setChatMessage==="function")?window.__chatappCompat.setChatMessage:(typeof window.setChatMessage==="function"?window.setChatMessage:async function(){return false;}))';
            }
            if (n === 'setChatMessages') {
                return '((window.__chatappCompat&&typeof window.__chatappCompat.setChatMessages==="function")?window.__chatappCompat.setChatMessages:(typeof window.setChatMessages==="function"?window.setChatMessages:async function(){return false;}))';
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
        markFnCall(/(^|[^\w$.])getChatMessages\s*\(/g, 'getChatMessages');
        markFnCall(/(^|[^\w$.])getChatMessage\s*\(/g, 'getChatMessage');
        markFnCall(/(^|[^\w$.])getContext\s*\(/g, 'getContext');
        markFnCall(/(^|[^\w$.])setChatMessage\s*\(/g, 'setChatMessage');
        markFnCall(/(^|[^\w$.])setChatMessages\s*\(/g, 'setChatMessages');
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
const rewriteMvuModuleGlobals = (htmlCode) => {
    let html = String(htmlCode || '');
    let replaced = 0;
    const rewriteJs = (jsCode) => {
        let js = String(jsCode || '');
        const replaceCall = (regex, replacementFactory) => {
            js = js.replace(regex, (...args) => {
                replaced += 1;
                return replacementFactory(...args);
            });
        };
        replaceCall(/(^|[^\w$.])errorCatched\s*\(/g, (full, prefix) => `${String(prefix || '')}window.errorCatched(`);
        replaceCall(/(^|[^\w$.])getAllVariables\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getAllVariables||(()=>({})))(`);
        replaceCall(/(^|[^\w$.])getVariables\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getVariables||window.getAllVariables||(()=>({})))(`);
        replaceCall(/(^|[^\w$.])getCurrentMessageId\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getCurrentMessageId||(()=>''))(`);
        replaceCall(/(^|[^\w$.])getChatMessages\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getChatMessages||(()=>[]))(`);
        replaceCall(/(^|[^\w$.])getChatMessage\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getChatMessage||(()=>''))(`);
        replaceCall(/(^|[^\w$.])getContext\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.getContext||(()=>({})))(`);
        replaceCall(/(^|[^\w$.])setChatMessage\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.setChatMessage|| (async()=>false))(`);
        replaceCall(/(^|[^\w$.])setChatMessages\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.setChatMessages|| (async()=>false))(`);
        replaceCall(/(^|[^\w$.])insertOrAssignVariables\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.insertOrAssignVariables|| (async()=>false))(`);
        replaceCall(/(^|[^\w$.])deleteVariable\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.deleteVariable|| (async()=>false))(`);
        replaceCall(/(^|[^\w$.])waitGlobalInitialized\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.waitGlobalInitialized||(()=>Promise.resolve(null)))(`);
        replaceCall(/(^|[^\w$.])eventOn\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.eventOn||(()=>{}))(`);
        replaceCall(/(^|[^\w$.])eventRemoveListener\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.eventRemoveListener||(()=>{}))(`);
        replaceCall(/(^|[^\w$.])Mvu\b/g, (full, prefix) => `${String(prefix || '')}window.Mvu`);
        replaceCall(/(^|[^\w$.])_\s*\./g, (full, prefix) => `${String(prefix || '')}window._.`);
        replaceCall(/(^|[^\w$.])\$\s*\(/g, (full, prefix) => `${String(prefix || '')}(window.$||(()=>({text(){return this;},css(){return this;},addClass(){return this;},removeClass(){return this;},empty(){return this;},html(){return this;},append(){return this;}})))(`);
        return js;
    };
    try {
        html = html.replace(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi, (full, attrs, body) => {
            const attrText = String(attrs || '');
            if (/\bsrc\s*=/.test(attrText)) return full;
            if (!/\btype\s*=\s*["']module["']/i.test(attrText)) return full;
            if (/\btype\s*=\s*["'](?:application\/json|application\/ld\+json|text\/plain)["']/i.test(attrText)) return full;
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
    const hasModuleScript = /<script\b[^>]*\btype\s*=\s*["']module["'][^>]*>/i.test(html);
    if (hasModuleScript) return rewriteMvuModuleGlobals(html);
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
  const CHATAPP_IFRAME_ID = ${serializeForInlineScript(id)};
  const CHATAPP_DEBUG_TAG = ${serializeForInlineScript(tag)};
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
  log('info', 'vue-shim-mode major=' + ${serializeForInlineScript(major)});
  ensureGlobal('Vue', ${serializeForInlineScript(vueUrls)}, 'vue-shim-ready', 'vue-shim-missing');
  setupVueDemi();
  ensureGlobal('VueRouter', ${serializeForInlineScript(routerUrls)}, 'vue-router-shim-ready', 'vue-router-shim-missing');
  if (${serializeForInlineScript(major)} === 3) {
    setupVueDemi();
    ensureGlobal('Pinia', ${serializeForInlineScript(piniaUrls)}, 'pinia-shim-ready', 'pinia-shim-missing');
  }
  setTimeout(async () => {
    try {
      log('info', 'vue-shim-late ' + (window.Vue ? 'ready' : 'missing'));
      log('info', 'vue-router-shim-late ' + (window.VueRouter ? 'ready' : 'missing'));
      if (${serializeForInlineScript(major)} === 3) {
        log('info', 'pinia-shim-late ' + (window.Pinia ? 'ready' : 'missing'));
      }
      if (window.Vue && !window.VueRouter) {
        await ensureGlobalAsync('VueRouter', ${serializeForInlineScript(routerUrls)}, 'vue-router-shim-ready-retry', 'vue-router-shim-missing-retry');
      }
      if (${serializeForInlineScript(major)} === 3 && window.Vue && !window.Pinia) {
        setupVueDemi();
        await ensureGlobalAsync('Pinia', ${serializeForInlineScript(piniaUrls)}, 'pinia-shim-ready-retry', 'pinia-shim-missing-retry');
      }
      if (${serializeForInlineScript(major)} === 3 && !window.Pinia) {
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

const buildDollarGlobalShim = ({
    iframeId = '',
    debugTag = '',
    appOrigin = '',
    needsZodShim = false,
    messageId = '',
    messageIndex = null,
    seedMessages = [],
} = {}) => {
    const id = String(iframeId || '');
    const tag = String(debugTag || '');
    const origin = String(appOrigin || '').trim();
    const mid = String(messageId || '');
    const rawIdx = Number(messageIndex);
    const midx = Number.isFinite(rawIdx) ? Math.trunc(rawIdx) : null;
    const seed = Array.isArray(seedMessages) ? seedMessages : [];
    const lodashUrls = [
        origin ? `${origin}/lib/lodash.min.js` : '',
        origin ? `${origin}/src/lib/lodash.min.js` : '',
        'https://testingcf.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        'https://cdn.jsdelivr.net/npm/lodash@4.17.21/lodash.min.js',
        'https://unpkg.com/lodash@4.17.21/lodash.min.js',
    ];
    const zodUrls = [
        origin ? `${origin}/lib/zod.min.js` : '',
        origin ? `${origin}/src/lib/zod.min.js` : '',
        'https://testingcf.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js',
        'https://cdn.jsdelivr.net/npm/zod@3.22.4/lib/index.umd.min.js',
        'https://unpkg.com/zod@3.22.4/lib/index.umd.min.js',
    ];
    return `<script>
(() => {
  const CHATAPP_IFRAME_ID = ${serializeForInlineScript(id)};
  const CHATAPP_DEBUG_TAG = ${serializeForInlineScript(tag)};
  const CHATAPP_MESSAGE_ID = ${serializeForInlineScript(mid)};
  const CHATAPP_MESSAGE_INDEX = ${midx === null ? 'null' : String(midx)};
  const CHATAPP_SEED_MESSAGES = ${serializeForInlineScript(seed)};
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
  const chatState = {
    currentRef: String(CHATAPP_MESSAGE_ID || ''),
    currentIndex: Number.isInteger(CHATAPP_MESSAGE_INDEX) ? CHATAPP_MESSAGE_INDEX : null,
    entries: new Map(),
  };
  const getCurrentCompatRef = () => String(chatState.currentRef || CHATAPP_MESSAGE_ID || '');
  const normalizeCompatRef = (input) => {
    const raw = input === undefined || input === null || input === '' ? getCurrentCompatRef() : String(input);
    const idx = Number(raw);
    if (Number.isInteger(idx) && Number.isInteger(chatState.currentIndex) && idx === chatState.currentIndex) {
      return getCurrentCompatRef();
    }
    return raw;
  };
  const normalizeCompatEntry = (entry = {}, fallbackRef = '') => {
    const ref = normalizeCompatRef(entry.message_id ?? entry.messageId ?? entry.id ?? fallbackRef ?? '');
    const numericId = Number(ref);
    const messageId = Number.isInteger(numericId) ? numericId : ref;
    const message = String(entry.message ?? entry.content ?? entry.raw ?? '');
    const data = entry.data && typeof entry.data === 'object' ? JSON.parse(JSON.stringify(entry.data)) : {};
    const extra = entry.extra && typeof entry.extra === 'object' ? JSON.parse(JSON.stringify(entry.extra)) : {};
    return {
      message_id: messageId,
      id: messageId,
      role: String(entry.role || 'assistant'),
      message,
      mes: message,
      content: message,
      data,
      extra,
      is_hidden: Boolean(entry.is_hidden),
      name: String(entry.name || ''),
      swipe_id: Number.isInteger(Number(entry.swipe_id)) ? Number(entry.swipe_id) : 0,
      swipes: Array.isArray(entry.swipes) ? entry.swipes.slice() : [message],
      swipes_data: Array.isArray(entry.swipes_data) ? entry.swipes_data.slice() : [data],
      swipes_info: Array.isArray(entry.swipes_info) ? entry.swipes_info.slice() : [extra],
    };
  };
  const upsertCompatEntry = (refInput, patch = {}) => {
    const ref = normalizeCompatRef(refInput);
    if (!ref) return null;
    const prev = chatState.entries.get(ref) || normalizeCompatEntry({ message_id: ref }, ref);
    const merged = normalizeCompatEntry({ ...prev, ...patch, message_id: patch?.message_id ?? prev.message_id }, ref);
    chatState.entries.set(ref, merged);
    return merged;
  };
  const exportCompatEntries = () => Array.from(chatState.entries.values()).map((entry) => normalizeCompatEntry(entry, ''));
  const sortCompatEntries = (items) => (Array.isArray(items) ? items.slice() : [])
    .sort((a, b) => {
      const an = Number(a?.message_id);
      const bn = Number(b?.message_id);
      const ai = Number.isFinite(an) && Number.isInteger(an);
      const bi = Number.isFinite(bn) && Number.isInteger(bn);
      if (ai && bi) return an - bn;
      if (ai) return -1;
      if (bi) return 1;
      return String(a?.message_id ?? '').localeCompare(String(b?.message_id ?? ''));
    });
  const toLegacyChatMessage = (entry = {}) => {
    const message = String(entry?.message || '');
    const role = String(entry?.role || 'assistant').trim().toLowerCase();
    const data = entry?.data && typeof entry.data === 'object' ? entry.data : {};
    const extra = entry?.extra && typeof entry.extra === 'object' ? entry.extra : {};
    const swipes = Array.isArray(entry?.swipes) && entry.swipes.length
      ? entry.swipes.slice()
      : [message];
    const swipeVars = Array.isArray(entry?.swipes_data) && entry.swipes_data.length
      ? entry.swipes_data.slice()
      : [data];
    return {
      mes: message,
      name: String(entry?.name || (role === 'user' ? 'user' : 'assistant')),
      is_user: role === 'user',
      is_system: Boolean(entry?.is_hidden),
      swipe_id: Number.isInteger(Number(entry?.swipe_id)) ? Number(entry.swipe_id) : 0,
      swipes,
      variables: swipeVars,
      extra,
    };
  };
  const syncLegacyChatGlobals = () => {
    const legacy = sortCompatEntries(exportCompatEntries()).map((entry) => toLegacyChatMessage(entry));
    const currentId = Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : 0;
    const mirrorHost = (host) => {
      try {
        if (!host) return;
        host.chat = legacy;
        host.this_chid = currentId;
        if (!host.chat_metadata || typeof host.chat_metadata !== 'object') host.chat_metadata = {};
      } catch {}
    };
    mirrorHost(window);
    mirrorHost(window.parent);
    mirrorHost(window.top);
    return legacy;
  };
  const resolveCompatCurrentMessageId = () =>
    Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : getCurrentCompatRef();
  const applyCompatSetMessageCache = (messageRef, fieldValues = {}) => {
    const ref = normalizeCompatRef(messageRef);
    const fields = fieldValues && typeof fieldValues === 'object' ? fieldValues : {};
    const patch = {};
    if (Object.prototype.hasOwnProperty.call(fields, 'message')) patch.message = String(fields.message ?? '');
    if (Object.prototype.hasOwnProperty.call(fields, 'data')) {
      patch.data = fields.data && typeof fields.data === 'object' ? JSON.parse(JSON.stringify(fields.data)) : {};
    }
    const next = upsertCompatEntry(ref, patch);
    syncLegacyChatGlobals();
    return next;
  };
  let compatReadLogCount = 0;
  const logCompatRead = (name, detail = '') => {
    compatReadLogCount += 1;
    if (compatReadLogCount > 24) return;
    log('info', String(name || '') + (detail ? (' ' + detail) : ''));
  };
  (Array.isArray(CHATAPP_SEED_MESSAGES) ? CHATAPP_SEED_MESSAGES : []).forEach((entry) => {
    const ref = entry?.id ?? entry?.message_id ?? entry?.messageId ?? '';
    if (!ref) return;
    upsertCompatEntry(ref, entry);
  });
  {
    const currentRef = getCurrentCompatRef();
    if (currentRef && !chatState.entries.has(currentRef)) {
      upsertCompatEntry(currentRef, {
        message_id: Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : currentRef,
        role: 'assistant',
        message: '',
        data: {},
        extra: {},
      });
    }
  }
  const legacySeed = syncLegacyChatGlobals();
  log('info', 'legacy-chat-shim-ready count=' + String(Array.isArray(legacySeed) ? legacySeed.length : 0) + ' this_chid=' + String(Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : 0));
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
    compat.getVariables = (option = { type: 'message' }) => {
      try {
        if (typeof window.getVariables === 'function' && window.getVariables !== compat.getVariables) {
          return window.getVariables(option);
        }
      } catch {}
      return getScopedVars(compat.getAllVariables(), option);
    };
  }
  if (typeof compat.getContext !== 'function') {
    compat.getContext = () => {
      const vars = compat.getAllVariables();
      const chat = compat.getChatMessages();
      const ctx = buildMvuCompatWindowContext({
        vars,
        chat,
        currentMessageId: compat.getCurrentMessageId(),
      });
      logCompatRead('compat-read getContext', 'chat=' + String(Array.isArray(chat) ? chat.length : 0) + ' vars=' + String(Object.keys(ctx?.stat_data || {}).length));
      return ctx;
    };
  }
  if (typeof compat.getCurrentMessageId !== 'function') {
    compat.getCurrentMessageId = () => {
      const id = resolveCompatCurrentMessageId();
      logCompatRead('compat-read getCurrentMessageId', 'value=' + String(id));
      return id;
    };
  }
  if (typeof compat.getChatMessages !== 'function') {
    compat.getChatMessages = (...args) => {
      const all = exportCompatEntries()
        .slice()
        .sort((a, b) => {
          const an = Number(a?.message_id);
          const bn = Number(b?.message_id);
          const ai = Number.isFinite(an) && Number.isInteger(an);
          const bi = Number.isFinite(bn) && Number.isInteger(bn);
          if (ai && bi) return an - bn;
          if (ai) return -1;
          if (bi) return 1;
          return String(a?.message_id ?? '').localeCompare(String(b?.message_id ?? ''));
        });
      if (!all.length) return [];
      const first = args[0];
      let range = first;
      let options = {};
      if (first && typeof first === 'object' && !Array.isArray(first)) {
        options = { ...first };
        range = undefined;
      } else {
        const second = args[1];
        const third = args[2];
        if (second && typeof second === 'object' && !Array.isArray(second)) options = { ...second };
        else if (typeof second === 'string') options.role = second;
        if (third && typeof third === 'object' && !Array.isArray(third)) options = { ...options, ...third };
        else if (typeof third === 'string' && !options.role) options.role = third;
      }
      const roleKey = String(options?.role || 'all').trim().toLowerCase();
      const hideState = String(options?.hide_state || 'all').trim().toLowerCase();
      const applyFilters = (items) => items.filter((item) => {
        const msgRole = String(item?.role || '').trim().toLowerCase();
        if (roleKey && roleKey !== 'all' && roleKey !== 'any' && msgRole !== roleKey) return false;
        if (hideState === 'hidden' && !Boolean(item?.is_hidden)) return false;
        if (hideState === 'unhidden' && Boolean(item?.is_hidden)) return false;
        return true;
      });
      if (range === undefined || range === null || range === '') {
        const filtered = applyFilters(all);
        logCompatRead(
          'compat-read getChatMessages',
          'range=all count=' + String(filtered.length) +
            ' role=' + String(roleKey || 'all') +
            ' hide=' + String(hideState || 'all'),
        );
        return filtered;
      }
      const numericIds = all
        .map((item) => Number(item?.message_id))
        .filter((n) => Number.isFinite(n) && Number.isInteger(n));
      const fallbackMax = Number.isInteger(chatState.currentIndex) ? chatState.currentIndex : -1;
      const maxId = numericIds.length ? Math.max(...numericIds) : fallbackMax;
      const clamp = (value) => {
        if (!Number.isFinite(value) || !Number.isInteger(value)) return null;
        if (maxId < 0) return value;
        const normalized = value < 0 ? maxId + value + 1 : value;
        return Math.max(0, Math.min(maxId, normalized));
      };
      const parseRange = (raw) => {
        if (typeof raw === 'number' && Number.isInteger(raw)) {
          const one = clamp(raw);
          return one === null ? null : { start: one, end: one };
        }
        const text = String(raw ?? '').trim();
        const oneMatch = text.match(/^(-?\d+)$/);
        if (oneMatch) {
          const one = clamp(Number(oneMatch[1]));
          return one === null ? null : { start: one, end: one };
        }
        const rangeMatch = text.match(/^(-?\d+)\s*-\s*(-?\d+)$/);
        if (!rangeMatch) return null;
        const a = clamp(Number(rangeMatch[1]));
        const b = clamp(Number(rangeMatch[2]));
        if (a === null || b === null) return null;
        return a <= b ? { start: a, end: b } : { start: b, end: a };
      };
      const parsed = parseRange(range);
      if (parsed) {
        const matched = all.filter((item) => {
          const id = Number(item?.message_id);
          if (!Number.isFinite(id) || !Number.isInteger(id)) return false;
          return id >= parsed.start && id <= parsed.end;
        });
        const filtered = applyFilters(matched);
        const sampleText = filtered[0] ? String(filtered[0]?.message || '') : '';
        const sampleLen = sampleText.length;
        const sampleHasContent = /<\s*content\b/i.test(sampleText) ? 1 : 0;
        logCompatRead(
          'compat-read getChatMessages',
          'range=' + String(parsed.start) + '-' + String(parsed.end) +
            ' count=' + String(filtered.length) +
            ' len=' + String(sampleLen) +
            ' hasContent=' + String(sampleHasContent) +
            ' role=' + String(roleKey || 'all') +
            ' hide=' + String(hideState || 'all'),
        );
        return filtered;
      }
      const ref = normalizeCompatRef(range);
      const matched = all.filter((item) => String(item?.message_id) === ref || String(item?.id || '') === ref);
      const filtered = applyFilters(matched);
      const sampleText = filtered[0] ? String(filtered[0]?.message || '') : '';
      const sampleLen = sampleText.length;
      const sampleHasContent = /<\s*content\b/i.test(sampleText) ? 1 : 0;
      logCompatRead(
        'compat-read getChatMessages',
        'range=' + String(range) + ' ref=' + String(ref) +
          ' count=' + String(filtered.length) +
          ' len=' + String(sampleLen) +
          ' hasContent=' + String(sampleHasContent) +
          ' role=' + String(roleKey || 'all') +
          ' hide=' + String(hideState || 'all'),
      );
      return filtered;
    };
  }
  if (typeof compat.getChatMessage !== 'function') {
    compat.getChatMessage = (idx, role) => {
      const list = compat.getChatMessages();
      const roleKey = String(role || '').trim().toLowerCase();
      const filtered = roleKey && roleKey !== 'any'
        ? list.filter((item) => String(item?.role || '').trim().toLowerCase() === roleKey)
        : list;
      if (!filtered.length) return '';
      const asId = Number(idx);
      if (Number.isFinite(asId) && Number.isInteger(asId)) {
        const hitById = filtered.find((item) => Number(item?.message_id) === asId || String(item?.message_id) === String(asId));
        if (hitById) {
          const txt = String(hitById?.message || '');
          logCompatRead('compat-read getChatMessage', 'id=' + String(asId) + ' by=message_id len=' + String(txt.length));
          return txt;
        }
      }
      let index = Number(idx);
      if (!Number.isFinite(index) || !Number.isInteger(index)) {
        logCompatRead('compat-read getChatMessage', 'idx=' + String(idx) + ' invalid');
        return '';
      }
      if (index < 0) index = filtered.length + index;
      if (index < 0 || index >= filtered.length) {
        logCompatRead('compat-read getChatMessage', 'idx=' + String(index) + ' out-of-range size=' + String(filtered.length));
        return '';
      }
      const txt = String(filtered[index]?.message || '');
      logCompatRead('compat-read getChatMessage', 'idx=' + String(index) + ' by=index len=' + String(txt.length));
      return txt;
    };
  }
  if (typeof compat.setChatMessage !== 'function') {
    compat.setChatMessage = async (fieldValues, messageId, options = {}) => {
      const payload = typeof fieldValues === 'string'
        ? { message: fieldValues }
        : (fieldValues && typeof fieldValues === 'object' ? { ...fieldValues } : {});
      const targetMessageId = messageId === undefined || messageId === null || messageId === ''
        ? (typeof compat.getCurrentMessageId === 'function' ? compat.getCurrentMessageId() : '')
        : normalizeCompatRef(messageId);
      const safeOptions = options && typeof options === 'object' ? options : {};
      try {
        parent.postMessage({
          type: 'chatapp:set-chat-message',
          id: CHATAPP_IFRAME_ID,
          sessionId: '',
          messageId: String(targetMessageId || ''),
          fieldValues: payload,
          options: safeOptions,
        }, '*');
        applyCompatSetMessageCache(targetMessageId, payload);
        return true;
      } catch {
        return false;
      }
    };
  }
  if (typeof compat.setChatMessages !== 'function') {
    compat.setChatMessages = async (messages = [], options = {}) => {
      const list = Array.isArray(messages) ? messages : [];
      const safeOptions = options && typeof options === 'object' ? options : {};
      const normalized = list
        .map((item) => (item && typeof item === 'object' ? { ...item } : null))
        .filter(Boolean);
      try {
        parent.postMessage({
          type: 'chatapp:set-chat-messages',
          id: CHATAPP_IFRAME_ID,
          sessionId: '',
          messages: normalized,
          options: safeOptions,
        }, '*');
        normalized.forEach((item) => {
          const ref = item?.message_id ?? item?.messageId ?? item?.id ?? item?.mid ?? '';
          applyCompatSetMessageCache(ref, item);
        });
        return true;
      } catch {
        return false;
      }
    };
  }
  if (typeof compat.replaceVariables !== 'function') {
    compat.replaceVariables = async (nextScoped, options = {}) => {
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const payload = nextScoped && typeof nextScoped === 'object' ? cloneMvuCompatValue(nextScoped) : {};
      const nextVars = replaceScopedVars(compat.getAllVariables(), payload, safeOptions);
      try { await window.Mvu?.replaceMvuData?.(nextVars, safeOptions); } catch {}
      try {
        parent.postMessage({
          type: 'chatapp:replace-variables',
          id: CHATAPP_IFRAME_ID,
          sessionId: '',
          variables: payload,
          options: safeOptions,
        }, '*');
        return getScopedVars(nextVars, safeOptions);
      } catch {
        return false;
      }
    };
  }
  if (typeof compat.insertOrAssignVariables !== 'function') {
    compat.insertOrAssignVariables = async (patch, options = {}) => {
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const payload = patch && typeof patch === 'object' ? cloneMvuCompatValue(patch) : {};
      const nextVars = mergeScopedVars(compat.getAllVariables(), payload, safeOptions);
      try { await window.Mvu?.replaceMvuData?.(nextVars, safeOptions); } catch {}
      try {
        parent.postMessage({
          type: 'chatapp:merge-variables',
          id: CHATAPP_IFRAME_ID,
          sessionId: '',
          patch: payload,
          options: safeOptions,
        }, '*');
        return getScopedVars(nextVars, safeOptions);
      } catch {
        return false;
      }
    };
  }
  if (typeof compat.deleteVariable !== 'function') {
    compat.deleteVariable = async (key, options = {}) => {
      const rawKey = String(key || '').trim();
      if (!rawKey) return false;
      const safeOptions = options && typeof options === 'object' ? { ...options } : {};
      const nextVars = deleteScopedVar(compat.getAllVariables(), rawKey, safeOptions);
      try { await window.Mvu?.replaceMvuData?.(nextVars, safeOptions); } catch {}
      try {
        parent.postMessage({
          type: 'chatapp:delete-variable',
          id: CHATAPP_IFRAME_ID,
          sessionId: '',
          key: rawKey,
          options: safeOptions,
        }, '*');
        return {
          variables: getScopedVars(nextVars, safeOptions),
          delete_occurred: true,
        };
      } catch {
        return false;
      }
    };
  }
  if (!window.TavernHelper || typeof window.TavernHelper !== 'object') {
    window.TavernHelper = {};
  }
  const helper = window.TavernHelper;
  if (typeof helper.getAllVariables !== 'function') helper.getAllVariables = (...args) => compat.getAllVariables(...args);
  if (typeof helper.getVariables !== 'function') helper.getVariables = (...args) => compat.getVariables(...args);
  if (typeof helper.getCurrentMessageId !== 'function') helper.getCurrentMessageId = (...args) => compat.getCurrentMessageId(...args);
  if (typeof helper.getChatMessages !== 'function') helper.getChatMessages = (...args) => compat.getChatMessages(...args);
  if (typeof helper.getChatMessage !== 'function') helper.getChatMessage = (...args) => compat.getChatMessage(...args);
  if (typeof helper.getContext !== 'function') helper.getContext = (...args) => compat.getContext(...args);
  if (typeof helper.setChatMessage !== 'function') helper.setChatMessage = (...args) => compat.setChatMessage(...args);
  if (typeof helper.setChatMessages !== 'function') helper.setChatMessages = (...args) => compat.setChatMessages(...args);
  if (typeof helper.replaceVariables !== 'function') helper.replaceVariables = (...args) => compat.replaceVariables(...args);
  if (typeof helper.insertOrAssignVariables !== 'function') helper.insertOrAssignVariables = (...args) => compat.insertOrAssignVariables(...args);
  if (typeof helper.deleteVariable !== 'function') helper.deleteVariable = (...args) => compat.deleteVariable(...args);
  if (typeof helper.waitGlobalInitialized !== 'function') helper.waitGlobalInitialized = async () => null;
  if (typeof helper.getTavernHelperVersion !== 'function') helper.getTavernHelperVersion = async () => '4.0.99-chatapp';
  if (!window.SillyTavern || typeof window.SillyTavern !== 'object') {
    window.SillyTavern = {};
  }
  if (!window.SillyTavern.TavernHelper || typeof window.SillyTavern.TavernHelper !== 'object') {
    window.SillyTavern.TavernHelper = helper;
  }
  ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'getChatMessages', 'getChatMessage', 'getContext', 'setChatMessage', 'setChatMessages', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables']
    .forEach((name) => {
      if (typeof helper[name] === 'function') {
        window.SillyTavern[name] = (...args) => helper[name](...args);
      }
    });
  if (typeof window.getCurrentMessageId !== 'function') window.getCurrentMessageId = (...args) => compat.getCurrentMessageId(...args);
  if (typeof window.getChatMessages !== 'function') window.getChatMessages = (...args) => compat.getChatMessages(...args);
  if (typeof window.getChatMessage !== 'function') window.getChatMessage = (...args) => compat.getChatMessage(...args);
  if (typeof window.getContext !== 'function') window.getContext = (...args) => compat.getContext(...args);
  if (typeof window.setChatMessage !== 'function') window.setChatMessage = (...args) => compat.setChatMessage(...args);
  if (typeof window.setChatMessages !== 'function') window.setChatMessages = (...args) => compat.setChatMessages(...args);
  if (typeof window.replaceVariables !== 'function') window.replaceVariables = (...args) => compat.replaceVariables(...args);
  if (typeof window.insertOrAssignVariables !== 'function') window.insertOrAssignVariables = (...args) => compat.insertOrAssignVariables(...args);
  if (typeof window.deleteVariable !== 'function') window.deleteVariable = (...args) => compat.deleteVariable(...args);
  const bridgeHostCompat = (host) => {
    try {
      if (!host || host === window) return false;
      if (!host.TavernHelper || typeof host.TavernHelper !== 'object') host.TavernHelper = {};
      const hostHelper = host.TavernHelper;
      const names = ['getAllVariables', 'getVariables', 'getCurrentMessageId', 'getChatMessages', 'getChatMessage', 'getContext', 'setChatMessage', 'setChatMessages', 'insertOrAssignVariables', 'deleteVariable', 'waitGlobalInitialized', 'replaceVariables'];
      names.forEach((name) => {
        if (typeof helper[name] === 'function') {
          hostHelper[name] = (...args) => helper[name](...args);
        }
      });
      if (typeof hostHelper.getTavernHelperVersion !== 'function') hostHelper.getTavernHelperVersion = async () => '4.0.99-chatapp';
      if (!host.SillyTavern || typeof host.SillyTavern !== 'object') host.SillyTavern = {};
      if (!host.SillyTavern.TavernHelper || typeof host.SillyTavern.TavernHelper !== 'object') {
        host.SillyTavern.TavernHelper = hostHelper;
      }
      names.forEach((name) => {
        if (typeof hostHelper[name] === 'function') {
          host.SillyTavern[name] = (...args) => hostHelper[name](...args);
        }
      });
      host.getCurrentMessageId = (...args) => compat.getCurrentMessageId(...args);
      host.getChatMessages = (...args) => compat.getChatMessages(...args);
      host.getChatMessage = (...args) => compat.getChatMessage(...args);
      host.getContext = (...args) => compat.getContext(...args);
      host.getVariables = (...args) => compat.getVariables(...args);
      host.getAllVariables = (...args) => compat.getAllVariables(...args);
      host.setChatMessage = (...args) => compat.setChatMessage(...args);
      host.setChatMessages = (...args) => compat.setChatMessages(...args);
      host.replaceVariables = (...args) => compat.replaceVariables(...args);
      host.insertOrAssignVariables = (...args) => compat.insertOrAssignVariables(...args);
      host.deleteVariable = (...args) => compat.deleteVariable(...args);
      if (typeof host._ === 'undefined' && typeof window._ !== 'undefined') host._ = window._;
      if (typeof host.$ === 'undefined' && typeof window.$ === 'function') host.$ = window.$;
      if (typeof host.jQuery === 'undefined' && typeof window.jQuery === 'function') host.jQuery = window.jQuery;
      return true;
    } catch {
      return false;
    }
  };
  const bridgedParent = bridgeHostCompat(window.parent);
  const bridgedTop = bridgeHostCompat(window.top);
  log('info', 'tavern-helper-shim-bootstrap seed=' + String(Array.isArray(CHATAPP_SEED_MESSAGES) ? CHATAPP_SEED_MESSAGES.length : 0));
  log('info', 'tavern-helper-shim-host-bridge parent=' + (bridgedParent ? '1' : '0') + ' top=' + (bridgedTop ? '1' : '0'));
  {
    const currentRef = getCurrentCompatRef();
    const seededCurrent = currentRef ? chatState.entries.get(currentRef) : null;
    log('info', 'tavern-helper-shim-seed-current has=' + (seededCurrent ? '1' : '0') + ' len=' + String(seededCurrent ? String(seededCurrent.message || '').length : 0));
  }
  const hasJq = typeof window.$ === 'function' && window.$.fn && window.$.fn.jquery;
  if (!hasJq) {
    if (!(typeof window.$ === 'function' && window.$.__chatappMini)) {
      const toNodes = (input) => {
        if (!input) return [];
        if (input instanceof Element || input === window || input === document) return [input];
        if (Array.isArray(input)) return input.filter(Boolean);
        return Array.from(document.querySelectorAll(String(input)));
      };
      const asIndexedApi = (api, nodes) => {
        try {
          api.length = Array.isArray(nodes) ? nodes.length : 0;
          (Array.isArray(nodes) ? nodes : []).forEach((n, i) => {
            api[i] = n;
          });
        } catch {}
        return api;
      };
      const wrap = (nodes) => asIndexedApi({
        __chatappMini: true,
        __chatappMiniLite: true,
        nodes,
        length: Array.isArray(nodes) ? nodes.length : 0,
        ready(handler) {
          if (typeof handler !== 'function') return this;
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', handler, { once: true });
          else setTimeout(() => {
            try { handler.call(document); } catch {}
          }, 0);
          return this;
        },
        get(index) {
          if (index === undefined) return Array.isArray(nodes) ? nodes.slice() : [];
          let idx = Number(index);
          if (!Number.isFinite(idx) || !Number.isInteger(idx)) return undefined;
          if (idx < 0) idx = (Array.isArray(nodes) ? nodes.length : 0) + idx;
          return (Array.isArray(nodes) && idx >= 0 && idx < nodes.length) ? nodes[idx] : undefined;
        },
        eq(index) {
          const hit = this.get(index);
          return wrap(hit ? [hit] : []);
        },
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
      }, nodes);
      const mini = (input) => {
        if (typeof input === 'function') {
          if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', input);
          else setTimeout(input, 0);
          return wrap([]);
        }
        return wrap(toNodes(input));
      };
      mini.__chatappMini = true;
      mini.__chatappMiniLite = true;
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
  ensureGlobal('_', ${serializeForInlineScript(lodashUrls)}, 'lodash-shim-ready', 'lodash-shim-missing');
  if (${serializeForInlineScript(Boolean(needsZodShim))}) {
    ensureGlobal('Zod', ${serializeForInlineScript(zodUrls)}, 'zod-shim-ready', 'zod-shim-missing');
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
  if (${serializeForInlineScript(Boolean(needsZodShim))} && (!window.z || typeof window.z !== 'object')) {
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
  if (typeof window._ !== 'function') {
    const toPath = (raw) => String(raw || '')
      .replace(/\\[([^\\]]+)\\]/g, '.$1')
      .split('.')
      .map(seg => seg.trim().replace(/^['"]|['"]$/g, ''))
      .filter(Boolean);
    const existing = (window._ && typeof window._ === 'object') ? window._ : {};
    const makeChain = (initial) => {
      let current = initial;
      const api = {
        value() { return current; },
        map(fn) {
          if (Array.isArray(current)) current = current.map((v, i) => fn(v, i));
          else if (current && typeof current === 'object') current = Object.keys(current).map((k) => fn(current[k], k));
          else current = [];
          return api;
        },
        filter(fn) {
          current = Array.isArray(current) ? current.filter((v, i) => fn(v, i)) : [];
          return api;
        },
        sortBy(iteratee) {
          const arr = Array.isArray(current) ? current.slice() : [];
          const getter = typeof iteratee === 'function'
            ? iteratee
            : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
          arr.sort((a, b) => {
            const av = getter(a);
            const bv = getter(b);
            if (av > bv) return 1;
            if (av < bv) return -1;
            return 0;
          });
          current = arr;
          return api;
        },
        find(fn) {
          current = Array.isArray(current) ? current.find((v, i) => fn(v, i)) : undefined;
          return api;
        },
        forEach(fn) {
          if (Array.isArray(current)) current.forEach((v, i) => fn(v, i));
          else if (current && typeof current === 'object') Object.keys(current).forEach((k) => fn(current[k], k));
          return api;
        },
        each(fn) { return api.forEach(fn); },
      };
      return api;
    };
    const lodashLite = (value) => makeChain(value);
    Object.assign(lodashLite, existing);
    lodashLite.chain = (value) => makeChain(value);
    window._ = lodashLite;
    if (typeof window._.isArray !== 'function') window._.isArray = Array.isArray;
    if (typeof window._.isObject !== 'function') window._.isObject = (v) => v !== null && typeof v === 'object';
    if (typeof window._.isPlainObject !== 'function') {
      window._.isPlainObject = (v) => {
        if (v === null || typeof v !== 'object') return false;
        const proto = Object.getPrototypeOf(v);
        return proto === Object.prototype || proto === null;
      };
    }
    if (typeof window._.isNil !== 'function') window._.isNil = (v) => v === null || v === undefined;
    if (typeof window._.isString !== 'function') window._.isString = (v) => typeof v === 'string';
    if (typeof window._.isNumber !== 'function') window._.isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
    if (typeof window._.isBoolean !== 'function') window._.isBoolean = (v) => typeof v === 'boolean';
    if (typeof window._.isFunction !== 'function') window._.isFunction = (v) => typeof v === 'function';
    if (typeof window._.clamp !== 'function') window._.clamp = (n, min, max) => Math.max(min, Math.min(max, n));
    if (typeof window._.map !== 'function') window._.map = (list, fn) => (Array.isArray(list) ? list.map(fn) : Object.keys(list || {}).map((k) => fn(list[k], k)));
    if (typeof window._.filter !== 'function') window._.filter = (list, fn) => (Array.isArray(list) ? list.filter(fn) : []);
    if (typeof window._.forEach !== 'function') {
      window._.forEach = (list, fn) => {
        if (Array.isArray(list)) list.forEach((v, i) => fn(v, i));
        else if (list && typeof list === 'object') Object.keys(list).forEach((k) => fn(list[k], k));
        return list;
      };
    }
    if (typeof window._.each !== 'function') window._.each = window._.forEach;
    if (typeof window._.sortBy !== 'function') {
      window._.sortBy = (list, iteratee) => {
        const getter = typeof iteratee === 'function'
          ? iteratee
          : (v) => (v && typeof v === 'object' ? v[iteratee] : undefined);
        return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
          const av = getter(a);
          const bv = getter(b);
          if (av > bv) return 1;
          if (av < bv) return -1;
          return 0;
        });
      };
    }
    if (typeof window._.sortedUniq !== 'function') {
      window._.sortedUniq = (list) => {
        const out = [];
        (Array.isArray(list) ? list : []).forEach((v) => {
          if (!out.some((x) => x === v)) out.push(v);
        });
        return out;
      };
    }
    if (typeof window._.uniq !== 'function') window._.uniq = (list) => window._.sortedUniq(list);
    if (typeof window._.find !== 'function') window._.find = (list, fn) => (Array.isArray(list) ? list.find(fn) : undefined);
    if (typeof window._.some !== 'function') {
      window._.some = (list, fn) => (Array.isArray(list) ? list.some(fn) : Object.keys(list || {}).some((k) => fn(list[k], k)));
    }
    if (typeof window._.every !== 'function') {
      window._.every = (list, fn) => (Array.isArray(list) ? list.every(fn) : Object.keys(list || {}).every((k) => fn(list[k], k)));
    }
    if (typeof window._.includes !== 'function') {
      window._.includes = (list, value) => {
        if (typeof list === 'string') return list.includes(String(value));
        if (Array.isArray(list)) return list.includes(value);
        if (list && typeof list === 'object') return Object.values(list).includes(value);
        return false;
      };
    }
    if (typeof window._.findLast !== 'function') {
      window._.findLast = (list, fn) => {
        if (!Array.isArray(list)) return undefined;
        for (let i = list.length - 1; i >= 0; i -= 1) {
          if (fn(list[i], i)) return list[i];
        }
        return undefined;
      };
    }
    if (typeof window._.range !== 'function') {
      window._.range = (start, end, step = 1) => {
        let s = Number(start);
        let e = Number(end);
        if (!Number.isFinite(e)) {
          e = s;
          s = 0;
        }
        const st = Number(step) || 1;
        const out = [];
        if (st > 0) for (let i = s; i < e; i += st) out.push(i);
        else for (let i = s; i > e; i += st) out.push(i);
        return out;
      };
    }
    if (typeof window._.times !== 'function') {
      window._.times = (n, fn) => {
        const len = Math.max(0, Number(n) || 0);
        const out = [];
        for (let i = 0; i < len; i += 1) out.push(typeof fn === 'function' ? fn(i) : undefined);
        return out;
      };
    }
    if (typeof window._.constant !== 'function') window._.constant = (v) => () => v;
    if (typeof window._.keys !== 'function') window._.keys = (obj) => Object.keys(obj || {});
    if (typeof window._.values !== 'function') window._.values = (obj) => Object.values(obj || {});
    if (typeof window._.size !== 'function') {
      window._.size = (obj) => {
        if (obj == null) return 0;
        if (typeof obj === 'string' || Array.isArray(obj)) return obj.length;
        if (typeof obj === 'object') return Object.keys(obj).length;
        return 0;
      };
    }
    if (typeof window._.debounce !== 'function') {
      window._.debounce = (fn, wait = 0) => {
        let timer = 0;
        return (...args) => {
          clearTimeout(timer);
          timer = setTimeout(() => fn(...args), Number(wait) || 0);
        };
      };
    }
    if (typeof window._.throttle !== 'function') {
      window._.throttle = (fn, wait = 0) => {
        let last = 0;
        let timer = 0;
        return (...args) => {
          const now = Date.now();
          const gap = Number(wait) || 0;
          if (now - last >= gap) {
            last = now;
            fn(...args);
            return;
          }
          clearTimeout(timer);
          timer = setTimeout(() => {
            last = Date.now();
            fn(...args);
          }, Math.max(0, gap - (now - last)));
        };
      };
    }
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
    if (typeof window._.has !== 'function') window._.has = (obj, path) => window._.get(obj, path, undefined) !== undefined;
    if (typeof window._.unset !== 'function') {
      window._.unset = (obj, path) => {
        const parts = toPath(path);
        if (!parts.length) return false;
        let cur = obj;
        for (let i = 0; i < parts.length - 1; i += 1) {
          const key = parts[i];
          if (!cur || typeof cur !== 'object') return false;
          cur = cur[key];
        }
        if (!cur || typeof cur !== 'object') return false;
        return delete cur[parts[parts.length - 1]];
      };
    }
    if (typeof window._.cloneDeep !== 'function') {
      window._.cloneDeep = (v) => {
        try { return structuredClone(v); } catch {}
        try { return JSON.parse(JSON.stringify(v)); } catch {}
        return v;
      };
    }
    if (typeof window._.clone !== 'function') {
      window._.clone = (v) => {
        if (Array.isArray(v)) return v.slice();
        if (v && typeof v === 'object') return { ...v };
        return v;
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
    if (typeof window._.merge !== 'function') {
      window._.merge = (object, ...rest) => window._.mergeWith(object, ...rest);
    }
    if (typeof window._.defaults !== 'function') {
      window._.defaults = (object, ...sources) => {
        const out = object && typeof object === 'object' ? object : {};
        sources.forEach((src) => {
          if (!src || typeof src !== 'object') return;
          Object.keys(src).forEach((k) => {
            if (out[k] === undefined) out[k] = src[k];
          });
        });
        return out;
      };
    }
    if (typeof window._.defaultsDeep !== 'function') {
      window._.defaultsDeep = (object, ...sources) => {
        const out = object && typeof object === 'object' ? object : {};
        sources.forEach((src) => {
          if (!src || typeof src !== 'object') return;
          Object.keys(src).forEach((k) => {
            const cur = out[k];
            const next = src[k];
            if (cur === undefined) out[k] = Array.isArray(next) ? next.slice() : (window._.isPlainObject(next) ? { ...next } : next);
            else if (window._.isPlainObject(cur) && window._.isPlainObject(next)) window._.defaultsDeep(cur, next);
          });
        });
        return out;
      };
    }
    if (typeof window._.mapValues !== 'function') {
      window._.mapValues = (obj, fn) => {
        const out = {};
        Object.keys(obj || {}).forEach((k) => { out[k] = fn(obj[k], k); });
        return out;
      };
    }
    if (typeof window._.groupBy !== 'function') {
      window._.groupBy = (list, iteratee) => {
        const out = {};
        const getter = typeof iteratee === 'function'
          ? iteratee
          : (v) => (v && typeof v === 'object' ? v[iteratee] : v);
        (Array.isArray(list) ? list : []).forEach((item, idx) => {
          const key = String(getter(item, idx));
          if (!out[key]) out[key] = [];
          out[key].push(item);
        });
        return out;
      };
    }
    if (typeof window._.flatten !== 'function') window._.flatten = (list) => (Array.isArray(list) ? list.flat(1) : []);
    if (typeof window._.flattenDeep !== 'function') window._.flattenDeep = (list) => (Array.isArray(list) ? list.flat(Infinity) : []);
    if (typeof window._.uniqBy !== 'function') {
      window._.uniqBy = (list, iteratee) => {
        const getter = typeof iteratee === 'function'
          ? iteratee
          : (v) => (v && typeof v === 'object' ? v[iteratee] : v);
        const seen = new Set();
        const out = [];
        (Array.isArray(list) ? list : []).forEach((item) => {
          const key = getter(item);
          if (seen.has(key)) return;
          seen.add(key);
          out.push(item);
        });
        return out;
      };
    }
    if (typeof window._.pick !== 'function') {
      window._.pick = (obj, keys) => {
        const out = {};
        (Array.isArray(keys) ? keys : []).forEach((k) => {
          if (obj && Object.prototype.hasOwnProperty.call(obj, k)) out[k] = obj[k];
        });
        return out;
      };
    }
    if (typeof window._.omit !== 'function') {
      window._.omit = (obj, keys) => {
        const deny = new Set(Array.isArray(keys) ? keys : []);
        const out = {};
        Object.keys(obj || {}).forEach((k) => { if (!deny.has(k)) out[k] = obj[k]; });
        return out;
      };
    }
    if (typeof window._.toNumber !== 'function') window._.toNumber = (v) => Number(v);
    if (typeof window._.trim !== 'function') window._.trim = (v) => String(v ?? '').trim();
    if (typeof window._.split !== 'function') window._.split = (v, sep, limit) => String(v ?? '').split(sep, limit);
    if (!(window._ && window._.__chatappProbe)) {
      const seen = new Set();
      const missingLimit = 24;
      const target = window._;
      window._ = new Proxy(target, {
        get(obj, prop, receiver) {
          if (Reflect.has(obj, prop)) return Reflect.get(obj, prop, receiver);
          if (typeof prop === 'string' && prop && !prop.startsWith('__') && seen.size < missingLimit) {
            seen.add(prop);
            log('warn', 'lodash-missing-method-access name=' + prop);
          }
          return undefined;
        },
      });
      window._.__chatappProbe = true;
      log('info', 'lodash-shim-fallback');
    }
  }
  if (typeof window.errorCatched !== 'function') {
    window.errorCatched = (fn) => (...args) => {
      try { return fn?.(...args); } catch (err) { console.error(err); }
    };
  }
  try {
    window.eval('var $ = window.$; var jQuery = window.jQuery; var _ = window._; var z = window.z; var Zod = window.Zod; var getVariables = window.getVariables; var getCurrentMessageId = window.getCurrentMessageId; var getChatMessages = window.getChatMessages; var getChatMessage = window.getChatMessage; var getContext = window.getContext; var setChatMessage = window.setChatMessage; var setChatMessages = window.setChatMessages; var insertOrAssignVariables = window.insertOrAssignVariables; var deleteVariable = window.deleteVariable; var errorCatched = window.errorCatched;');
  } catch {}
  if (typeof window.$ === 'function') log('info', 'dollar-shim-ready');
  else log('warn', 'dollar-shim-missing');
})();
</script>`;
};

const LAZY_RICH_ROOT_MARGIN = '360px 0px';
const lazyRichObserverRoots = new WeakMap();
const lazyRichPendingMounts = new WeakMap();
const lazyRichMountQueue = [];
let lazyRichViewportObserver = null;
let lazyRichMountRaf = 0;

const buildLazyRichPlaceholder = (onActivate) => {
    const wrap = document.createElement('div');
    wrap.className = 'chat-lazy-rich-placeholder';
    wrap.style.cssText = [
        'display:flex',
        'align-items:center',
        'justify-content:space-between',
        'gap:12px',
        'padding:12px 14px',
        'min-height:84px',
        'background:linear-gradient(180deg, rgba(248,250,252,0.96), rgba(241,245,249,0.96))',
        'color:#0f172a',
    ].join(';');

    const textWrap = document.createElement('div');
    textWrap.style.cssText = 'display:flex; flex-direction:column; gap:4px; min-width:0;';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:13px; font-weight:700;';
    title.textContent = '复杂卡片待加载';
    const desc = document.createElement('div');
    desc.style.cssText = 'font-size:12px; line-height:1.45; color:#475569;';
    desc.textContent = '滚动到可见区域会自动加载；点击右侧也可立即展开。';
    textWrap.appendChild(title);
    textWrap.appendChild(desc);

    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = '立即加载';
    button.style.cssText = [
        'flex:0 0 auto',
        'border:1px solid rgba(15,23,42,0.14)',
        'background:#fff',
        'color:#0f172a',
        'border-radius:10px',
        'padding:8px 12px',
        'font-size:12px',
        'font-weight:600',
        'cursor:pointer',
    ].join(';');
    button.addEventListener('click', (event) => {
        try { event.preventDefault(); } catch {}
        try { event.stopPropagation(); } catch {}
        onActivate?.();
    });

    wrap.appendChild(textWrap);
    wrap.appendChild(button);
    return wrap;
};

const drainLazyRichMountQueue = () => {
    lazyRichMountRaf = 0;
    const batch = lazyRichMountQueue.splice(0, 2);
    batch.forEach((containerEl) => {
        const pending = lazyRichPendingMounts.get(containerEl);
        if (!pending || pending.mounted) return;
        pending.queued = false;
        pending.mounted = true;
        if (pending.observer) {
            try { pending.observer.unobserve(containerEl); } catch {}
        }
        pending.observer = null;
        if (!containerEl || !containerEl.isConnected) {
            lazyRichPendingMounts.delete(containerEl);
            return;
        }
        const options = pending.options || {};
        const text = pending.text;
        lazyRichPendingMounts.delete(containerEl);
        renderRichText(containerEl, text, { ...options, lazyMount: false });
    });
    if (lazyRichMountQueue.length) {
        lazyRichMountRaf = requestAnimationFrame(drainLazyRichMountQueue);
    }
};

const enqueueLazyRichMount = (containerEl, { immediate = false } = {}) => {
    const pending = lazyRichPendingMounts.get(containerEl);
    if (!pending || pending.mounted) return;
    if (immediate) {
        lazyRichMountQueue.unshift(containerEl);
        if (!lazyRichMountRaf) drainLazyRichMountQueue();
        return;
    }
    if (pending.queued) return;
    pending.queued = true;
    lazyRichMountQueue.push(containerEl);
    if (!lazyRichMountRaf) {
        lazyRichMountRaf = requestAnimationFrame(drainLazyRichMountQueue);
    }
};

const getLazyRichObserver = (rootEl = null) => {
    if (typeof IntersectionObserver === 'undefined') return null;
    if (!rootEl) {
        if (!lazyRichViewportObserver) {
            lazyRichViewportObserver = new IntersectionObserver((entries) => {
                entries.forEach((entry) => {
                    if (!entry?.isIntersecting && !(entry?.intersectionRatio > 0)) return;
                    enqueueLazyRichMount(entry.target);
                });
            }, { root: null, rootMargin: LAZY_RICH_ROOT_MARGIN, threshold: 0.01 });
        }
        return lazyRichViewportObserver;
    }
    if (lazyRichObserverRoots.has(rootEl)) return lazyRichObserverRoots.get(rootEl);
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry?.isIntersecting && !(entry?.intersectionRatio > 0)) return;
            enqueueLazyRichMount(entry.target);
        });
    }, { root: rootEl, rootMargin: LAZY_RICH_ROOT_MARGIN, threshold: 0.01 });
    lazyRichObserverRoots.set(rootEl, observer);
    return observer;
};

const cancelLazyRichMount = (containerEl) => {
    const pending = lazyRichPendingMounts.get(containerEl);
    if (!pending) return;
    if (pending.observer) {
        try { pending.observer.unobserve(containerEl); } catch {}
    }
    lazyRichPendingMounts.delete(containerEl);
};

const shouldLazyMountRichText = (text) => {
    const raw = String(text || '');
    if (!raw) return false;
    return /```|<(style|details|div|body|html|table|section|article|main|svg|iframe|script)\b|&lt;(style|details|div|body|html|table|section|article|main|svg|iframe|script)\b/i.test(raw);
};

const scheduleLazyRichMount = (containerEl, text, options = {}) => {
    if (!containerEl) return;
    cancelLazyRichMount(containerEl);
    containerEl.innerHTML = '';
    const placeholder = buildLazyRichPlaceholder(() => enqueueLazyRichMount(containerEl, { immediate: true }));
    containerEl.appendChild(placeholder);
    const rootEl = containerEl.closest?.('#chat-scroll') || null;
    const observer = getLazyRichObserver(rootEl);
    const pending = {
        text: String(text ?? ''),
        options: { ...options },
        observer,
        mounted: false,
        queued: false,
    };
    lazyRichPendingMounts.set(containerEl, pending);
    if (observer) {
        observer.observe(containerEl);
        return;
    }
    enqueueLazyRichMount(containerEl);
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
    const hasInteractiveHtml = hasInteractiveHtmlHint(code);
    const shouldRenderScopedFragment = shouldRenderHtml && !hasInteractiveHtml && !looksLikeHtmlDoc;
    const directBodyLoadUrl = shouldRenderHtml ? detectBodyLoadUrl(code) : '';
    const forceMvuCompat = Boolean(directBodyLoadUrl);
    const needsMvuCompat = allowScripts && (forceMvuCompat || shouldEnableMvuCompat(code));
    const needsFrameworkShim = allowScripts && shouldInjectFrameworkShim(code, { directLoad: Boolean(directBodyLoadUrl) });
    const resolvedSessionId = (() => {
        try {
            const explicitSid = String(sessionId || '').trim();
            if (explicitSid) return explicitSid;
            const mid = String(messageId || '').trim();
            const store = window.appBridge?.chatStore;
            const currentSid = String(store?.getCurrent?.() || window.appBridge?.activeSessionId || '').trim();
            if (!store || !mid) return currentSid;
            if (currentSid && store.findMessage?.(mid, currentSid)) return currentSid;
            const sessionIds = Array.isArray(store.listSessions?.()) ? store.listSessions() : [];
            for (const id of sessionIds) {
                const sid = String(id || '').trim();
                if (!sid) continue;
                if (store.findMessage?.(mid, sid)) return sid;
            }
            return currentSid;
        } catch {
            return String(sessionId || window.appBridge?.activeSessionId || '').trim();
        }
    })();
    const messageIndex = (() => {
        try {
            const sid = String(resolvedSessionId || '').trim();
            const mid = String(messageId || '').trim();
            const store = window.appBridge?.chatStore;
            if (!store || !sid || !mid) return null;
            const list = Array.isArray(store.getMessages?.(sid)) ? store.getMessages(sid) : [];
            const idx = list.findIndex((item) => String(item?.id || '').trim() === mid);
            return idx >= 0 ? idx : null;
        } catch {
            return null;
        }
    })();
    const compatSeedMessages = (() => {
        try {
            const sid = String(resolvedSessionId || '').trim();
            const mid = String(messageId || '').trim();
            const store = window.appBridge?.chatStore;
            if (!store || !sid || !mid) return [];
            const msg = store.findMessage?.(mid, sid);
            if (!msg) return [];
            const idx = Number.isInteger(messageIndex) ? messageIndex : null;
            const text =
                String(
                    (typeof msg.rawSource === 'string' && msg.rawSource) ||
                    (typeof msg.raw_source === 'string' && msg.raw_source) ||
                    (typeof msg.rawOriginal === 'string' && msg.rawOriginal) ||
                    (typeof msg.raw === 'string' && msg.raw) ||
                    (typeof msg.content === 'string' && msg.content) ||
                    ''
                );
            return [{
                id: mid,
                message_id: idx !== null ? idx : mid,
                role: String(msg.role || 'assistant'),
                message: text,
                data: msg?.data && typeof msg.data === 'object' ? msg.data : {},
                extra: msg?.extra && typeof msg.extra === 'object' ? msg.extra : {},
                name: String(msg?.name || ''),
                is_hidden: Boolean(msg?.is_system || msg?.isHidden),
            }];
        } catch {
            return [];
        }
    })();
    const compatSeedVars = (() => {
        try {
            const sid = String(resolvedSessionId || window.appBridge?.activeSessionId || '').trim();
            const store = window.appBridge?.chatStore;
            if (!store || !sid) return null;
            const localVars = store?.listVariables?.(sid) || {};
            const globalVars = store?.listGlobalVariables?.() || {};
            const isShared = window.appBridge?.isSharedVariableSession
                ? Boolean(window.appBridge.isSharedVariableSession(sid))
                : false;
            const baseVars = isShared ? globalVars : localVars;
            const variableContext = buildVariableContext({ baseVars, globalVars, localVars }).variableContext;
            return pickMvuCompatSeedVars(variableContext);
        } catch {
            return null;
        }
    })();
    if (debugTag === 'rp-greeting' && !String(sessionId || '').trim() && resolvedSessionId) {
        const sidMsg = `rp-greeting session-fallback sid=${resolvedSessionId}`;
        emitDebugLog({ source: 'rich', type: 'info', message: sidMsg, force: true });
        logger.info(`[rich] ${sidMsg}`);
    }
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
            const msg = `codeblock html?=${shouldRenderHtml} fragment=${shouldRenderScopedFragment ? 1 : 0} lang=${lang || 'none'} len=${String(code || '').length} msg=${String(messageId || '')} scripts=${allowScripts ? 1 : 0} mvu=${needsMvuCompat ? 1 : 0} forceMvu=${forceMvuCompat ? 1 : 0}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: shouldRenderHtml ? 'info' : 'warn', message: msg, force: true });
            logger.info(`[rich] ${msg}`);
            const compatMsg = `compat-profile=${sourceCompat.profile} flags=${summarizeCompatFlags(sourceCompat.flags) || 'none'}${debugTag ? ` tag=${debugTag}` : ''}`;
            emitDebugLog({ source: 'rich', type: 'info', message: compatMsg, force: true });
            logger.info(`[rich] ${compatMsg}`);
            if (debugTag === 'rp-greeting') {
                const importUrlSet = new Set();
                const codeText = String(code || '');
                const scriptSrcList = Array.from(codeText.matchAll(/<script\b[^>]*\bsrc\s*=\s*["']([^"']+)["'][^>]*>/gi))
                    .map((m) => String(m?.[1] || '').trim())
                    .filter(Boolean);
                const inlineScriptList = Array.from(codeText.matchAll(/<script\b(?![^>]*\bsrc\s*=)[^>]*>([\s\S]*?)<\/script>/gi))
                    .map((m) => String(m?.[1] || '').trim())
                    .filter(Boolean);
                const contentMatch = codeText.match(/<content>([\s\S]*?)<\/content>/i);
                const contentBlock = contentMatch ? String(contentMatch[1] || '') : '';
                const contentHasBr = /<br\s*\/?>/i.test(contentBlock) ? 1 : 0;
                const contentLineCount = contentBlock
                    ? contentBlock.split(/\r?\n/).filter((line) => String(line || '').trim().length > 0).length
                    : 0;
                const narrationCount = (contentBlock.match(/\[旁白\]\|/g) || []).length;
                const importFromRe = /\bimport\s*(?:[\w*\s{},]*?\sfrom\s*)?["']([^"']+)["']/g;
                const dynamicImportRe = /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g;
                let importMatch;
                while ((importMatch = importFromRe.exec(codeText))) {
                    const u = String(importMatch[1] || '').trim();
                    if (u) importUrlSet.add(u);
                }
                while ((importMatch = dynamicImportRe.exec(codeText))) {
                    const u = String(importMatch[1] || '').trim();
                    if (u) importUrlSet.add(u);
                }
                const importUrls = Array.from(importUrlSet);
                const preview = String(code || '')
                    .replace(/\s+/g, ' ')
                    .slice(0, 220);
                const probeMsg =
                    `html-probe len=${String(code || '').length}` +
                    ` hasContentTag=${/<\s*content\b/i.test(code) ? 1 : 0}` +
                    ` hasStateBar=${/<\s*state_bar\b/i.test(code) ? 1 : 0}` +
                    ` hasNarration=${/\[旁白\]\|/.test(code) ? 1 : 0}` +
                    ` usesGetChatMessages=${/getChatMessages\s*\(/.test(code) ? 1 : 0}` +
                    ` usesGetChatMessage=${/getChatMessage\s*\(/.test(code) ? 1 : 0}` +
                    ` usesGetContext=${/getContext\s*\(/.test(code) ? 1 : 0}` +
                    ` usesSetChatMessage=${/setChatMessage\s*\(/.test(code) ? 1 : 0}` +
                    ` usesLodash=${/\b_\s*\./.test(code) ? 1 : 0}` +
                    ` importUrlCount=${importUrls.length}` +
                    ` scriptSrcCount=${scriptSrcList.length}` +
                    ` inlineScriptCount=${inlineScriptList.length}` +
                    ` contentBlockLen=${contentBlock.length}` +
                    ` contentHasBr=${contentHasBr}` +
                    ` contentLineCount=${contentLineCount}` +
                    ` narrationCount=${narrationCount}` +
                    ` tag=${debugTag}`;
                emitDebugLog({ source: 'rich', type: 'info', message: probeMsg, force: true });
                logger.info(`[rich] ${probeMsg}`);
                if (importUrls.length) {
                    const importMsg = `html-import-urls ${importUrls.slice(0, 6).join(' | ')}${importUrls.length > 6 ? ' | ...' : ''} tag=${debugTag}`;
                    emitDebugLog({ source: 'rich', type: 'info', message: importMsg, force: true });
                    logger.info(`[rich] ${importMsg}`);
                }
                if (scriptSrcList.length) {
                    const srcMsg = `html-script-src ${scriptSrcList.slice(0, 6).join(' | ')}${scriptSrcList.length > 6 ? ' | ...' : ''} tag=${debugTag}`;
                    emitDebugLog({ source: 'rich', type: 'info', message: srcMsg, force: true });
                    logger.info(`[rich] ${srcMsg}`);
                }
                if (inlineScriptList.length) {
                    const inlinePreview = inlineScriptList[0].replace(/\s+/g, ' ').slice(0, 180);
                    const inlineMsg = `html-inline-script-preview ${inlinePreview}${inlineScriptList[0].length > 180 ? '...' : ''} tag=${debugTag}`;
                    emitDebugLog({ source: 'rich', type: 'info', message: inlineMsg, force: true });
                    logger.info(`[rich] ${inlineMsg}`);
                }
                if (preview) {
                    const previewMsg = `html-preview ${preview}${String(code || '').length > 220 ? '...' : ''} tag=${debugTag}`;
                    emitDebugLog({ source: 'rich', type: 'info', message: previewMsg, force: true });
                    logger.info(`[rich] ${previewMsg}`);
                }
            }
            if (directBodyLoadUrl) {
                const bodyLoadMsg = `body-load-detected url=${directBodyLoadUrl}${debugTag ? ` tag=${debugTag}` : ''}`;
                emitDebugLog({ source: 'rich', type: 'info', message: bodyLoadMsg, force: true });
                logger.info(`[rich] ${bodyLoadMsg}`);
            }
        }
    }
    if (shouldRenderScopedFragment) {
        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'background:#fff; padding:12px 14px;';
        const rendered = renderScopedRichFragment(previewWrap, code, {
            messageId: String(messageId || 'code'),
            resolveStatusCard: null,
            allowStatusCards: false,
            debugTag,
            source: 'codeblock',
        });
        if (rendered) {
            wrap.appendChild(previewWrap);
            return wrap;
        }
    }
    if (shouldRenderHtml) {
        const previewWrap = document.createElement('div');
        previewWrap.style.cssText = 'background:#fff;';
        const iframe = document.createElement('iframe');
        const iframeId = `msg-${String(messageId || 'x')}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
        iframe.dataset.iframeId = iframeId;
        iframe.dataset.msgId = String(messageId || '');
        if (resolvedSessionId) iframe.dataset.sessionId = String(resolvedSessionId || '');
        iframe.dataset.iframeSource = 'host';
        iframe.dataset.iframeAllowScripts = allowScripts ? '1' : '0';
        iframe.dataset.iframeMvuCompat = needsMvuCompat ? '1' : '0';
        iframe.dataset.iframeAuthority = IFRAME_AUTHORITY_HOST;
        iframe.dataset.iframeLock = '0';
        iframe.dataset.iframeMode = 'document';
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
            lastSeq: -1,
            lastResizeSource: '',
            lastResizeMode: 'document',
            lastRawHeight: 0,
            lastAppliedHeight: 0,
            authority: IFRAME_AUTHORITY_HOST,
            lock: false,
            heightHistory: [],
            pressCount: 0,
            lastPressAt: 0,
            error: '',
        });

        // Keep full HTML documents byte-stable: injecting <br> into text nodes can
        // break card scripts that parse <content>/<state_bar> by raw line breaks.
        let html = (preserveHtmlNewlines && !looksLikeHtmlDoc) ? injectHtmlNewlines(code) : code;
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
        const dollarShim = allowScripts
            ? buildDollarGlobalShim({
                iframeId,
                debugTag,
                appOrigin: window.location.origin,
                needsZodShim,
                messageId,
                messageIndex,
                seedMessages: compatSeedMessages,
            })
            : '';
        const frameworkShim = (allowScripts && !useLegacyMvuBridge && needsFrameworkShim)
            ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: vueRuntimePreference, appOrigin: window.location.origin })
            : '';
        const mvuCompatBridge = needsMvuCompat
            ? mvuBridgeBuilder({ iframeId, sessionId: resolvedSessionId, debugTag, messageId, messageIndex, seedVars: compatSeedVars || {} })
            : '';
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
                        messageId,
                        messageIndex,
                        seedMessages: compatSeedMessages,
                    });
                    const directNeedsFrameworkShim = shouldInjectFrameworkShim(directHtml, { directLoad: true });
                    const directVueRuntimePreference = detectVueRuntimePreference(directHtml);
                    const directFrameworkShim = directNeedsFrameworkShim
                        ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: directVueRuntimePreference, appOrigin: window.location.origin })
                        : '';
                    const directMvuBridge = needsMvuCompat
                        ? buildMvuCompatBridge({ iframeId, sessionId: resolvedSessionId, debugTag, messageId, messageIndex, seedVars: compatSeedVars || {} })
                        : '';
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
                        messageId,
                        messageIndex,
                        seedMessages: compatSeedMessages,
                    });
                    const directNeedsFrameworkShim = shouldInjectFrameworkShim(directHtml, { directLoad: true });
                    const directVueRuntimePreference = detectVueRuntimePreference(directHtml);
                    const directFrameworkShim = directNeedsFrameworkShim
                        ? buildFrameworkGlobalShim({ iframeId, debugTag, vueMajor: directVueRuntimePreference, appOrigin: window.location.origin })
                        : '';
                    const directMvuBridge = needsMvuCompat
                        ? buildMvuCompatBridge({ iframeId, sessionId: resolvedSessionId, debugTag, messageId, messageIndex, seedVars: compatSeedVars || {} })
                        : '';
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
                applyIframeBlankFallbackIfNeeded(iframe, iframeId, 'iframe-load-error', {
                    assumeBlank: true,
                    requireLoaded: false,
                });
            });
        }

        wrap.appendChild(previewWrap);
        // Match ST 酒馆助手体验：渲染后不显示源码（源码/复制转移到长按菜单）

        // 回退观测：脚本桥未就绪时，仍尝试本地测高与长按转发。
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            const st = getIframeState(iframeId);
            if (st && st.authority && st.authority !== IFRAME_AUTHORITY_HOST) return;
            if (st && st.lock) return;
            if (iframe.dataset.iframeLoaded !== '1') return;
            if (!(st && st.lastResizeAt) && !iframe.dataset.iframePostResizeAt) {
                observeIframeContent(iframe);
            }
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
            if (!st.readyAt && !st.lastResizeAt) {
                const reason = 'no-ready-after-2s+no-resize-after-2s';
                applyIframeBlankFallbackIfNeeded(iframe, iframeId, reason, {
                    requireLoaded: true,
                    tryDirectRecover: true,
                });
            }
            if (
                iframe.dataset.iframeReady !== '1' &&
                iframe.dataset.iframeLoaded === '1' &&
                !(st.authority && st.authority !== IFRAME_AUTHORITY_HOST) &&
                !st.lock
            ) {
                observeIframeContent(iframe);
                bindIframeDocumentPressFallback(iframe, iframeId);
            }
        }, 2000);
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            if (iframe.dataset.iframeReady === '1') {
                try { iframe.contentWindow?.postMessage({ type: 'chatapp:ping' }, '*'); } catch {}
            }
        }, 2200);
        setTimeout(() => {
            if (!isLiveIframe(iframe, iframeId)) return;
            applyIframeBlankFallbackIfNeeded(iframe, iframeId, 'post-load-blank-probe', {
                requireLoaded: true,
                tryDirectRecover: true,
            });
        }, 3200);

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
    const applyIncomingResizeMessage = (iframe, data, { sourceFallback = 'bridge' } = {}) => {
        if (!iframe || !data || typeof data !== 'object') return false;
        const rawHeight = Number(data.height ?? data.newHeight);
        if (!Number.isFinite(rawHeight)) return false;
        return applyIframeResizeUpdate(iframe, {
            rawHeight,
            source: normalizeHeightSource(data.source || sourceFallback),
            mode: normalizeHeightMode(data.mode || 'document'),
            seq: data.seq,
            lock: Boolean(data.lock),
            unlock: Boolean(data.unlock),
            ts: data.ts,
        });
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
        const variableContext = buildVariableContext({ baseVars, globalVars, localVars }).variableContext;
        return pickMvuCompatSeedVars(variableContext);
    };
    const isCompatValueEqual = (left, right) => {
        if (Object.is(left, right)) return true;
        if (typeof left !== typeof right) return false;
        if (!left || !right || typeof left !== 'object') return false;
        try {
            return JSON.stringify(left) === JSON.stringify(right);
        } catch {
            return false;
        }
    };
    const resolveCompatVariableStoreScope = (sessionId, options = {}) => {
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        const type = normalizeMvuCompatOptionType(options);
        if (type === 'global') return 'global';
        if (type === 'local') return 'local';
        const shared = sid && window.appBridge?.isSharedVariableSession
            ? Boolean(window.appBridge.isSharedVariableSession(sid))
            : false;
        return shared ? 'global' : 'local';
    };
    const buildCompatVarsSnapshot = (sessionId, scopeType = 'local') => {
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        const store = window.appBridge?.chatStore;
        const globalVars = store?.listGlobalVariables?.() || {};
        const localVars = sid ? (store?.listVariables?.(sid) || {}) : {};
        const baseVars = scopeType === 'global' ? globalVars : localVars;
        const variableContext = buildVariableContext({ baseVars, globalVars, localVars }).variableContext;
        return pickMvuCompatSeedVars(variableContext);
    };
    const syncCompatScopedVariablesToStore = (scopeType, nextScoped, sessionId) => {
        const store = window.appBridge?.chatStore;
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        if (!store) return false;
        if (scopeType !== 'global' && !sid) return false;
        const currentFlat = scopeType === 'global'
            ? (store.listGlobalVariables?.() || {})
            : (store.listVariables?.(sid) || {});
        const nextFlat = flattenMvuCompatVariables(nextScoped);
        const keys = new Set([...Object.keys(currentFlat), ...Object.keys(nextFlat)]);
        let changed = false;
        keys.forEach((key) => {
            const name = String(key || '').trim();
            if (!name) return;
            const hasNext = Object.prototype.hasOwnProperty.call(nextFlat, name);
            const hasCurrent = Object.prototype.hasOwnProperty.call(currentFlat, name);
            if (!hasNext) {
                const ok = scopeType === 'global'
                    ? store.deleteGlobalVariable?.(name)
                    : store.deleteVariable?.(name, sid);
                changed = Boolean(ok) || changed;
                return;
            }
            const nextValue = cloneMvuCompatValue(nextFlat[name]);
            if (hasCurrent && isCompatValueEqual(currentFlat[name], nextValue)) return;
            const ok = scopeType === 'global'
                ? store.setGlobalVariable?.(name, nextValue)
                : store.setVariable?.(name, nextValue, sid);
            changed = Boolean(ok) || changed;
        });
        return changed;
    };
    const applyCompatVariableMutation = ({ sessionId, mode, payload, key, options = {} }) => {
        const sid = String(sessionId || window.appBridge?.activeSessionId || '').trim();
        const scopeType = resolveCompatVariableStoreScope(sid, options);
        const currentVars = collectMvuVars(sid) || buildCompatVarsSnapshot(sid, scopeType);
        const currentScoped = getMvuCompatScopedVariables(currentVars, { type: scopeType });
        let nextVars = currentVars;
        if (mode === 'replace') {
            nextVars = replaceMvuCompatScopedVariables(currentVars, payload, { type: scopeType });
        } else if (mode === 'merge') {
            nextVars = mergeMvuCompatScopedVariables(currentVars, payload, { type: scopeType });
        } else if (mode === 'delete') {
            nextVars = deleteMvuCompatScopedVariable(currentVars, key, { type: scopeType });
        }
        const nextScoped = getMvuCompatScopedVariables(nextVars, { type: scopeType });
        const changed = syncCompatScopedVariablesToStore(scopeType, nextScoped, sid);
        const vars = collectMvuVars(sid) || buildCompatVarsSnapshot(sid, scopeType);
        return {
            ok: true,
            changed,
            deleted: mode === 'delete' ? !isCompatValueEqual(currentScoped, nextScoped) : undefined,
            scopeType,
            vars,
        };
    };
    const postMvuVarsToIframe = (iframe, sessionId) => {
        if (!iframe || iframe.dataset.iframeMvuCompat !== '1' || iframe.dataset.iframeAllowScripts !== '1') return;
        const iframeId = String(iframe.dataset.iframeId || '');
        const sid = String(sessionId || iframe.dataset.sessionId || window.appBridge?.activeSessionId || '').trim();
        if (!sid) {
            emitDebugLog({
                source: 'iframe',
                type: 'warn',
                message: `mvu-vars-skip id=${iframeId || 'unknown'} reason=no-session`,
            });
            return;
        }
        const vars = collectMvuVars(sid);
        if (!vars) {
            emitDebugLog({
                source: 'iframe',
                type: 'warn',
                message: `mvu-vars-skip id=${iframeId || 'unknown'} sid=${sid} reason=no-vars`,
            });
            return;
        }
        try {
            iframe.contentWindow?.postMessage({
                type: 'chatapp:mvu-vars',
                id: iframeId,
                sessionId: sid,
                vars,
            }, '*');
            const keyCount = Object.keys((vars && vars.stat_data) || {}).length;
            emitDebugLog({
                source: 'iframe',
                type: 'info',
                message: `mvu-vars-posted id=${iframeId || 'unknown'} sid=${sid} keys=${keyCount}`,
            });
        } catch (err) {
            const msg = err?.message ? String(err.message) : String(err || 'post-failed');
            emitDebugLog({
                source: 'iframe',
                type: 'warn',
                message: `mvu-vars-post-failed id=${iframeId || 'unknown'} sid=${sid} err=${msg}`,
            });
        }
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
    const normalizeCompatFieldValues = (input) => {
        if (typeof input === 'string') return { message: input };
        if (!input || typeof input !== 'object') return {};
        return { ...input };
    };
    const resolveCompatSessionId = (iframe, sessionId) => {
        const sid = String(sessionId || iframe?.dataset?.sessionId || window.appBridge?.activeSessionId || '').trim();
        return sid;
    };
    const resolveCompatMessageId = (sessionId, rawRef, fallbackRef = '') => {
        const sid = String(sessionId || '').trim();
        const store = window.appBridge?.chatStore;
        const fallback = String(fallbackRef || '').trim();
        const ref = String(rawRef ?? '').trim();
        if (!store || !sid) return ref || fallback;
        const pickByNumericIndex = (raw) => {
            const num = Number(raw);
            if (!Number.isFinite(num) || !Number.isInteger(num)) return '';
            const list = Array.isArray(store.getMessages?.(sid)) ? store.getMessages(sid) : [];
            if (!list.length) return '';
            const idx = num < 0 ? list.length + num : num;
            if (idx < 0 || idx >= list.length) return '';
            return String(list[idx]?.id || '').trim();
        };
        if (ref) {
            const direct = store.findMessage?.(ref, sid);
            if (direct) return ref;
            const byIndex = pickByNumericIndex(ref);
            if (byIndex) return byIndex;
            return ref;
        }
        if (fallback) {
            const direct = store.findMessage?.(fallback, sid);
            if (direct) return fallback;
            const byIndex = pickByNumericIndex(fallback);
            if (byIndex) return byIndex;
            return fallback;
        }
        return '';
    };
    const applyCompatSetChatMessage = async ({ iframe, sessionId, messageRef, fieldValues }) => {
        const store = window.appBridge?.chatStore;
        const ui = window.appBridge?.chatUI;
        const sid = String(sessionId || '').trim();
        if (!store || !sid) return { ok: false, reason: 'missing-store-or-session' };
        const fallbackRef = String(iframe?.dataset?.msgId || '').trim();
        const targetId = resolveCompatMessageId(sid, messageRef, fallbackRef);
        if (!targetId) return { ok: false, reason: 'missing-message-id' };
        const current = store.findMessage?.(targetId, sid);
        if (!current) return { ok: false, reason: 'message-not-found', messageId: targetId };
        const fields = normalizeCompatFieldValues(fieldValues);
        const hasMessage = Object.prototype.hasOwnProperty.call(fields, 'message');
        const hasData = Object.prototype.hasOwnProperty.call(fields, 'data');
        if (!hasMessage && !hasData) return { ok: true, messageId: targetId };
        if (hasMessage) {
            const nextRaw = String(fields.message ?? '');
            const handler = ui && typeof ui.actionHandler === 'function' ? ui.actionHandler : null;
            if (handler && String(current.role || '') === 'assistant') {
                try {
                    await handler('edit-assistant-raw', current, {
                        text: nextRaw,
                        regexEditMode: false,
                        source: 'iframe-set-chat-message',
                    });
                    const latest = store.findMessage?.(targetId, sid);
                    if (latest) {
                        const latestRawSource =
                            (typeof latest.rawSource === 'string' && latest.rawSource) ||
                            (typeof latest.raw_source === 'string' && latest.raw_source) ||
                            '';
                        const latestRaw = typeof latest.raw === 'string' ? latest.raw : '';
                        const latestContent = typeof latest.content === 'string' ? latest.content : '';
                        const hasContentTag = /<\s*content\b/i.test(latestRawSource) ? 1 : 0;
                        emitDebugLog({
                            source: 'iframe',
                            type: 'info',
                            message:
                                `set-chat-message-updated sid=${sid} mid=${targetId} ` +
                                `rawSourceLen=${latestRawSource.length} rawLen=${latestRaw.length} contentLen=${latestContent.length} hasContentTag=${hasContentTag}`,
                            force: true,
                        });
                    }
                    if (latest && store.getCurrent?.() === sid && typeof ui.updateMessage === 'function') {
                        ui.updateMessage(targetId, latest);
                    }
                    return { ok: true, messageId: targetId };
                } catch (err) {
                    logger.warn('iframe set-chat-message via action handler failed', err);
                }
            }
            let stored = nextRaw;
            let display = nextRaw;
            try {
                stored = window.appBridge?.applyOutputStoredRegex
                    ? window.appBridge.applyOutputStoredRegex(nextRaw, { isEdit: false, depth: 0 })
                    : nextRaw;
                display = window.appBridge?.applyOutputDisplayRegex
                    ? window.appBridge.applyOutputDisplayRegex(stored, { isEdit: false, depth: 0 })
                    : stored;
            } catch {}
            const patch = {
                rawOriginal: nextRaw,
                rawSource: nextRaw,
                raw: stored,
                content: display,
            };
            if (hasData) patch.data = fields.data;
            const updated = store.updateMessage?.(targetId, patch, sid) || null;
            if (updated) {
                const nextRawSource =
                    (typeof updated.rawSource === 'string' && updated.rawSource) ||
                    (typeof updated.raw_source === 'string' && updated.raw_source) ||
                    '';
                const nextRaw = typeof updated.raw === 'string' ? updated.raw : '';
                const nextContent = typeof updated.content === 'string' ? updated.content : '';
                const hasContentTag = /<\s*content\b/i.test(nextRawSource) ? 1 : 0;
                emitDebugLog({
                    source: 'iframe',
                    type: 'info',
                    message:
                        `set-chat-message-updated sid=${sid} mid=${targetId} ` +
                        `rawSourceLen=${nextRawSource.length} rawLen=${nextRaw.length} contentLen=${nextContent.length} hasContentTag=${hasContentTag}`,
                    force: true,
                });
            }
            if (updated && store.getCurrent?.() === sid && typeof ui?.updateMessage === 'function') {
                ui.updateMessage(targetId, updated);
            }
            return { ok: Boolean(updated), messageId: targetId };
        }
        if (hasData) {
            const updated = store.updateMessage?.(targetId, { data: fields.data }, sid) || null;
            if (updated && store.getCurrent?.() === sid && typeof ui?.updateMessage === 'function') {
                ui.updateMessage(targetId, updated);
            }
            return { ok: Boolean(updated), messageId: targetId };
        }
        return { ok: true, messageId: targetId };
    };
    const applyCompatSetChatMessages = async ({ iframe, sessionId, messages }) => {
        const list = Array.isArray(messages) ? messages : [];
        let applied = 0;
        let skipped = 0;
        for (const item of list) {
            if (!item || typeof item !== 'object') {
                skipped += 1;
                continue;
            }
            const messageRef =
                item.message_id ??
                item.messageId ??
                item.id ??
                item.mid ??
                (item.message && !item.data ? (iframe?.dataset?.msgId || '') : '');
            const fields = {};
            if (Object.prototype.hasOwnProperty.call(item, 'message')) fields.message = item.message;
            if (Object.prototype.hasOwnProperty.call(item, 'data')) fields.data = item.data;
            const result = await applyCompatSetChatMessage({
                iframe,
                sessionId,
                messageRef,
                fieldValues: fields,
            });
            if (result?.ok) applied += 1;
            else skipped += 1;
        }
        return { ok: skipped === 0, applied, skipped, total: list.length };
    };

    window.addEventListener('message', (e) => {
        const data = e?.data;
        if (!data || typeof data !== 'object') return;
        const esc = (CSS && typeof CSS.escape === 'function') ? CSS.escape : (s) => String(s).replace(/[^a-zA-Z0-9_-]/g, '\\$&');
        if (data.type === 'chatapp:set-chat-message') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            void (async () => {
                const sid = resolveCompatSessionId(iframe, data.sessionId);
                const result = await applyCompatSetChatMessage({
                    iframe,
                    sessionId: sid,
                    messageRef: data.messageId,
                    fieldValues: data.fieldValues,
                });
                const info = `set-chat-message id=${id} ok=${result?.ok ? 1 : 0} sid=${sid || 'none'} mid=${String(result?.messageId || data.messageId || '')}`;
                emitDebugLog({
                    source: 'iframe',
                    type: result?.ok ? 'info' : 'warn',
                    message: info,
                    force: true,
                });
                try {
                    e.source?.postMessage({
                        type: 'chatapp:set-chat-message-result',
                        id,
                        requestId: String(data.requestId || ''),
                        ok: Boolean(result?.ok),
                        reason: String(result?.reason || ''),
                        messageId: String(result?.messageId || ''),
                    }, '*');
                } catch {}
            })();
            return;
        }
        if (data.type === 'chatapp:set-chat-messages') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            void (async () => {
                const sid = resolveCompatSessionId(iframe, data.sessionId);
                const result = await applyCompatSetChatMessages({
                    iframe,
                    sessionId: sid,
                    messages: data.messages,
                });
                const info = `set-chat-messages id=${id} ok=${result?.ok ? 1 : 0} sid=${sid || 'none'} applied=${Number(result?.applied || 0)} skipped=${Number(result?.skipped || 0)} total=${Number(result?.total || 0)}`;
                emitDebugLog({
                    source: 'iframe',
                    type: result?.ok ? 'info' : 'warn',
                    message: info,
                    force: true,
                });
                try {
                    e.source?.postMessage({
                        type: 'chatapp:set-chat-messages-result',
                        id,
                        requestId: String(data.requestId || ''),
                        ok: Boolean(result?.ok),
                        reason: result?.ok ? '' : 'partial-or-failed',
                        applied: Number(result?.applied || 0),
                        skipped: Number(result?.skipped || 0),
                        total: Number(result?.total || 0),
                    }, '*');
                } catch {}
            })();
            return;
        }
        if (data.type === 'chatapp:replace-variables' || data.type === 'chatapp:merge-variables' || data.type === 'chatapp:delete-variable') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            void (async () => {
                const sid = resolveCompatSessionId(iframe, data.sessionId);
                const mode = data.type === 'chatapp:replace-variables'
                    ? 'replace'
                    : (data.type === 'chatapp:merge-variables' ? 'merge' : 'delete');
                const result = applyCompatVariableMutation({
                    sessionId: sid,
                    mode,
                    payload: data.type === 'chatapp:replace-variables' ? data.variables : data.patch,
                    key: data.key,
                    options: data.options,
                });
                const count = Object.keys((result?.vars && result.vars.stat_data) || {}).length;
                emitDebugLog({
                    source: 'iframe',
                    type: result?.ok ? 'info' : 'warn',
                    message:
                        `${mode}-variables id=${id} ok=${result?.ok ? 1 : 0} ` +
                        `sid=${sid || 'none'} scope=${String(result?.scopeType || '')} keys=${count}`,
                    force: true,
                });
                try {
                    e.source?.postMessage({
                        type: `${data.type}-result`,
                        id,
                        requestId: String(data.requestId || ''),
                        ok: Boolean(result?.ok),
                        reason: String(result?.reason || ''),
                        deleted: Boolean(result?.deleted),
                        scopeType: String(result?.scopeType || ''),
                        vars: result?.vars || null,
                    }, '*');
                } catch {}
            })();
            return;
        }
        if (data.type === 'chatapp:iframe-ready') {
            const id = String(data.id || '');
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            iframe.dataset.iframeReady = '1';
            iframe.dataset.iframeLoaded = iframe.dataset.iframeLoaded || '1';
            const st = getIframeState(id, { messageId: String(iframe.dataset.msgId || ''), createdAt: Date.now() });
            if (st) {
                if (!st.readyAt) st.readyAt = Date.now();
                if (!st.authority) st.authority = IFRAME_AUTHORITY_HOST;
            }
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
            applyIframeBlankFallbackIfNeeded(iframe, id, `iframe-host-error ${String(message || '').slice(0, 120)}`, {
                requireLoaded: true,
                tryDirectRecover: true,
            });
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
            let handled = false;
            if (
                /VueRouter is not defined|Vue is not defined|Pinia is not defined|createPinia is not defined|_ is not defined|resource-load-failed|unhandledrejection/i.test(message)
            ) {
                const recovered = tryRecoverDirectLoadFallback(iframe, id, message.slice(0, 120));
                handled = recovered;
                if (!recovered && recoverableRuntimeError) {
                    handled = applyIframeStaticFallback(iframe, id, message.slice(0, 160));
                }
            } else if (recoverableRuntimeError) {
                handled = applyIframeStaticFallback(iframe, id, message.slice(0, 160));
            }
            if (!handled) {
                applyIframeBlankFallbackIfNeeded(iframe, id, `iframe-error ${String(message || '').slice(0, 120)}`, {
                    requireLoaded: true,
                    tryDirectRecover: true,
                });
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
            if (!id) return;
            const iframe = document.querySelector(`iframe[data-iframe-id="${esc(id)}"]`);
            if (!iframe) return;
            applyIncomingResizeMessage(iframe, data, { sourceFallback: 'bridge' });
            return;
        }
        if (data.type === 'resizeIframe') {
            const iframe = findIframeBySource(e?.source) || null;
            if (!iframe) return;
            applyIncomingResizeMessage(iframe, data, { sourceFallback: 'legacy' });
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

export const renderRichText = (
    containerEl,
    text,
    { messageId, preserveHtmlNewlines = false, sessionId, debugTag = '', lazyMount = false } = {},
) => {
    if (!containerEl) return;
    cancelLazyRichMount(containerEl);
    if (lazyMount && shouldLazyMountRichText(text)) {
        scheduleLazyRichMount(containerEl, text, {
            messageId,
            preserveHtmlNewlines,
            sessionId,
            debugTag,
        });
        return;
    }
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
    // - 普通 markdown / HTML 片段走“消息内安全渲染”
    // - 带 <script>/<body>/<html>/<iframe> 的完整页面仍走 iframe 沙盒
    const trimmed = htmlCandidateText.trim();
    const htmlDocTagRe = /<(script|body|html|iframe)\b/i;
    const htmlDocCloseRe = /<\/(script|body|html|iframe)\b/i;
    const hasHtmlDocTag = htmlDocTagRe.test(trimmed) || /^\s*<!doctype\s+html/i.test(trimmed);
    const hasHtmlDocClose = htmlDocCloseRe.test(trimmed) || /<\/html\s*>/i.test(trimmed) || /<\/body\s*>/i.test(trimmed);
    const wholeLooksLikeHtml = hasHtmlDocTag && (hasHtmlDocClose || /<script[\s>]/i.test(trimmed));
    const textWithBreaks = rawText
        .replace(/&lt;br\s*\/?&gt;/gi, '\n')
        .replace(/<br\s*\/?>/gi, '\n');
    const hasCodeFence = /```/.test(htmlCandidateText);
    let parts = (hasCodeFence ? splitFencedCodeBlocks(htmlCandidateText)
        : wholeLooksLikeHtml
            ? [{ type: 'code', lang: 'html', code: trimmed }]
            : [{ type: 'text', text: textWithBreaks }]);
    const hasInteractiveHtmlLikeText = (val) => {
        const raw = String(val || '');
        if (!raw) return false;
        const hasTag = htmlDocTagRe.test(raw) && htmlDocCloseRe.test(raw);
        const escapedTag = RICH_INTERACTIVE_ESCAPED_HTML_RE.test(raw);
        return hasTag || escapedTag;
    };
    if (hasCodeFence) {
        parts = parts.flatMap((p) => {
            if (p.type !== 'text') return [p];
            if (!hasInteractiveHtmlLikeText(p.text)) return [p];
            const decoded = decodeHtmlEntities(p.text);
            return [{ type: 'code', lang: 'html', code: decoded }];
        });
    }
    if (Boolean(debugTag) || shouldLogRichDebug()) {
        const fragmentHint = hasRichFragmentHint(htmlCandidateText);
        if (fragmentHint || hasCodeFence || wholeLooksLikeHtml) {
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
        if (hasRichFragmentHint(chunk) && !hasInteractiveHtmlHint(chunk)) {
            const rendered = renderScopedRichFragment(containerEl, chunk, {
                messageId,
                resolveStatusCard,
                allowStatusCards: true,
                debugTag,
                source: 'message',
            });
            if (rendered) return;
        }
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

export const cleanupRichText = (containerEl) => {
    if (!containerEl) return;
    cancelLazyRichMount(containerEl);
};
