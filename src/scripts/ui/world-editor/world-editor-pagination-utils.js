const clampInteger = (value, min, max, fallback = min) => {
  const number = Number(value);
  const integer = Number.isFinite(number) ? Math.trunc(number) : fallback;
  return Math.min(max, Math.max(min, integer));
};

export const paginateWorldEntries = (entries = [], pageIndex = 0, pageSize = 4) => {
  const list = Array.isArray(entries) ? entries : [];
  const size = clampInteger(pageSize, 1, 200, 4);
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const current = clampInteger(pageIndex, 0, totalPages - 1, 0);
  const start = current * size;
  return {
    items: list.slice(start, start + size),
    pageIndex: current,
    pageSize: size,
    totalPages,
  };
};

export const getCompactPageItems = (totalPages = 1, currentPage = 0) => {
  const total = Math.max(1, Math.trunc(Number(totalPages) || 1));
  const current = clampInteger(currentPage, 0, total - 1, 0);
  if (total <= 7) return Array.from({ length: total }, (_, index) => index);

  const pages = new Set([0, total - 1]);
  for (let page = current - 2; page <= current + 2; page += 1) {
    if (page > 0 && page < total - 1) pages.add(page);
  }
  const ordered = Array.from(pages).sort((left, right) => left - right);
  const items = [];
  ordered.forEach((page, index) => {
    const previous = ordered[index - 1];
    if (index > 0 && page - previous > 1) items.push('ellipsis');
    items.push(page);
  });
  return items;
};
