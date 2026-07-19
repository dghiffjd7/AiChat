// 增量审计固化：对运行中 APP 的全部启用脚本做一次性兼容健康扫描。
// 目的——把"以后出现新脚本家族时增量审计"从凭记忆逐卡点，变成 `npm run smoke:app` 一键看红绿。
//
// 判定：所有启用脚本都属于已审计家族（归一化名命中 AUDITED_FAMILIES）且脚本运行时可用 → PASS。
// 出现未知家族（新导入且未审计的脚本）→ FAIL，detail.newFamilies 直接给出名字/scope/它调用的酒馆 API，
// 作为审计起点。审计并接纳某个新家族后，把它的归一化名加进下面 AUDITED_FAMILIES 即可转绿。
//
// 归一化只剥版本号（带点的 v7.1/V6.0/2.8.0）、尾部括注（（…）/(…)）与作者尾标（ —作者），
// 故同家族的版本升级仍匹配，真正的新脚本才会落到 newFamilies。
(async () => {
  const bridge = window.appBridge;
  const scriptStore = bridge?.getScriptStore?.();
  const scriptRuntime = bridge?.getScriptRuntime?.();
  const st = scriptStore?.state || {};

  // 当前库已逐一审计并确认执行结论的脚本家族（归一化名）。
  const AUDITED_FAMILIES = new Set([
    'MVU Zod 脚本', '变量结构设计', '苍玄大陆地图标记', '一键切换插图显示正则',
    '自动开启角色卡局部正则', '世界书强制用推荐的全局设置', '世界书强制自定义排序',
    '酒馆思维链清洗', '预设对比助手', '格式肘击大师', '对话渲染系统',
    '三人成行悬浮窗', '双人成行悬浮窗', '悬浮窗V3', '悬浮球V2', '防奶人', 'TGbreak😺',
  ]);

  const API_VOCAB = [
    'getChatMessages', 'setChatMessages', 'getLastMessageId', 'getCurrentMessageId', 'updateMessageBlock',
    'eventOn', 'eventOnButton', 'tavern_events', 'getTavernRegexes', 'replaceTavernRegexes', 'updateTavernRegexes',
    'replaceScriptButtons', 'getScriptId', 'setExtensionPrompt', 'injectPrompts', 'uninjectPrompts',
    'getVariables', 'setVariables', 'updateVariablesWith', 'insertOrAssignVariables', 'deleteVariable',
    'registerVariableSchema', 'triggerSlash', 'substitudeMacros', 'SillyTavern', 'TavernHelper',
    'callGenericPopup', 'XMLHttpRequest', 'WebSocket', 'importScripts',
  ];

  const normalizeFamily = (name) => String(name || '')
    .replace(/[（(][^）)]*[）)]\s*$/g, '')            // 尾部括注
    .replace(/\s*[—–-]\s*[^\s—–-]+\s*$/g, '')          // 作者尾标（ —凝嘤嘤 等）
    .replace(/\s*[vV]?\d+(?:\.\d+)+\s*$/g, '')          // 带点版本号
    .trim();

  const fingerprint = (content) => {
    const c = String(content || '');
    const apis = API_VOCAB.filter(api => c.includes(api));
    if (/fetch\s*\(/.test(c)) apis.push('fetch');
    if (/new\s+Function\s*\(/.test(c)) apis.push('new Function');
    return apis;
  };

  const enabled = [];
  const pushBucket = (scope, scopeId, bucket) => (bucket?.scripts || [])
    .filter(s => s && s.enabled === true)
    .forEach(s => enabled.push({
      scope,
      scopeId: String(scopeId).slice(0, 40),
      name: String(s.name || '').slice(0, 48),
      family: normalizeFamily(s.name),
      apis: fingerprint(s.content),
      remote: /fetch\s*\(\s*['"`]https?:/.test(String(s.content || '')),
    }));
  pushBucket('global', 'global', st.global);
  Object.entries(st.character || {}).forEach(([id, b]) => pushBucket('character', id, b));
  Object.entries(st.preset || {}).forEach(([id, b]) => pushBucket('preset', id, b));

  const newFamilies = enabled
    .filter(x => x.family && !AUDITED_FAMILIES.has(x.family))
    // 同名新家族在多个 scope 出现时只报一次
    .filter((x, i, arr) => arr.findIndex(y => y.family === x.family) === i)
    .map(x => ({ name: x.name, family: x.family, scope: x.scope, apis: x.apis, remote: x.remote }));

  // 取证：iframe 脚本错误探针（跨会话持久，最多 10 条）作为 detail 信号，不作硬门（可能是历史陈留）。
  let iframeErrorProbe = 0;
  try {
    iframeErrorProbe = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]').length;
  } catch {}

  const runtimeEnabled = typeof scriptRuntime?.isEnabled === 'function'
    ? scriptRuntime.isEnabled()
    : Boolean(scriptRuntime);

  const pass = newFamilies.length === 0 && runtimeEnabled === true && enabled.length > 0;
  return {
    pass,
    detail: {
      totalEnabled: enabled.length,
      auditedFamilies: AUDITED_FAMILIES.size,
      newFamilies,
      runtimeEnabled,
      iframeErrorProbe,
    },
  };
})()
