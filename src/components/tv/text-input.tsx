import { useState, type ComponentProps } from "react"
import { flushSync } from "react-dom"
import { Input } from "@/components/ui/input"
import { KEY } from "@/lib/nav"

/**
 * The app's text field (the shadcn Input underneath): read-only until activated, so the D-pad / arrow keys pass over it like any control.
 * A click / tap or OK (Enter) starts editing (TV: that OK also opens the on-screen keyboard); leaving the field or Back / Esc ends it.
 * `autoEdit` = editable from the start (a box opened only to type in, e.g. the search palette). `unstyled` = no shadcn look, the caller styles it.
 */
export function TextInput({ autoEdit, readOnly, onPointerDown, onKeyDown, onBlur, ...p }: ComponentProps<typeof Input> & { autoEdit?: boolean }) {
  const [editing, setEditing] = useState(!!autoEdit)
  // synchronous: the click / key that starts editing must already find an editable field (phones open their keyboard on that focus, nav.ts opens the TV one)
  const start = () => { if (!editing && !readOnly) flushSync(() => setEditing(true)) }
  return (
    <Input
      {...p}
      readOnly={readOnly || !editing}
      data-editing={editing ? "" : undefined}
      onPointerDown={(e) => { start(); onPointerDown?.(e) }}
      onKeyDown={(e) => {
        // the OK that starts editing never submits; the on-screen keyboard's own Enter (untrusted) still reaches onKeyDown and submits
        if (!editing && e.key === "Enter" && e.nativeEvent.isTrusted && !readOnly) { e.preventDefault(); start(); return }
        // the first Back / Esc only stops editing; the next one is Back as usual
        if (editing && (e.key === "Escape" || e.keyCode === KEY.back)) { e.preventDefault(); e.stopPropagation(); setEditing(false); return }
        onKeyDown?.(e)
      }}
      onBlur={(e) => { setEditing(false); onBlur?.(e) }}
    />
  )
}
