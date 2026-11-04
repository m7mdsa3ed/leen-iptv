// Chromium 94 (webOS 23) lacks structuredClone (98) and Array/TypedArray findLast / findLastIndex (97), which the AI SDK's chat code calls.
// Installed only when missing, and only when the lazy AI bundle loads (sdk.ts imports this first), so the startup bundle and newer browsers are untouched.
type G = Record<string, unknown>

function clone(v: unknown, seen = new Map<object, unknown>()): unknown {
  if (typeof v !== "object" || v === null) return v
  if (seen.has(v)) return seen.get(v)
  if (v instanceof Date) return new Date(v.getTime())
  if (v instanceof Map) { const m = new Map(); seen.set(v, m); v.forEach((x, k) => m.set(clone(k, seen), clone(x, seen))); return m }
  if (v instanceof Set) { const s = new Set(); seen.set(v, s); v.forEach((x) => s.add(clone(x, seen))); return s }
  if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return (v as unknown as { slice: () => unknown }).slice()
  if (Array.isArray(v)) { const a: unknown[] = []; seen.set(v, a); v.forEach((x, i) => { a[i] = clone(x, seen) }); return a }
  const o: Record<string, unknown> = {}
  seen.set(v, o)
  for (const k of Object.keys(v)) o[k] = clone((v as Record<string, unknown>)[k], seen)
  return o
}

function lastIndex(this: ArrayLike<unknown>, f: (x: unknown, i: number, a: ArrayLike<unknown>) => unknown, thisArg?: unknown): number {
  for (let i = this.length - 1; i >= 0; i--) if (f.call(thisArg, this[i], i, this)) return i
  return -1
}
function last(this: ArrayLike<unknown>, f: (x: unknown, i: number, a: ArrayLike<unknown>) => unknown, thisArg?: unknown): unknown {
  const i = lastIndex.call(this, f, thisArg)
  return i < 0 ? undefined : this[i]
}

export function installPolyfills(g: G, array: object): void {
  if (typeof g.structuredClone !== "function") g.structuredClone = (v: unknown) => clone(v)
  const def = (name: string, fn: unknown) => { if (!(name in array)) Object.defineProperty(array, name, { value: fn, writable: true, configurable: true }) }
  def("findLast", last)
  def("findLastIndex", lastIndex)
}

installPolyfills(globalThis as unknown as G, Array.prototype)
