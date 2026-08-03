import { normalizeRegexRule } from '../storage/regex-store.js';
import { hasTauriRuntime, pickSavePath } from './save-dialog.js';
import { safeInvoke } from './tauri.js';

export const genRegexId = (prefix = 're') =>
  `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;

const asArray = (value) => Array.isArray(value) ? value : [];

export const normalizeRegexScript = normalizeRegexRule;

export const getRegexRuleSignature = (rule = {}) => {
  const r = normalizeRegexScript(rule);
  const placement = asArray(r.placement).map(Number).filter(Number.isFinite).sort((a, b) => a - b).join(',');
  const trim = asArray(r.trimStrings).map(String).join('\n');
  const minDepth = r.minDepth === null || r.minDepth === undefined ? '' : String(r.minDepth);
  const maxDepth = r.maxDepth === null || r.maxDepth === undefined ? '' : String(r.maxDepth);
  return [
    r.findRegex,
    r.replaceString,
    trim,
    placement,
    r.disabled ? '1' : '0',
    r.markdownOnly ? '1' : '0',
    r.promptOnly ? '1' : '0',
    r.runOnEdit ? '1' : '0',
    String(Number(r.substituteRegex || 0)),
    minDepth,
    maxDepth,
  ].join('\u0000');
};

const normalizeRuleList = (rules = []) => {
  const seen = new Set();
  const out = [];
  asArray(rules).forEach((raw) => {
    if (!raw || typeof raw !== 'object') return;
    const rule = normalizeRegexScript(raw);
    if (!String(rule.findRegex || '').trim()) return;
    const sig = getRegexRuleSignature(rule);
    if (!sig || seen.has(sig)) return;
    seen.add(sig);
    out.push(rule);
  });
  return out;
};

const GENERIC_SOURCE_NAME_PATTERNS = [
  /^regex\s*scripts?$/i,
  /^regex\s*bindings?$/i,
  /^regex\s*binding\s*scripts?$/i,
  /^regexbinding$/i,
  /^regexbinding\s*scripts?$/i,
  /^bindings?$/i,
  /^绑定正则(?:\s*\d+)?$/i,
  /^导入正则(?:\s*\d+)?$/i,
];

export const stripGenericRegexSetName = (value) => {
  let name = String(value || '').trim();
  if (!name) return '';
  if (/^(?:regex\s*(?:scripts?|bindings?|binding\s*scripts?)|regexbinding\s*scripts?|regexbinding|bindings?|绑定正则|导入正则)(?:\s*(?:\([^)]*\)|（[^）]*）|\[[^\]]*\]))?(?:\s*[-_:：/|]?\s*\d+)?$/i.test(name)) {
    return '';
  }
  for (let i = 0; i < 3; i += 1) {
    const next = name
      .replace(/^(?:regex\s*(?:scripts?|bindings?|binding\s*scripts?)|regexbinding\s*scripts?|regexbinding|bindings?|绑定正则|导入正则)\s*/i, '')
      .replace(/^(?:\((?:regex\s*)?(?:scripts?|bindings?)\)|（(?:regex\s*)?(?:scripts?|bindings?)）|\[(?:regex\s*)?(?:scripts?|bindings?)\])\s*/i, '')
      .replace(/^\s*[-_:：/|]+\s*/, '')
      .trim();
    if (next === name) break;
    name = next;
  }
  return name;
};

const isGenericSourceName = (value) => {
  const name = stripGenericRegexSetName(value) || String(value || '').trim();
  return Boolean(name) && GENERIC_SOURCE_NAME_PATTERNS.some((pattern) => pattern.test(name));
};

const getNameFromRules = (rules = []) => {
  const names = [];
  const seen = new Set();
  asArray(rules).forEach((rule) => {
    const name = String(rule?.scriptName || rule?.script_name || rule?.name || '').trim();
    if (!name || seen.has(name)) return;
    seen.add(name);
    names.push(name);
  });
  if (names.length === 1) return names[0];
  if (names.length > 1) return `${names[0]} 等 ${names.length} 条`;
  return '';
};

export const getRegexImportSetName = (name, rules = [], fallbackName = '导入正则') => {
  const explicitName = stripGenericRegexSetName(name);
  if (explicitName && !isGenericSourceName(explicitName)) return explicitName;

  const ruleName = getNameFromRules(rules);
  if (ruleName) return ruleName;

  const fallback = stripGenericRegexSetName(fallbackName);
  if (fallback && !isGenericSourceName(fallback)) return fallback;

  return explicitName || fallback || '未命名正则';
};

const normalizeSet = (set = {}, fallbackName = '导入正则') => {
  const sourceRules = Array.isArray(set.rules)
    ? set.rules
    : (Array.isArray(set.regexes)
      ? set.regexes
      : (Array.isArray(set.regex_scripts) ? set.regex_scripts : asArray(set.regexScripts)));
  const rules = normalizeRuleList(sourceRules);
  if (!rules.length) return null;
  const rawName = String(set.name || set.title || '').trim();
  return {
    name: getRegexImportSetName(rawName, rules, fallbackName),
    enabled: set.enabled !== false,
    rules,
  };
};

const pushUniqueRules = (target, seen, rules = []) => {
  normalizeRuleList(rules).forEach((rule) => {
    const sig = getRegexRuleSignature(rule);
    if (!sig || seen.has(sig)) return;
    seen.add(sig);
    target.push(rule);
  });
};

const pushUniqueSet = (target, seen, set) => {
  if (!set || !Array.isArray(set.rules) || !set.rules.length) return;
  const sig = set.rules.map(getRegexRuleSignature).sort().join('\u0001');
  if (!sig || seen.has(sig)) return;
  seen.add(sig);
  target.push(set);
};

const getExtensionRegexes = (node = {}) => {
  const ext = node?.extensions && typeof node.extensions === 'object' ? node.extensions : {};
  return [
    ...asArray(node.regex_scripts),
    ...asArray(node.regexScripts),
    ...asArray(node.regex),
    ...asArray(node.regexes),
    ...asArray(ext.regex_scripts),
    ...asArray(ext.regexScripts),
    ...asArray(ext.regex),
    ...asArray(ext.regexes),
  ];
};

const getRegexBindingRules = (node = {}) => {
  const out = [];
  const containers = [
    node,
    node?.SPreset,
    node?.SPresetSettings,
    node?.extensions,
    node?.extensions?.SPreset,
    node?.extensions?.SPresetSettings,
  ];
  containers.forEach((container) => {
    const binding = container?.RegexBinding || container?.regexBinding;
    if (Array.isArray(binding?.regexes)) out.push(...binding.regexes);
    if (Array.isArray(binding?.rules)) out.push(...binding.rules);
  });
  return out;
};

export const parseRegexImportData = (data = {}) => {
  const result = { name: '', rules: [], sets: [] };
  const seenRules = new Set();
  const seenSets = new Set();

  const addRules = (rules = []) => pushUniqueRules(result.rules, seenRules, rules);
  const addSet = (rawSet, fallbackName) => {
    const set = normalizeSet(rawSet, fallbackName);
    pushUniqueSet(result.sets, seenSets, set);
  };
  const addRuleSet = (name, rules, enabled = true) => addSet({ name, rules, enabled }, name);

  if (Array.isArray(data)) {
    const looksLikeSets = data.some((item) =>
      item && typeof item === 'object' && (
        Array.isArray(item.rules)
        || Array.isArray(item.regexes)
        || Array.isArray(item.regex_scripts)
        || Array.isArray(item.regexScripts)
      )
    );
    if (looksLikeSets) data.forEach((item, index) => addSet(item, `导入正则 ${index + 1}`));
    else addRules(data);
    return result;
  }

  if (!data || typeof data !== 'object') return result;
  result.name = String(data.name || data.title || '').trim();

  const hasOwn = key => Object.prototype.hasOwnProperty.call(data, key);
  const looksLikeRule = hasOwn('findRegex')
    || hasOwn('find_regex')
    || (hasOwn('pattern') && (
      hasOwn('flags')
      || hasOwn('when')
      || hasOwn('replacement')
      || hasOwn('replaceString')
      || hasOwn('replace_string')
    ));
  if (looksLikeRule) addRules([data]);

  addRules(data.rules);
  addRules(data.global?.rules);
  addRules(getExtensionRegexes(data));
  addRuleSet('', getRegexBindingRules(data), data.enabled !== false);

  asArray(data.boundRegexSets || data.bound_regex_sets).forEach((set, index) => addSet(set, `绑定正则 ${index + 1}`));
  asArray(data.sets || data.regexSets || data.regex_sets).forEach((set, index) => addSet(set, `导入正则 ${index + 1}`));

  const localSets = data.local?.sets && typeof data.local.sets === 'object' ? data.local.sets : null;
  if (localSets) {
    Object.values(localSets).forEach((set, index) => addSet(set, `局部正则 ${index + 1}`));
  }

  const visit = (node, depth = 0) => {
    if (!node || depth > 10) return;
    if (typeof node === 'string') {
      const raw = node.trim();
      if (!raw || !/regexbinding/i.test(raw) || !(raw.startsWith('{') || raw.startsWith('['))) return;
      try {
        visit(JSON.parse(raw), depth + 1);
      } catch {}
      return;
    }
    if (Array.isArray(node)) {
      node.forEach((item) => visit(item, depth + 1));
      return;
    }
    if (typeof node !== 'object') return;
    const bindingRules = getRegexBindingRules(node);
    if (bindingRules.length) addRuleSet('', bindingRules);
    const extRules = getExtensionRegexes(node);
    if (extRules.length) addRules(extRules);
    Object.entries(node).forEach(([key, value]) => {
      if (key === 'rules' || key === 'regexes' || key === 'regex_scripts' || key === 'regexScripts') return;
      visit(value, depth + 1);
    });
  };
  visit(data);

  return result;
};

export const parseRegexImportText = (text = '') => {
  const raw = String(text || '').replace(/^\uFEFF/, '').trim();
  if (!raw) throw new Error('文件为空');
  return parseRegexImportData(JSON.parse(raw));
};

export const flattenRegexImportRules = (parsed = {}) => {
  const seen = new Set();
  const out = [];
  pushUniqueRules(out, seen, parsed.rules);
  asArray(parsed.sets).forEach((set) => pushUniqueRules(out, seen, set?.rules));
  return out;
};

const bytesToBase64 = (bytes) => {
  const chunkSize = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const slice = bytes.subarray(i, i + chunkSize);
    binary += String.fromCharCode(...slice);
  }
  return btoa(binary);
};

const buildJsonDataUrl = (text) => {
  const bytes = new TextEncoder().encode(String(text || ''));
  return `data:application/json;base64,${bytesToBase64(bytes)}`;
};

const pickJsonSavePath = async (defaultName) =>
  pickSavePath({ defaultName, filters: [{ name: 'JSON', extensions: ['json'] }] });

const browserDownloadJsonFile = (text, filename) => {
  const blob = new Blob([text], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
};

export const downloadJsonFile = async (data, filename = 'regex.json') => {
  const text = JSON.stringify(data, null, 2);
  if (!hasTauriRuntime()) {
    browserDownloadJsonFile(text, filename);
    return { saved: true, cancelled: false, path: filename };
  }

  const pick = await pickJsonSavePath(filename);
  if (pick.cancelled) return { saved: false, cancelled: true, path: '' };

  const dataUrl = buildJsonDataUrl(text);
  const resp = pick.fallback
    ? await safeInvoke('export_attachment', { dataUrl, fileName: filename })
    : await safeInvoke('export_attachment', { dataUrl, fileName: filename, path: pick.path });

  return {
    saved: true,
    cancelled: false,
    path: String(resp?.path || pick.path || filename || '').trim(),
  };
};

export const pickJsonFileText = () => new Promise((resolve) => {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  const cleanup = () => {
    try { input.remove(); } catch {}
  };
  input.onchange = () => {
    const file = input.files?.[0];
    if (!file) { cleanup(); resolve(null); return; }
    const reader = new FileReader();
    reader.onload = () => { cleanup(); resolve(reader.result); };
    reader.onerror = () => { cleanup(); resolve(null); };
    reader.readAsText(file);
  };
  document.body.appendChild(input);
  input.click();
});
