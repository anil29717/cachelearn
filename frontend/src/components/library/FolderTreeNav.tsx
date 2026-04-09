import React, { useMemo, useState } from 'react';
import { ChevronRight, Folder, FolderOpen, Lock, Trash2 } from 'lucide-react';
import { LibraryFolder } from '../../types';
import { Button } from '../ui/button';
import { Input } from '../ui/input';

type Props = {
  folders: LibraryFolder[];
  selectedId: number | null;
  onSelect: (id: number) => void;
  /** Admin: show create/delete */
  admin?: boolean;
  onCreateRoot?: (name: string) => Promise<void> | void;
  onCreateSubfolder?: (parentId: number, name: string) => Promise<void> | void;
  onDeleteFolder?: (id: number) => Promise<void> | void;
};

function childrenOf(folders: LibraryFolder[], parentId: number | null) {
  return folders
    .filter((f) => (parentId === null ? f.parent_id == null : f.parent_id === parentId))
    .sort((a, b) => a.name.localeCompare(b.name));
}

function TreeRow({
  folder,
  folders,
  depth,
  selectedId,
  expanded,
  toggle,
  onSelect,
  admin,
  onDeleteFolder,
}: {
  folder: LibraryFolder;
  folders: LibraryFolder[];
  depth: number;
  selectedId: number | null;
  expanded: Set<number>;
  toggle: (id: number) => void;
  onSelect: (id: number) => void;
  admin?: boolean;
  onDeleteFolder?: (id: number) => Promise<void> | void;
}) {
  const kids = childrenOf(folders, folder.id);
  const hasKids = kids.length > 0;
  const isOpen = expanded.has(folder.id);
  const isSel = selectedId === folder.id;

  return (
    <div className="select-none">
      <div
        className={`group flex items-center gap-1 rounded-md pr-1 ${isSel ? 'bg-red-50 ring-1 ring-red-200' : 'hover:bg-gray-100'}`}
        style={{ paddingLeft: Math.max(0, depth) * 12 + 4 }}
      >
        <button
          type="button"
          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded ${hasKids ? 'text-gray-600' : 'text-transparent'}`}
          onClick={(e) => {
            e.stopPropagation();
            if (hasKids) toggle(folder.id);
          }}
          aria-label={isOpen ? 'Collapse' : 'Expand'}
        >
          <ChevronRight className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-90' : ''}`} />
        </button>
        <button
          type="button"
          className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-sm"
          onClick={() => onSelect(folder.id)}
        >
          {isOpen && hasKids ? (
            <FolderOpen className="h-4 w-4 shrink-0 text-red-600" />
          ) : (
            <Folder className="h-4 w-4 shrink-0 text-red-500" />
          )}
          <span className="truncate font-medium">{folder.name}</span>
          {String(folder.visibility || 'all') === 'restricted' && (
            <Lock className="h-3.5 w-3.5 shrink-0 text-gray-400" aria-label="Restricted" />
          )}
          <span className="shrink-0 text-xs text-gray-400">({folder.file_count})</span>
        </button>
        {admin && onDeleteFolder && (
          <button
            type="button"
            className="opacity-0 transition-opacity group-hover:opacity-100"
            title="Delete folder and contents"
            onClick={(e) => {
              e.stopPropagation();
              onDeleteFolder(folder.id);
            }}
          >
            <Trash2 className="h-4 w-4 text-gray-400 hover:text-red-600" />
          </button>
        )}
      </div>
      {hasKids && isOpen && (
        <div>
          {kids.map((ch) => (
            <TreeRow
              key={ch.id}
              folder={ch}
              folders={folders}
              depth={depth + 1}
              selectedId={selectedId}
              expanded={expanded}
              toggle={toggle}
              onSelect={onSelect}
              admin={admin}
              onDeleteFolder={onDeleteFolder}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function FolderTreeNav({
  folders,
  selectedId,
  onSelect,
  admin,
  onCreateRoot,
  onCreateSubfolder,
  onDeleteFolder,
}: Props) {
  const roots = useMemo(() => childrenOf(folders, null), [folders]);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set());

  React.useEffect(() => {
    const parents = new Set<number>();
    folders.forEach((f) => {
      if (f.parent_id != null) parents.add(f.parent_id);
    });
    setExpanded((prev) => {
      const next = new Set(prev);
      parents.forEach((id) => next.add(id));
      return next;
    });
  }, [folders]);
  const [name, setName] = useState('');
  const [mode, setMode] = useState<'root' | 'sub'>('root');

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  React.useEffect(() => {
    if (selectedId == null) return;
    const ancestors: number[] = [];
    let cur = folders.find((f) => f.id === selectedId);
    while (cur?.parent_id != null) {
      ancestors.push(cur.parent_id);
      cur = folders.find((f) => f.id === cur!.parent_id);
    }
    setExpanded((prev) => {
      const next = new Set(prev);
      ancestors.forEach((id) => next.add(id));
      if (selectedId) next.add(selectedId);
      return next;
    });
  }, [selectedId, folders]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return;
    if (mode === 'sub') {
      if (selectedId == null || !onCreateSubfolder) return;
      await onCreateSubfolder(selectedId, n);
      setExpanded((prev) => new Set(prev).add(selectedId));
    } else {
      if (!onCreateRoot) return;
      await onCreateRoot(n);
    }
    setName('');
  };

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-gray-100 bg-gray-50/50 p-2">
        {roots.length === 0 && (
          <p className="px-2 py-4 text-center text-sm text-gray-500">No folders yet. Create one below.</p>
        )}
        {roots.map((f) => (
          <TreeRow
            key={f.id}
            folder={f}
            folders={folders}
            depth={0}
            selectedId={selectedId}
            expanded={expanded}
            toggle={toggle}
            onSelect={onSelect}
            admin={admin}
            onDeleteFolder={onDeleteFolder}
          />
        ))}
      </div>

      {admin && onCreateRoot && (
        <form onSubmit={handleCreate} className="border-t border-gray-100 pt-3 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button
              type="button"
              variant={mode === 'root' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('root')}
            >
              Root folder
            </Button>
            <Button
              type="button"
              variant={mode === 'sub' ? 'default' : 'outline'}
              size="sm"
              disabled={selectedId == null}
              onClick={() => setMode('sub')}
            >
              Subfolder
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={mode === 'sub' ? 'Subfolder name' : 'Folder name'}
              className="h-9 text-sm"
            />
            <Button type="submit" size="sm" className="shrink-0">
              Create
            </Button>
          </div>
          {mode === 'sub' && (
            <p className="text-[11px] text-gray-500">
              Creating inside: {selectedId ? folders.find((f) => f.id === selectedId)?.name || 'selected folder' : 'select a folder first'}
            </p>
          )}
        </form>
      )}
    </div>
  );
}
