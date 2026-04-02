import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '../ui/dialog';
import type { LibraryFile, VideoProgress } from '../../types';

function normalizeCompleted(value: number | boolean | undefined) {
  return Number(value) === 1 || value === true;
}

type TrackProgressProps = {
  trackProgress: true;
  file: LibraryFile;
  progressMap: Record<number, VideoProgress>;
  setProgressMap: React.Dispatch<React.SetStateAction<Record<number, VideoProgress>>>;
  saveVideoProgress: (
    fileId: number,
    watchedSeconds: number,
    durationSeconds: number,
    lastPositionSeconds: number
  ) => Promise<void>;
  userId: number;
};

type NoTrackProps = {
  trackProgress?: false;
  file?: LibraryFile | null;
  progressMap?: undefined;
  setProgressMap?: undefined;
  saveVideoProgress?: undefined;
  userId?: undefined;
};

export type SecureLibraryVideoDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  streamUrl: string;
  viewerLabel: string;
} & (TrackProgressProps | NoTrackProps);

/**
 * In-app video playback: streamed URL (no blob download), watermark, blur on focus loss / PrtScr guard.
 * Optional watch progress for employees.
 */
export function SecureLibraryVideoDialog(props: SecureLibraryVideoDialogProps) {
  const {
    open,
    onOpenChange,
    title,
    streamUrl,
    viewerLabel,
    trackProgress = false,
    file = null,
    progressMap = {},
    setProgressMap,
    saveVideoProgress,
    userId = 0,
  } = props as SecureLibraryVideoDialogProps & Partial<TrackProgressProps>;

  const [watermarkTime, setWatermarkTime] = useState(() => new Date().toLocaleString());
  const [playbackObscured, setPlaybackObscured] = useState(false);
  const [screenshotGuardUntil, setScreenshotGuardUntil] = useState<number | null>(null);
  const screenshotGuardUntilRef = useRef(0);
  const lastPrintScreenArmAtRef = useRef(0);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const lastSyncedSecondsRef = useRef(0);
  const progressSessionFileIdRef = useRef<number | null>(null);

  const canClearObscured = () => {
    const t = screenshotGuardUntilRef.current;
    return !(t > 0 && Date.now() < t);
  };

  const doSaveProgress = useCallback(
    async (fileId: number, watchedSeconds: number, durationSeconds: number, lastPositionSeconds: number) => {
      if (!trackProgress || !saveVideoProgress) return;
      try {
        await saveVideoProgress(fileId, watchedSeconds, durationSeconds, lastPositionSeconds);
        lastSyncedSecondsRef.current = Math.max(lastSyncedSecondsRef.current, watchedSeconds);
      } catch {
        /* ignore */
      }
    },
    [trackProgress, saveVideoProgress]
  );

  useEffect(() => {
    if (!open || !trackProgress || !file) {
      progressSessionFileIdRef.current = null;
      return;
    }
    if (progressSessionFileIdRef.current !== file.id) {
      progressSessionFileIdRef.current = file.id;
      lastSyncedSecondsRef.current = Number(progressMap[file.id]?.watched_seconds || 0);
    }
  }, [open, file, trackProgress, progressMap]);

  useEffect(() => {
    if (!open) return undefined;
    const id = window.setInterval(() => {
      setWatermarkTime(new Date().toLocaleString());
    }, 1000);
    return () => window.clearInterval(id);
  }, [open]);

  useEffect(() => {
    if (!screenshotGuardUntil) return undefined;
    const ms = screenshotGuardUntil - Date.now();
    if (ms <= 0) {
      screenshotGuardUntilRef.current = 0;
      setScreenshotGuardUntil(null);
      return undefined;
    }
    const tid = window.setTimeout(() => {
      screenshotGuardUntilRef.current = 0;
      setScreenshotGuardUntil(null);
    }, ms);
    return () => window.clearTimeout(tid);
  }, [screenshotGuardUntil]);

  useEffect(() => {
    if (!open) {
      setPlaybackObscured(false);
      screenshotGuardUntilRef.current = 0;
      setScreenshotGuardUntil(null);
      return undefined;
    }
    const syncFromDoc = () => {
      if (!canClearObscured()) {
        setPlaybackObscured(true);
        return;
      }
      const hidden = document.visibilityState !== 'visible';
      const noFocus = typeof document.hasFocus === 'function' && !document.hasFocus();
      setPlaybackObscured(hidden || noFocus);
    };
    const onWinBlur = () => setPlaybackObscured(true);
    const onWinFocus = () => {
      if (!canClearObscured()) return;
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        setPlaybackObscured(false);
      }
    };
    const onVis = () => {
      if (document.visibilityState !== 'visible') {
        setPlaybackObscured(true);
      } else if (document.hasFocus() && canClearObscured()) {
        setPlaybackObscured(false);
      }
    };
    const onDocMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget == null) setPlaybackObscured(true);
    };
    const onDocMouseOver = () => {
      if (!canClearObscured()) return;
      if (document.visibilityState === 'visible' && document.hasFocus()) {
        setPlaybackObscured(false);
      }
    };
    window.addEventListener('blur', onWinBlur);
    window.addEventListener('focus', onWinFocus);
    document.addEventListener('visibilitychange', onVis);
    document.documentElement.addEventListener('mouseout', onDocMouseOut);
    document.documentElement.addEventListener('mouseover', onDocMouseOver);
    syncFromDoc();
    return () => {
      window.removeEventListener('blur', onWinBlur);
      window.removeEventListener('focus', onWinFocus);
      document.removeEventListener('visibilitychange', onVis);
      document.documentElement.removeEventListener('mouseout', onDocMouseOut);
      document.documentElement.removeEventListener('mouseover', onDocMouseOver);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    const GUARD_MS = 14_000;
    const arm = () => {
      if (Date.now() - lastPrintScreenArmAtRef.current < 400) return;
      lastPrintScreenArmAtRef.current = Date.now();
      const until = Date.now() + GUARD_MS;
      screenshotGuardUntilRef.current = until;
      setScreenshotGuardUntil(until);
      setPlaybackObscured(true);
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          videoRef.current?.pause();
        });
      });
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'PrintScreen' && e.code !== 'PrintScreen') return;
      arm();
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('keyup', onKey, true);
    return () => {
      window.removeEventListener('keydown', onKey, true);
      window.removeEventListener('keyup', onKey, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open || !playbackObscured) return;
    if (videoRef.current) videoRef.current.pause();
  }, [open, playbackObscured]);

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      if (trackProgress && file && videoRef.current) {
        const watchedSeconds = Math.max(videoRef.current.currentTime || 0, lastSyncedSecondsRef.current);
        const durationSeconds = Number(videoRef.current.duration || 0);
        void doSaveProgress(file.id, watchedSeconds, durationSeconds, videoRef.current.currentTime || 0);
      }
      lastSyncedSecondsRef.current = 0;
    }
    onOpenChange(next);
  };

  const currentFile = trackProgress ? file : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-4xl p-0 overflow-hidden">
        <div
          className="relative bg-black"
          onMouseEnter={() => {
            const t = screenshotGuardUntilRef.current;
            if (t > 0 && Date.now() < t) return;
            if (document.visibilityState === 'visible' && document.hasFocus()) {
              setPlaybackObscured(false);
            }
          }}
          onMouseLeave={() => setPlaybackObscured(true)}
        >
          <DialogHeader className="p-4">
            <DialogTitle className="text-white text-sm">{title}</DialogTitle>
            <DialogDescription className="sr-only">Internal video playback</DialogDescription>
          </DialogHeader>
          <div className="px-4 pb-4">
            <div className="pointer-events-none absolute right-8 top-20 z-10 rounded bg-black/45 px-3 py-1 text-[11px] text-white">
              {viewerLabel} · {watermarkTime}
            </div>
            <div className="relative w-full overflow-hidden rounded-lg">
              <video
                ref={videoRef}
                src={streamUrl}
                controls
                autoPlay
                controlsList="nodownload noremoteplayback"
                disablePictureInPicture
                className={`w-full max-h-[70vh] rounded-lg bg-black transition-[filter,transform] duration-200 ${
                  playbackObscured ? 'scale-[1.02] blur-3xl' : ''
                }`}
                onContextMenu={(e) => e.preventDefault()}
                onLoadedMetadata={(e) => {
                  if (!trackProgress || !currentFile) return;
                  const progress = progressMap[currentFile.id];
                  const resumeAt = Number(progress?.last_position_seconds || 0);
                  const duration = Number(e.currentTarget.duration || 0);
                  if (resumeAt > 0 && duration > 0 && !normalizeCompleted(progress?.completed)) {
                    e.currentTarget.currentTime = Math.min(resumeAt, Math.max(duration - 1, 0));
                  }
                }}
                onTimeUpdate={(e) => {
                  if (!trackProgress || !currentFile || !setProgressMap) return;
                  const duration = Number(e.currentTarget.duration || 0);
                  if (!Number.isFinite(duration) || duration <= 0) return;
                  const currentTime = Number(e.currentTarget.currentTime || 0);
                  const watchedSeconds = Math.max(currentTime, lastSyncedSecondsRef.current);
                  const shouldFlush =
                    watchedSeconds - lastSyncedSecondsRef.current >= 5 || watchedSeconds >= duration;
                  if (shouldFlush) {
                    void doSaveProgress(currentFile.id, watchedSeconds, duration, currentTime);
                  }
                  setProgressMap((prev) => {
                    const existing = prev[currentFile.id];
                    const nextPercent = Math.min(
                      100,
                      Math.max(Number(existing?.max_percent || 0), (watchedSeconds / duration) * 100)
                    );
                    return {
                      ...prev,
                      [currentFile.id]: {
                        user_id: userId,
                        file_id: currentFile.id,
                        watched_seconds: watchedSeconds,
                        duration_seconds: duration,
                        max_percent: nextPercent,
                        completed: nextPercent >= 100,
                        completed_at:
                          nextPercent >= 100
                            ? existing?.completed_at || new Date().toISOString()
                            : existing?.completed_at || null,
                        last_position_seconds: currentTime,
                        updated_at: existing?.updated_at || null,
                      },
                    };
                  });
                }}
                onEnded={(e) => {
                  if (!trackProgress || !currentFile) return;
                  const duration = Number(e.currentTarget.duration || 0);
                  void doSaveProgress(currentFile.id, duration, duration, duration);
                }}
              />
              {playbackObscured && (
                <div
                  className="absolute inset-0 z-20 flex flex-col items-center justify-center gap-2 rounded-lg bg-black/55 px-4 text-center backdrop-blur-md"
                  aria-live="polite"
                >
                  <p className="text-sm font-medium text-white">Playback hidden</p>
                  <p className="max-w-sm text-xs text-white/85">
                    {screenshotGuardUntil != null && Date.now() < screenshotGuardUntil
                      ? 'Screenshot key detected — blur stays on for a few seconds so the capture step cannot show a clear frame.'
                      : 'Focus this tab, keep the pointer inside the player window, and move the cursor back into the browser to continue.'}
                  </p>
                </div>
              )}
            </div>
            <p className="mt-2 text-xs text-gray-300">
              Playback uses a streamed URL (no direct file download in this viewer). Print Screen triggers an extended
              blur. OS-level capture cannot be fully blocked; the watermark applies when the video is visible.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
