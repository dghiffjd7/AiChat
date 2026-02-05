import { parseMvuScript, parseScriptJson, hasZodSchema } from './mvu-schema-parser.js';

const safeJsonParse = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

const extractJsonBlocks = (text) => {
  const raw = String(text || '');
  const blocks = [];
  const tagPatterns = [
    /<stat_data>([\s\S]*?)<\/stat_data>/gi,
    /<mvu_data>([\s\S]*?)<\/mvu_data>/gi,
    /<mvu>([\s\S]*?)<\/mvu>/gi,
  ];
  tagPatterns.forEach((re) => {
    let m;
    while ((m = re.exec(raw))) {
      if (m[1]) blocks.push(m[1]);
    }
  });
  const codeBlock = /```json([\s\S]*?)```/gi;
  let cm;
  while ((cm = codeBlock.exec(raw))) {
    if (cm[1]) blocks.push(cm[1]);
  }
  return blocks.map(s => String(s || '').trim()).filter(Boolean);
};

const extractStatDataFromJson = (payload) => {
  if (!payload || typeof payload !== 'object') return null;
  if (payload.stat_data && typeof payload.stat_data === 'object') return payload.stat_data;
  if (payload.mvu_data && typeof payload.mvu_data === 'object') {
    const nested = payload.mvu_data.stat_data || payload.mvu_data.statData;
    if (nested && typeof nested === 'object') return nested;
  }
  if (payload.data && typeof payload.data === 'object') {
    const nested = payload.data.stat_data || payload.data.statData;
    if (nested && typeof nested === 'object') return nested;
  }
  return null;
};

const findJsonCandidate = (text) => {
  const raw = String(text || '').trim();
  if (!raw) return null;
  if (raw.startsWith('{') || raw.startsWith('[')) return raw;
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start >= 0 && end > start) {
    return raw.slice(start, end + 1);
  }
  return null;
};

const normalizeEntries = (entries) => {
  if (!entries) return [];
  if (Array.isArray(entries)) return entries;
  if (typeof entries === 'object') return Object.values(entries);
  return [];
};

const getWorldEntries = (raw) => {
  const out = [];
  const data = raw?.data && typeof raw.data === 'object' ? raw.data : raw;
  const book = data?.character_book || raw?.character_book || null;
  if (book && typeof book === 'object') {
    const entries = normalizeEntries(book.entries || book);
    if (entries.length) out.push(...entries);
  }
  const ext = data?.extensions || raw?.extensions || {};
  const worldInfo = ext?.world_info || ext?.worldInfo || ext?.world_info_entry || ext?.worldInfoEntry;
  if (worldInfo) {
    const entries = normalizeEntries(worldInfo.entries || worldInfo);
    if (entries.length) out.push(...entries);
  }
  return out;
};

const hasMvuMarker = (entry) => {
  const comment = String(entry?.comment || entry?.title || '').toLowerCase();
  const content = String(entry?.content || '').toLowerCase();
  const keys = Array.isArray(entry?.keys) ? entry.keys : Array.isArray(entry?.key) ? entry.key : [];
  const keyStr = keys.map(k => String(k || '').toLowerCase()).join(',');
  return (
    comment.includes('mvu') ||
    content.includes('stat_data') ||
    content.includes('mvu_data') ||
    content.includes('<mvu') ||
    keyStr.includes('mvu_')
  );
};

const inferSchema = (key, value) => {
  const schema = { type: 'string', ui: { display: 'card', label: String(key || '').trim() } };
  if (typeof value === 'number' && Number.isFinite(value)) {
    schema.type = 'number';
    if (value >= 0 && value <= 100) {
      schema.range = { min: 0, max: 100 };
      schema.ui.display = 'progress';
      schema.ui.format = '{value}/100';
    }
    return schema;
  }
  if (typeof value === 'boolean') {
    schema.type = 'boolean';
    schema.ui.display = 'badge';
    return schema;
  }
  if (Array.isArray(value)) {
    schema.type = 'array';
    schema.ui.display = 'card';
    return schema;
  }
  if (value && typeof value === 'object') {
    schema.type = 'object';
    schema.ui.display = 'card';
    return schema;
  }
  schema.type = 'string';
  schema.ui.display = 'card';
  return schema;
};

export class MVUConverter {
  /**
   * 检测是否为 MVU 相关的角色卡或脚本
   */
  static detect(rawInput) {
    const raw = rawInput?.raw ? rawInput.raw : rawInput;
    if (!raw || typeof raw !== 'object') return false;
    const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const ext = data?.extensions || raw?.extensions || {};
    if (ext?.mvu || ext?.mvu_data || ext?.mvuData) return true;
    const entries = getWorldEntries(raw);
    return entries.some(hasMvuMarker);
  }

  /**
   * 检测脚本 JSON 是否包含 Zod Schema 定义
   * @param {object|string} scriptJson - 脚本 JSON 对象或字符串
   */
  static detectZodScript(scriptJson) {
    try {
      const data = typeof scriptJson === 'string' ? JSON.parse(scriptJson) : scriptJson;
      if (!data || typeof data !== 'object') return false;
      const content = data.content || '';
      return hasZodSchema(content);
    } catch {
      return false;
    }
  }

  /**
   * 解析 Zod Schema 脚本，提取变量定义
   * @param {object|string} scriptJson - 脚本 JSON 对象或字符串
   * @returns {{ variables: object, schemas: object, rawSchema: object|null, error: string|null, name: string }}
   */
  static parseZodScript(scriptJson) {
    return parseScriptJson(scriptJson);
  }

