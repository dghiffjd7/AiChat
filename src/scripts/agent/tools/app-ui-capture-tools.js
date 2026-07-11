const trim = (value, fallback = '') => {
  const text = String(value ?? '').trim();
  return text || fallback;
};

const normalizeRect = (raw = null) => {
  if (!raw || typeof raw !== 'object') return null;
  const rect = {
    left: Number(raw.left),
    top: Number(raw.top),
    width: Number(raw.width),
    height: Number(raw.height),
  };
  if (!Object.values(rect).every(Number.isFinite) || rect.width <= 0 || rect.height <= 0) return null;
  return rect;
};

const listCaptureRegions = (context = {}) => (Array.isArray(context?.userSelection) ? context.userSelection : [])
  .map((item, index) => ({
    regionId: trim(item?.regionId),
    semanticSummary: trim(item?.semanticSummary || item?.text).slice(0, 200),
    viewportRect: normalizeRect(item?.viewportRect),
    index: index + 1,
  }))
  .filter(item => item.regionId);

const publicRegionList = regions => regions.map(item => ({
  regionId: item.regionId,
  index: item.index,
  semanticSummary: item.semanticSummary,
}));

const createCaptureAttachmentId = (regionId = '', now = Date.now) => {
  const safeRegion = trim(regionId, 'region').replace(/[^a-zA-Z0-9_-]+/g, '-').slice(0, 80) || 'region';
  const timestamp = Number(typeof now === 'function' ? now() : Date.now()) || Date.now();
  return `capture-${safeRegion}-${timestamp}`;
};

