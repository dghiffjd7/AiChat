(() => {
  const p = localStorage.getItem('__chatapp_doc_probe');
  return p ? JSON.parse(p) : { none: true };
})()
