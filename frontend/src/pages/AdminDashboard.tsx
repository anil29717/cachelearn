import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { SecureLibraryDocumentDialog } from '../components/library/SecureLibraryDocumentDialog';
import { SecureLibraryVideoDialog } from '../components/library/SecureLibraryVideoDialog';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { apiClient } from '../utils/api';
import { AdminVideoProgress, LibraryFile, LibraryFolder, User } from '../types';
import { toast } from '@/lib/toast';
import { ConfirmDestructiveDialog } from '@/components/feedback/ConfirmDestructiveDialog';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { FolderTreeNav } from '../components/library/FolderTreeNav';
import { ChevronRight, CheckCircle2, FileText, LayoutDashboard, FolderTree, FolderOpen, Users as UsersIcon, Shield, Upload, Trash2, ScrollText, Circle } from 'lucide-react';
import { Progress } from '../components/ui/progress';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '../components/ui/chart';
import { Bar, BarChart, CartesianGrid, XAxis } from 'recharts';
import { Switch } from '../components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Checkbox } from '../components/ui/checkbox';

const ADMIN_LOGS_PAGE_SIZE = 50;

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

function folderFullPath(folders: LibraryFolder[], folderId: number): string {
  return folderBreadcrumb(folders, folderId)
    .map((f) => f.name)
    .join(' / ');
}

/** Normalize DB / API values (0/1, string, boolean) for the Active switch. */
function isUserActive(u: { is_active?: unknown }) {
  return Number(u?.is_active) === 1;
}

function describeUserFolderAccess(u: User & { restricted_folder_access?: Array<{ path: string }> }, openFoldersCount: number) {
  if (u.role === 'admin') {
    return 'Full access — all folders and files.';
  }
  const lines: string[] = [];
  if (openFoldersCount > 0) {
    lines.push(`${openFoldersCount} “all employees” folder(s) (everyone can open).`);
  }
  const grants = u.restricted_folder_access || [];
  if (grants.length) {
    lines.push(`Restricted (assigned): ${grants.map((g) => g.path).join(' · ')}`);
  } else {
    lines.push('No per-user restricted folders assigned.');
  }
  return lines.join(' ');
}

