import { useState } from "react"
import { Award } from "lucide-react"
import { cn } from "@/lib/utils"

/** Detail heading: the TMDB title logo on dark themes (most logos are white), the text title on light themes or when the logo fails. */
export function TitleArt({ title, logo, className, as: H = "h1" }: { title: string; logo?: string; className?: string; as?: "h1" | "h2" }) {
  const [bad, setBad] = useState<string>()
  const show = !!logo && bad !== logo
  return (
    <H dir="auto">
      {show && <img src={logo} alt={title} onError={() => setBad(logo)} className="hidden max-h-[min(8rem,20vh)] max-w-[min(100%,26rem)] object-contain dark:block" />}
      <span className={cn("block", className, show && "dark:hidden")}>{title}</span>
    </H>
  )
}

/** OMDb awards line ("Won 2 Oscars. 40 wins & 90 nominations total"); provider text, so not translated. */
export const Awards = ({ text, className }: { text?: string; className?: string }) =>
  text ? <p dir="auto" className={cn("flex items-center gap-2 text-sm opacity-75", className)}><Award className="size-4 shrink-0" /><span>{text}</span></p> : null
