import { create } from 'zustand';
import type { MemoryMode } from '../types/database';

interface DraftState {
  content: string;
  mood: number | null;
  memoryMode: MemoryMode;
  promptUsed: string | null;
  setContent: (content: string) => void;
  setMood: (mood: number | null) => void;
  setMemoryMode: (mode: MemoryMode) => void;
  setPromptUsed: (prompt: string | null) => void;
  clear: () => void;
}

const DEFAULT_MODE: MemoryMode = 'remember';

export const useDraftStore = create<DraftState>((set) => ({
  content: '',
  mood: null,
  memoryMode: DEFAULT_MODE,
  promptUsed: null,
  setContent: (content) => set({ content }),
  setMood: (mood) => set({ mood }),
  setMemoryMode: (memoryMode) => set({ memoryMode }),
  setPromptUsed: (promptUsed) => set({ promptUsed }),
  clear: () => set({ content: '', mood: null, memoryMode: DEFAULT_MODE, promptUsed: null }),
}));
