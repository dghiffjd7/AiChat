(() => {
  const iframe = document.querySelector('iframe');
  return {
    error: iframe.dataset.iframeError,
    staticFallbackApplied: iframe.dataset.staticFallbackApplied,
    fallbackAttempted: iframe.dataset.iframeFallbackAttempted,
  };
})()
