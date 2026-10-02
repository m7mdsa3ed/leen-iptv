import type { useSync } from "@/lib/sync"
import type { Probe } from "./probe"

export type Status = "ok" | "warn" | "fail" | "skip"
export type GroupId = "device" | "playback" | "network" | "sources" | "streams" | "services"
export const GROUPS: GroupId[] = ["device", "playback", "network", "sources", "streams", "services"]
export type Result = { status: Status; detail: string; hint?: string; ms?: number }
/** `sub` = sub-heading inside a group (the source name); `lock` = checks sharing a lock run one at a time (provider connection limits). */
export type Check = { id: string; group: GroupId; title: string; sub?: string; lock?: string; slow?: boolean; run: () => Promise<Result> }
export type Env = {
  sync: () => ReturnType<typeof useSync>
  /** direct (browser) + through-proxy probe of one URL, shared by every check in this run */
  dual: (url: string, init?: RequestInit) => Promise<{ d: Probe; p?: Probe }>
}
export const res = (status: Status, detail: string, hint?: string, ms?: number): Result => ({ status, detail, hint, ms })
