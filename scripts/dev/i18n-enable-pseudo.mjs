import { evaluateInApp } from './cdp-client.mjs';

const result = await evaluateInApp(`(async () => {
  const state = await window.appI18n.initialize({
    preference: 'en',
    fetchFn: url => fetch(String(url).replace(/en\.json$/, 'pseudo.json')),
  });
  window.appI18n.startDomLocalization();
  return {
    locale: state.locale,
    loadError: state.loadError,
    sample: window.appI18n.t('保存'),
  };
})()`);
console.log(JSON.stringify(result, null, 2));
