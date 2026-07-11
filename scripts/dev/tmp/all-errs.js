(() => {
  const errs = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  // 最近一轮（at 相近的一组）
  const latest = errs[errs.length - 1]?.at || 0;
  const round = errs.filter(e => latest - e.at < 60000);
  return round.map(e => ({ at: e.at, msg: (e.message || '').slice(0, 120), line: e.line, stackHead: (e.stack || '').slice(0, 260) }));
})()
