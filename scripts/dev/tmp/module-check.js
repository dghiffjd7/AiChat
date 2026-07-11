(async () => {
  const mod = await import('/scripts/ui/chat/rich-text-renderer.js');
  return {
    hasSplitExport: typeof mod.splitFencedCodeBlocks === 'function',
    exports: Object.keys(mod).length,
  };
})()
