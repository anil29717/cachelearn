/**
 * Open or download a library file using the session cookie (same-origin /api proxy).
 * Do not put JWTs in localStorage — auth is httpOnly cookie + credentials.
 */
export async function openLibraryFile(fileId: number, filename: string, mimeType: string) {
  const path =
    mimeType.startsWith('video/') && !mimeType.includes('quicktime')
      ? `/api/library/files/${fileId}/stream`
      : `/api/library/files/${fileId}/download`;
  const res = await fetch(path, {
    credentials: 'include',
  });
  if (!res.ok) throw new Error('Could not load file');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (mimeType.startsWith('video/')) {
    if (!url.startsWith('blob:')) {
      URL.revokeObjectURL(url);
      throw new Error('Invalid object URL');
    }
    window.open(url, '_blank', 'noopener,noreferrer');
  } else {
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.rel = 'noopener';
    a.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 120_000);
}
