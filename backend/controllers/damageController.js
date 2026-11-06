import DamageReport from "../models/DamageReport.js";
import MaintenanceRecord from "../models/MaintenanceRecord.js";
import Equipment from "../models/Equipment.js";
import { notify } from "../models/Notification.js";
import mongoose from "mongoose";

// Student/staff reports a problem with equipment
export const createDamageReport = async (req, res) => {
    try {
        const { equipment, booking, description, priority = "medium" } = req.body;

        if (!equipment || !mongoose.Types.ObjectId.isValid(equipment)) {
            return res.status(400).json({ success: false, message: "Valid equipment ID required" });
        }
        if (typeof description !== "string" || description.trim().length < 5) {
            return res.status(400).json({ success: false, message: "Describe the problem (min 5 characters)" });
        }
        const eq = await Equipment.findById(equipment);
        if (!eq) return res.status(404).json({ success: false, message: "Equipment not found" });

        const report = await DamageReport.create({
            equipment,
            booking: booking && mongoose.Types.ObjectId.isValid(booking) ? booking : null,
            reportedBy: req.user._id,
            description: description.trim(),
            priority: ["low", "medium", "high"].includes(priority) ? priority : "medium"
        });

        // Auto-create a maintenance record so it enters the maintenance queue
        await MaintenanceRecord.create({
            equipment,
            damageReport: report._id,
            title: `Damage report: ${eq.name}`,
            description: report.description,
            priority: report.priority,
            status: "reported",
            reportedBy: req.user._id
        });

        await notify(req.user._id, "damage_reported", `Damage report submitted for ${eq.name}.`, "/maintenance");

        return res.status(201).json({ success: true, message: "Damage report submitted", report });
    } catch (error) {
        console.error("Damage report error:", error);
        return res.status(500).json({ success: false, message: "Failed to submit damage report" });
    }
};

// List reports — students see own; faculty/admin see all
export const getDamageReports = async (req, res) => {
    try {
        const filter = req.user.role === "student" ? { reportedBy: req.user._id } : {};
        if (req.query.status) filter.status = req.query.status;
        const reports = await DamageReport.find(filter)
            .populate("equipment", "name category laboratory")
            .populate("reportedBy", "name email role")
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, count: reports.length, reports });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch damage reports" });
    }
};

// Faculty/admin update report status/priority
export const updateDamageReport = async (req, res) => {
    try {
        const { status, priority, notes } = req.body;
        const report = await DamageReport.findById(req.params.id);
        if (!report) return res.status(404).json({ success: false, message: "Report not found" });

        if (status && !["reported", "pending", "under_maintenance", "repaired", "closed"].includes(status)) {
            return res.status(400).json({ success: false, message: "Invalid status" });
        }
        if (status) report.status = status;
        if (["low", "medium", "high"].includes(priority)) report.priority = priority;
        if (typeof notes === "string") report.notes = notes;
        report.reviewedBy = req.user._id;
        await report.save();

        await notify(report.reportedBy, "maintenance_updated",
            `Damage report for equipment updated to ${report.status}.`, "/maintenance");

        return res.status(200).json({ success: true, message: "Report updated", report });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to update report" });
    }
};
