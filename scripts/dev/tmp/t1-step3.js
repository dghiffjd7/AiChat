(() => {
  const r = window.__testRunDone?.result;
  const s3 = (r?.steps || [])[2];
  return s3 ? JSON.stringify(s3.output || s3).slice(0, 2500) : null;
})()
