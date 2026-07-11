(async () => {
  const stores = window.appBridge?.debugUiRegistry?.stores || {};
  const out = {};
  // scriptStore 是对象但方法列表为空（可能是 class 实例）——取原型方法
  const ss = stores.scriptStore;
  out.scriptStoreMethods = ss ? Object.getOwnPropertyNames(Object.getPrototypeOf(ss)).slice(0, 20) : null;
  // 直接从 localStorage/kv 找 preset、regex、script 数据
  out.lsKeys = Object.keys(localStorage).filter(k => /preset|regex|script/i.test(k)).map(k => ({ key: k, size: (localStorage.getItem(k) || '').length }));
  return out;
})()
