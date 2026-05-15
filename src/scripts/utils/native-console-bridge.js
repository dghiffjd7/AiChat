import { safeInvoke } from './tauri.js';

const globalObj = typeof globalThis !== 'undefined' ? globalThis : window;

const isDevOrigin = () => {
  if (typeof window === 'undefined') return false;
  try {
    const { protocol, hostname, port } = window.location || {};
    if (hostname === '127.0.0.1' || hostname === 'localhost') return true;
    return protocol === 'http:' && Boolean(port);
  } catch {
    return false;
  }
};

const shouldEnable = () => {
  if (typeof window === 'undefined') return false;
  try {
    const flag = localStorage.getItem('chatapp_native_console_bridge');
    if (flag === 'off') return false;
    if (flag === 'on') return true;
    return isDevOrigin();
  } catch {
    return isDevOrigin();
  }
};

const stringifyArg = (arg) => {
  if (arg instanceof Error) return `${arg.name}: ${arg.message}\n${arg.stack || ''}`.trim();
  if (typeof arg === 'string') return arg;
  if (arg == null) return String(arg);
  try {
    return JSON.stringify(arg);
  } catch {
    return String(arg);
  }
};

const shouldMirrorLevel = (level, text) => {
  if (level === 'warn' || level === 'error') return true;
  return /(failed|failure|error|warning|uncaught|typeerror|referenceerror|not available|失败|错误|异常|报错)/i.test(text);
};

const installNativeConsoleBridge = () => {
  if (!shouldEnable()) return;
  if (globalObj.__CHATAPP_NATIVE_CONSOLE_BRIDGE__) return;
  globalObj.__CHATAPP_NATIVE_CONSOLE_BRIDGE__ = true;

  const original = {
    log: console.log.bind(console),
    info: console.info.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
  };
  let count = 0;
  const limit = 600;

  const mirror = (level, args) => {
    const text = args.map(stringifyArg).join(' ');
    if (!shouldMirrorLevel(level, text)) return;
    if (count >= limit) {
      if (count === limit) {
        count += 1;
        safeInvoke('log_js', {
          tag: 'CONSOLE',
          level: 'warn',
          message: 'native console bridge limit reached',
          data: { droppedAfter: limit },
        }).catch(() => {});
      }
      return;
    }
    count += 1;
    safeInvoke('log_js', {
      tag: 'CONSOLE',
      level,
      message: text.slice(0, 1800),
      data: { source: 'webview-console', count },
    }).catch(() => {});
  };

  ['log', 'info', 'warn', 'error'].forEach((level) => {
    console[level] = (...args) => {
      original[level](...args);
      mirror(level, args);
    };
  });

  window.addEventListener('error', (event) => {
    mirror('error', [
      'window.error',
      event?.message || '',
      event?.filename || '',
      event?.lineno || '',
      event?.colno || '',
      event?.error || '',
    ]);
  });

  window.addEventListener('unhandledrejection', (event) => {
    mirror('error', ['unhandledrejection', event?.reason || '']);
  });
};

installNativeConsoleBridge();
