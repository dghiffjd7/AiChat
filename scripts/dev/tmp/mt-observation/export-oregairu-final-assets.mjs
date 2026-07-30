import {
  copyFileSync,
  mkdirSync,
  writeFileSync,
} from 'node:fs';
import { extname, resolve } from 'node:path';

import { evaluateInApp } from '../../cdp-client.mjs';

const outputDir = resolve(
  'scripts/dev/tmp/mt-observation/oregairu-final-visual-audit',
);
mkdirSync(outputDir, { recursive: true });

const expression = `(() => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const contacts = stores.contactsStore?.listContacts?.() || [];
  const find = name => contacts.find(item => String(item?.name || '').trim() === name) || null;
  const targets = [
    ['hachiman', find('比企谷八幡')],
    ['yukino', find('雪之下雪乃')],
    ['yui', find('由比滨结衣')],
    ['shizuka', find('平塚静')],
    ['group', find('侍奉部')],
  ];
  return {
    avatars: [
      ['persona', stores.personaStore?.getActive?.()?.avatar || ''],
      ['user', stores.userStore?.getActive?.()?.avatar || ''],
      ...targets.map(([key, item]) => [key, item?.avatar || '']),
    ],
    wallpapers: targets.map(([key, item]) => [
      key,
      stores.chatStore?.getSessionSettings?.(item?.id || '')?.wallpaper?.path || '',
    ]),
  };
})()`;

const result = await evaluateInApp(expression, { timeoutMs: 300000 });
const manifest = {
  ok: true,
  outputDir,
  avatars: [],
  wallpapers: [],
};

for (const [key, dataUrl] of result?.avatars || []) {
  const match = String(dataUrl || '').match(/^data:image\/([a-z0-9.+-]+);base64,(.+)$/i);
  if (!match) {
    manifest.ok = false;
    manifest.avatars.push({ key, ok: false, reason: 'avatar_data_url_missing' });
    continue;
  }
  const subtype = match[1].toLowerCase();
  const extension = subtype.includes('webp') ? '.webp' : (subtype.includes('png') ? '.png' : '.jpg');
  const outputPath = resolve(outputDir, `${key}-avatar${extension}`);
  writeFileSync(outputPath, Buffer.from(match[2], 'base64'));
  manifest.avatars.push({ key, ok: true, outputPath });
}

for (const [key, sourcePath] of result?.wallpapers || []) {
  const source = String(sourcePath || '').trim();
  if (!source) {
    manifest.ok = false;
    manifest.wallpapers.push({ key, ok: false, reason: 'wallpaper_path_missing' });
    continue;
  }
  const extension = extname(source) || '.jpg';
  const outputPath = resolve(outputDir, `${key}-wallpaper${extension}`);
  try {
    copyFileSync(source, outputPath);
    manifest.wallpapers.push({ key, ok: true, sourcePath: source, outputPath });
  } catch (error) {
    manifest.ok = false;
    manifest.wallpapers.push({
      key,
      ok: false,
      sourcePath: source,
      reason: String(error?.message || error),
    });
  }
}

const manifestPath = resolve(outputDir, 'manifest.json');
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({
  ok: manifest.ok,
  outputDir,
  avatarCount: manifest.avatars.filter(item => item.ok).length,
  wallpaperCount: manifest.wallpapers.filter(item => item.ok).length,
  manifestPath,
}, null, 2));
if (!manifest.ok) process.exitCode = 1;
