import express from "express";
import {
    getMaintenanceRecords,
    createMaintenanceRecord,
    updateMaintenanceRecord
} from "../controllers/maintenanceController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/", protect, getMaintenanceRecords);
router.post("/", protect, authorizeRoles("faculty", "admin"), createMaintenanceRecord);
router.patch("/:id", protect, authorizeRoles("faculty", "admin"), updateMaintenanceRecord);

export default router;
