import assert from 'node:assert/strict';

import {
  collectImageFilesFromDataTransfer,
  collectImageFilesFromDropEvent,
  collectImageFilesFromPasteEvent,
  createImageAttachmentFromFile,
  eventHasImageFiles,
  isImageAttachmentFile,
} from '../../src/scripts/ui/image-attachment-input-utils.js';

const pngFile = { name: 'screen.png', type: 'image/png', size: 12 };
const jpgFile = { name: 'photo.jpg', type: '', size: 15 };
const textFile = { name: 'note.txt', type: 'text/plain', size: 7 };

{
  assert.equal(isImageAttachmentFile(pngFile), true);
  assert.equal(isImageAttachmentFile(jpgFile), true);
  assert.equal(isImageAttachmentFile(textFile), false);
  console.log('ok - image attachment input detects image files by mime or extension');
}

{
  const files = collectImageFilesFromDataTransfer({
    files: [pngFile, textFile],
    items: [
      { getAsFile: () => pngFile },
      { getAsFile: () => jpgFile },
    ],
  });
  assert.deepEqual(files, [pngFile, jpgFile]);
  console.log('ok - image attachment input collects and deduplicates image files');
}

{
  const pasteFiles = collectImageFilesFromPasteEvent({
    clipboardData: { files: [pngFile] },
  });
  const dropFiles = collectImageFilesFromDropEvent({
    dataTransfer: { files: [jpgFile] },
  });
  assert.deepEqual(pasteFiles, [pngFile]);
  assert.deepEqual(dropFiles, [jpgFile]);
  assert.equal(eventHasImageFiles({ dataTransfer: { types: ['Files'] } }), true);
  console.log('ok - image attachment input reads paste and drop events');
}

{
  const calls = [];
  const attachment = await createImageAttachmentFromFile(pngFile, {
    readFileAsDataUrl: async file => `raw:${file.name}`,
    compressImageDataUrl: async (dataUrl, options) => {
      calls.push({ dataUrl, options });
      return `compressed:${dataUrl}`;
    },
    isGifFile: () => false,
    source: 'clipboard-image',
  });
  assert.equal(attachment.kind, 'image');
  assert.equal(attachment.url, 'compressed:raw:screen.png');
  assert.equal(attachment.name, 'screen.png');
  assert.equal(attachment.source, 'clipboard-image');
  assert.equal(calls.length, 1);
  assert.equal(calls[0].options.maxDim, 1280);
  console.log('ok - image attachment input builds compressed image attachments');
}

{
  const attachment = await createImageAttachmentFromFile({ name: 'anim.gif', type: 'image/gif', size: 99 }, {
    readFileAsDataUrl: async () => 'raw-gif',
    compressImageDataUrl: async () => {
      throw new Error('gif should not be compressed');
    },
    isGifFile: () => true,
  });
  assert.equal(attachment.url, 'raw-gif');
  console.log('ok - image attachment input keeps gif attachments uncompressed');
}
