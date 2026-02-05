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
const getIframeState = (id, init) => {
    if (!id) return null;
    if (!iframeDebugState.has(id) && init) iframeDebugState.set(id, init);
    return iframeDebugState.get(id) || null;
};
const warnIframe = (msg, id, extra = '') => {
    const suffix = extra ? ` ${extra}` : '';
    logger.warn(`[iframe] ${msg} id=${id || 'unknown'}${suffix}`);
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
    return /getAllVariables\s*\(|waitGlobalInitialized\s*\(|\bMvu\b|StatusPlaceHolderImpl|mag_variable_/i.test(raw);
};
const buildMvuCompatBridge = ({ iframeId, sessionId } = {}) => {
    const id = String(iframeId || '');
    const sid = String(sessionId || '');
    return `
<script>
(() => {
  const CHATAPP_IFRAME_ID = ${JSON.stringify(id)};
  const CHATAPP_SESSION_ID = ${JSON.stringify(sid)};
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
  };

  const setVars = (vars) => {
    state.vars = normalizeVars(vars);
    emit(window.Mvu?.events?.VARIABLE_UPDATE_ENDED || 'mag_variable_update_ended', state.vars);
  };

  window.getAllVariables = window.getAllVariables || (() => state.vars);
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
      const message = String(ev?.message || ev?.error?.message || 'iframe error');
      parent.postMessage({ type: 'chatapp:iframe-error', id, message }, '*');
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

const makeCodeBlock = ({ lang, code, messageId, preserveHtmlNewlines = false, sessionId } = {}) => {
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
    const needsMvuCompat = allowScripts && shouldEnableMvuCompat(code);
    const shouldRenderHtml = looksLikeHtmlDoc || isHtmlLang || looksLikeHtmlSnippet;
    if (shouldLogRichDebug()) {
        const hasHtmlHint = /<\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(code) ||
            /&lt;\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(code);
        if (hasHtmlHint || shouldRenderHtml) {
            const msg = `codeblock html?=${shouldRenderHtml} lang=${lang || 'none'} len=${String(code || '').length} msg=${String(messageId || '')}`;
            emitDebugLog({ source: 'rich', type: shouldRenderHtml ? 'info' : 'warn', message: msg, force: true });
            logger.info(`[rich] ${msg}`);
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
        const hasMinVh = /min-height:\s*[^;]*vh/i.test(html);
        const hasJsVhUsage = /\d+vh/.test(html);
        const needsVhHandling = hasMinVh || hasJsVhUsage;
        if (needsVhHandling) html = processAllVhUnits(html);
        const previewHtml = allowScripts ? html : stripScriptsForPreview(html);
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
        const bridgeScriptUrl = '';
        const baseHref = allowScripts ? `${window.location.origin}/` : '';
        const mvuCompatBridge = needsMvuCompat ? buildMvuCompatBridge({ iframeId, sessionId }) : '';
        const scriptDoc = buildIframeSrcDoc(html, {
            iframeId,
            needsVhHandling,
            preserveNewlines: false,
            injectBridgeScript: true,
            styleInBody: false,
            baseHref,
            bridgeScriptUrl,
            headPrepend: mvuCompatBridge,
        });
        previewWrap.appendChild(iframe);
        if (allowScripts) {
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
            setTimeout(() => {
                const st = getIframeState(iframeId);
                if (st && st.lastResizeAt) return;
                if (iframe.dataset.iframePostResizeAt) return;
                observeIframeContent(iframe);
                bindIframeDocumentPressFallback(iframe, iframeId);
            }, 900);
        }

        wrap.appendChild(previewWrap);
        // Match ST 酒馆助手体验：渲染后不显示源码（源码/复制转移到长按菜单）

        // Fallback: some WebViews choke on srcdoc; retry via srcdoc if host never reports ready.
        if (!allowScripts) {
            setTimeout(() => {
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
            const st = getIframeState(iframeId);
            if (!st) return;
            if (!st.readyAt) {
                const msgId = st.messageId || iframe.dataset.msgId || '';
                const fallback = iframe.dataset.iframeFallbackAttempted === '1' ? 'fallback=1' : 'fallback=0';
                const loaded = iframe.dataset.iframeLoaded === '1' ? 'loaded=1' : 'loaded=0';
                const source = iframe.dataset.iframeSource || 'host';
                const sent = iframe.dataset.iframeDocSent === '1' ? 'sent=1' : 'sent=0';
                warnIframe('no-ready-after-2s', iframeId, `msg=${msgId} ${fallback} ${loaded} ${sent} source=${source}`);
            }
            if (!st.lastResizeAt) {
                const msgId = st.messageId || iframe.dataset.msgId || '';
                const loaded = iframe.dataset.iframeLoaded === '1' ? 'loaded=1' : 'loaded=0';
                const source = iframe.dataset.iframeSource || 'host';
                const sent = iframe.dataset.iframeDocSent === '1' ? 'sent=1' : 'sent=0';
                warnIframe('no-resize-after-2s', iframeId, `msg=${msgId} ${loaded} ${sent} source=${source}`);
            }
        }, 2000);
        setTimeout(() => {
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

export const renderRichText = (containerEl, text, { messageId, preserveHtmlNewlines = false, sessionId } = {}) => {
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
    if (shouldLogRichDebug()) {
        const htmlHint = /<\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(htmlCandidateText) ||
            /&lt;\s*(style|details|div|body|html|table|section|article|main|svg|iframe)\b/i.test(rawText);
        if (htmlHint || hasCodeFence || wholeLooksLikeHtml) {
            const msg = `render msg=${String(messageId || '')} codeFence=${hasCodeFence} html=${wholeLooksLikeHtml} escaped=${hasEscapedHtml} parts=${parts.length}`;
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
