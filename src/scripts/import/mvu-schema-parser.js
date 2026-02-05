/**
 * MVU Zod Schema 解析器
 *
 * 解析酒馆 MVU 脚本中的 Zod Schema 定义，提取变量结构。
 * 不执行脚本，只静态分析 Schema 定义部分。
 */

/**
 * 创建一个"记录型" Zod 模拟对象
 * 不做实际验证，只记录 Schema 结构
 */
const createZodRecorder = () => {
  const createChain = (type, extra = {}) => {
    const info = { _type: type, ...extra };

    const chain = {
      // 获取记录的信息
      _getInfo: () => info,

      // 常用方法
      prefault: (val) => {
        info._default = val;
        return chain;
      },
      default: (val) => {
        info._default = val;
        return chain;
      },
      describe: (desc) => {
        info._description = desc;
        return chain;
      },
      transform: (fn) => {
        // 尝试从 transform 函数中提取范围信息
        try {
          const fnStr = fn.toString();
          // 匹配 _.clamp(v, min, max)
          const clampMatch = fnStr.match(/clamp\s*\([^,]+,\s*(-?\d+(?:\.\d+)?),\s*(-?\d+(?:\.\d+)?)\)/);
          if (clampMatch) {
            info._range = {
              min: parseFloat(clampMatch[1]),
              max: parseFloat(clampMatch[2]),
            };
          }
          // 匹配 _.max([min, v]) 形式 (下限)
          const maxMatch = fnStr.match(/max\s*\(\s*\[\s*(-?\d+(?:\.\d+)?)/);
          if (maxMatch && !info._range) {
            info._range = { min: parseFloat(maxMatch[1]), max: null };
          }
        } catch {}
        return chain;
      },
      optional: () => {
        info._optional = true;
        return chain;
      },
      nullable: () => {
        info._nullable = true;
        return chain;
      },
      // 其他常见方法（返回 chain 保持链式调用）
      min: (val) => { info._min = val; return chain; },
      max: (val) => { info._max = val; return chain; },
      length: (val) => { info._length = val; return chain; },
      email: () => chain,
      url: () => chain,
      uuid: () => chain,
      regex: () => chain,
      trim: () => chain,
      toLowerCase: () => chain,
      toUpperCase: () => chain,
      int: () => chain,
      positive: () => { info._range = { ...(info._range || {}), min: 0 }; return chain; },
      negative: () => { info._range = { ...(info._range || {}), max: 0 }; return chain; },
      nonnegative: () => { info._range = { ...(info._range || {}), min: 0 }; return chain; },
      nonpositive: () => { info._range = { ...(info._range || {}), max: 0 }; return chain; },
      finite: () => chain,
      safe: () => chain,
    };

    return chain;
  };

  const z = {
    // 基本类型
    string: () => createChain('string'),
    number: () => createChain('number'),
    boolean: () => createChain('boolean'),
    bigint: () => createChain('bigint'),
    date: () => createChain('date'),
    undefined: () => createChain('undefined'),
    null: () => createChain('null'),
    void: () => createChain('void'),
    any: () => createChain('any'),
    unknown: () => createChain('unknown'),
    never: () => createChain('never'),

    // 复合类型
    object: (shape) => createChain('object', { _shape: shape }),
    array: (itemType) => createChain('array', { _itemType: itemType }),
    tuple: (...items) => createChain('tuple', { _items: items }),
    record: (keyType, valueType) => createChain('record', { _keyType: keyType, _valueType: valueType }),
    map: (keyType, valueType) => createChain('map', { _keyType: keyType, _valueType: valueType }),
    set: (itemType) => createChain('set', { _itemType: itemType }),

    // 枚举和联合
    enum: (values) => createChain('enum', { _options: values }),
    nativeEnum: (enumObj) => createChain('nativeEnum', { _enumObj: enumObj }),
    union: (...types) => createChain('union', { _types: types }),
    discriminatedUnion: (key, types) => createChain('discriminatedUnion', { _key: key, _types: types }),
    intersection: (...types) => createChain('intersection', { _types: types }),

    // 特殊类型
    literal: (value) => createChain('literal', { _value: value }),
    promise: (inner) => createChain('promise', { _inner: inner }),
    function: () => createChain('function'),
    lazy: (getter) => createChain('lazy', { _getter: getter }),

    // coerce 系列
    coerce: {
      string: () => createChain('string', { _coerce: true }),
      number: () => createChain('number', { _coerce: true }),
      boolean: () => createChain('boolean', { _coerce: true }),
      bigint: () => createChain('bigint', { _coerce: true }),
      date: () => createChain('date', { _coerce: true }),
    },

    // 辅助方法
    optional: (inner) => {
      const chain = inner || createChain('any');
      if (chain._getInfo) chain._getInfo()._optional = true;
      return chain;
    },
    nullable: (inner) => {
      const chain = inner || createChain('any');
      if (chain._getInfo) chain._getInfo()._nullable = true;
      return chain;
    },

    // 扩展方法（兼容 MVU 使用的自定义方法）
    looseObject: (shape) => createChain('object', { _shape: shape, _loose: true }),
  };

  return z;
};

/**
 * 创建模拟的 lodash 对象
 */
const createLodashMock = () => ({
  clamp: (val, min, max) => Math.min(Math.max(val, min), max),
  max: (arr) => Array.isArray(arr) ? Math.max(...arr) : arr,
  min: (arr) => Array.isArray(arr) ? Math.min(...arr) : arr,
  get: (obj, path, def) => {
    const keys = typeof path === 'string' ? path.split('.') : path;
    let result = obj;
    for (const key of keys) {
      if (result == null) return def;
      result = result[key];
    }
    return result === undefined ? def : result;
  },
  set: (obj, path, value) => {
    const keys = typeof path === 'string' ? path.split('.') : path;
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (!current[keys[i]]) current[keys[i]] = {};
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
    return obj;
  },
});

/**
 * 从脚本内容中提取 Schema 定义部分
 */
const extractSchemaCode = (content) => {
  const raw = String(content || '');

  // 移除 import 语句
  let cleaned = raw.replace(/import\s+[\s\S]*?from\s+['"][^'"]+['"];?\s*/g, '');
  cleaned = cleaned.replace(/import\s+['"][^'"]+['"];?\s*/g, '');

  // 移除 $(() => { ... }) 包装
  cleaned = cleaned.replace(/\$\s*\(\s*\(\s*\)\s*=>\s*\{[\s\S]*?\}\s*\)\s*;?/g, '');
  cleaned = cleaned.replace(/\$\s*\(\s*function\s*\(\s*\)\s*\{[\s\S]*?\}\s*\)\s*;?/g, '');

  // 尝试提取 export const Schema = z.object({...})
  const exportMatch = cleaned.match(/export\s+const\s+Schema\s*=\s*(z\.[\s\S]*?)(?:;?\s*$|;?\s*(?:export|const|let|var|function|class)\s)/);
  if (exportMatch) {
    return exportMatch[1].replace(/;+\s*$/, '');
  }

  // 尝试提取 const Schema = z.object({...})
  const constMatch = cleaned.match(/const\s+Schema\s*=\s*(z\.[\s\S]*?)(?:;?\s*$|;?\s*(?:export|const|let|var|function|class)\s)/);
  if (constMatch) {
    return constMatch[1].replace(/;+\s*$/, '');
  }

  // 尝试提取任何 z.object({...}) 形式
  const objectMatch = cleaned.match(/(z\.object\s*\(\s*\{[\s\S]*\}\s*\))/);
  if (objectMatch) {
    return objectMatch[1];
  }

  return null;
};

/**
 * 将记录的 Schema 信息转换为我们的原生格式
 */
const convertToNativeSchema = (info, path = []) => {
  if (!info || typeof info !== 'object') return null;

  // 获取 _getInfo() 的结果（如果是 chain 对象）
  const data = typeof info._getInfo === 'function' ? info._getInfo() : info;

  const type = data._type || 'string';
  const result = {
    type: mapType(type),
    default: data._default,
    description: data._description || null,
    range: data._range || null,
    options: data._options || null,
    optional: data._optional || false,
    nullable: data._nullable || false,
  };

  // 处理嵌套对象
  if (type === 'object' && data._shape) {
    result.properties = {};
    Object.entries(data._shape).forEach(([key, value]) => {
      const nested = convertToNativeSchema(value, [...path, key]);
      if (nested) {
        result.properties[key] = nested;
      }
    });
  }

  // 处理 record 类型
  if (type === 'record' && data._valueType) {
    result.valueSchema = convertToNativeSchema(data._valueType, [...path, '*']);
  }

  // 处理数组类型
  if (type === 'array' && data._itemType) {
    result.itemSchema = convertToNativeSchema(data._itemType, [...path, '[]']);
  }

  return result;
};

/**
 * 映射 Zod 类型到我们的类型系统
 */
const mapType = (zodType) => {
  const mapping = {
    'string': 'string',
    'number': 'number',
    'boolean': 'boolean',
    'enum': 'enum',
    'object': 'object',
    'array': 'array',
    'record': 'object',
    'map': 'object',
    'set': 'array',
    'tuple': 'array',
    'bigint': 'number',
    'date': 'string',
    'literal': 'string',
    'union': 'string',
    'any': 'string',
    'unknown': 'string',
  };
  return mapping[zodType] || 'string';
};

/**
 * 将嵌套的 Schema 展平为变量列表
 */
const flattenSchema = (schema, prefix = '', results = { variables: {}, schemas: {} }) => {
  if (!schema || typeof schema !== 'object') return results;

  const type = schema.type || 'string';

  if (type === 'object' && schema.properties) {
    // 递归处理嵌套属性
    Object.entries(schema.properties).forEach(([key, value]) => {
      const fullPath = prefix ? `${prefix}.${key}` : key;
      flattenSchema(value, fullPath, results);
    });
  } else {
    // 叶子节点 - 创建变量
    const varName = prefix || 'value';

    // 变量初始值
    results.variables[varName] = schema.default !== undefined ? schema.default : getDefaultValue(type, schema);

    // 变量 Schema
    results.schemas[varName] = {
      id: varName,
      name: varName.split('.').pop() || varName,
      type: type,
      default: schema.default,
      range: schema.range,
      options: schema.options,
      ui: inferUI(varName, type, schema),
    };
  }

  return results;
};

/**
 * 获取类型的默认值
 */
const getDefaultValue = (type, schema) => {
  switch (type) {
    case 'number': return 0;
    case 'boolean': return false;
    case 'array': return [];
    case 'object': return {};
    case 'enum': return schema.options?.[0] || '';
    default: return '';
  }
};

/**
 * 推断 UI 配置
 */
const inferUI = (name, type, schema) => {
  const ui = {
    display: 'card',
    label: name.split('.').pop() || name,
    color: '',
    icon: '',
    format: '',
  };

  // 根据名称和类型推断显示方式
  const nameLower = name.toLowerCase();

  if (type === 'number') {
    if (schema.range && schema.range.min !== null && schema.range.max !== null) {
      ui.display = 'progress';
      ui.format = `{value}/${schema.range.max}`;
    }
    // 常见的进度类变量
    if (/好感|生命|体力|血量|饥饿|口渴|精神|心情|体温|hp|health|stamina|hunger|thirst/.test(nameLower)) {
      ui.display = 'progress';
      if (!schema.range) {
        ui.format = '{value}/100';
      }
    }
  }

  if (type === 'boolean') {
    ui.display = 'badge';
  }

  if (type === 'enum') {
    ui.display = 'badge';
  }

  // 根据名称推断图标
  if (/好感|爱|love|affection/.test(nameLower)) ui.icon = '❤️';
  if (/生命|血量|hp|health/.test(nameLower)) ui.icon = '💗';
  if (/体力|stamina/.test(nameLower)) ui.icon = '⚡';
  if (/金币|money|gold|coin/.test(nameLower)) ui.icon = '💰';
  if (/天气|weather/.test(nameLower)) ui.icon = '🌤️';
  if (/时间|time/.test(nameLower)) ui.icon = '🕐';
  if (/位置|location/.test(nameLower)) ui.icon = '📍';

  return ui;
};

/**
 * 解析 MVU 脚本内容，提取变量 Schema
 *
 * @param {string} scriptContent - 脚本内容（JSON 的 content 字段）
 * @returns {{ variables: object, schemas: object, rawSchema: object|null, error: string|null }}
 */
export const parseMvuScript = (scriptContent) => {
  const result = {
    variables: {},
    schemas: {},
    rawSchema: null,
    error: null,
  };

  try {
    const schemaCode = extractSchemaCode(scriptContent);
    if (!schemaCode) {
      result.error = '未找到 Schema 定义';
      return result;
    }

    // 创建沙箱环境
    const z = createZodRecorder();
    const _ = createLodashMock();

    // 在沙箱中执行 Schema 定义
    // 使用 Function 构造器创建隔离的执行环境
    const sandbox = new Function('z', '_', `
      "use strict";
      try {
        return ${schemaCode};
      } catch (e) {
        return { _error: e.message };
      }
    `);

    const schemaResult = sandbox(z, _);

    if (schemaResult?._error) {
      result.error = `Schema 解析错误: ${schemaResult._error}`;
      return result;
    }

    // 转换为原生格式
    const nativeSchema = convertToNativeSchema(schemaResult);
    result.rawSchema = nativeSchema;

    // 展平为变量列表
    const flattened = flattenSchema(nativeSchema);
    result.variables = flattened.variables;
    result.schemas = flattened.schemas;

  } catch (err) {
    result.error = `解析失败: ${err.message || err}`;
  }

  return result;
};

/**
 * 检测脚本是否包含 Zod Schema 定义
 */
export const hasZodSchema = (scriptContent) => {
  const raw = String(scriptContent || '');
  return /z\.object\s*\(/.test(raw) || /export\s+const\s+Schema\s*=/.test(raw);
};

/**
 * 从 JS-Slash-Runner 脚本 JSON 中提取并解析 Schema
 */
export const parseScriptJson = (scriptJson) => {
  const result = {
    name: '',
    variables: {},
    schemas: {},
    rawSchema: null,
    error: null,
  };

  try {
    const data = typeof scriptJson === 'string' ? JSON.parse(scriptJson) : scriptJson;

    if (!data || typeof data !== 'object') {
      result.error = '无效的脚本 JSON';
      return result;
    }

    result.name = data.name || '';

    const content = data.content || '';
    if (!content) {
      result.error = '脚本内容为空';
      return result;
    }

    if (!hasZodSchema(content)) {
      result.error = '脚本中未找到 Zod Schema 定义';
      return result;
    }

    const parsed = parseMvuScript(content);
    result.variables = parsed.variables;
    result.schemas = parsed.schemas;
    result.rawSchema = parsed.rawSchema;
    result.error = parsed.error;

  } catch (err) {
    result.error = `JSON 解析失败: ${err.message || err}`;
  }

  return result;
};

export default {
  parseMvuScript,
  parseScriptJson,
  hasZodSchema,
};
