import { del, get, keys, set } from "idb-keyval"
import type { UIMessage } from "ai"
import { prepareHistory } from "./pure"

/** The typed chat's conversation, per profile, in IndexedDB on this device only (never synced: it can be long and it is personal). `prepareHistory` makes what
    is stored safe to resume. Stored under `chat:<profileId>`, like the watch history's `hist:<profileId>`. */
const key = (profileId: string) => `chat:${profileId}`

export const loadChat = async (profileId: string): Promise<UIMessage[]> => {
  const v = await get<UIMessage[]>(key(profileId)).catch(() => undefined)
  return Array.isArray(v) ? prepareHistory(v) : []
}
export const saveChat = (profileId: string, messages: UIMessage[]) => {
  const keep = prepareHistory(messages)
  return (keep.length ? set(key(profileId), keep) : del(key(profileId))).catch(() => {}) // storage full / private mode: the chat still works, it just is not kept
}
export const clearChat = (profileId: string) => del(key(profileId)).catch(() => {})
/** Every profile's saved conversation (Settings > Assistant > Remember conversations turned off). */
export const clearAllChats = async () => {
  const all = await keys().catch(() => [] as IDBValidKey[])
  await Promise.all(all.filter((k) => typeof k === "string" && k.startsWith("chat:")).map((k) => del(k).catch(() => {})))
}
