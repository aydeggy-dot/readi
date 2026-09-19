import type { CvContentType } from "@readi/shared-types";
import { CV_CONTENT_TYPES, CV_MAX_BYTES } from "@readi/shared-types/constants";

const [PDF, DOCX] = CV_CONTENT_TYPES;

/**
 * The CV type of a chosen file, from its MIME type or (when the browser reports none, as some
 * Android browsers do for DOCX) its extension. The server checks the file's real signature.
 */
export function cvContentType(file: { name: string; type: string }): CvContentType | null {
  if (file.type === PDF || (!file.type && /\.pdf$/i.test(file.name))) return PDF;
  if (file.type === DOCX || (!file.type && /\.docx$/i.test(file.name))) return DOCX;
  if (file.type === "application/octet-stream") {
    if (/\.pdf$/i.test(file.name)) return PDF;
    if (/\.docx$/i.test(file.name)) return DOCX;
  }
  return null;
}

export type CvFileProblem = "type" | "tooLarge" | "empty";

export function checkCvFile(file: {
  name: string;
  type: string;
  size: number;
}): CvFileProblem | null {
  if (!cvContentType(file)) return "type";
  if (file.size === 0) return "empty";
  if (file.size > CV_MAX_BYTES) return "tooLarge";
  return null;
}

export const CV_MAX_MB = CV_MAX_BYTES / 1024 / 1024;

/** PUTs a file with progress reporting (fetch cannot report upload progress). Resolves the status. */
export function putWithProgress(
  url: string,
  headers: Record<string, string>,
  file: Blob,
  onProgress: (fraction: number) => void,
): Promise<number> {
  return new Promise((resolve) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [name, value] of Object.entries(headers)) xhr.setRequestHeader(name, value);
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total);
    };
    xhr.onload = () => resolve(xhr.status);
    xhr.onerror = () => resolve(0);
    xhr.onabort = () => resolve(0);
    xhr.send(file);
  });
}
