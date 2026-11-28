declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    APP_ENV?: string;
    APP_ORIGIN?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
    ADMIN_OWNER_EMAIL?: string;
    WEBAUTHN_RP_ID?: string;
    WEBAUTHN_ORIGIN?: string;
  }
}
