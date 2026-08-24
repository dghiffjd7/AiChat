(async () => {
  const bridge = window.appBridge;
  if (!bridge?.processTextMacros) return { error: 'processTextMacros missing' };
  // 隔离态：macroVariableState 使所有读写走模拟 Map，不触及真实变量存储
  const iso = () => ({ macroVariableState: new Map() });
  const results = {};
  results.setGet = bridge.processTextMacros('{{setglobalvar::__probe::7}}{{getglobalvar::__probe}}', iso());
  results.scopeIsolation = bridge.processTextMacros('{{setvar::__probe::1}}{{setglobalvar::__probe::2}}{{getvar::__probe}}{{getglobalvar::__probe}}', iso());
  results.incDec = bridge.processTextMacros('{{setglobalvar::__n::5}}{{incglobalvar::__n}}{{decglobalvar::__n}}', iso());
  results.add = bridge.processTextMacros('{{setglobalvar::__a::3}}{{addglobalvar::__a::4}}{{getglobalvar::__a}}', iso());
  results.realStoreUntouched = bridge.chatStore?.getGlobalVariable?.('__probe') ?? null;
  return results;
})()
