import express from "express";

import {
    createBooking,
    getAllBookings,
    getMyBookings,
    reviewBooking,
    cancelBooking,
    issueBooking,
    requestReturn,
    confirmReturn
} from "../controllers/bookingController.js";

import {
    protect,
    authorizeRoles
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Student, faculty and admin can request equipment
router.post("/", protect, createBooking);

// Users can view their own bookings
router.get("/my-bookings", protect, getMyBookings);

// Faculty and admin can view all bookings
router.get(
    "/",
    protect,
    authorizeRoles("faculty", "admin"),
    getAllBookings
);

// Faculty and admin can approve or reject bookings
router.patch(
    "/:id/review",
    protect,
    authorizeRoles("faculty", "admin"),
    reviewBooking
);

// Staff issue approved equipment to the student
router.patch(
    "/:id/issue",
    protect,
    authorizeRoles("faculty", "admin"),
    issueBooking
);

// Student requests return of issued equipment
router.patch("/:id/request-return", protect, requestReturn);

// Staff confirms physical return and updates condition
router.patch(
    "/:id/confirm-return",
    protect,
    authorizeRoles("faculty", "admin"),
    confirmReturn
);

// Users can cancel their own pending bookings
router.patch("/:id/cancel", protect, cancelBooking);

export default router;
