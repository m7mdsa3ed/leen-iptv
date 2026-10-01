import { Component, type ReactNode } from "react"
import { TvButton } from "./ui"
import { useRoute } from "@/lib/nav"

/** A crashing page shows a message instead of a black screen; Back still works. */
export class Boundary extends Component<{ children: ReactNode }, { err: Error | null }> {
  state = { err: null as Error | null }
  static getDerivedStateFromError(err: Error) { return { err } }
  render() {
    if (!this.state.err) return this.props.children
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 bg-background p-8 text-center">
        <div className="text-2xl font-semibold">Something went wrong</div>
        <div className="max-w-xl text-muted-foreground">{this.state.err.message}</div>
        <div className="flex gap-3">
          <TvButton data-autofocus="" onClick={() => (this.setState({ err: null }), useRoute.getState().back())}>Go back</TvButton>
          <TvButton variant="secondary" onClick={() => location.reload()}>Reload app</TvButton>
        </div>
      </div>
    )
  }
}
