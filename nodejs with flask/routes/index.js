import express from "express";
import youtubeRoutes from "./youtube.js"; // ✅ FIXED (was likely missing ./)

const router = express.Router();

router.use("/youtube", youtubeRoutes);

export default router;
