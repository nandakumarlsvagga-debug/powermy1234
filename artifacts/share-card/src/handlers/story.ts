import { Router } from "express";
import { renderCard } from "../lib/render-card.js";

const router = Router();

router.get("/:scanId/story.png", async (req, res, next) => {
  try {
    const scanId = req.params.scanId;
    const baseUrl = `${req.protocol}://${req.get("host")}`;

    const result = await renderCard(scanId, "story", baseUrl);
    if (!result) {
      res.status(404).json({ code: "NOT_FOUND", message: "Scan not found" });
      return;
    }

    res.setHeader("Content-Type", "image/png");
    res.setHeader("Cache-Control", "public, max-age=86400, s-maxage=86400, immutable");
    res.setHeader("ETag", `"${result.etag}"`);
    res.send(result.pngBuffer);
  } catch (err) {
    res.status(503).json({
      code: "SERVICE_UNAVAILABLE",
      message: "Share card temporarily unavailable",
    });
  }
});

export default router;
