import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/api';
import { LibraryFile, LibraryFolder } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from '@/lib/toast';
import { FolderTreeNav } from '../components/library/FolderTreeNav';
import { ChevronRight, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';

async function fetchAuthedBlob(path: string) {
  const res = await fetch(path, { credentials: 'include' });
  if (!res.ok) throw new Error('Could not load video');
  return await res.blob();
}

function folderBreadcrumb(folders: LibraryFolder[], folderId: number | null): LibraryFolder[] {
  if (folderId == null) return [];
  const byId = new Map(folders.map((f) => [f.id, f]));
  const chain: LibraryFolder[] = [];
  let cur: LibraryFolder | undefined = byId.get(folderId);
  while (cur) {
    chain.unshift(cur);
    cur = cur.parent_id != null ? byId.get(cur.parent_id) : undefined;
  }
  return chain;
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [videoOpen, setVideoOpen] = useState(false);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');

  const loadData = useCallback(async (selectId?: number | null) => {
    const foldersRes = await apiClient.getFolders();
    setFolders(foldersRes.folders);
    const pick =
      selectId != null && foldersRes.folders.some((f) => f.id === selectId)
        ? selectId
        : foldersRes.folders[0]?.id ?? null;
    setSelectedFolderId(pick);
    if (pick) {
      const filesRes = await apiClient.getFolderFiles(pick);
      setFiles(filesRes.files);
    } else {
      setFiles([]);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role === 'admin') {
      navigate('/admin');
      return;
    }
    loadData()
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load library');
      })
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate, loadData]);

  const onSelectFolder = async (folderId: number) => {
    setSelectedFolderId(folderId);
    try {
      const res = await apiClient.getFolderFiles(folderId);
      setFiles(res.files);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load files');
    }
  };

  const breadcrumb = useMemo(
    () => folderBreadcrumb(folders, selectedFolderId),
    [folders, selectedFolderId]
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading session…</p>
      </div>
    );
  }
  if (!user || user.role === 'admin') return null;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-gray-50 overflow-hidden">
      <aside className="flex w-72 shrink-0 h-full flex-col border-r border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Library</h2>
          <p className="text-xs text-gray-500">Browse folders shared by your team</p>
        </div>
        <div className="min-h-0 flex-1 overflow-hidden p-3">
          <FolderTreeNav folders={folders} selectedId={selectedFolderId} onSelect={onSelectFolder} />
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 h-full flex-col">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Employee</h1>
            <p className="text-sm text-gray-600">
              {user.name} · {user.email}
            </p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto space-y-4 p-6">
          {selectedFolderId == null ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-600">
                No folders available yet. Ask an admin to add content.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-1 text-sm text-gray-600">
                {breadcrumb.map((seg, i) => (
                  <React.Fragment key={seg.id}>
                    {i > 0 && <ChevronRight className="h-4 w-4 shrink-0 text-gray-400" />}
                    <button
                      type="button"
                      className={`rounded px-1 hover:text-red-700 ${i === breadcrumb.length - 1 ? 'font-semibold text-gray-900' : ''}`}
                      onClick={() => onSelectFolder(seg.id)}
                    >
                      {seg.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FileText className="h-5 w-5 text-red-600" />
                    Files in “{breadcrumb[breadcrumb.length - 1]?.name ?? 'folder'}”
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {files.map((f) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50/80"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{f.original_name}</p>
                          <p className="text-xs text-gray-500">
                            {(f.file_size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              if (f.mime_type.startsWith('video/')) {
                                // Best-effort security: fetch as blob with JWT, play in modal, hide download UI.
                                const blob = await fetchAuthedBlob(`/api/library/files/${f.id}/stream`);
                                const url = URL.createObjectURL(blob);
                                setVideoTitle(f.original_name);
                                setVideoUrl(url);
                                setVideoOpen(true);
                                return;
                              }
                              // Documents still download (authorized route).
                              const res = await fetch(`/api/library/files/${f.id}/download`, {
                                credentials: 'include',
                              });
                              if (!res.ok) throw new Error('Could not download file');
                              const blob = await res.blob();
                              const url = URL.createObjectURL(blob);
                              const a = document.createElement('a');
                              a.href = url;
                              a.download = f.original_name;
                              a.rel = 'noopener';
                              a.click();
                              setTimeout(() => URL.revokeObjectURL(url), 120_000);
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to open file');
                            }
                          }}
                        >
                          {f.mime_type.startsWith('video/') ? 'Play' : 'Download'}
                        </Button>
                      </li>
                    ))}
                  </ul>
                  {!files.length && (
                    <p className="py-8 text-center text-sm text-gray-500">No files in this folder.</p>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </main>
      </div>

      <Dialog
        open={videoOpen}
        onOpenChange={(open) => {
          setVideoOpen(open);
          if (!open && videoUrl) {
            URL.revokeObjectURL(videoUrl);
            setVideoUrl('');
            setVideoTitle('');
          }
        }}
      >
        <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
          <div className="bg-black">
            <DialogHeader className="p-4">
              <DialogTitle className="text-white text-sm">{videoTitle}</DialogTitle>
              <DialogDescription className="sr-only">Internal video playback</DialogDescription>
            </DialogHeader>
            <div className="px-4 pb-4">
              <video
                src={videoUrl}
                controls
                autoPlay
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                className="w-full max-h-[70vh] rounded-lg bg-black"
                onContextMenu={(e) => e.preventDefault()}
              />
              <p className="mt-2 text-xs text-gray-300">
                Download is disabled in the UI. (Note: absolute prevention isn’t possible in browsers.)
              </p>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
