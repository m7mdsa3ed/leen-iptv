import { useMemo } from "react"
import { encode } from "uqr"
import { cn } from "@/lib/utils"

/** QR code for `value`: black modules on a white card (scanners need that contrast in both themes), one <path> so it is cheap to draw. */
export function QrCode({ value, label, className }: { value: string; label: string; className?: string }) {
  const { size, d } = useMemo(() => {
    const { data, size } = encode(value, { ecc: "M", border: 0 })
    let d = ""
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) if (data[y][x]) d += `M${x} ${y}h1v1h-1z`
    return { size, d }
  }, [value])
  const q = 3 // quiet zone, in modules
  return (
    <div dir="ltr" className={cn("rounded-2xl bg-white p-1 shadow-sm", className)}>
      <svg role="img" aria-label={label} viewBox={`${-q} ${-q} ${size + 2 * q} ${size + 2 * q}`} shapeRendering="crispEdges" className="block size-full">
        <path d={d} fill="#000" />
      </svg>
    </div>
  )
}
