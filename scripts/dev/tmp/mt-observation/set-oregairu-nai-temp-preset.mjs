import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const mode = String(process.argv[2] || 'inspect').trim().toLowerCase();
const outputPath = resolve(
  `scripts/dev/tmp/mt-observation/oregairu-nai-preset-${mode}-20260730.json`,
);
const expression = `(async () => {
  const registry = window.appBridge?.debugUiRegistry || {};
  const panel = registry.panels?.configPanel || null;
  const store = panel?.imageGenerationParamsPanel?.store || null;
  if (!store) return { ok: false, reason: 'image_params_store_missing' };
  await store.ready;
  const mode = ${JSON.stringify(mode)};
  const avatarId = 'oregairu-nai-avatar-20260730';
  const wallpaperId = 'oregairu-nai-wallpaper-20260730';
  const originalId = String(window.__oregairuOriginalImageParamsId || store.getActiveId?.() || 'default');
  if (!window.__oregairuOriginalImageParamsId && ![avatarId, wallpaperId].includes(originalId)) {
    window.__oregairuOriginalImageParamsId = originalId;
  }
  const restoreId = String(window.__oregairuOriginalImageParamsId || 'default');
  const original = store.list?.().find(item => item.id === restoreId) || store.getActive?.();
  const baseNovel = {
    ...(original?.paramsByProvider?.novelai || {}),
    promptPrefix: 'anime screencap, official anime style, clean lineart, soft cel shading, expressive eyes',
    promptSuffix: 'no text, no logo, no watermark',
    steps: 23,
    scale: 5,
    sampler: 'k_euler_ancestral',
    scheduler: 'karras',
    qualityToggle: 'true',
    seed: '',
  };

  if (mode === 'avatar' || mode === 'wallpaper') {
    const isWallpaper = mode === 'wallpaper';
    const preset = await store.upsert({
      ...original,
      id: isWallpaper ? wallpaperId : avatarId,
      name: isWallpaper ? '临时·侍奉部 NAI 壁纸' : '临时·侍奉部 NAI 头像',
      paramsByProvider: {
        ...(original?.paramsByProvider || {}),
        novelai: {
          ...baseNovel,
          width: isWallpaper ? 1344 : 1024,
          height: isWallpaper ? 768 : 1024,
        },
      },
    });
    return {
      ok: true,
      mode,
      originalId: restoreId,
      activeId: store.getActiveId?.(),
      preset,
    };
  }

  if (mode === 'restore') {
    await store.setActive(restoreId);
    const deletedAvatar = await store.delete(avatarId);
    const deletedWallpaper = await store.delete(wallpaperId);
    await store.setActive(restoreId);
    delete window.__oregairuOriginalImageParamsId;
    return {
      ok: true,
      mode,
      restoredId: restoreId,
      activeId: store.getActiveId?.(),
      deletedAvatar,
      deletedWallpaper,
      active: store.getActive?.(),
    };
  }

  return {
    ok: true,
    mode,
    originalId: restoreId,
    activeId: store.getActiveId?.(),
    active: store.getActive?.(),
    presets: store.list?.().map(item => ({ id: item.id, name: item.name })) || [],
  };
})()`;

const result = await evaluateInApp(expression, { timeoutMs: 300000 });
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ ...result, outputPath }, null, 2));
if (!result?.ok) process.exitCode = 1;
