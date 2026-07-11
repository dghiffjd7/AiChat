(() => {
  const list = JSON.parse(localStorage.getItem('__chatapp_iframe_script_errors') || '[]');
  return { count: list.length, records: list.slice(-3) };
})()
