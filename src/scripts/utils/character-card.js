const PNG_SIGNATURE = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

const readFileAsArrayBuffer = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(reader.result || new ArrayBuffer(0));
  reader.onerror = () => reject(reader.error || new Error('读取失败'));
  reader.readAsArrayBuffer(file);
});

const readFileAsText = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('读取失败'));
  reader.readAsText(file);
});

const readFileAsDataUrl = (file) => new Promise((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('读取失败'));
  reader.readAsDataURL(file);
});

const ensureArray = (val) => Array.isArray(val) ? val : (val ? [val] : []);

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const isLikelyBase64 = (text) => {
  const raw = String(text || '').trim();
  if (!raw || raw.length < 16) return false;
  if (raw.length % 4 !== 0) return false;
  return /^[A-Za-z0-9+/=]+$/.test(raw);
};

const decodeBase64Text = (text) => {
  const raw = String(text || '').trim();
  try {
    const bin = atob(raw);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  } catch {
    return '';
  }
};

const parseCardText = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') || raw.startsWith('[')) {
    return safeJsonParse(raw);
  }
  if (isLikelyBase64(raw)) {
    const decoded = decodeBase64Text(raw).trim();
    if (decoded.startsWith('{') || decoded.startsWith('[')) {
      return safeJsonParse(decoded);
    }
  }
  const decodedUri = (() => {
    try {
      return decodeURIComponent(raw);
    } catch {
      return '';
    }
  })();
  if (decodedUri && (decodedUri.startsWith('{') || decodedUri.startsWith('['))) {
    return safeJsonParse(decodedUri);
  }
  return null;
};

const readPngTextChunks = (buffer) => {
  const bytes = new Uint8Array(buffer);
  const chunks = [];
  if (bytes.length < PNG_SIGNATURE.length) return chunks;
  for (let i = 0; i < PNG_SIGNATURE.length; i += 1) {
    if (bytes[i] !== PNG_SIGNATURE[i]) return chunks;
  }
  const view = new DataView(buffer);
  let offset = PNG_SIGNATURE.length;
  while (offset + 8 <= bytes.length) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    );
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > bytes.length) break;
    const data = bytes.slice(dataStart, dataEnd);
    chunks.push({ type, data });
    offset = dataEnd + 4;
    if (type === 'IEND') break;
  }
  return chunks;
};

const parseTextChunk = (type, data) => {
  const decoder = new TextDecoder('utf-8');
  if (type === 'tEXt') {
    const zeroIdx = data.indexOf(0);
    if (zeroIdx <= 0) return null;
    const keyword = decoder.decode(data.slice(0, zeroIdx));
    const text = decoder.decode(data.slice(zeroIdx + 1));
    return { keyword, text };
  }
  if (type === 'iTXt') {
    let offset = 0;
    const readZero = () => {
      const idx = data.indexOf(0, offset);
      if (idx === -1) return null;
      const part = data.slice(offset, idx);
      offset = idx + 1;
      return part;
    };
    const keywordBytes = readZero();
    if (!keywordBytes) return null;
    const keyword = decoder.decode(keywordBytes);
    const compressionFlag = data[offset];
    offset += 1;
    offset += 1; // compression method
    const languageTag = readZero();
    if (languageTag === null) return null;
    const translatedKeyword = readZero();
    if (translatedKeyword === null) return null;
    if (compressionFlag !== 0) return null;
    const text = decoder.decode(data.slice(offset));
    return { keyword, text };
  }
  return null;
};

export const extractCharacterCardJsonFromPng = (buffer) => {
  const chunks = readPngTextChunks(buffer);
  if (!chunks.length) return null;
  const candidates = [];
  chunks.forEach(({ type, data }) => {
    const parsed = parseTextChunk(type, data);
    if (!parsed) return;
    const keyword = String(parsed.keyword || '').trim().toLowerCase();
    if (!keyword) return;
    if (['chara', 'character', 'chara_card_v2', 'card'].includes(keyword)) {
      candidates.push(parsed.text);
    }
  });
  for (const text of candidates) {
    const parsed = parseCardText(text);
    if (parsed) return parsed;
  }
  // Fallback: try any text chunk
  for (const { type, data } of chunks) {
    const parsed = parseTextChunk(type, data);
    if (!parsed) continue;
    const candidate = parseCardText(parsed.text);
    if (candidate) return candidate;
  }
  return null;
};

const pickText = (...values) => {
  for (const v of values) {
    if (typeof v === 'string' && v.trim()) return v;
  }
  return '';
};

export const normalizeCharacterCard = (input = {}) => {
  const raw = (input && typeof input === 'object') ? input : {};
  const spec = String(raw.spec || raw.format || '').trim().toLowerCase();
  const hasV2 = Boolean(raw.data) || spec.includes('chara_card_v2') || spec.includes('chub');
  const data = hasV2 ? (raw.data && typeof raw.data === 'object' ? raw.data : {}) : raw;
  const format = hasV2 ? 'tavern_v2' : 'tavern_v1';
  return {
    format,
    name: pickText(data.name, raw.name),
    description: pickText(data.description, raw.description),
    personality: pickText(data.personality, raw.personality),
    scenario: pickText(data.scenario, raw.scenario),
    first_mes: pickText(data.first_mes, raw.first_mes),
    mes_example: pickText(data.mes_example, raw.mes_example),
    system_prompt: pickText(data.system_prompt, raw.system_prompt),
    post_history_instructions: pickText(data.post_history_instructions, raw.post_history_instructions),
    creator_notes: pickText(data.creator_notes, raw.creator_notes),
    alternate_greetings: ensureArray(data.alternate_greetings || raw.alternate_greetings).map(String).filter(Boolean),
    character_book: data.character_book || raw.character_book || null,
    extensions: data.extensions || raw.extensions || {},
    raw,
  };
};

export const parseCharacterCardFile = async (file) => {
  if (!file) throw new Error('未选择文件');
  const name = String(file.name || '').toLowerCase();
  if (name.endsWith('.json')) {
    const text = await readFileAsText(file);
    const json = safeJsonParse(text);
    if (!json) throw new Error('JSON 解析失败');
    return { card: normalizeCharacterCard(json), raw: json, avatarDataUrl: '' };
  }
  if (name.endsWith('.png')) {
    const [buffer, avatarDataUrl] = await Promise.all([
      readFileAsArrayBuffer(file),
      readFileAsDataUrl(file),
    ]);
    const json = extractCharacterCardJsonFromPng(buffer);
    if (!json) throw new Error('未找到角色卡数据');
    return { card: normalizeCharacterCard(json), raw: json, avatarDataUrl };
  }
  throw new Error('仅支持 PNG 或 JSON 角色卡');
};
