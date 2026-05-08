import {
  decodeZipEntryBase64Text,
  findZipEntryByName,
  normalizeZipEntryName,
  readZipEntryJson,
} from './zip-entry-utils.js';

export const IMPORT_PACKAGE_KINDS = Object.freeze({
  BUNDLE: 'bundle',
  EXPERIENCE_PACK: 'experience-pack',
  CUSTOM_BUNDLE: 'custom-bundle',
});

export const IMPORT_PACKAGE_FORMATS = Object.freeze({
  EXPERIENCE_PACK: 'chatapp.experience-pack.v1',
  CUSTOM_BUNDLE: 'chatapp.custom-bundle.v1',
});

export const normalizeImportZipEntryName = (name = '') =>
  normalizeZipEntryName(name, { trim: true });

export const decodeImportBase64Text = decodeZipEntryBase64Text;

export const readImportManifestFromEntries = (
  entries = [],
  {
    decodeBase64Text = decodeImportBase64Text,
  } = {},
) => {
  const list = Array.isArray(entries) ? entries : [];
  const manifestEntry = findZipEntryByName(list, 'manifest.json', { trimNames: true });
  if (!manifestEntry) return null;
  try {
    return readZipEntryJson(manifestEntry, {
      fallback: null,
      decodeBase64Text,
    });
  } catch {
    return null;
  }
};

export const resolveImportKindFromZipEntries = (
  entries = [],
  options = {},
) => {
  const manifest = readImportManifestFromEntries(entries, options);
  const format = String(manifest?.format || '').trim();
  if (format === IMPORT_PACKAGE_FORMATS.EXPERIENCE_PACK) {
    return { kind: IMPORT_PACKAGE_KINDS.EXPERIENCE_PACK, entries };
  }
  if (format === IMPORT_PACKAGE_FORMATS.CUSTOM_BUNDLE) {
    return { kind: IMPORT_PACKAGE_KINDS.CUSTOM_BUNDLE, entries };
  }
  return { kind: IMPORT_PACKAGE_KINDS.BUNDLE, entries };
};
