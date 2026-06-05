import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import storyRouter from "../handlers/story.js";
import squareRouter from "../handlers/square.js";
import landscapeRouter from "../handlers/landscape.js";

const router: IRouter = Router();

router.use(healthRouter);
router.use(storyRouter);
router.use(squareRouter);
router.use(landscapeRouter);

export default router;
