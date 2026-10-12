import { create } from 'zustand';
import { AppStorage } from './storage';

const KEY = 'granitemeasure.pending-capture';

export type PendingImage = {
  id: string;
  uri: string;
  fingerprint: string;
  sequence: number;
  status: 'pending' | 'uploading' | 'synced' | 'failed';
  capturedAt: string;
  width?: number;
  height?: number;
  fileSize?: number | null;
  mimeType?: string;
  gps?: { latitude: number; longitude: number; accuracy?: number } | null;
  orientation?: string;
  qualityScore?: number;
  qualityWarnings?: string[];
  idempotencyKey?: string;
  retryCount: number;
  lastError?: string | null;
  lastAttemptAt?: string | null;
};

export type CaptureQueueState =
  | 'DRAFT'
  | 'READY'
  | 'UPLOADING'
  | 'PARTIALLY_UPLOADED'
  | 'UPLOADED'
  | 'PROCESSING'
  | 'COMPLETED'
  | 'FAILED';

export type CaptureDraft = {
  quarryId: string;
  categoryId: string;
  blockCode?: string;
  calibrationType?: string;
  referenceCm: string;
  referencePx: string;
  gps: { latitude: number; longitude: number; accuracy?: number } | null;
  blockId?: string;
  sessionId?: string;
};

type State = {
  images: PendingImage[];
  draft: CaptureDraft | null;
  queueState: CaptureQueueState;
  lastError: string | null;
  activeUploadStage: string | null;
  setImage: (image: PendingImage) => void;
  setImages: (images: PendingImage[]) => void;
  updateImage: (id: string, patch: Partial<PendingImage>) => void;
  removeImage: (id: string) => void;
  setDraft: (draft: CaptureDraft) => void;
  setQueueState: (queueState: CaptureQueueState, lastError?: string | null, stage?: string | null) => void;
  retryFailedImages: () => void;
  clear: () => Promise<void>;
  restore: () => Promise<void>;
  persist: () => Promise<void>;
};

export const useCaptureStore = create<State>((set, get) => ({
  images: [],
  draft: null,
  queueState: 'DRAFT',
  lastError: null,
  activeUploadStage: null,
  setImage: (image) => {
    set((state) => ({
      images: [...state.images, image],
      queueState: 'READY',
      lastError: null,
    }));
    void get().persist();
  },
  setImages: (images) => {
    set({ images, queueState: images.length >= 4 ? 'READY' : 'DRAFT' });
    void get().persist();
  },
  updateImage: (id, patch) => {
    set((state) => ({
      images: state.images.map((image) => (image.id === id ? { ...image, ...patch } : image)),
    }));
    void get().persist();
  },
  removeImage: (id) => {
    set((state) => {
      const remaining = state.images.filter((image) => image.id !== id);
      // Re-index sequences
      const reindexed = remaining.map((img, idx) => ({ ...img, sequence: idx + 1 }));
      return {
        images: reindexed,
        queueState: reindexed.length >= 4 ? 'READY' : reindexed.length > 0 ? 'DRAFT' : 'DRAFT',
      };
    });
    void get().persist();
  },
  setDraft: (draft) => {
    set({ draft });
    void get().persist();
  },
  setQueueState: (queueState, lastError = null, stage = null) => {
    set({ queueState, lastError, activeUploadStage: stage });
    void get().persist();
  },
  retryFailedImages: () => {
    set((state) => ({
      images: state.images.map((img) =>
        img.status === 'failed' ? { ...img, status: 'pending', lastError: null } : img
      ),
      queueState: 'READY',
      lastError: null,
    }));
    void get().persist();
  },
  clear: async () => {
    set({ images: [], draft: null, queueState: 'DRAFT', lastError: null, activeUploadStage: null });
    await AppStorage.removeItem(KEY);
  },
  restore: async () => {
    try {
      const value = await AppStorage.getItem(KEY);
      if (!value) return;
      const saved = JSON.parse(value) as Partial<State>;
      if (Array.isArray(saved.images)) {
        set({
          images: saved.images,
          draft: saved.draft ?? null,
          queueState: saved.queueState ?? (saved.images.length >= 4 ? 'READY' : 'DRAFT'),
          lastError: saved.lastError ?? null,
        });
      }
    } catch {
      await AppStorage.removeItem(KEY);
    }
  },
  persist: async () => {
    try {
      await AppStorage.setItem(
        KEY,
        JSON.stringify({
          images: get().images,
          draft: get().draft,
          queueState: get().queueState,
          lastError: get().lastError,
        })
      );
    } catch {
      // Safe fallback
    }
  },
}));
