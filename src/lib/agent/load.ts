import * as React from "react"
import * as jsx from "react/jsx-runtime"
import { load } from "@/lib/engines"
import aiUrl from "../../../node_modules/.cache/leen-ai/ai-sdk.js?url"
import type * as Sdk from "./sdk"

/** The AI SDK pieces the voice assistant uses, loaded on its first use (the bundle is built by vite.config.ts `aiBundle`). */
export type AiSdk = typeof Sdk

let ready: Promise<AiSdk> | undefined
export const loadAi = (): Promise<AiSdk> => (ready ??= (() => {
  Object.assign(window, { __leenReact: React, __leenJsx: jsx }) // the bundle's React imports (it ships none of its own: one React runs the hooks)
  return load(aiUrl).then(() => (window as unknown as { LeenAI: AiSdk }).LeenAI)
})().catch((e) => { ready = undefined; throw e })) // a later open retries
