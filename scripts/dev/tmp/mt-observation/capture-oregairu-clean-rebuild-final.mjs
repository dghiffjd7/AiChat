import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const expressionPath = resolve(
  'scripts/dev/tmp/mt-observation/audit-oregairu-clean-rebuild.js',
);
const outputPath = resolve(
  'scripts/dev/tmp/mt-observation/oregairu-clean-rebuild-final-20260730.json',
);
const result = await evaluateInApp(readFileSync(expressionPath, 'utf8'), {
  timeoutMs: 300000,
});
writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: result?.ok === true,
  outputPath,
  activePersona: result?.activePersona?.name || '',
  activeUser: result?.activeUser?.name || '',
  sessionIds: result?.allSessionIds || [],
  orphanSessionCount: result?.orphanSessionDetails?.length || 0,
  contacts: (result?.contacts || []).map(item => ({
    name: item.name,
    isGroup: item.isGroup,
    members: item.members,
    hasAvatar: item.hasAvatar,
    hasWallpaper: item.hasWallpaper,
    wallpaperWidth: item.wallpaper?.width || 0,
    wallpaperHeight: item.wallpaper?.height || 0,
  })),
  worldbooks: (result?.worldbooks || []).map(item => ({
    name: item.name,
    entryCount: item.entryCount,
  })),
  groupWorldIds: result?.groupWorldResolution?.worldIds || [],
  activeImageParamsId: result?.imageParams?.activeId || '',
  imagePresetIds: result?.imageParams?.presetIds || [],
}, null, 2));
if (!result?.ok) process.exitCode = 1;
