(() => {
  const srcdoc = document.querySelector('iframe')?.srcdoc || '';
  // 提取原始面板 html 的近似（srcdoc 中 body 部分）——直接对整个 srcdoc 测两个条件
  return {
    hasViewportVar: /var\(\s*--viewport-height/i.test(srcdoc),
    hasBodyOpen: /<body[\s>]/i.test(srcdoc),
    hasBodyClose: /<\/body>/i.test(srcdoc),
    // renderer 模块是否已是新版（导出了 splitFencedCodeBlocks + measureFullscreenAppHeight 在源内）
    srcdocLen: srcdoc.length,
  };
})()
