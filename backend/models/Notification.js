import mongoose from "mongoose";

const notificationSchema = new mongoose.Schema(
    {
        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },
        type: {
            type: String,
            enum: [
                "booking_submitted", "booking_approved", "booking_rejected",
                "equipment_issued", "return_reminder", "overdue_return",
                "damage_reported", "maintenance_updated", "return_confirmed",
                "return_requested", "general"
            ],
            default: "general"
        },
        message: { type: String, required: true },
        link: { type: String, default: "" },
        read: { type: Boolean, default: false }
    },
    { timestamps: true }
);

notificationSchema.index({ user: 1, read: 1, createdAt: -1 });

const Notification = mongoose.model("Notification", notificationSchema);

export const notify = async (userId, type, message, link = "") => {
    try {
        await Notification.create({ user: userId, type, message, link });
    } catch (e) {
        console.error("Notification failed:", e.message);
    }
};

export default Notification;
