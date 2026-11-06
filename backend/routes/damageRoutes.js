import express from "express";
import {
    getDamageReports,
    createDamageReport,
    updateDamageReport
} from "../controllers/damageController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/", protect, createDamageReport);
router.get("/", protect, getDamageReports);
router.patch("/:id", protect, authorizeRoles("faculty", "admin"), updateDamageReport);

export default router;
