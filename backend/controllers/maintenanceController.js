import MaintenanceRecord from "../models/MaintenanceRecord.js";
import Equipment from "../models/Equipment.js";
import { notify } from "../models/Notification.js";
import mongoose from "mongoose";

export const getMaintenanceRecords = async (req, res) => {
    try {
        const filter = {};
        if (req.user.role === "student") {
            // students only see records for equipment (read-only awareness)
        }
        if (req.query.status) filter.status = req.query.status;
        if (req.query.equipment) filter.equipment = req.query.equipment;
        const records = await MaintenanceRecord.find(filter)
            .populate("equipment", "name category condition status laboratory")
            .populate("reportedBy", "name email role")
            .populate("assignedTo", "name email")
            .sort({ createdAt: -1 });
        return res.status(200).json({ success: true, count: records.length, records });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch maintenance records" });
    }
};

// Faculty/admin create a maintenance request
export const createMaintenanceRecord = async (req, res) => {
    try {
        const { equipment, title, description = "", priority = "medium" } = req.body;
        if (!equipment || !mongoose.Types.ObjectId.isValid(equipment)) {
            return res.status(400).json({ success: false, message: "Valid equipment ID required" });
        }
        if (typeof title !== "string" || title.trim().length < 3) {
            return res.status(400).json({ success: false, message: "Title required (min 3 characters)" });
        }
        const eq = await Equipment.findById(equipment);
        if (!eq) return res.status(404).json({ success: false, message: "Equipment not found" });

        const record = await MaintenanceRecord.create({
            equipment,
            title: title.trim(),
            description,
            priority: ["low", "medium", "high"].includes(priority) ? priority : "medium",
            status: "reported",
            reportedBy: req.user._id
        });

        await notify(req.user._id, "maintenance_updated", `Maintenance request created for ${eq.name}.`, "/maintenance");
        return res.status(201).json({ success: true, message: "Maintenance request created", record });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to create maintenance record" });
    }
};

// Admin updates maintenance status (admin finalizes; faculty can update to under_maintenance)
export const updateMaintenanceRecord = async (req, res) => {
    try {
        const { status, priority, repairNotes, assignedTo } = req.body;
        const record = await MaintenanceRecord.findById(req.params.id);
        if (!record) return res.status(404).json({ success: false, message: "Record not found" });

        const isAdmin = req.user.role === "admin";
        const allowed = isAdmin
            ? ["reported", "pending", "under_maintenance", "repaired", "closed"]
            : ["under_maintenance", "repaired"]; // faculty may advance but not reopen/close-finalize

        if (status) {
            if (!allowed.includes(status)) {
                return res.status(403).json({ success: false, message: "You cannot set this maintenance status" });
            }
            record.status = status;
            if (status === "under_maintenance" && !record.startedAt) record.startedAt = new Date();
            if (["repaired", "closed"].includes(status)) record.completedAt = new Date();
        }
        if (["low", "medium", "high"].includes(priority)) record.priority = priority;
        if (typeof repairNotes === "string") record.repairNotes = repairNotes;
        if (assignedTo && mongoose.Types.ObjectId.isValid(assignedTo)) record.assignedTo = assignedTo;
        await record.save();

        // Sync equipment condition for visibility
        if (record.status === "under_maintenance") {
            await Equipment.findByIdAndUpdate(record.equipment, { condition: "under_maintenance", status: "unavailable" });
        } else if (record.status === "repaired" || record.status === "closed") {
            await Equipment.findByIdAndUpdate(record.equipment, { condition: "working", status: "active" });
        }

        if (record.reportedBy.toString() !== req.user._id.toString()) {
            await notify(record.reportedBy, "maintenance_updated",
                `Maintenance record "${record.title}" is now ${record.status}.`, "/maintenance");
        }

        return res.status(200).json({ success: true, message: "Maintenance record updated", record });
    } catch (error) {
        console.error("Maintenance update error:", error);
        return res.status(500).json({ success: false, message: "Failed to update maintenance record" });
    }
};
