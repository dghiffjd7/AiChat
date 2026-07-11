(() => {
  // 找最近一次发送失败的错误文本样本：chat 消息里的错误气泡 / debug 面板日志
  const reg = window.appBridge?.debugUiRegistry;
  const logs = (window.__appLogBuffer || []).slice(-40);
  const errLogs = logs.filter(l => /error|失败|Error/i.test(JSON.stringify(l))).slice(-5);
  return { errLogs: errLogs.map(l => JSON.stringify(l).slice(0, 300)), hasBuffer: !!window.__appLogBuffer };
})()
