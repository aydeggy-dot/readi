/** The filename in a `Content-Disposition: attachment; filename="…"` header, if there is one. */
export function filenameFromDisposition(header: string | null | undefined): string | undefined {
  const match = header?.match(/filename="([^"/\\]+)"/);
  return match?.[1];
}

/** Hands a file the page fetched to the browser as a download. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  // Revoked after the click has been handled; some browsers read the URL asynchronously.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