export const createAppUiCaptureTools = ({
  captureRegion = null,
  checkVisionSupport = null,
  now = Date.now,
  maxCaptureBytes = 850_000,
  maxRunCaptures = 2,
  maxRunImageChars = 1_200_000,
} = {}) => [{
  name: 'ui.capture_region',
  title: 'Capture selected app region',
  description: 'Capture pixels from a user-selected APP region and inject the screenshot into this maid run for visual inspection.',
  source: 'maid-app-ui-capture',
  permissions: [],
  riskLevel: 'low',
  capabilities: {
    read: true,
    write: false,
    network: false,
    cost: 'none',
    undo: 'none',
    modelContext: 'allowlist',
    confirmation: 'none',
  },
  schema: {
    type: 'object',
    required: ['regionId'],
    additionalProperties: false,
    properties: {
      regionId: { type: 'string', minLength: 1, maxLength: 160 },
    },
  },
  timeoutMs: 20_000,
  execute: async (args = {}, context = {}) => {
    const regions = listCaptureRegions(context);
    if (!regions.length) {
      return {
        ok: false,
        captured: false,
        reason: 'selection_region_missing',
        message: '本次请求没有可截图的选区，请先用圈选按钮选择区域。',
      };
    }
    const requested = trim(args.regionId);
    let selected = requested ? regions.find(item => item.regionId === requested) : null;
    if (!selected && !requested && regions.length === 1) selected = regions[0];
    if (!selected) {
      return {
        ok: false,
        captured: false,
        reason: requested ? 'selection_region_not_found' : 'selection_region_ambiguous',
        message: requested ? '指定的选区已经失效。' : '当前有多个选区，请按区域ID指定要查看哪一个。',
        availableRegions: publicRegionList(regions),
      };
    }

    const resolveLiveRegion = async () => {
      let liveRegion = {
        ok: Boolean(selected.viewportRect),
        regionId: selected.regionId,
        rect: selected.viewportRect,
        semanticSummary: selected.semanticSummary,
      };
      if (typeof context?.resolveMaidSelectionRegion === 'function') {
        liveRegion = await context.resolveMaidSelectionRegion(selected.regionId);
      }
      return { liveRegion, rect: normalizeRect(liveRegion?.rect) };
    };
    let resolved = await resolveLiveRegion();
    if (resolved.liveRegion?.ok === false || !resolved.rect) {
      return {
        ok: false,
        captured: false,
        reason: trim(resolved.liveRegion?.reason, 'selection_region_stale'),
        message: '这个选区已离开当前页面或不可见，请重新圈选后再截图。',
        regionId: selected.regionId,
      };
    }

    if (typeof checkVisionSupport === 'function') {
      const vision = await checkVisionSupport({ regionId: selected.regionId, context });
      if (vision?.ok === false) {
        return {
          ok: false,
          captured: false,
          reason: 'maid_vision_not_supported',
          message: trim(vision?.message, '当前女仆模型不支持图片输入。'),
          visionStatus: trim(vision?.capability?.status, 'unsupported'),
          regionId: selected.regionId,
        };
      }
    }
    // vision 检查可能触发异步配置读取；截图前必须再次解析选区，避免滚动或布局变化后截到旧坐标。
    resolved = await resolveLiveRegion();
    if (resolved.liveRegion?.ok === false || !resolved.rect) {
      return {
        ok: false,
        captured: false,
        reason: trim(resolved.liveRegion?.reason, 'selection_region_stale'),
        message: '这个选区已离开当前页面或不可见，请重新圈选后再截图。',
        regionId: selected.regionId,
      };
    }
    if (typeof captureRegion !== 'function') {
      return {
        ok: false,
        captured: false,
        reason: 'capture_unavailable',
        message: '当前平台没有可用的 APP 截图通道。',
        regionId: selected.regionId,
      };
    }

    let captured = null;
    try {
      captured = await captureRegion({
        regionId: selected.regionId,
        rect: resolved.rect,
        semanticSummary: trim(resolved.liveRegion?.semanticSummary || selected.semanticSummary),
        context,
      });
    } catch (error) {
      return {
        ok: false,
        captured: false,
        reason: 'capture_failed',
        message: trim(error?.message || error, 'APP 选区截图失败。'),
        regionId: selected.regionId,
      };
    }
    const dataUrl = trim(captured?.dataUrl || captured?.llmUrl || captured?.url);
    const mime = trim(captured?.mime, 'image/png').toLowerCase();
    const bytes = Math.max(0, Number(captured?.bytes || 0) || 0);
    if (!dataUrl.startsWith('data:image/') || !mime.startsWith('image/')) {
      return {
        ok: false,
        captured: false,
        reason: 'capture_invalid_image',
        message: '截图通道没有返回有效图片。',
        regionId: selected.regionId,
      };
    }
    if (bytes > Math.max(100_000, Number(maxCaptureBytes || 0) || 850_000)) {
      return {
        ok: false,
        captured: false,
        reason: 'capture_image_too_large',
        message: '截图体积过大，请缩小选区后重试。',
        regionId: selected.regionId,
        bytes,
      };
    }
    if (!Array.isArray(context?.maidAttachments)) {
      return {
        ok: false,
        captured: false,
        reason: 'capture_attachment_pool_unavailable',
        message: '本轮女仆视觉附件池不可用。',
        regionId: selected.regionId,
      };
    }

    const attachmentId = createCaptureAttachmentId(selected.regionId, now);
    const attachment = {
      id: attachmentId,
      kind: 'image',
      name: `${attachmentId}.png`,
      mime,
      size: bytes,
      bytes,
      url: dataUrl,
      llmUrl: dataUrl,
      source: 'ui.capture_region',
      regionId: selected.regionId,
    };
    const nextAttachments = context.maidAttachments.slice();
    const existingIndex = nextAttachments.findIndex(item => (
      trim(item?.source) === 'ui.capture_region' && trim(item?.regionId) === selected.regionId
    ));
    if (existingIndex >= 0) {
      nextAttachments.splice(existingIndex, 1, attachment);
    } else {
      const captureIndexes = nextAttachments
        .map((item, index) => (trim(item?.source) === 'ui.capture_region' ? index : -1))
        .filter(index => index >= 0);
      const limit = Math.max(1, Math.min(4, Math.trunc(Number(maxRunCaptures || 0)) || 2));
      while (captureIndexes.length >= limit) {
        const removeIndex = captureIndexes.shift();
        nextAttachments.splice(removeIndex, 1);
        for (let i = 0; i < captureIndexes.length; i += 1) {
          if (captureIndexes[i] > removeIndex) captureIndexes[i] -= 1;
        }
      }
      nextAttachments.push(attachment);
    }
    const imageChars = nextAttachments.reduce((total, item) => {
      if (trim(item?.kind) !== 'image') return total;
      return total + trim(item?.llmUrl || item?.url).length;
    }, 0);
    const imageCharLimit = Math.max(100_000, Math.min(
      1_600_000,
      Math.trunc(Number(maxRunImageChars || 0)) || 1_200_000,
    ));
    if (imageChars > imageCharLimit) {
      return {
        ok: false,
        captured: false,
        reason: 'capture_run_image_budget_exceeded',
        message: '本轮图片附件已接近模型请求上限，请减少附图或缩小选区后重试。',
        regionId: selected.regionId,
        imageChars,
        maxImageChars: imageCharLimit,
      };
    }
    context.maidAttachments.splice(0, context.maidAttachments.length, ...nextAttachments);
    return {
      ok: true,
      captured: true,
      imageInjected: true,
      regionId: selected.regionId,
      attachmentId,
      mime,
      width: Math.max(0, Number(captured?.width || 0) || 0),
      height: Math.max(0, Number(captured?.height || 0) || 0),
      bytes,
      message: '选区截图已加入本轮视觉上下文，下一步请直接查看截图并回答用户。',
    };
  },
  summarizeResult: result => result?.captured
    ? `captured selected region ${trim(result?.regionId, '-')}`
    : `capture selected region failed: ${trim(result?.reason, 'failed')}`,
}];

export const registerAppUiCaptureTools = (registry, deps = {}) => {
  const tools = createAppUiCaptureTools(deps);
  if (!registry || typeof registry.registerMany !== 'function') return tools;
  registry.registerMany(tools);
  return tools;
};