export function AdminDashboard() {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedFolderId, setSelectedFolderId] = useState<number | null>(null);
  const [files, setFiles] = useState<LibraryFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const [uploadPercent, setUploadPercent] = useState(0);
  const [loading, setLoading] = useState(true);
  const [pendingFolderDeleteId, setPendingFolderDeleteId] = useState<number | null>(null);
  const [pendingFileDelete, setPendingFileDelete] = useState<{ id: number; name: string } | null>(null);
  const [pendingUserDelete, setPendingUserDelete] = useState<{ id: number; email: string } | null>(null);
  const [activeSection, setActiveSection] = useState<
    'dashboard' | 'content' | 'upload' | 'folders' | 'users' | 'logs' | 'progress'
  >('content');
  const [summary, setSummary] = useState<{
    total_employees: number;
    total_files: number;
    recent_uploads: Array<{
      id: number;
      original_name: string;
      mime_type: string;
      file_size: number;
      created_at: string;
      folder_name: string;
    }>;
  } | null>(null);

  const [accessOpen, setAccessOpen] = useState(false);
  const [accessLoading, setAccessLoading] = useState(false);
  const [accessUserIds, setAccessUserIds] = useState<number[]>([]);
  const [assignedEmployeeCount, setAssignedEmployeeCount] = useState<number | null>(null);
  const [uploadRootId, setUploadRootId] = useState<number | null>(null);
  const [uploadSubfolderValue, setUploadSubfolderValue] = useState<string>('');
  const [lastUploadedFile, setLastUploadedFile] = useState<LibraryFile | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSaving, setRenameSaving] = useState(false);
  const [contentFilter, setContentFilter] = useState<'folder' | 'all'>('folder');
  const [allFiles, setAllFiles] = useState<Array<LibraryFile & { folder_name: string }>>([]);
  const [allFilesLoading, setAllFilesLoading] = useState(false);
  const [openFoldersCount, setOpenFoldersCount] = useState(0);
  const [assignedNames, setAssignedNames] = useState<string[]>([]);
  const [newEmployeeName, setNewEmployeeName] = useState('');
  const [newEmployeeEmail, setNewEmployeeEmail] = useState('');
  const [newEmployeePassword, setNewEmployeePassword] = useState('');
  const [creatingEmployee, setCreatingEmployee] = useState(false);
  const [logs, setLogs] = useState<any[]>([]);
  const [logsTotal, setLogsTotal] = useState(0);
  const [logsPage, setLogsPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  const [progressEmployeeId, setProgressEmployeeId] = useState<number | null>(null);
  const [progressRows, setProgressRows] = useState<AdminVideoProgress[]>([]);
  const [progressLoading, setProgressLoading] = useState(false);
  const [progressEmployeeName, setProgressEmployeeName] = useState('');
  const [previewVideoOpen, setPreviewVideoOpen] = useState(false);
  const [previewVideoFile, setPreviewVideoFile] = useState<LibraryFile | null>(null);
  const [previewVideoTitle, setPreviewVideoTitle] = useState('');
  const [previewVideoUrl, setPreviewVideoUrl] = useState('');
  const [previewDocOpen, setPreviewDocOpen] = useState(false);
  const [previewDocFile, setPreviewDocFile] = useState<LibraryFile | null>(null);

  const loadData = useCallback(async (selectId?: number | null) => {
    const [usersRes, foldersRes, summaryRes] = await Promise.all([
      apiClient.getUsers(),
      apiClient.getFolders(),
      apiClient.getAdminSummary(),
    ]);
    setUsers(usersRes.users);
    setOpenFoldersCount(typeof usersRes.open_folders_count === 'number' ? usersRes.open_folders_count : 0);
    setFolders(foldersRes.folders);
    setSummary(summaryRes.summary);
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

  const loadAllFiles = useCallback(async () => {
    setAllFilesLoading(true);
    try {
      const rows = await Promise.all(
        folders.map(async (f) => {
          const res = await apiClient.getFolderFiles(f.id);
          return res.files.map((file) => ({ ...file, folder_name: f.name }));
        })
      );
      setAllFiles(rows.flat());
    } catch (err) {
      console.error(err);
      toast.error('Failed to load all files');
    } finally {
      setAllFilesLoading(false);
    }
  }, [folders]);

  const loadLogs = useCallback(async (page: number) => {
    setLogsLoading(true);
    try {
      const res = await apiClient.getAdminLogs({ page, limit: ADMIN_LOGS_PAGE_SIZE });
      setLogs(res.logs);
      setLogsTotal(res.total);
    } catch {
      toast.error('Failed to load logs');
    } finally {
      setLogsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeSection !== 'logs') return;
    loadLogs(logsPage);
  }, [activeSection, logsPage, loadLogs]);

  const loadEmployeeProgress = useCallback(async (employeeId: number) => {
    setProgressLoading(true);
    try {
      const res = await apiClient.getAdminUserVideoProgress(employeeId);
      setProgressRows(res.progress || []);
      setProgressEmployeeName(res.user?.name || '');
    } catch (err) {
      console.error(err);
      toast.error('Failed to load employee progress');
    } finally {
      setProgressLoading(false);
    }
  }, []);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate('/login');
      return;
    }
    if (user.role !== 'admin') {
      navigate('/profile');
      return;
    }
    loadData()
      .catch((err) => {
        console.error(err);
        toast.error('Failed to load admin data');
      })
      .finally(() => setLoading(false));
  }, [user, authLoading, navigate, loadData]);

  useEffect(() => {
    if (contentFilter === 'all') {
      loadAllFiles();
    }
  }, [contentFilter, loadAllFiles]);

  const totals = useMemo(() => {
    const totalFiles = folders.reduce((sum, f) => sum + Number(f.file_count || 0), 0);
    const totalEmployees = users.filter((u) => u.role === 'employee').length;
    const restrictedFolders = folders.filter((f) => String(f.visibility || 'all') === 'restricted').length;
    return { totalFiles, totalEmployees, totalFolders: folders.length, restrictedFolders };
  }, [folders, users]);

  const filesByType = useMemo(() => {
    const items = summary?.recent_uploads || [];
    const buckets: Record<string, number> = {};
    for (const f of items) {
      const mt = String(f.mime_type || '');
      const key = mt.startsWith('video/')
        ? 'Video'
        : mt === 'application/pdf'
        ? 'PDF'
        : mt.includes('wordprocessingml') || mt === 'application/msword'
        ? 'DOC'
        : 'Other';
      buckets[key] = (buckets[key] || 0) + 1;
    }
    return Object.entries(buckets).map(([type, count]) => ({ type, count }));
  }, [summary]);

  const breadcrumb = useMemo(
    () => folderBreadcrumb(folders, selectedFolderId),
    [folders, selectedFolderId]
  );

  const selectedFolder = useMemo(
    () => (selectedFolderId ? folders.find((f) => f.id === selectedFolderId) || null : null),
    [folders, selectedFolderId]
  );
  const rootFolders = useMemo(() => folders.filter((f) => f.parent_id == null), [folders]);
  const uploadSubfolders = useMemo(
    () => folders.filter((f) => f.parent_id === uploadRootId),
    [folders, uploadRootId]
  );

  const employees = useMemo(
    () => users.filter((u: any) => u.role === 'employee'),
    [users]
  );

  useEffect(() => {
    if (!employees.length) {
      setProgressEmployeeId(null);
      return;
    }
    if (progressEmployeeId == null || !employees.some((e) => e.id === progressEmployeeId)) {
      setProgressEmployeeId(employees[0].id);
    }
  }, [employees, progressEmployeeId]);

  useEffect(() => {
    if (activeSection !== 'progress' || progressEmployeeId == null) return;
    loadEmployeeProgress(progressEmployeeId);
  }, [activeSection, progressEmployeeId, loadEmployeeProgress]);

  const refreshAssignedCount = useCallback(async () => {
    if (!selectedFolderId) {
      setAssignedEmployeeCount(null);
      return;
    }
    try {
      const res = await apiClient.getFolderAccess(selectedFolderId);
      setAssignedEmployeeCount(res.user_ids.length);
    } catch {
      setAssignedEmployeeCount(null);
    }
  }, [selectedFolderId]);

  useEffect(() => {
    if (String(selectedFolder?.visibility || 'all') !== 'restricted') {
      setAssignedEmployeeCount(null);
      return;
    }
    refreshAssignedCount();
  }, [selectedFolder?.visibility, refreshAssignedCount]);

  useEffect(() => {
    if (!selectedFolderId || String(selectedFolder?.visibility || 'all') !== 'restricted') {
      setAssignedNames([]);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await apiClient.getFolderAccess(selectedFolderId);
        const ids = res.user_ids || [];
        const names = ids.map((id: number) => {
          const row = users.find((x) => x.id === id);
          return row?.name || `User #${id}`;
        });
        if (!cancelled) setAssignedNames(names);
      } catch {
        if (!cancelled) setAssignedNames([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedFolderId, selectedFolder?.visibility, users]);

  useEffect(() => {
    if (uploadRootId == null && rootFolders.length) {
      setUploadRootId(rootFolders[0].id);
    }
  }, [uploadRootId, rootFolders]);

  const onSelectFolder = async (folderId: number) => {
    setSelectedFolderId(folderId);
    try {
      const res = await apiClient.getFolderFiles(folderId);
      setFiles(res.files);
    } catch (err) {
      console.error(err);
      toast.error('Failed to load folder files');
    }
  };

  const onCreateRoot = async (name: string) => {
    const res = await apiClient.createFolder(name, null);
    await loadData(res.folder.id);
    toast.success('Folder created');
  };

  const onCreateSubfolder = async (parentId: number, name: string) => {
    await apiClient.createFolder(name, parentId);
    // Keep the parent selected so admins can add multiple sibling subfolders quickly.
    await loadData(parentId);
    toast.success('Subfolder created');
  };

  const onDeleteFolder = (folderId: number) => {
    setPendingFolderDeleteId(folderId);
  };

  const onUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!uploadRootId) return;
    const file = e.target.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append('file', file);
    let targetFolderId: number | null = null;
    try {
      if (uploadSubfolderValue && uploadSubfolderValue !== '__other__') {
        targetFolderId = Number(uploadSubfolderValue);
      } else {
        const existingOther = uploadSubfolders.find((f) => f.name.trim().toLowerCase() === 'other');
        if (existingOther) {
          targetFolderId = existingOther.id;
        } else {
          const created = await apiClient.createFolder('Other', uploadRootId);
          targetFolderId = created.folder.id;
        }
      }
      if (!targetFolderId) {
        toast.error('Please select a valid subfolder');
        return;
      }
      setUploading(true);
      setUploadPercent(0);
      const uploadRes = await apiClient.uploadFolderFile(targetFolderId, formData, {
        onProgress: (percent) => setUploadPercent(percent),
      });
      await loadData(targetFolderId);
      setUploadRootId(uploadRootId);
      setUploadSubfolderValue(String(targetFolderId));
      setLastUploadedFile(uploadRes.file);
      setRenameValue(uploadRes.file.original_name);
      toast.success('File uploaded');
    } catch (err: any) {
      toast.error(err?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      setUploadPercent(0);
      e.target.value = '';
    }
  };

  if (authLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading session…</p>
      </div>
    );
  }
  if (!user || user.role !== 'admin') return null;
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50">
        <p className="text-gray-600">Loading admin panel…</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-3.5rem)] bg-gray-50 overflow-hidden">
      <aside className="flex w-72 shrink-0 h-full flex-col border-r border-gray-200 bg-white shadow-sm">
        <div className="border-b border-gray-100 p-4">
          <h2 className="text-lg font-semibold text-gray-900">Admin</h2>
          <p className="text-xs text-gray-500">Content hub navigation</p>
        </div>

        <nav className="p-3 space-y-1">
          <button
            type="button"
            onClick={() => setActiveSection('dashboard')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'dashboard' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <LayoutDashboard className="h-4 w-4" /> Dashboard
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('content')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'content' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <FolderOpen className="h-4 w-4" /> Content
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('upload')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'upload' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <Upload className="h-4 w-4" /> Upload
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('folders')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'folders' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <FolderTree className="h-4 w-4" /> Folders
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('users')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'users' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <UsersIcon className="h-4 w-4" /> Users
          </button>
          <button
            type="button"
            onClick={() => setActiveSection('progress')}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'progress' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <CheckCircle2 className="h-4 w-4" /> Progress
          </button>
          <button
            type="button"
            onClick={() => {
              setLogsPage(1);
              setActiveSection('logs');
            }}
            className={`w-full rounded-md px-3 py-2 text-left text-sm flex items-center gap-2 ${
              activeSection === 'logs' ? 'bg-red-50 text-red-700' : 'hover:bg-gray-100 text-gray-700'
            }`}
          >
            <ScrollText className="h-4 w-4" /> Logs
          </button>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 h-full flex-col">
        <header className="border-b border-gray-200 bg-white px-6 py-4">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Admin Panel</h1>
            <p className="text-sm text-gray-600">Internal content hub management</p>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto space-y-4 p-6">
          {activeSection === 'dashboard' && (
            <div className="space-y-5">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card
                className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveSection('content')}
                role="button"
                tabIndex={0}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Total files</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{summary?.total_files ?? totals.totalFiles}</CardContent>
              </Card>
              <Card
                className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveSection('users')}
                role="button"
                tabIndex={0}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Employees</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{summary?.total_employees ?? totals.totalEmployees}</CardContent>
              </Card>
              <Card
                className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveSection('content')}
                role="button"
                tabIndex={0}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Restricted folders</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{totals.restrictedFolders}</CardContent>
              </Card>
              <Card
                className="shadow-sm cursor-pointer hover:shadow-md transition-shadow"
                onClick={() => setActiveSection('folders')}
                role="button"
                tabIndex={0}
              >
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-gray-600">Folders (incl. subfolders)</CardTitle>
                </CardHeader>
                <CardContent className="text-2xl font-semibold">{totals.totalFolders}</CardContent>
              </Card>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <Card className="shadow-sm h-[360px] flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">Recent uploads</CardTitle>
                </CardHeader>
                <CardContent className="flex-1 overflow-y-auto">
                  <div className="space-y-2 pr-1">
                    {(summary?.recent_uploads || []).map((u) => (
                      <div
                        key={u.id}
                        className="flex items-center justify-between gap-3 rounded-md border border-gray-100 p-3 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="truncate font-medium text-gray-900">{u.original_name}</div>
                          <div className="text-xs text-gray-500">
                            {u.folder_name} · {(u.file_size / 1024 / 1024).toFixed(2)} MB
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            const mime = String(u.mime_type || '');
                            if (mime.startsWith('video/')) {
                              setPreviewVideoFile({
                                id: u.id,
                                folder_id: 0,
                                original_name: u.original_name,
                                stored_name: '',
                                mime_type: u.mime_type,
                                file_size: u.file_size,
                                uploaded_by: 0,
                                created_at: '',
                              });
                              setPreviewVideoTitle(u.original_name);
                              setPreviewVideoUrl(`/api/library/files/${u.id}/stream`);
                              setPreviewVideoOpen(true);
                              return;
                            }
                            setPreviewDocFile({
                              id: u.id,
                              folder_id: 0,
                              original_name: u.original_name,
                              stored_name: '',
                              mime_type: u.mime_type,
                              file_size: u.file_size,
                              uploaded_by: 0,
                              created_at: '',
                            });
                            setPreviewDocOpen(true);
                          }}
                        >
                          Open
                        </Button>
                      </div>
                    ))}
                    {(!summary?.recent_uploads || summary.recent_uploads.length === 0) && (
                      <p className="text-sm text-gray-500">No uploads yet.</p>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="shadow-sm h-[360px] flex flex-col">
                <CardHeader>
                  <CardTitle className="text-base">Uploads by type (recent)</CardTitle>
                </CardHeader>
                <CardContent className="flex-1">
                  <ChartContainer
                    id="uploads-by-type"
                    className="h-[280px] w-full"
                    config={{
                      count: { label: 'Files', color: '#ef4444' },
                    }}
                  >
                    <BarChart data={filesByType}>
                      <CartesianGrid vertical={false} />
                      <XAxis dataKey="type" tickLine={false} axisLine={false} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[6, 6, 0, 0]} />
                    </BarChart>
                  </ChartContainer>
                </CardContent>
              </Card>
            </div>
            </div>
          )}

          {activeSection === 'folders' && (
            <Card>
              <CardHeader>
                <CardTitle>Folders</CardTitle>
              </CardHeader>
              <CardContent className="py-4">
                <div className="h-[60vh]">
                  <FolderTreeNav
                    folders={folders}
                    selectedId={selectedFolderId}
                    onSelect={onSelectFolder}
                    admin
                    onCreateRoot={onCreateRoot}
                    onCreateSubfolder={onCreateSubfolder}
                    onDeleteFolder={onDeleteFolder}
                  />
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'upload' && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Upload Files</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Select root folder</label>
                  <select
                    value={uploadRootId ?? ''}
                    onChange={(e) => {
                      const id = Number(e.target.value);
                      setUploadRootId(id || null);
                      setUploadSubfolderValue('');
                    }}
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    <option value="">Choose root folder</option>
                    {rootFolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium text-gray-700">Select subfolder (required)</label>
                  <select
                    value={uploadSubfolderValue}
                    onChange={(e) => setUploadSubfolderValue(e.target.value)}
                    disabled={!uploadRootId}
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm disabled:bg-gray-50"
                  >
                    <option value="">Auto use "Other"</option>
                    {uploadSubfolders.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.name}
                      </option>
                    ))}
                    <option value="__other__">Other (auto create/use)</option>
                  </select>
                  <p className="text-xs text-gray-500">
                    Files are uploaded only in subfolders. If no subfolder is selected, it goes to <strong>Other</strong>.
                  </p>
                </div>

                <div>
                  <Input
                    type="file"
                    onChange={onUpload}
                    disabled={uploading || uploadRootId == null}
                    className="cursor-pointer"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    Upload directly to selected subfolder. PDF, DOC, DOCX, MP4, AVI, MKV, MOV, WEBM
                  </p>
                  {uploading && (
                    <div className="mt-3 space-y-1">
                      <div className="flex items-center justify-between text-xs text-gray-600">
                        <span>Uploading...</span>
                        <span>{uploadPercent}%</span>
                      </div>
                      <Progress value={uploadPercent} />
                    </div>
                  )}
                </div>

                {lastUploadedFile && (
                  <div className="rounded-lg border border-gray-100 bg-gray-50 p-3 space-y-2">
                    <div className="text-sm font-medium text-gray-900">Rename uploaded file</div>
                    <div className="flex gap-2">
                      <Input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="File name"
                      />
                      <Button
                        disabled={renameSaving || !renameValue.trim()}
                        onClick={async () => {
                          try {
                            setRenameSaving(true);
                            const res = await apiClient.renameFolderFile(lastUploadedFile.id, renameValue.trim());
                            setLastUploadedFile(res.file);
                            await loadData(res.file.folder_id);
                            toast.success('File name updated');
                          } catch (e: any) {
                            toast.error(e?.message || 'Failed to rename file');
                          } finally {
                            setRenameSaving(false);
                          }
                        }}
                      >
                        Save name
                      </Button>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'users' && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Users</CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="text-sm text-gray-600">
                  Inactive users cannot sign in. Folder access shows open libraries and restricted assignments. Delete
                  removes the account (uploads are reassigned to you).
                </div>
                <div className="rounded-lg border border-gray-100 bg-gray-50 p-4 space-y-3">
                  <div className="text-sm font-medium text-gray-900">Add employee</div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      placeholder="Full name"
                      value={newEmployeeName}
                      onChange={(e) => setNewEmployeeName(e.target.value)}
                    />
                    <Input
                      type="email"
                      placeholder="Email"
                      value={newEmployeeEmail}
                      onChange={(e) => setNewEmployeeEmail(e.target.value)}
                    />
                    <Input
                      type="password"
                      placeholder="Password (min 8 chars)"
                      value={newEmployeePassword}
                      onChange={(e) => setNewEmployeePassword(e.target.value)}
                    />
                  </div>
                  <Button
                    disabled={creatingEmployee}
                    onClick={async () => {
                      const name = newEmployeeName.trim();
                      const email = newEmployeeEmail.trim();
                      const password = newEmployeePassword;
                      if (!name || !email || !password) {
                        toast.error('Fill name, email, and password');
                        return;
                      }
                      if (password.length < 8) {
                        toast.error('Password must be at least 8 characters');
                        return;
                      }
                      try {
                        setCreatingEmployee(true);
                        await apiClient.createEmployee({ name, email, password });
                        setNewEmployeeName('');
                        setNewEmployeeEmail('');
                        setNewEmployeePassword('');
                        await loadData(selectedFolderId);
                        toast.success('Employee saved');
                      } catch (e: any) {
                        toast.error(e?.message || 'Failed to create employee');
                      } finally {
                        setCreatingEmployee(false);
                      }
                    }}
                  >
                    Save employee
                  </Button>
                </div>
                <div className="divide-y rounded-lg border border-gray-100 bg-white">
                  {users.map((u: any) => (
                    <div key={u.id} className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="min-w-0 flex-1 space-y-2">
                        <div>
                          <div className="truncate font-medium text-gray-900">
                            {u.name}{' '}
                            <span className="text-xs text-gray-500 font-normal">({u.role})</span>
                          </div>
                          <div className="text-xs text-gray-500 truncate">{u.email}</div>
                        </div>
                        <p className="text-xs leading-relaxed text-gray-600">
                          {describeUserFolderAccess(u, openFoldersCount)}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3 sm:flex-col sm:items-end">
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500">Active</span>
                          <Switch
                            checked={isUserActive(u)}
                            disabled={Number(u.id) === Number(user?.id)}
                            onCheckedChange={async (checked) => {
                              try {
                                const res = await apiClient.updateUserStatus(Number(u.id), Boolean(checked));
                                setUsers((prev: any) =>
                                  prev.map((x: any) =>
                                    x.id === u.id
                                      ? { ...x, ...res.user, restricted_folder_access: x.restricted_folder_access }
                                      : x
                                  )
                                );
                                toast.success('User status updated');
                              } catch (e: any) {
                                toast.error(e?.message || 'Failed to update status');
                              }
                            }}
                          />
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                          disabled={Number(u.id) === Number(user?.id)}
                          onClick={() =>
                            setPendingUserDelete({ id: Number(u.id), email: String(u.email) })
                          }
                        >
                          <Trash2 className="h-4 w-4 mr-1" />
                          Delete
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'progress' && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>Employee video progress</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="max-w-sm">
                  <select
                    value={progressEmployeeId ?? ''}
                    onChange={(e) => setProgressEmployeeId(Number(e.target.value) || null)}
                    className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                  >
                    {employees.map((employee) => (
                      <option key={employee.id} value={employee.id}>
                        {employee.name} · {employee.email}
                      </option>
                    ))}
                  </select>
                </div>

                {progressLoading ? (
                  <p className="text-sm text-gray-600">Loading employee progress…</p>
                ) : (
                  <>
                    <div className="rounded-lg border border-gray-100 bg-gray-50 p-4">
                      <div className="text-sm font-medium text-gray-900">
                        {progressEmployeeName || 'Employee progress'}
                      </div>
                      <div className="mt-1 text-xs text-gray-500">
                        Completed videos are marked only when playback reaches 100%.
                      </div>
                    </div>

                    <div className="overflow-auto rounded-md border border-gray-100">
                      <table className="w-full text-left text-sm">
                        <thead className="border-b bg-gray-50 text-xs uppercase tracking-wide text-gray-500">
                          <tr>
                            <th className="p-3">Status</th>
                            <th className="p-3">Video</th>
                            <th className="p-3">Folder</th>
                            <th className="p-3">Progress</th>
                            <th className="p-3">Watched</th>
                            <th className="p-3">Updated</th>
                          </tr>
                        </thead>
                        <tbody>
                          {progressRows.map((row) => (
                            <tr key={`${row.user_id}-${row.file_id}`} className="border-b border-gray-50 hover:bg-gray-50/70">
                              <td className="p-3">
                                {Number(row.completed) === 1 ? (
                                  <span className="inline-flex items-center gap-2 text-emerald-700">
                                    <CheckCircle2 className="h-4 w-4" /> Completed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-2 text-gray-500">
                                    <Circle className="h-4 w-4" /> In progress
                                  </span>
                                )}
                              </td>
                              <td className="p-3 font-medium text-gray-900">{row.original_name}</td>
                              <td className="p-3 text-gray-600">{row.folder_name}</td>
                              <td className="p-3 min-w-[180px]">
                                <div className="space-y-1">
                                  <Progress value={Number(row.max_percent || 0)} className="h-2" />
                                  <div className="text-xs text-gray-500">{Math.round(Number(row.max_percent || 0))}%</div>
                                </div>
                              </td>
                              <td className="p-3 text-gray-600">
                                {Math.floor(Number(row.watched_seconds || 0))}s / {Math.floor(Number(row.duration_seconds || 0))}s
                              </td>
                              <td className="p-3 text-gray-500">
                                {row.updated_at ? String(row.updated_at).replace('T', ' ').slice(0, 19) : '—'}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {!progressRows.length && (
                        <div className="p-6 text-sm text-gray-500">No video progress has been recorded for this employee yet.</div>
                      )}
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          )}

          {activeSection === 'logs' && (
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle>System logs</CardTitle>
                <p className="text-xs text-gray-500">
                  Sign-ins, uploads, and admin actions. Files and videos still require a valid session on each request;
                  hiding URLs from the console is not possible in browsers, but unauthorized requests are rejected by the
                  server.
                </p>
              </CardHeader>
              <CardContent className="space-y-4">
                {logsLoading ? (
                  <p className="text-sm text-gray-600">Loading…</p>
                ) : (
                  <div className="max-h-[60vh] overflow-auto rounded-md border border-gray-100">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-gray-50 border-b">
                        <tr>
                          <th className="p-2 font-medium">Time</th>
                          <th className="p-2 font-medium">Level</th>
                          <th className="p-2 font-medium">Action</th>
                          <th className="p-2 font-medium">Message</th>
                          <th className="p-2 font-medium">User</th>
                          <th className="p-2 font-medium">IP</th>
                        </tr>
                      </thead>
                      <tbody>
                        {logs.map((row) => (
                          <tr key={row.id} className="border-b border-gray-50 hover:bg-gray-50/80">
                            <td className="p-2 whitespace-nowrap text-gray-600">
                              {row.created_at ? String(row.created_at).replace('T', ' ').slice(0, 19) : '—'}
                            </td>
                            <td className="p-2">{row.level}</td>
                            <td className="p-2 font-mono">{row.action}</td>
                            <td className="p-2 max-w-xs truncate" title={row.message || ''}>
                              {row.message || '—'}
                            </td>
                            <td className="p-2">{row.user_id ?? '—'}</td>
                            <td className="p-2 font-mono text-gray-500">{row.ip || '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {!logs.length && <p className="p-4 text-sm text-gray-500">No log entries yet.</p>}
                  </div>
                )}
                <div className="flex items-center justify-between gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsPage <= 1 || logsLoading}
                    onClick={() => setLogsPage((p) => Math.max(1, p - 1))}
                  >
                    Previous
                  </Button>
                  <span className="text-xs text-gray-600">
                    Page {logsPage} · {logsTotal} entries
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={logsLoading || logsPage * ADMIN_LOGS_PAGE_SIZE >= logsTotal}
                    onClick={() => setLogsPage((p) => p + 1)}
                  >
                    Next
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {activeSection === 'content' && (selectedFolderId == null ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-600">
                Select a folder from the Upload or Folders section to manage content.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  size="sm"
                  variant={contentFilter === 'all' ? 'default' : 'outline'}
                  onClick={() => setContentFilter('all')}
                >
                  All
                </Button>
                <Button
                  size="sm"
                  variant={contentFilter === 'folder' ? 'default' : 'outline'}
                  onClick={() => setContentFilter('folder')}
                >
                  By folder
                </Button>
                {contentFilter === 'folder' && (
                  <div className="max-w-sm w-full">
                    <select
                      value={selectedFolderId ?? ''}
                      onChange={(e) => {
                        const id = Number(e.target.value);
                        if (id) onSelectFolder(id);
                      }}
                      className="h-10 w-full rounded-md border border-gray-200 bg-white px-3 text-sm"
                    >
                      {folders.map((f) => (
                        <option key={f.id} value={f.id}>
                          {folderFullPath(folders, f.id)}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

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
                <CardContent className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-lg border border-gray-100 bg-white p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2 text-sm text-gray-700">
                        <Shield className="h-4 w-4 text-gray-500" />
                        <span className="font-medium">Visibility</span>
                        <span className="text-xs text-gray-500">
                          {String(selectedFolder?.visibility || 'all') === 'restricted'
                            ? `Restricted — ${assignedEmployeeCount ?? '…'} employee(s) assigned`
                            : 'Visible to all employees (or assign specific people below)'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-gray-500">Restricted</span>
                        <Switch
                          checked={String(selectedFolder?.visibility || 'all') === 'restricted'}
                          onCheckedChange={async (checked) => {
                            if (!selectedFolderId) return;
                            try {
                              const res = await apiClient.updateFolder(selectedFolderId, {
                                visibility: checked ? 'restricted' : 'all',
                              });
                              setFolders((prev) =>
                                prev.map((f) => (f.id === selectedFolderId ? { ...f, ...res.folder } : f))
                              );
                              if (checked) await refreshAssignedCount();
                              else setAssignedEmployeeCount(null);
                              toast.success('Folder visibility updated');
                            } catch (e: any) {
                              toast.error(e?.message || 'Failed to update visibility');
                            }
                          }}
                        />
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={async () => {
                            if (!selectedFolderId) return;
                            setAccessOpen(true);
                            setAccessLoading(true);
                            try {
                              const res = await apiClient.getFolderAccess(selectedFolderId);
                              setAccessUserIds(res.user_ids || []);
                            } catch (e: any) {
                              toast.error(e?.message || 'Failed to load access list');
                            } finally {
                              setAccessLoading(false);
                            }
                          }}
                        >
                          Assign employees
                        </Button>
                      </div>
                    </div>
                    {String(selectedFolder?.visibility || 'all') === 'restricted' && (
                      <>
                        <div className="text-xs text-gray-500">
                          Tip: Restrict a parent folder (e.g. “Cisco”) so access rules apply to its subfolders too.
                        </div>
                        <div className="text-xs text-gray-800">
                          <span className="font-medium">Assigned employees:</span>{' '}
                          {assignedNames.length
                            ? assignedNames.join(', ')
                            : 'None — use Assign employees'}
                        </div>
                      </>
                    )}
                  </div>

                  {contentFilter === 'all' && allFilesLoading && (
                    <p className="text-sm text-gray-500">Loading all files…</p>
                  )}
                  <ul className="divide-y divide-gray-100 rounded-lg border border-gray-100">
                    {(contentFilter === 'all' ? allFiles : files).map((f: any) => (
                      <li
                        key={f.id}
                        className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-gray-50/80"
                      >
                        <div className="min-w-0">
                          <p className="truncate font-medium text-gray-900">{f.original_name}</p>
                          <p className="text-xs text-gray-500">
                            {(f.file_size / 1024 / 1024).toFixed(2)} MB · {f.mime_type}
                            {contentFilter === 'all' ? ` · ${f.folder_name}` : ''}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-2">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => {
                              if (f.mime_type.startsWith('video/')) {
                                setPreviewVideoFile(f);
                                setPreviewVideoTitle(f.original_name);
                                setPreviewVideoUrl(`/api/library/files/${f.id}/stream`);
                                setPreviewVideoOpen(true);
                                return;
                              }
                              setPreviewDocFile(f);
                              setPreviewDocOpen(true);
                            }}
                          >
                            {f.mime_type.startsWith('video/') ? 'Play' : 'Open'}
                          </Button>
                          <Button
                            variant="outline"
                            size="sm"
                            className="text-red-700 border-red-200 hover:bg-red-50"
                            onClick={() => setPendingFileDelete({ id: f.id, name: f.original_name })}
                          >
                            <Trash2 className="h-4 w-4 mr-1" />
                            Delete
                          </Button>
                        </div>
                      </li>
                    ))}
                  </ul>
                  {!(contentFilter === 'all' ? allFiles.length : files.length) && !allFilesLoading && (
                    <p className="py-8 text-center text-sm text-gray-500">No files in this folder yet.</p>
                  )}
                </CardContent>
              </Card>
            </>
          ))}

          <Dialog open={accessOpen} onOpenChange={setAccessOpen}>
            <DialogContent className="sm:max-w-xl">
              <DialogHeader>
                <DialogTitle>Folder access (employees)</DialogTitle>
                <DialogDescription>
                  Choose which employees can open this folder. Only applies when the folder is restricted.
                </DialogDescription>
              </DialogHeader>
              {accessLoading ? (
                <div className="text-sm text-gray-600">Loading…</div>
              ) : (
                <div className="space-y-4">
                  <div className="text-sm text-gray-600">
                    {String(selectedFolder?.visibility || 'all') === 'restricted' ? (
                      <>Choose which employees can open this folder and its files.</>
                    ) : (
                      <>
                        Choose employees to allow. Saving will set this folder to <strong>Restricted</strong> so only
                        selected people can see it.
                      </>
                    )}
                  </div>
                  <div className="max-h-72 overflow-auto rounded-md border border-gray-100">
                    {employees.map((e: any) => {
                      const checked = accessUserIds.includes(e.id);
                      return (
                        <label
                          key={e.id}
                          className="flex items-center gap-3 px-4 py-2 hover:bg-gray-50 cursor-pointer"
                        >
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(v) => {
                              const next = Boolean(v);
                              setAccessUserIds((prev) =>
                                next ? [...new Set([...prev, e.id])] : prev.filter((x) => x !== e.id)
                              );
                            }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-gray-900 truncate">{e.name}</div>
                            <div className="text-xs text-gray-500 truncate">{e.email}</div>
                          </div>
                        </label>
                      );
                    })}
                    {employees.length === 0 && (
                      <div className="px-4 py-3 text-sm text-gray-600">No employees found.</div>
                    )}
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" onClick={() => setAccessOpen(false)}>
                      Cancel
                    </Button>
                    <Button
                      onClick={async () => {
                        if (!selectedFolderId) return;
                        try {
                          if (accessUserIds.length > 0) {
                            const resVis = await apiClient.updateFolder(selectedFolderId, {
                              visibility: 'restricted',
                            });
                            setFolders((prev) =>
                              prev.map((f) => (f.id === selectedFolderId ? { ...f, ...resVis.folder } : f))
                            );
                          }
                          await apiClient.setFolderAccess(selectedFolderId, accessUserIds);
                          await refreshAssignedCount();
                          toast.success('Access list saved');
                          setAccessOpen(false);
                        } catch (e: any) {
                          toast.error(e?.message || 'Failed to save access list');
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                </div>
              )}
            </DialogContent>
          </Dialog>
        </main>

        <SecureLibraryVideoDialog
          open={previewVideoOpen}
          onOpenChange={(open) => {
            setPreviewVideoOpen(open);
            if (!open) {
              setPreviewVideoUrl('');
              setPreviewVideoTitle('');
              setPreviewVideoFile(null);
            }
          }}
          title={previewVideoTitle}
          streamUrl={previewVideoUrl}
          viewerLabel={user?.email ?? 'Admin'}
        />

        <SecureLibraryDocumentDialog
          open={previewDocOpen}
          onOpenChange={(open) => {
            setPreviewDocOpen(open);
            if (!open) setPreviewDocFile(null);
          }}
          title={previewDocFile?.original_name ?? ''}
          fileId={previewDocFile?.id ?? 0}
          mimeType={previewDocFile?.mime_type ?? ''}
        />

        <ConfirmDestructiveDialog
          open={pendingFolderDeleteId !== null}
          onOpenChange={(o) => {
            if (!o) setPendingFolderDeleteId(null);
          }}
          title="Delete folder?"
          description="This removes the folder, all subfolders, and every file inside. This cannot be undone."
          confirmLabel="Delete folder"
          onConfirm={async () => {
            if (pendingFolderDeleteId == null) return;
            const folderId = pendingFolderDeleteId;
            try {
              await apiClient.deleteFolder(folderId);
              await loadData(null);
              toast.success('Folder removed');
            } catch (e: any) {
              toast.error(e?.message || 'Failed to delete folder');
            }
          }}
        />
        <ConfirmDestructiveDialog
          open={pendingFileDelete !== null}
          onOpenChange={(o) => {
            if (!o) setPendingFileDelete(null);
          }}
          title="Delete file?"
          description={
            pendingFileDelete
              ? `Remove “${pendingFileDelete.name}” from the library? The stored file will be deleted. This cannot be undone.`
              : ''
          }
          confirmLabel="Delete file"
          onConfirm={async () => {
            if (!pendingFileDelete) return;
            try {
              await apiClient.deleteLibraryFile(pendingFileDelete.id);
              await loadData(selectedFolderId);
              if (contentFilter === 'all') {
                await loadAllFiles();
              }
              toast.success('File deleted');
            } catch (e: any) {
              toast.error(e?.message || 'Failed to delete file');
            }
          }}
        />
        <ConfirmDestructiveDialog
          open={pendingUserDelete !== null}
          onOpenChange={(o) => {
            if (!o) setPendingUserDelete(null);
          }}
          title="Delete user?"
          description={
            pendingUserDelete
              ? `Delete ${pendingUserDelete.email}? This cannot be undone.`
              : ''
          }
          confirmLabel="Delete user"
          onConfirm={async () => {
            if (!pendingUserDelete) return;
            try {
              await apiClient.deleteUser(pendingUserDelete.id);
              setUsers((prev) => prev.filter((x) => x.id !== pendingUserDelete.id));
              toast.success('User deleted');
            } catch (e: any) {
              toast.error(e?.message || 'Failed to delete user');
            }
          }}
        />
      </div>
    </div>
  );
}
