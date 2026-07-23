export const MAID_GUIDE_EXPRESSION_SHEET_SRC = './assets/media/maid-guide-expression-sheet.webp';
export const MAID_GUIDE_EXPRESSION_ZOOM = 1.18;
export const MAID_GUIDE_EXPRESSION_BACKGROUND = '#efedf7';

const EXPRESSION_GRID_SIZE = 4;
const getCellPosition = (index) => {
  const zoom = MAID_GUIDE_EXPRESSION_ZOOM;
  const centeredOffset = (zoom - 1) / 2;
  const position = ((Number(index) * zoom + centeredOffset) / (EXPRESSION_GRID_SIZE * zoom - 1)) * 100;
  return `${Number(position.toFixed(4))}%`;
};

export const MAID_GUIDE_EXPRESSIONS = Object.freeze({
  welcome: Object.freeze({ row: 0, column: 0 }),
  bow: Object.freeze({ row: 0, column: 1 }),
  point: Object.freeze({ row: 0, column: 2 }),
  idea: Object.freeze({ row: 0, column: 3 }),
  thinking: Object.freeze({ row: 1, column: 0 }),
  explain: Object.freeze({ row: 1, column: 1 }),
  manual: Object.freeze({ row: 1, column: 2 }),
  clipboard: Object.freeze({ row: 1, column: 3 }),
  cheer: Object.freeze({ row: 2, column: 0 }),
  success: Object.freeze({ row: 2, column: 1 }),
  apology: Object.freeze({ row: 2, column: 2 }),
  listen: Object.freeze({ row: 2, column: 3 }),
  waiting: Object.freeze({ row: 3, column: 0 }),
  surprise: Object.freeze({ row: 3, column: 1 }),
  encourage: Object.freeze({ row: 3, column: 2 }),
  complete: Object.freeze({ row: 3, column: 3 }),
});

const trim = value => String(value ?? '').trim();

export const getMaidGuideExpression = (state = 'welcome') => {
  const key = Object.hasOwn(MAID_GUIDE_EXPRESSIONS, trim(state)) ? trim(state) : 'welcome';
  const cell = MAID_GUIDE_EXPRESSIONS[key];
  return {
    state: key,
    row: cell.row,
    column: cell.column,
    x: getCellPosition(cell.column),
    y: getCellPosition(cell.row),
  };
};

export const resolveMaidGuideExpressionState = ({ phase = 'steps', step = null, index = 0 } = {}) => {
  const requested = trim(step?.expression);
  if (requested && Object.hasOwn(MAID_GUIDE_EXPRESSIONS, requested)) return requested;
  if (phase === 'done') return 'complete';
  if (step?.action === 'click') return 'point';
  if (step?.action === 'type') return 'clipboard';
  if (step?.action === 'wait-event') {
    return trim(step?.target) === 'chat-body' ? 'waiting' : 'listen';
  }
  return Number(index) > 0 ? 'explain' : 'welcome';
};

export const applyMaidGuideExpression = (element = null, state = 'welcome') => {
  if (!element) return null;
  const expression = getMaidGuideExpression(state);
  element.classList?.add?.('maid-guide-expression');
  if (element.dataset) element.dataset.maidExpression = expression.state;
  if (element.style) {
    element.style.backgroundImage = `url("${MAID_GUIDE_EXPRESSION_SHEET_SRC}")`;
    element.style.backgroundPosition = `${expression.x} ${expression.y}`;
    element.style.backgroundRepeat = 'no-repeat';
    element.style.backgroundSize = `${EXPRESSION_GRID_SIZE * MAID_GUIDE_EXPRESSION_ZOOM * 100}% ${EXPRESSION_GRID_SIZE * MAID_GUIDE_EXPRESSION_ZOOM * 100}%`;
    element.style.backgroundColor = MAID_GUIDE_EXPRESSION_BACKGROUND;
    element.style.backgroundClip = 'padding-box';
    element.style.imageRendering = 'auto';
  }
  return expression;
};
