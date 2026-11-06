import express from "express";

import {
    createEquipment,
    bulkImportEquipment,
    getAllEquipment,
    getEquipmentById,
    updateEquipment,
    deleteEquipment
} from "../controllers/equipmentController.js";

import {
    protect,
    authorizeRoles
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Logged-in users can view equipment
router.get("/", protect, getAllEquipment);
router.get("/:id", protect, getEquipmentById);

// Faculty and admin can manage equipment
router.post(
    "/",
    protect,
    authorizeRoles("faculty", "admin"),
    createEquipment
);

// Bulk import (must be before /:id routes)
router.post(
    "/bulk",
    protect,
    authorizeRoles("admin"),
    bulkImportEquipment
);

router.put(
    "/:id",
    protect,
    authorizeRoles("faculty", "admin"),
    updateEquipment
);

router.delete(
    "/:id",
    protect,
    authorizeRoles("faculty", "admin"),
    deleteEquipment
);

export default router;