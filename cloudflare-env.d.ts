declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    /** `sites` trusts identity headers injected by Sites dispatch; anything else ignores them. */
    LUB_AUTH_MODE?: string;
    /** Server secret required to create the first owner and to recover owner access outside Sites. */
    LUB_SETUP_TOKEN?: string;
  }
}
