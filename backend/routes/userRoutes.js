import express from "express";

import User from "../models/User.js";

import {
    protect,
    authorizeRoles
} from "../middleware/authMiddleware.js";

const router = express.Router();

// Admin: list all users
router.get(
    "/",
    protect,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const users = await User.find()
                .select("name email role isActive createdAt")
                .sort({ createdAt: -1 });
            return res.status(200).json({ success: true, count: users.length, users });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to fetch users" });
        }
    }
);

// Admin: create a user account with a chosen role
router.post(
    "/",
    protect,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const bcrypt = (await import("bcryptjs")).default;
            const { name, email, password, role = "student", facultyId, department, designation } = req.body;

            if (!name || !email || !password) {
                return res.status(400).json({ success: false, message: "Name, email and password are required" });
            }
            if (!["student", "faculty", "admin"].includes(role)) {
                return res.status(400).json({ success: false, message: "Invalid role" });
            }
            if (password.length < 8) {
                return res.status(400).json({ success: false, message: "Password must be at least 8 characters" });
            }
            const exists = await User.findOne({ email: email.toLowerCase() });
            if (exists) {
                return res.status(409).json({ success: false, message: "Email already registered" });
            }
            const passwordHash = await bcrypt.hash(password, 12);
            const user = await User.create({
                name, email, passwordHash, role,
                facultyId: facultyId || "",
                department: department || "",
                designation: designation || ""
            });
            return res.status(201).json({
                success: true,
                message: "User created",
                user: { id: user._id, name: user.name, email: user.email, role: user.role }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to create user" });
        }
    }
);

// Admin: update user role / active status / name
router.patch(
    "/:id",
    protect,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const target = await User.findById(req.params.id);
            if (!target) return res.status(404).json({ success: false, message: "User not found" });

            const { name, role, isActive, facultyId, department, designation } = req.body;
            if (role && !["student", "faculty", "admin"].includes(role)) {
                return res.status(400).json({ success: false, message: "Invalid role" });
            }
            if (name) target.name = name.trim();
            if (role) target.role = role;
            if (typeof isActive === "boolean") target.isActive = isActive;
            if (facultyId !== undefined) target.facultyId = facultyId;
            if (department !== undefined) target.department = department;
            if (designation !== undefined) target.designation = designation;
            await target.save();

            return res.status(200).json({
                success: true,
                message: "User updated",
                user: { id: target._id, name: target.name, email: target.email, role: target.role, isActive: target.isActive }
            });
        } catch (error) {
            return res.status(500).json({ success: false, message: "Failed to update user" });
        }
    }
);

// Get logged-in user profile
router.get("/profile", protect, (req, res) => {
    res.status(200).json({
        success: true,
        message: "Profile fetched successfully",
        user: {
            id: req.user._id,
            name: req.user.name,
            email: req.user.email,
            role: req.user.role
        }
    });
});

// Student-only route
router.get(
    "/student",
    protect,
    authorizeRoles("student"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Student"
        });
    }
);

// Faculty-only route
router.get(
    "/faculty",
    protect,
    authorizeRoles("faculty"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Faculty"
        });
    }
);

// Admin-only: user login/logout activity summary
router.get(
    "/activity",
    protect,
    authorizeRoles("admin"),
    async (req, res) => {
        try {
            const users = await User.find()
                .select("name email role activityLog createdAt")
                .sort({ createdAt: 1 });

            const activity = users.map((u) => {
                const log = u.activityLog || [];
                const logins = log.filter((e) => e.type === "login");
                const logouts = log.filter((e) => e.type === "logout");
                const lastEvent = log.length ? log[log.length - 1].at : null;
                return {
                    id: u._id,
                    name: u.name,
                    email: u.email,
                    role: u.role,
                    createdAt: u.createdAt,
                    loginCount: logins.length,
                    logoutCount: logouts.length,
                    lastLoginAt: logins.length ? logins[logins.length - 1].at : null,
                    lastActivityAt: lastEvent,
                    recentActivity: log.slice(-8).reverse()
                };
            }).sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0));

            return res.status(200).json({
                success: true,
                count: activity.length,
                users: activity
            });
        } catch (error) {
            return res.status(500).json({
                success: false,
                message: "Failed to fetch activity"
            });
        }
    }
);

// Admin-only route
router.get(
    "/admin",
    protect,
    authorizeRoles("admin"),
    (req, res) => {
        res.json({
            success: true,
            message: "Welcome Admin"
        });
    }
);

export default router;