import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/api';
import { LibraryFile, LibraryFolder, VideoProgress } from '../types';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { toast } from '@/lib/toast';
import { FolderTreeNav } from '../components/library/FolderTreeNav';
import { SecureLibraryDocumentDialog } from '../components/library/SecureLibraryDocumentDialog';
import { SecureLibraryVideoDialog } from '../components/library/SecureLibraryVideoDialog';
import { ChevronRight, CheckCircle2, Circle, FileText } from 'lucide-react';
import { Progress } from '../components/ui/progress';

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

function normalizeCompleted(value: number | boolean | undefined) {
  return Number(value) === 1 || value === true;
}

function formatPercent(value: number | undefined) {
  return `${Math.max(0, Math.min(100, Math.round(Number(value || 0))))}%`;
}

function formatClock(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '00:00';
  const total = Math.floor(value);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  const hours = Math.floor(mins / 60);
  if (hours > 0) {
    return `${String(hours).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function ProfilePage() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [progressMap, setProgressMap] = useState<Record<number, VideoProgress>>({});
  const [loading, setLoading] = useState(true);
  const [videoOpen, setVideoOpen] = useState(false);
  const [currentVideoFile, setCurrentVideoFile] = useState<LibraryFile | null>(null);
  const [videoTitle, setVideoTitle] = useState<string>('');
  const [videoUrl, setVideoUrl] = useState<string>('');
  const [docOpen, setDocOpen] = useState(false);
  const [docFile, setDocFile] = useState<LibraryFile | null>(null);
  const savingProgressRef = useRef(false);

  const loadFolderContent = useCallback(async (folderId: number | null) => {
    if (!folderId) {
      setFiles([]);
      setProgressMap({});
      return;
    }
    const [filesRes, progressRes] = await Promise.all([
      apiClient.getFolderFiles(folderId),
      apiClient.getFolderVideoProgress(folderId),
    ]);
    setFiles(filesRes.files);
    setProgressMap(
      Object.fromEntries((progressRes.progress || []).map((row) => [Number(row.file_id), row]))
    );
  }, []);

  const loadData = useCallback(async (selectId?: number | null) => {
    const foldersRes = await apiClient.getFolders();
    setFolders(foldersRes.folders);
    const pick =
      selectId != null && foldersRes.folders.some((f) => f.id === selectId)
        ? selectId
        : foldersRes.folders[0]?.id ?? null;
    setSelectedFolderId(pick);
    await loadFolderContent(pick);
  }, [loadFolderContent]);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
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
      await loadFolderContent(folderId);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load files');
    }
  };

  const breadcrumb = useMemo(
    () => folderBreadcrumb(folders, selectedFolderId),
    [folders, selectedFolderId]
  );

  const saveVideoProgress = useCallback(
    async (fileId: number, watchedSeconds: number, durationSeconds: number, lastPositionSeconds: number) => {
      if (savingProgressRef.current) return;
      savingProgressRef.current = true;
      try {
        const res = await apiClient.updateFileVideoProgress(fileId, {
          watched_seconds: watchedSeconds,
          duration_seconds: durationSeconds,
          last_position_seconds: lastPositionSeconds,
        });
        const next = res.progress;
        setProgressMap((prev) => ({ ...prev, [fileId]: next }));
      } catch (err) {
        console.error(err);
      } finally {
        savingProgressRef.current = false;
      }
    },
    []
  );

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading session…</p>
      </div>
    );
  }
  if (!user) return null;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading…</p>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 bg-gray-50 overflow-hidden">
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
                        <div className="flex min-w-0 flex-1 items-start gap-3">
                          {f.mime_type.startsWith('video/') ? (
                            normalizeCompleted(progressMap[f.id]?.completed) ? (
                              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                            ) : (
                              <Circle className="mt-0.5 h-5 w-5 shrink-0 text-gray-300" />
                            )
                          ) : (
                            <FileText className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />
                          )}
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium text-gray-900">{f.original_name}</p>
                            <p className="text-xs text-gray-500">
                              {(f.file_size / 1024 / 1024).toFixed(2)} MB
                              {f.mime_type.startsWith('video/') && (
                                <> · {formatPercent(progressMap[f.id]?.max_percent)}</>
                              )}
                            </p>
                            {f.mime_type.startsWith('video/') && (
                              <div className="mt-2 space-y-1">
                                <Progress value={Number(progressMap[f.id]?.max_percent || 0)} className="h-1.5" />
                                <div className="flex items-center justify-between text-[11px] text-gray-500">
                                  <span>
                                    {normalizeCompleted(progressMap[f.id]?.completed)
                                      ? 'Completed'
                                      : 'In progress'}
                                  </span>
                                  <span>
                                    {formatClock(Number(progressMap[f.id]?.watched_seconds || 0))}
                                    {Number(progressMap[f.id]?.duration_seconds || 0) > 0
                                      ? ` / ${formatClock(Number(progressMap[f.id]?.duration_seconds || 0))}`
                                      : ''}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            try {
                              if (f.mime_type.startsWith('video/')) {
                                const fileProgress = await apiClient.getFileVideoProgress(f.id);
                                setProgressMap((prev) => ({ ...prev, [f.id]: fileProgress.progress }));
                                setCurrentVideoFile(f);
                                setVideoTitle(f.original_name);
                                setVideoUrl(`/api/library/files/${f.id}/stream`);
                                setVideoOpen(true);
                                return;
                              }
                              setDocFile(f);
                              setDocOpen(true);
                            } catch (err: any) {
                              toast.error(err?.message || 'Failed to open file');
                            }
                          }}
                        >
                          {f.mime_type.startsWith('video/') ? 'Play' : 'Open'}
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

      <SecureLibraryVideoDialog
        open={videoOpen}
        onOpenChange={(open) => {
          setVideoOpen(open);
          if (!open) {
            setVideoUrl('');
            setVideoTitle('');
            setCurrentVideoFile(null);
          }
        }}
        title={videoTitle}
        streamUrl={videoUrl}
        viewerLabel={user?.email ?? ''}
        trackProgress
        file={currentVideoFile}
        progressMap={progressMap}
        setProgressMap={setProgressMap}
        saveVideoProgress={saveVideoProgress}
        userId={user?.id ?? 0}
      />

      <SecureLibraryDocumentDialog
        open={docOpen}
        onOpenChange={(open) => {
          setDocOpen(open);
          if (!open) setDocFile(null);
        }}
        title={docFile?.original_name ?? ''}
        fileId={docFile?.id ?? 0}
        mimeType={docFile?.mime_type ?? ''}
      />
    </div>
  );
}
