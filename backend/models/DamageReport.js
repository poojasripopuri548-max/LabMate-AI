import mongoose from "mongoose";

const damageReportSchema = new mongoose.Schema(
    {
        equipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Equipment",
            required: true
        },
        booking: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Booking",
            default: null
        },
        reportedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        description: { type: String, required: true, trim: true },
        status: {
            type: String,
            enum: ["reported", "pending", "under_maintenance", "repaired", "closed"],
            default: "reported"
        },
        priority: {
            type: String,
            enum: ["low", "medium", "high"],
            default: "medium"
        },
        reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        notes: { type: String, default: "" }
    },
    { timestamps: true }
);

damageReportSchema.index({ equipment: 1, status: 1 });

const DamageReport = mongoose.model("DamageReport", damageReportSchema);
export default DamageReport;
