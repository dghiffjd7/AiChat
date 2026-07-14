(() => {
  const isNeutralGray = (rgb) => {
    const m = rgb.match(/(\d+),\s*(\d+),\s*(\d+)/); if(!m) return null;
    const [r,g,b]=[+m[1],+m[2],+m[3]];
    const max=Math.max(r,g,b),min=Math.min(r,g,b);
    return { rgb:[r,g,b], chroma:max-min, isDarkNeutral: (max-min)<=8 && max<90 };
  };
  const pick = (sel) => { const el=document.querySelector(sel); if(!el) return {sel,missing:true}; const bg=getComputedStyle(el).backgroundColor; return { sel, bg, ...(isNeutralGray(bg)||{}) }; };
  const targets = ['#chat-page','.topbar','.search-box-wrapper','.sheet','.config-panel','[class*="config"] input','.world-panel-section-card','.QQ_chat_charmsg','.bottom-nav','[class*="modal"]'];
  const rows = targets.map(pick).filter(r=>!r.missing && r.bg && r.bg!=='rgba(0, 0, 0, 0)');
  // 找出"深中性灰/黑"的（硬编码死色嫌疑，与紫 token 不符）
  const suspects = rows.filter(r=>r.isDarkNeutral);
  return { sampled: rows.length, purpleTokenPanel: getComputedStyle(document.documentElement).getPropertyValue('--app-surface-panel').trim(), rows: rows.map(r=>({sel:r.sel,bg:r.bg,chroma:r.chroma})), neutralGraySuspects: suspects.map(r=>r.sel) };
})()
