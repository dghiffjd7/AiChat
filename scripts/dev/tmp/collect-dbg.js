(() => {
  const all = window.__dbgAll || [];
  const interesting = all.filter(l => /error|babel|blob|script|fallback|write-flush/i.test(l));
  return { total: all.length, hits: interesting.slice(-25) };
})()
