import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import anonSessionRouter from "./anon-session.js";
import scansRouter from "./scans.js";
import likesRouter from "./likes.js";
import feedRouter from "./feed.js";
import leaderboardsRouter from "./leaderboards.js";
import profilesRouter from "./profiles.js";
import meRouter from "./me.js";
import internalJobsRouter from "./internal-jobs.js";
import { sameOriginCors, csrfCheck } from "../middlewares/csrf-cors.js";

const router: IRouter = Router();

// Apply same-origin CORS and CSRF check middleware globally for the /api routes
router.use(sameOriginCors);
router.use(csrfCheck);

router.use(healthRouter);
router.use(anonSessionRouter);
router.use(scansRouter);
router.use(likesRouter);
router.use(feedRouter);
router.use(leaderboardsRouter);
router.use(profilesRouter);
router.use(meRouter);
// Internal job routes — authenticated by INTERNAL_JOB_SECRET, not the CSRF check
router.use(internalJobsRouter);

export default router;

