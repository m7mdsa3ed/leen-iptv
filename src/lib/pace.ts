/** Run `work` over many items without hammering a server: batches (3 at a time), a pause between batches, and a growing wait (15s, 30s, 60s) when some fail;
    gives up after 3 failed waits in a row, when offline, or when `stop.current` is set. Returns how many items finished. */
const nap = async (ms: number, stop: { current: boolean }) => { for (let w = 0; w < ms && !stop.current; w += 250) await new Promise((r) => setTimeout(r, 250)) }

export async function paced<T>(items: T[], work: (x: T) => Promise<void>, o: { stop: { current: boolean }; onState: (done: number, waiting: boolean) => void; onBatch?: () => void; size?: number; pause?: number }): Promise<number> {
  const queue = [...items]
  let done = 0, strikes = 0
  o.onState(0, false)
  while (queue.length && !o.stop.current && navigator.onLine) {
    const batch = queue.splice(0, o.size ?? 15)
    const failed: T[] = []
    let n = 0
    await Promise.all([0, 1, 2].map(async () => {
      while (n < batch.length && !o.stop.current) {
        const x = batch[n++]
        try { await work(x); done++ } catch { failed.push(x) }
        o.onState(done, false)
      }
    }))
    o.onBatch?.()
    if (failed.length) {
      if (++strikes > 3) break
      queue.unshift(...failed)
      o.onState(done, true)
      await nap(15000 * 2 ** (strikes - 1), o.stop)
      o.onState(done, false)
    } else {
      strikes = 0
      if (queue.length) await nap(o.pause ?? 2000, o.stop)
    }
  }
  return done
}
