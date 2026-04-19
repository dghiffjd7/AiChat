/**
 * Simple sticker picker (placeholder options)
 */

const DEFAULT_STICKERS = [
  '摸摸头', '比心', '跳舞', '哭哭', '生气', '睡觉', '爱心', '赞',
  '害羞', '拥抱', '喝奶茶', 'OK', '嘟嘴'
];

const RECENT_KEY = 'sticker_recents';

export class StickerPicker {
  constructor(onSelect) {
    this.onSelect = onSelect;
    this.overlay = null;
    this.panel = null;
    this.recent = this.loadRecent();
  }

  loadRecent() {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  saveRecent() {
    localStorage.setItem(RECENT_KEY, JSON.stringify(this.recent.slice(0, 8)));
  }

  show() {
    if (!this.panel) this.createUI();
    this.render();
    this.overlay.style.display = 'block';
    this.panel.style.display = 'block';
  }

  hide() {
    if (this.overlay) this.overlay.style.display = 'none';
    if (this.panel) this.panel.style.display = 'none';
  }

  render() {
    const gridRecent = this.panel.querySelector('#sticker-recent');
    const gridAll = this.panel.querySelector('#sticker-all');
    gridRecent.innerHTML = '';
    gridAll.innerHTML = '';

    const renderBtn = (container, label) => {
      const btn = document.createElement('button');
      btn.textContent = label;
      btn.style.cssText = `
          padding: 10px 8px; border: 1px solid #eee; border-radius: 10px; background: #f8fafc;
          cursor: pointer; font-size: 14px;
      `;
      btn.onclick = () => {
        this.recent = [label, ...this.recent.filter((x) => x !== label)];
        this.saveRecent();
        this.onSelect?.(label);
        this.hide();
      };
      container.appendChild(btn);
    };

    if (this.recent.length) {
      this.recent.forEach((s) => renderBtn(gridRecent, s));
    } else {
      gridRecent.innerHTML = '<span style="color:#94a3b8;font-size:12px;">无最近使用</span>';
    }

    DEFAULT_STICKERS.forEach((s) => renderBtn(gridAll, s));
  }

  createUI() {
    this.overlay = document.createElement('div');
    this.overlay.className = 'app-themed-overlay sticker-picker-overlay';
    this.overlay.style.cssText = `
            display:none; position:fixed; inset:0; background:rgba(0,0,0,0.4); z-index:9000;
        `;
    this.overlay.onclick = () => this.hide();

    this.panel = document.createElement('div');
    this.panel.className = 'app-themed-panel sticker-picker-panel';
    this.panel.style.cssText = `
            display:none; position:fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
            background: #fff; border-radius: 12px; box-shadow: 0 8px 30px rgba(0,0,0,0.2);
            padding: 10px; z-index: 10000; width: min(360px, 90vw);
        `;
    this.panel.onclick = (e) => e.stopPropagation();

    this.panel.innerHTML = `
        <div style="font-weight:700; margin-bottom:6px;">最近</div>
        <div id="sticker-recent" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px; margin-bottom:10px;"></div>
        <div style="font-weight:700; margin-bottom:6px;">全部</div>
        <div id="sticker-all" style="display:grid; grid-template-columns: repeat(auto-fill, minmax(80px, 1fr)); gap: 8px;"></div>
    `;

    document.body.appendChild(this.overlay);
    document.body.appendChild(this.panel);
  }
}
