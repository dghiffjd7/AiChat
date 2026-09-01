import {
  buildTavernV2CharacterCard,
  embedTavernV2CharacterCardInPng,
  sanitizeCharacterCardExportName,
} from '../utils/character-card-export.js';
import { hasTauriRuntime, pickSavePath } from '../utils/save-dialog.js';
import { safeInvoke } from '../utils/tauri.js';

const bytesToBase64 = (bytes) => {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
};

const textToDataUrl = text => `data:application/json;base64,${bytesToBase64(new TextEncoder().encode(String(text || '')))}`;
const pngBytesToDataUrl = bytes => `data:image/png;base64,${bytesToBase64(bytes)}`;

const decodeDataUrl = (dataUrl) => {
  const raw = String(dataUrl || '').trim();
  const match = raw.match(/^data:([^;,]+)?(;base64)?,(.*)$/s);
  if (!match) return new Uint8Array(0);
  if (match[2]) {
    const binary = atob(match[3]);
    const bytes = new Uint8Array(binary.length);
    for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
    return bytes;
  }
  return new TextEncoder().encode(decodeURIComponent(match[3]));
};

const loadImage = source => new Promise((resolve, reject) => {
  const image = new Image();
  if (/^https?:/i.test(source)) image.crossOrigin = 'anonymous';
  image.onload = () => resolve(image);
  image.onerror = () => reject(new Error('角色卡头像加载失败'));
  image.src = source;
});

const imageSourceToPngBytes = async (source) => {
  const raw = String(source || '').trim();
  if (!raw) throw new Error('角色卡没有可用头像');
  if (/^data:image\/png[;,]/i.test(raw)) {
    const bytes = decodeDataUrl(raw);
    if (bytes.length) return bytes;
  }
  const image = await loadImage(raw);
  const width = image.naturalWidth || image.width || 1;
  const height = image.naturalHeight || image.height || 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, width);
  canvas.height = Math.max(1, height);
  const context = canvas.getContext('2d', { alpha: true });
  if (!context) throw new Error('无法建立角色卡图片画布');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  const bytes = decodeDataUrl(canvas.toDataURL('image/png'));
  if (!bytes.length) throw new Error('角色卡头像转换 PNG 失败');
  return bytes;
};

const downloadInBrowser = ({ dataUrl, fileName }) => {
  const anchor = document.createElement('a');
  anchor.href = dataUrl;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
};

export class CharacterCardExporter {
  constructor({ appBridge = null, getFallbackAvatar = null } = {}) {
    this.appBridge = appBridge || globalThis.window?.appBridge || null;
    this.getFallbackAvatar = typeof getFallbackAvatar === 'function' ? getFallbackAvatar : () => '';
  }

  async loadRawCard(persona) {
    if (persona?.originalCard && typeof persona.originalCard === 'object') return persona.originalCard;
    if (persona?.source?.originalCardStored !== true) return null;
    const loaded = await this.appBridge?.loadPersonaCard?.(persona.id);
    if (!loaded || typeof loaded !== 'object' || Array.isArray(loaded) || loaded._tooLarge === true || !Object.keys(loaded).length) {
      throw new Error('无法读取原始角色卡数据，已取消导出以避免生成不完整文件');
    }
    return loaded;
  }

  async buildCard(persona) {
    if (!persona || typeof persona !== 'object') throw new Error('未找到要导出的角色卡');
    const rawCard = await this.loadRawCard(persona);
    return buildTavernV2CharacterCard({ persona, rawCard });
  }

  async saveDataUrl({ dataUrl, fileName, format }) {
    if (!hasTauriRuntime()) {
      downloadInBrowser({ dataUrl, fileName });
      return fileName;
    }
    const extension = format === 'png' ? 'png' : 'json';
    const pick = await pickSavePath({
      defaultName: fileName,
      filters: [{ name: extension.toUpperCase(), extensions: [extension] }],
    });
    if (pick.cancelled) return '';
    const payload = { dataUrl, fileName };
    if (!pick.fallback && pick.path) payload.path = pick.path;
    const result = await safeInvoke('export_attachment', payload);
    return String(result?.path || fileName).trim();
  }

  async export(persona, format = 'png') {
    const normalizedFormat = String(format || '').trim().toLowerCase();
    if (!['png', 'json'].includes(normalizedFormat)) throw new Error('不支持的角色卡导出格式');
    const card = await this.buildCard(persona);
    const baseName = sanitizeCharacterCardExportName(card.data?.name || persona?.name, 'character');

    if (normalizedFormat === 'json') {
      const fileName = `${baseName}.json`;
      const path = await this.saveDataUrl({
        dataUrl: textToDataUrl(JSON.stringify(card, null, 2)),
        fileName,
        format: normalizedFormat,
      });
      return { path, fileName, format: normalizedFormat, card };
    }

    const avatarSource = String(persona?.avatar || '').trim() || String(this.getFallbackAvatar() || '').trim();
    const pngBytes = await imageSourceToPngBytes(avatarSource);
    const embedded = embedTavernV2CharacterCardInPng(pngBytes, card);
    const fileName = `${baseName}.png`;
    const path = await this.saveDataUrl({
      dataUrl: pngBytesToDataUrl(embedded.bytes),
      fileName,
      format: normalizedFormat,
    });
    return { path, fileName, format: normalizedFormat, card };
  }
}
