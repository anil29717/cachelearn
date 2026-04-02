import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  fileId: number;
  mimeType: string;
};

function isPdf(mime: string) {
  return mime === 'application/pdf' || mime.endsWith('/pdf');
}

/**
 * Opens authorized library documents in a modal (iframe for PDF). No download control in the UI.
 * File is fetched with credentials; blob URL is revoked on close.
 */
export function SecureLibraryDocumentDialog({ open, onOpenChange, title, fileId, mimeType }: Props) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) {
      setBlobUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return null;
      });
      setError(null);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError(null);

    (async () => {
      try {
        const res = await fetch(`/api/library/files/${fileId}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error('Could not load file');
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        setBlobUrl(url);
      } catch (e: unknown) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, fileId]);

  const showIframe = blobUrl && isPdf(mimeType);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-4xl max-h-[90vh] flex flex-col p-0 gap-0 overflow-hidden">
        <DialogHeader className="px-4 pt-4 pb-2 shrink-0">
          <DialogTitle className="text-base truncate pr-8">{title}</DialogTitle>
          <DialogDescription className="sr-only">Document preview</DialogDescription>
        </DialogHeader>
        <div className="flex min-h-0 flex-1 flex-col border-t border-gray-100 bg-gray-50 px-4 pb-4">
          {loading && <p className="py-12 text-center text-sm text-gray-600">Loading…</p>}
          {error && <p className="py-12 text-center text-sm text-red-600">{error}</p>}
          {!loading && !error && showIframe && (
            <iframe
              title={title}
              src={blobUrl}
              className="mt-2 h-[min(72vh,720px)] w-full flex-1 rounded-md border border-gray-200 bg-white"
              sandbox="allow-same-origin allow-scripts allow-popups"
            />
          )}
          {!loading && !error && blobUrl && !isPdf(mimeType) && (
            <div className="mt-2 flex flex-col items-center justify-center gap-2 rounded-md border border-amber-100 bg-amber-50/80 px-4 py-10 text-center">
              <p className="text-sm font-medium text-gray-900">Preview isn’t available for this file type in the browser.</p>
              <p className="max-w-md text-xs text-gray-600">
                Word and other office files can’t be shown inline here without exposing a download. Ask your team if you
                need a copy through another channel.
              </p>
            </div>
          )}
          <p className="mt-3 text-xs text-gray-500">
            This viewer does not include a download button. Right-click and save may still depend on your browser.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
