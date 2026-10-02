/// <reference types="vite/client" />
interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Where the web app is hosted (https), used in the QR code that lets a phone sign a TV in. */
  readonly VITE_PUBLIC_APP_URL?: string
}
