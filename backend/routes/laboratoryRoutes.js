import express from "express";

import {
    createLaboratory,
    getLaboratories,
    getLaboratoryById,
    updateLaboratory,
    deleteLaboratory
} from "../controllers/laboratoryController.js";

import {
    protect,
    authorizeRoles
} from "../middleware/authMiddleware.js";

console.log("LABORATORY ROUTES LOADED");

const router = express.Router();

router.get("/", protect, getLaboratories);
router.get("/:id", protect, getLaboratoryById);

router.post(
    "/",
    protect,
    authorizeRoles("faculty", "admin"),
    createLaboratory
);

router.put(
    "/:id",
    protect,
    authorizeRoles("faculty", "admin"),
    updateLaboratory
);

router.delete(
    "/:id",
    protect,
    authorizeRoles("faculty", "admin"),
    deleteLaboratory
);

export default router;