/// <reference types="astro/client" />

interface ImportMetaEnv {
  readonly RESEND_API_KEY: string;
  readonly RESEND_EMAIL_FROM: string;
  readonly RESEND_EMAIL_TO: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
