import { AdminVideoProgress, LibraryFile, LibraryFolder, VideoProgress } from '../types';

// In the browser during `vite` dev, always use same-origin `/api` so the Vite proxy runs and
// httpOnly session cookies work. (Pointing fetch at http://localhost:8080 breaks cookies across ports.)
// In production builds, use VITE_BACKEND_URL when set (e.g. API on another host).
const envBackend = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
const API_BASE_URL =
  import.meta.env.DEV && typeof window !== 'undefined'
    ? '/api'
    : envBackend
      ? `${String(envBackend).replace(/\/$/, '')}/api`
      : typeof window !== 'undefined'
        ? '/api'
        : 'http://localhost:8080/api';

export class ApiClient {
  /** Optional Bearer header (e.g. legacy); primary auth is httpOnly cookie + credentials. */
  private accessToken: string | null = null;

  constructor() {
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.removeItem('auth_token');
      } catch {
        /* ignore */
      }
    }
  }

  setAccessToken(token: string | null) {
    this.accessToken = token;
  }

  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const isFormData = typeof FormData !== 'undefined' && options.body instanceof FormData;
    const baseHeaders: HeadersInit = {
      ...(this.accessToken ? { Authorization: `Bearer ${this.accessToken}` } : {}),
      ...options.headers,
    };
    const headers: HeadersInit = isFormData
      ? baseHeaders
      : { 'Content-Type': 'application/json', ...baseHeaders };

    let response: Response;
    try {
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers,
      });
    } catch (e: any) {
      const err: any = new Error('Network error: failed to reach backend');
      err.cause = e?.message || e;
      throw err;
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      const silentUnauthorized =
        response.status === 401 &&
        (endpoint === '/auth/profile' || endpoint.startsWith('/auth/profile?'));
      if (!silentUnauthorized) {
        console.error(`API Error at ${endpoint}:`, error);
      }

      // Create error object with code if available
      const errorObj: any = new Error(error.error || 'API request failed');
      if (error.code) {
        errorObj.code = error.code;
      }
      throw errorObj;
    }

    return response.json();
  }

  // Auth
  async register(email: string, password: string, name: string, role: string = 'employee') {
    return this.request<{ message: string }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, name, role }),
    });
  }

  async login(email: string, password: string) {
    return this.request<{ user: any }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
  }

  async logout() {
    return this.request<{ success: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  async resendVerification(email: string) {
    return this.request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
      body: JSON.stringify({ email }),
    });
  }

  // User
  async getProfile() {
    return this.request<{ profile: any }>('/auth/profile');
  }

  async updateProfile(data: any) {
    return this.request<{ profile: any }>('/users/profile', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async changePassword(data: { current_password: string; new_password: string }) {
    return this.request<{ success: boolean }>('/users/password', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Admin
  async getUsers() {
    return this.request<{ users: any[]; open_folders_count?: number }>('/admin/users');
  }

  async createEmployee(data: { email: string; password: string; name: string }) {
    return this.request<{ user: any }>('/admin/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAdminLogs(params?: { page?: number; limit?: number }) {
    const q = new URLSearchParams();
    if (params?.page) q.set('page', String(params.page));
    if (params?.limit) q.set('limit', String(params.limit));
    const qs = q.toString();
    return this.request<{
      logs: Array<{
        id: number;
        level: string;
        action: string;
        message: string | null;
        user_id: number | null;
        ip: string | null;
        user_agent: string | null;
        meta: string | null;
        created_at: string;
      }>;
      total: number;
      page: number;
      limit: number;
    }>(`/admin/logs${qs ? `?${qs}` : ''}`);
  }

  async updateUserStatus(userId: number, isActive: boolean) {
    return this.request<{ user: any }>(`/admin/users/${userId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ is_active: isActive }),
    });
  }

  async getAdminSummary() {
    return this.request<{
      summary: {
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
      };
    }>('/admin/summary');
  }

  async deleteUser(id: number | string) {
    return this.request<{ success: boolean }>(`/admin/users/${id}`, {
      method: 'DELETE',
    });
  }

  async getUserSummary(id: number | string) {
    return this.request<{ summary: any }>(`/admin/users/${id}/summary`);
  }

  async initDatabase() {
    return this.request<{ message: string }>('/init-db', {
      method: 'POST',
    });
  }

  // Internal library
  async createFolder(name: string, parentId?: number | null) {
    return this.request<{ folder: LibraryFolder }>('/library/folders', {
      method: 'POST',
      body: JSON.stringify({ name, parent_id: parentId ?? null }),
    });
  }

  async getFolders() {
    return this.request<{ folders: LibraryFolder[] }>('/library/folders');
  }

  async deleteFolder(folderId: number) {
    return this.request<{ success: boolean }>(`/library/folders/${folderId}`, {
      method: 'DELETE',
    });
  }

  async updateFolder(folderId: number, data: { visibility?: 'all' | 'restricted' }) {
    return this.request<{ folder: LibraryFolder }>(`/library/folders/${folderId}`, {
      method: 'PATCH',
      body: JSON.stringify(data),
    });
  }

  async getFolderAccess(folderId: number) {
    return this.request<{ user_ids: number[] }>(`/library/folders/${folderId}/access`);
  }

  async setFolderAccess(folderId: number, userIds: number[]) {
    return this.request<{ success: boolean; user_ids: number[] }>(`/library/folders/${folderId}/access`, {
      method: 'PUT',
      body: JSON.stringify({ user_ids: userIds }),
    });
  }

  async uploadFolderFile(
    folderId: number,
    formData: FormData,
    options?: { onProgress?: (percent: number) => void }
  ) {
    if (!options?.onProgress) {
      return this.request<{ file: LibraryFile }>(`/library/folders/${folderId}/files`, {
        method: 'POST',
        body: formData,
      });
    }

    return new Promise<{ file: LibraryFile }>((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', `${API_BASE_URL}/library/folders/${folderId}/files`);
      xhr.withCredentials = true;
      if (this.accessToken) {
        xhr.setRequestHeader('Authorization', `Bearer ${this.accessToken}`);
      }

      xhr.upload.onprogress = (event) => {
        if (!event.lengthComputable) return;
        const percent = Math.round((event.loaded / event.total) * 100);
        options.onProgress?.(percent);
      };

      xhr.onload = () => {
        try {
          const payload = JSON.parse(xhr.responseText || '{}');
          if (xhr.status >= 200 && xhr.status < 300) {
            options.onProgress?.(100);
            resolve(payload);
            return;
          }
          reject(new Error(payload.error || 'Upload failed'));
        } catch {
          reject(new Error('Upload failed'));
        }
      };
      xhr.onerror = () => reject(new Error('Network error: failed to upload file'));
      xhr.send(formData);
    });
  }

  async getFolderFiles(folderId: number) {
    return this.request<{ files: LibraryFile[] }>(`/library/folders/${folderId}/files`);
  }

  async renameFolderFile(fileId: number, originalName: string) {
    return this.request<{ file: LibraryFile }>(`/library/files/${fileId}`, {
      method: 'PATCH',
      body: JSON.stringify({ original_name: originalName }),
    });
  }

  async deleteLibraryFile(fileId: number) {
    return this.request<{ success: boolean }>(`/library/files/${fileId}`, {
      method: 'DELETE',
    });
  }

  async getFolderVideoProgress(folderId: number) {
    return this.request<{ progress: VideoProgress[] }>(`/library/folders/${folderId}/progress`);
  }

  async getFileVideoProgress(fileId: number) {
    return this.request<{ progress: VideoProgress }>(`/library/files/${fileId}/progress`);
  }

  async updateFileVideoProgress(
    fileId: number,
    data: {
      watched_seconds: number;
      duration_seconds: number;
      last_position_seconds: number;
      engaged_watch_seconds: number;
    }
  ) {
    return this.request<{ progress: VideoProgress }>(`/library/files/${fileId}/progress`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async getAdminUserVideoProgress(userId: number) {
    return this.request<{ user: any; progress: AdminVideoProgress[] }>(`/admin/users/${userId}/video-progress`);
  }
}

export const apiClient = new ApiClient();
