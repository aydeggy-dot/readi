import type { CvContentType } from "@readi/shared-types";

/** Bytes needed to recognise a file by its signature. */
export const SIGNATURE_BYTES = 8;

const SIGNATURES: Record<CvContentType, number[]> = {
  // "%PDF-"
  "application/pdf": [0x25, 0x50, 0x44, 0x46, 0x2d],
  // DOCX is a ZIP archive: "PK\x03\x04" (the worker checks it really is a Word document)
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": [
    0x50, 0x4b, 0x03, 0x04,
  ],
};

/** Whether the file starts with the signature of the type the browser declared. */
export function matchesSignature(start: Uint8Array, contentType: CvContentType): boolean {
  const signature = SIGNATURES[contentType];
  return signature.every((byte, index) => start[index] === byte);
}
