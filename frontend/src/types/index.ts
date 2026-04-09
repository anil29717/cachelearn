/** Explicit grants for restricted folders (admin users list). */
export interface RestrictedFolderAccessGrant {
  folder_id: number;
  path: string;
}

export interface User {
  id: number;
  email: string;
  name: string;
  phone?: string;
  role: string;
  is_active?: number | boolean;
  avatar_url?: string;
  created_at: string;
  /** Folders this user is allowed on when those folders are restricted (employees). */
  restricted_folder_access?: RestrictedFolderAccessGrant[];
}

export interface LibraryFolder {
  id: number;
  name: string;
  slug: string;
  parent_id: number | null;
  visibility?: 'all' | 'restricted' | string;
  created_by: number;
  created_at: string;
  file_count: number;
}

export interface LibraryFile {
  id: number;
  folder_id: number;
  original_name: string;
  stored_name: string;
  mime_type: string;
  file_size: number;
  uploaded_by: number;
  created_at: string;
}

export interface VideoProgress {
  user_id: number;
  file_id: number;
  watched_seconds: number;
  duration_seconds: number;
  max_percent: number;
  completed: number | boolean;
  completed_at: string | null;
  last_position_seconds: number;
  /** Real playback time accumulated (excludes large seeks); used for completion. */
  engaged_watch_seconds?: number;
  updated_at: string | null;
}

export interface AdminVideoProgress extends VideoProgress {
  original_name: string;
  mime_type: string;
  folder_id: number;
  folder_name: string;
}
