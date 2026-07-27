import { applyValidatedFormatLinePatches } from './format-patch-transaction-utils.js';

const normalizeAcceptedIndexes = (acceptedPatchIndexes, patchCount) => {
  const source = acceptedPatchIndexes instanceof Set
    ? Array.from(acceptedPatchIndexes)
    : (Array.isArray(acceptedPatchIndexes) ? acceptedPatchIndexes : []);
  return Array.from(new Set(source
    .map(value => Number(value))
    .filter(value => Number.isInteger(value) && value >= 0 && value < patchCount)))
    .sort((left, right) => left - right);
};

export const buildFormatPatchReviewCandidate = ({
  originalText = '',
  linePatches = [],
  acceptedPatchIndexes = [],
} = {}) => {
  const patches = Array.isArray(linePatches) ? linePatches : [];
  const acceptedIndexes = normalizeAcceptedIndexes(acceptedPatchIndexes, patches.length);
  const acceptedPatches = acceptedIndexes.map(index => patches[index]);
  if (!acceptedPatches.length) {
    return {
      ok: true,
      changed: false,
      candidateText: String(originalText ?? ''),
      acceptedIndexes,
      acceptedPatches,
      validationErrors: [],
    };
  }
  const applied = applyValidatedFormatLinePatches(originalText, acceptedPatches);
  return {
    ok: applied.ok,
    changed: applied.ok && applied.candidateText !== String(originalText ?? ''),
    candidateText: applied.ok ? applied.candidateText : '',
    acceptedIndexes,
    acceptedPatches: applied.linePatches,
    validationErrors: applied.validationErrors,
  };
};

export const createFormatPatchReviewSelection = (linePatches = [], {
  acceptAll = true,
} = {}) => {
  const patches = Array.isArray(linePatches) ? linePatches : [];
  return new Set(acceptAll ? patches.map((_patch, index) => index) : []);
};

export const updateFormatPatchReviewSelection = (
  selection,
  patchIndex,
  accepted,
) => {
  const next = new Set(selection instanceof Set ? selection : []);
  const index = Number(patchIndex);
  if (!Number.isInteger(index) || index < 0) return next;
  if (accepted) next.add(index);
  else next.delete(index);
  return next;
};
