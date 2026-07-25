export const CONTACT_GROUP_COLORS = Object.freeze({
  sky: Object.freeze({ key: 'sky', label: '晴空蓝', value: '#38a8f8', soft: 'rgba(56, 168, 248, 0.12)' }),
  violet: Object.freeze({ key: 'violet', label: '鸢尾紫', value: '#8b5cf6', soft: 'rgba(139, 92, 246, 0.12)' }),
  emerald: Object.freeze({ key: 'emerald', label: '青翠绿', value: '#10b981', soft: 'rgba(16, 185, 129, 0.12)' }),
  amber: Object.freeze({ key: 'amber', label: '暖阳橙', value: '#f59e0b', soft: 'rgba(245, 158, 11, 0.13)' }),
  rose: Object.freeze({ key: 'rose', label: '珊瑚红', value: '#f43f5e', soft: 'rgba(244, 63, 94, 0.11)' }),
});

export const normalizeContactGroupColor = (value = '') => {
  const key = String(value || '').trim().toLowerCase();
  return Object.prototype.hasOwnProperty.call(CONTACT_GROUP_COLORS, key) ? key : 'sky';
};

export const resolveContactGroupColor = (value = '') =>
  CONTACT_GROUP_COLORS[normalizeContactGroupColor(value)];
