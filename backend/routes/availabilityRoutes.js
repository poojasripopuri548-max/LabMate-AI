
import express from "express";

import {
    checkAvailability
} from "../controllers/availabilityController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Check equipment availability
router.get("/", protect, checkAvailability);

export default router;
