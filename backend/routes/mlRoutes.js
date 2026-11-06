import express from "express";
import {
    getRecommendations,
    getUsageAnalysis,
    getMaintenanceAnalysis
} from "../controllers/mlController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/recommendations", protect, getRecommendations);

router.get("/usage-analysis", protect, getUsageAnalysis);

router.get("/maintenance-analysis", protect, getMaintenanceAnalysis);

export default router;