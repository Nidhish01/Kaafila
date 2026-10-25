declare namespace Cloudflare {
  interface Env {
    DISPATCH_API_URL?: string;
    DISPATCH_GATEWAY_SECRET?: string;
    DISPATCH_MANAGER_IDS?: string;
    DB?: D1Database;
    BUCKET?: R2Bucket;
  }
}
