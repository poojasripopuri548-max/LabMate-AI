import mongoose from "mongoose";

const maintenanceRecordSchema = new mongoose.Schema(
    {
        equipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Equipment",
            required: true
        },
        damageReport: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "DamageReport",
            default: null
        },
        title: { type: String, required: true, trim: true },
        description: { type: String, default: "" },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium"
        },
        status: {
            type: String,
            enum: ["reported", "pending", "under_maintenance", "repaired", "closed"],
            default: "reported"
        },
        assignedTo: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        repairNotes: { type: String, default: "" },
        reportedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
        startedAt: { type: Date, default: null },
        completedAt: { type: Date, default: null }
    },
    { timestamps: true }
);

const MaintenanceRecord = mongoose.model("MaintenanceRecord", maintenanceRecordSchema);
export default MaintenanceRecord;
