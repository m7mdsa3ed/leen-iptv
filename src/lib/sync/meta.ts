// Persisted change-tracking for sync: per-entity timestamps + tombstones, found by diffing the app store (see merge.ts stamp()).
import { create } from "zustand"
import { persist } from "zustand/middleware"
import type { Stamp } from "./merge"

export const useSyncMeta = create<{ e: Record<string, Stamp>; init: boolean; lastSyncAt: number; uid: string | null }>()(
  persist(() => ({ e: {} as Record<string, Stamp>, init: false as boolean, lastSyncAt: 0, uid: null as string | null }), { name: "leen-sync-meta", version: 1 }),
)
