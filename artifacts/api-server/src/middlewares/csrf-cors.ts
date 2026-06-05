import type { Request, Response, NextFunction } from "express";
import { apiError } from "../lib/errors.js";

/**
 * Same-origin CORS middleware. Rejects any cross-origin requests
 * unless the requested path is the public share-card render endpoint.
 */
export function sameOriginCors(req: Request, res: Response, next: NextFunction) {
  const origin = req.headers.origin;
  if (origin) {
    try {
      const originUrl = new URL(origin);
      const host = req.headers.host;
      
      if (originUrl.host !== host) {
        // Check if it is the public share-card path
        const isShareCardPath = req.method === "GET" && req.path.includes("/share-card.png");
        if (isShareCardPath) {
          res.setHeader("Access-Control-Allow-Origin", "*");
          res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
          return next();
        }
        
        return next(apiError.forbidden("Cross-origin requests are not allowed."));
      }
    } catch {
      return next(apiError.forbidden("Invalid Origin header."));
    }
  }
  next();
}

/**
 * CSRF check middleware. Requires X-PLVL-Client: web custom header
 * on all mutation endpoints (POST/DELETE/PUT).
 */
export function csrfCheck(req: Request, res: Response, next: NextFunction) {
  const isMutation = ["POST", "PUT", "DELETE", "PATCH"].includes(req.method);
  if (isMutation) {
    const clientHeader = req.headers["x-plvl-client"];
    if (clientHeader !== "web") {
      return next(apiError.forbidden("CSRF verification failed: X-PLVL-Client header missing or invalid."));
    }
  }
  next();
}
