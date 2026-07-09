// Placeholder module for unresolved Node-specific dependencies in the Cloudflare runtime.
// These imports are in dead-code paths on Cloudflare and will never be executed.
export const createClient = () => {
  throw new Error("Local SQLite is not supported in the Cloudflare runtime.");
};
export const WebSocket = class {};
export default {};
