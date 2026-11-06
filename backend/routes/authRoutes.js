import express from "express";

import {
    registerUser,
    loginUser,
    logoutUser
} from "../controllers/authController.js";

import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

// Public auth routes
router.post("/register", registerUser);
router.post("/login", loginUser);

// Authenticated logout (records activity)
router.post("/logout", protect, logoutUser);

export default router;
