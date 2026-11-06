import mongoose from "mongoose";

const bookingSchema = new mongoose.Schema(
    {
        equipment: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Equipment",
            required: true
        },

        user: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        quantity: {
            type: Number,
            required: true,
            min: 1
        },

        startTime: {
            type: Date,
            required: true
        },

        endTime: {
            type: Date,
            required: true
        },

        purpose: {
            type: String,
            required: true,
            trim: true
        },

        status: {
            type: String,
            enum: [
                "pending",
                "approved",
                "rejected",
                "cancelled",
                "issued",
                "completed"
            ],
            default: "pending"
        },

        collectionLocation: {
            type: String,
            default: ""
        },

        rejectionReason: {
            type: String,
            default: ""
        },

        issuedAt: { type: Date, default: null },
        issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        returnRequestedAt: { type: Date, default: null },
        returnedAt: { type: Date, default: null },
        returnedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
        returnCondition: {
            type: String,
            enum: ["working", "damaged", "under_maintenance", ""],
            default: ""
        },

        reviewedBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            default: null
        },

        reviewedAt: {
            type: Date,
            default: null
        }
    },
    {
        timestamps: true
    }
);

const Booking = mongoose.model("Booking", bookingSchema);

export default Booking;