  /**
   * 直接解析脚本内容中的 Zod Schema
   * @param {string} scriptContent - 脚本内容
   * @returns {{ variables: object, schemas: object, rawSchema: object|null, error: string|null }}
   */
  static parseZodContent(scriptContent) {
    return parseMvuScript(scriptContent);
  }

  static extractStatData(rawInput) {
    const raw = rawInput?.raw ? rawInput.raw : rawInput;
    if (!raw || typeof raw !== 'object') return null;
    const data = raw.data && typeof raw.data === 'object' ? raw.data : raw;
    const ext = data?.extensions || raw?.extensions || {};
    const direct = ext?.mvu?.stat_data || ext?.mvu_data?.stat_data || ext?.mvuData?.stat_data;
    if (direct && typeof direct === 'object') return direct;

    const entries = getWorldEntries(raw);
    for (const entry of entries) {
      if (!entry) continue;
      const content = String(entry.content || '').trim();
      if (!content) continue;
      const blocks = extractJsonBlocks(content);
      for (const block of blocks) {
        const parsed = safeJsonParse(block);
        const statData = extractStatDataFromJson(parsed);
        if (statData) return statData;
      }
      const candidate = findJsonCandidate(content);
      if (candidate && /stat_data|mvu_data/i.test(candidate)) {
        const parsed = safeJsonParse(candidate);
        const statData = extractStatDataFromJson(parsed);
        if (statData) return statData;
      }
    }
    return null;
  }

  /**
   * 从角色卡中提取 stat_data（JSON 格式）
   */
  static convert(rawInput) {
    const statData = MVUConverter.extractStatData(rawInput);
    if (!statData || typeof statData !== 'object') {
      return { variables: {}, schemas: {}, rules: [], stageSchema: null };
    }
    const variables = {};
    const schemas = {};
    const flattenStatData = (value, prefix = '') => {
      const name = String(prefix || '').trim();
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        const entries = Object.entries(value);
        if (!entries.length) {
          if (name) {
            variables[name] = value;
            schemas[name] = inferSchema(name, value);
          }
          return;
        }
        entries.forEach(([key, val]) => {
          const next = name ? `${name}.${key}` : String(key || '').trim();
          if (!next) return;
          flattenStatData(val, next);
        });
        return;
      }
      if (!name) return;
      variables[name] = value;
      schemas[name] = inferSchema(name, value);
    };
    flattenStatData(statData, '');
    return { variables, schemas, rules: [], stageSchema: null };
  }

  /**
   * 综合转换方法：支持角色卡 JSON 和 Zod Schema 脚本
   *
   * @param {object} options
   * @param {object} [options.characterCard] - 角色卡数据
   * @param {object|string} [options.script] - MVU 脚本 JSON
   * @param {string} [options.scriptContent] - 脚本内容（直接传入 content 字段）
   * @returns {{ variables: object, schemas: object, rules: [], stageSchema: null, source: string, error: string|null }}
   */
  static convertAll(options = {}) {
    const result = {
      variables: {},
      schemas: {},
      rules: [],
      stageSchema: null,
      source: 'none',
      error: null,
    };

    // 优先尝试 Zod Schema 脚本（更精确的类型信息）
    if (options.script) {
      const parsed = MVUConverter.parseZodScript(options.script);
      if (!parsed.error && Object.keys(parsed.variables).length > 0) {
        result.variables = parsed.variables;
        result.schemas = parsed.schemas;
        result.source = 'zod_script';
        return result;
      }
      if (parsed.error) {
        result.error = parsed.error;
      }
    }

    // 尝试直接解析脚本内容
    if (options.scriptContent) {
      const parsed = MVUConverter.parseZodContent(options.scriptContent);
      if (!parsed.error && Object.keys(parsed.variables).length > 0) {
        result.variables = parsed.variables;
        result.schemas = parsed.schemas;
        result.source = 'zod_content';
        result.error = null;
        return result;
      }
      if (parsed.error && !result.error) {
        result.error = parsed.error;
      }
    }

    // 回退到角色卡 stat_data 提取
    if (options.characterCard) {
      const converted = MVUConverter.convert(options.characterCard);
      if (Object.keys(converted.variables).length > 0) {
        result.variables = converted.variables;
        result.schemas = converted.schemas;
        result.source = 'stat_data';
        result.error = null;
        return result;
      }
    }

    return result;
  }

  /**
   * 批量解析多个脚本，合并变量定义
   * @param {Array<object|string>} scripts - 脚本 JSON 数组
   * @returns {{ variables: object, schemas: object, errors: string[] }}
   */
  static parseMultipleScripts(scripts) {
    const result = {
      variables: {},
      schemas: {},
      errors: [],
    };

    if (!Array.isArray(scripts)) return result;

    for (const script of scripts) {
      if (!script) continue;

      // 跳过非 Zod Schema 脚本（如纯 import 的 MVU 加载脚本）
      if (!MVUConverter.detectZodScript(script)) {
        continue;
      }

      const parsed = MVUConverter.parseZodScript(script);
      if (parsed.error) {
        result.errors.push(`${parsed.name || '未知脚本'}: ${parsed.error}`);
        continue;
      }

      // 合并变量和 Schema
      Object.assign(result.variables, parsed.variables);
      Object.assign(result.schemas, parsed.schemas);
    }

    return result;
  }
}
