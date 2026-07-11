(() => {
  const srcdoc = document.querySelector('iframe')?.srcdoc || '';
  const idx = srcdoc.indexOf('chatapp-resize');
  return {
    at: idx,
    context: srcdoc.slice(Math.max(0, idx - 200), idx + 120).replace(/\n/g, '\\n'),
    headOpenAt: srcdoc.indexOf('<head'),
    headCloseAt: srcdoc.indexOf('</head>'),
  };
})()
