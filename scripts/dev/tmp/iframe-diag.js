(() => {
  const iframe = document.querySelector('iframe');
  if (!iframe) return { err: 'no iframe' };
  const r = iframe.getBoundingClientRect();
  const srcdoc = iframe.srcdoc || '';
  return {
    rect: { w: Math.round(r.width), h: Math.round(r.height) },
    styleHeight: iframe.style.height,
    usesVh: /100vh|100dvh/.test(srcdoc),
    bodyHeightRule: (srcdoc.match(/body\s*\{[^}]*height[^;}]*/i) || [''])[0].slice(0, 120),
    htmlHeightRule: (srcdoc.match(/html\s*[,{][^}]*height[^;}]*/i) || [''])[0].slice(0, 120),
    minHeightRules: (srcdoc.match(/min-height\s*:\s*[^;}]+/gi) || []).slice(0, 5),
    viewportMeta: /width=device-width/.test(srcdoc),
    parentWidth: Math.round(iframe.parentElement.getBoundingClientRect().width),
  };
})()
