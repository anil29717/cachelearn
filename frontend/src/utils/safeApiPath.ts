/** Reject absolute URLs / traversal in API paths (client-side SSRF guard). */
export function assertSafeApiEndpoint(endpoint: string): string {
  const e = String(endpoint ?? '').trim();
  if (!e.startsWith('/') || e.includes('://') || e.includes('..') || e.includes('\\')) {
    throw new Error('Invalid API endpoint');
  }
  return e;
}

export function assertPositiveFileId(fileId: number): number {
  if (!Number.isSafeInteger(fileId) || fileId <= 0) {
    throw new Error('Invalid file id');
  }
  return fileId;
}
