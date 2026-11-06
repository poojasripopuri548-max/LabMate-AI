import express from "express";
import { assistantChat } from "../controllers/assistantController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.post("/chat", protect, assistantChat);

export default router;
