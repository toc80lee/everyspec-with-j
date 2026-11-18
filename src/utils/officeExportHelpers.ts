export function triggerBlobDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function sanitizeFilename(name: string): string {
  return (name || 'SAP_SPEC')
    .trim()
    .replace(/[^a-zA-Z0-9가-힣_-]/g, '_')
    .replace(/_+/g, '_');
}
