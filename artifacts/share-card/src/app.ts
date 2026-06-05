import express, { type Express } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// The renderer never reads request bodies; PNG handlers respond on GET only.
// Subtask 12.4 will mount the per-ratio render routes; the bootstrap exposes
// only the health probe so the artifact builds and serves a 200 on
// `/share-card/healthz`.
app.use("/share-card", router);

export default app;
