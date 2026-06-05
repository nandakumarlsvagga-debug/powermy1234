/**
 * Vercel serverless entry point for the share-card renderer.
 *
 * Vercel @vercel/node expects a default export of a Node.js request handler.
 * We export the Express `app` directly so Vercel can wrap it in a serverless function.
 * When running locally (PORT set), we also start the HTTP server for dev convenience.
 */
import app from "./app.js";
import { logger } from "./lib/logger.js";

// Local dev mode — start the HTTP server only when PORT is explicitly set
if (process.env["PORT"]) {
  const port = Number(process.env["PORT"]);
  if (!Number.isNaN(port) && port > 0) {
    app.listen(port, () => {
      logger.info({ port }, "Share Card Renderer listening (local dev)");
    });
  }
}

// Default export consumed by Vercel @vercel/node
export default app;
