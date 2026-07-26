// OpenAI 兼容端点流式默认不回 usage，须带 stream_options.include_usage 才能拿到
// 校准样本；但严格中转可能对未知字段报 4xx。策略：默认携带，端点一旦因此报错就按
// baseUrl 记忆停用（持久化），当次自动去掉重试，之后的请求不再携带。
const STORAGE_KEY = 'stream_usage_unsupported_endpoints_v1';

const resolveBrowserStorage = () => {
  try {
    return typeof localStorage !== 'undefined' ? localStorage : null;
  } catch {
    return null;
  }
};

const normalizeEndpoint = (baseUrl) => String(baseUrl || '')
  .trim()
  .toLowerCase()
  .replace(/\/+$/, '');

const loadUnsupportedSet = (storage) => {
  try {
    const raw = storage?.getItem?.(STORAGE_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(list) ? list.map(normalizeEndpoint).filter(Boolean) : []);
  } catch {
    return new Set();
  }
};

// 读取 kv / localStorage 两种载荷：localStorage 存裸数组（向后兼容），kv 存 { version, endpoints }。
const readEndpointList = (raw) => {
  if (Array.isArray(raw)) return raw;
  if (raw && typeof raw === 'object' && Array.isArray(raw.endpoints)) return raw.endpoints;
  return [];
};

// localStorage 配额满时 setItem 会静默失败（本项目真机已发生，见 app-settings.js），
// 因此 kv（Tauri 本地文件）为权威通道，localStorage 仅作同步读缓存。
export const createStreamUsageCompat = ({
  storage = resolveBrowserStorage(),
  loadKv = null,
  saveKv = null,
} = {}) => {
  const unsupported = loadUnsupportedSet(storage);
  const kv = {
    load: typeof loadKv === 'function' ? loadKv : null,
    save: typeof saveKv === 'function' ? saveKv : null,
  };
  const save = () => {
    const endpoints = [...unsupported];
    try {
      storage?.setItem?.(STORAGE_KEY, JSON.stringify(endpoints));
    } catch {}
    if (kv.save) {
      Promise.resolve(kv.save(STORAGE_KEY, { version: 1, endpoints })).catch(() => {});
    }
  };
  return {
    // boot 早期调用：注入 kv 通道并取两侧并集——任一侧记过拒绝就不再重试，
    // 否则每次启动都要先踩一个 4xx 才降级。
    async hydrate({ loadKv: nextLoadKv = null, saveKv: nextSaveKv = null } = {}) {
      if (typeof nextLoadKv === 'function') kv.load = nextLoadKv;
      if (typeof nextSaveKv === 'function') kv.save = nextSaveKv;
      if (!kv.load) return [...unsupported];
      try {
        const raw = await kv.load(STORAGE_KEY);
        if (!raw || typeof raw !== 'object' || raw._tooLarge) return [...unsupported];
        readEndpointList(raw)
          .map(normalizeEndpoint)
          .filter(Boolean)
          .forEach(endpoint => unsupported.add(endpoint));
      } catch {}
      return [...unsupported];
    },
    isMarkedUnsupported(baseUrl) {
      return unsupported.has(normalizeEndpoint(baseUrl));
    },
    markUnsupported(baseUrl) {
      const key = normalizeEndpoint(baseUrl);
      if (!key || unsupported.has(key)) return;
      unsupported.add(key);
      save();
    },
    applyStreamUsageOptions(payload = {}, baseUrl = '') {
      const base = payload && typeof payload === 'object' ? payload : {};
      if (base.stream_options || unsupported.has(normalizeEndpoint(baseUrl))) return { ...base };
      return { ...base, stream_options: { include_usage: true } };
    },
  };
};

// 只认「4xx 且错误内容点名 stream_options / include_usage」的失败，避免把普通
// 参数错误误判成端点不兼容而永久停用计量。
export const isStreamOptionsRejectionError = (error) => {
  const status = Number(error?.status);
  if (!Number.isFinite(status) || status < 400 || status >= 500) return false;
  const text = `${error?.message || ''} ${error?.response || ''}`;
  return /stream_options|include_usage/i.test(text);
};

export const streamUsageCompat = createStreamUsageCompat();
