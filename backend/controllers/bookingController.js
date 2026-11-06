import mongoose from "mongoose";
import Booking from "../models/Booking.js";
import Equipment from "../models/Equipment.js";
import DamageReport from "../models/DamageReport.js";
import MaintenanceRecord from "../models/MaintenanceRecord.js";
import { notify } from "../models/Notification.js";
import User from "../models/User.js";

// Create a booking request
export const createBooking = async (req, res) => {
    try {
        const {
            equipment,
            quantity,
            startTime,
            endTime,
            purpose
        } = req.body;

        if (!equipment || !quantity || !startTime || !endTime || !purpose) {
            return res.status(400).json({
                success: false,
                message: "Please provide all required booking details"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(equipment)) {
            return res.status(400).json({
                success: false,
                message: "Invalid equipment ID"
            });
        }

        const requestedQuantity = Number(quantity);
        const start = new Date(startTime);
        const end = new Date(endTime);

        if (!Number.isInteger(requestedQuantity) || requestedQuantity < 1) {
            return res.status(400).json({
                success: false,
                message: "Quantity must be a positive whole number"
            });
        }

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            end <= start ||
            start <= new Date()
        ) {
            return res.status(400).json({
                success: false,
                message: "Provide valid future booking dates and times"
            });
        }

        if (typeof purpose !== "string" || !purpose.trim()) {
            return res.status(400).json({
                success: false,
                message: "Please provide a valid booking purpose"
            });
        }

        const equipmentItem = await Equipment.findById(equipment).populate("laboratory", "name building roomNumber");

        if (!equipmentItem) {
            return res.status(404).json({
                success: false,
                message: "Equipment not found"
            });
        }

        if (
            equipmentItem.status !== "active" ||
            equipmentItem.condition !== "working"
        ) {
            return res.status(400).json({
                success: false,
                message: "This equipment is currently unavailable"
            });
        }

        if (requestedQuantity > equipmentItem.totalQuantity) {
            return res.status(400).json({
                success: false,
                message: "Requested quantity exceeds total equipment quantity"
            });
        }

        // Find overlapping approved bookings.
        const overlappingBookings = await Booking.find({
            equipment,
            status: "approved",
            startTime: { $lt: end },
            endTime: { $gt: start }
        });

        const alreadyBooked = overlappingBookings.reduce(
            (total, booking) => total + booking.quantity,
            0
        );

        const availableQuantity =
            equipmentItem.totalQuantity - alreadyBooked;

        if (requestedQuantity > availableQuantity) {
            return res.status(409).json({
                success: false,
                message: "Not enough equipment available for this time period",
                availableQuantity
            });
        }

        // Resolve collection location from the equipment's block + laboratory
        const lab = equipmentItem.laboratory;
        const collectionLocation = [
            equipmentItem.block,
            lab?.name,
            equipmentItem.roomNumber || lab?.roomNumber
        ].filter(Boolean).join(" – ") || "Location pending assignment";

        const booking = await Booking.create({
            equipment,
            user: req.user._id,
            quantity: requestedQuantity,
            startTime: start,
            endTime: end,
            purpose: purpose.trim(),
            collectionLocation,
            status: "pending"
        });

        // Notify faculty/admin of the new request
        const staff = await User.find({ role: { $in: ["faculty", "admin"] }, isActive: { $ne: false } }).select("_id");
        await Promise.all(staff.map((s) =>
            notify(s._id, "booking_submitted",
                `New booking request for ${equipmentItem.name} by ${req.user.name}`,
                "/dashboard")
        ));

        return res.status(201).json({
            success: true,
            message: "Booking request submitted successfully",
            booking
        });

    } catch (error) {
        console.error("Create booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to create booking"
        });
    }
};


// Get all bookings
export const getAllBookings = async (req, res) => {
    try {
        const bookings = await Booking.find()
            .populate({ path: "equipment", populate: { path: "laboratory", select: "name building roomNumber" } })
            .populate("user", "name email role")
            .populate("reviewedBy", "name email")
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        console.error("Get bookings error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch bookings"
        });
    }
};


// Get bookings belonging to logged-in user
export const getMyBookings = async (req, res) => {
    try {
        const bookings = await Booking.find({
            user: req.user._id
        })
            .populate({ path: "equipment", populate: { path: "laboratory", select: "name building roomNumber" } })
            .sort({ createdAt: -1 });

        return res.status(200).json({
            success: true,
            count: bookings.length,
            bookings
        });

    } catch (error) {
        console.error("My bookings error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to fetch your bookings"
        });
    }
};


// Approve or reject a booking
export const reviewBooking = async (req, res) => {
    try {
        const { status } = req.body;

        if (!["approved", "rejected"].includes(status)) {
            return res.status(400).json({
                success: false,
                message: "Status must be approved or rejected"
            });
        }

        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID"
            });
        }

        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found"
            });
        }

        if (booking.status !== "pending") {
            return res.status(409).json({
                success: false,
                message: "Only pending bookings can be reviewed"
            });
        }

        if (status === "approved") {
            const equipmentItem = await Equipment.findById(
                booking.equipment
            );

            if (
                !equipmentItem ||
                equipmentItem.status !== "active" ||
                equipmentItem.condition !== "working"
            ) {
                return res.status(409).json({
                    success: false,
                    message: "Equipment is currently unavailable"
                });
            }

            const overlappingBookings = await Booking.find({
                _id: { $ne: booking._id },
                equipment: booking.equipment,
                status: "approved",
                startTime: { $lt: booking.endTime },
                endTime: { $gt: booking.startTime }
            });

            const alreadyBooked = overlappingBookings.reduce(
                (total, item) => total + item.quantity,
                0
            );

            const availableQuantity =
                equipmentItem.totalQuantity - alreadyBooked;

            if (booking.quantity > availableQuantity) {
                return res.status(409).json({
                    success: false,
                    message: "Insufficient equipment available for approval",
                    availableQuantity
                });
            }
        }

        booking.status = status;
        booking.reviewedBy = req.user._id;
        booking.reviewedAt = new Date();
        if (typeof req.body.reason === "string") {
            booking.rejectionReason = req.body.reason.trim();
        }

        await booking.save();

        await notify(
            booking.user,
            status === "approved" ? "booking_approved" : "booking_rejected",
            `Your booking for ${booking.equipment} was ${status}${booking.rejectionReason ? `: ${booking.rejectionReason}` : ""}`,
            "/my-bookings"
        );

        return res.status(200).json({
            success: true,
            message: `Booking ${status} successfully`,
            booking
        });

    } catch (error) {
        console.error("Review booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to review booking"
        });
    }
};


// Cancel own pending booking
export const cancelBooking = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({
                success: false,
                message: "Invalid booking ID"
            });
        }

        const booking = await Booking.findById(req.params.id);

        if (!booking) {
            return res.status(404).json({
                success: false,
                message: "Booking not found"
            });
        }

        if (booking.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({
                success: false,
                message: "You cannot cancel another user's booking"
            });
        }

        if (booking.status !== "pending") {
            return res.status(409).json({
                success: false,
                message: "Only pending bookings can be cancelled"
            });
        }

        booking.status = "cancelled";
        await booking.save();

        return res.status(200).json({
            success: true,
            message: "Booking cancelled successfully",
            booking
        });

    } catch (error) {
        console.error("Cancel booking error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to cancel booking"
        });
    }
};
// ISSUE EQUIPMENT — staff hands out an approved booking
export const issueBooking = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.status !== "approved") {
            return res.status(409).json({ success: false, message: "Only approved bookings can be issued" });
        }

        booking.status = "issued";
        booking.issuedAt = new Date();
        booking.issuedBy = req.user._id;
        await booking.save();

        await notify(booking.user, "equipment_issued",
            `Equipment for booking #${booking._id.toString().slice(-6)} has been issued. Please return it by ${booking.endTime.toDateString()}.`,
            "/returns");

        return res.status(200).json({ success: true, message: "Equipment issued", booking });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to issue equipment" });
    }
};

// REQUEST RETURN — student asks to return issued equipment
export const requestReturn = async (req, res) => {
    try {
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            return res.status(400).json({ success: false, message: "Invalid booking ID" });
        }
        const booking = await Booking.findById(req.params.id);
        if (!booking) return res.status(404).json({ success: false, message: "Booking not found" });
        if (booking.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ success: false, message: "Not your booking" });
        }
        if (booking.status !== "issued") {
            return res.status(409).json({ success: false, message: "Only issued equipment can be returned" });
        }

        booking.returnRequestedAt = new Date();
        await booking.save();

        const staff = await User.find({ role: { $in: ["faculty", "admin"] }, isActive: { $ne: false } }).select("_id");
        await Promise.all(staff.map((s) =>
            notify(s._id, "return_requested",
                `${req.user.name} requested return of booking #${booking._id.toString().slice(-6)}`,
                "/dashboard")
        ));

        return res.status(200).json({ success: true, message: "Return requested", booking });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to request return" });
    }
};

// CONFIRM RETURN — staff verifies returned equipment, updates condition
export const confirmReturn = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        session.startTransaction();

        const { condition = "working", notes = "" } = req.body;
        if (!["working", "damaged", "under_maintenance"].includes(condition)) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Invalid return condition" });
        }
        if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
            await session.abortTransaction();
            return res.status(400).json({ success: false, message: "Invalid booking ID" });
        }

        const booking = await Booking.findById(req.params.id).session(session);
        if (!booking) {
            await session.abortTransaction();
            return res.status(404).json({ success: false, message: "Booking not found" });
        }
        if (booking.status !== "issued") {
            await session.abortTransaction();
            return res.status(409).json({ success: false, message: "Only issued equipment can be returned" });
        }

        booking.status = "completed";
        booking.returnedAt = new Date();
        booking.returnedBy = req.user._id;
        booking.returnCondition = condition;
        await booking.save({ session });

        // Update equipment condition if damaged/needs maintenance
        if (condition !== "working") {
            await Equipment.findByIdAndUpdate(booking.equipment, { condition }, { session });
        }

        // Auto-create damage report + maintenance record when returned damaged
        let damageReport = null;
        if (condition !== "working") {
            damageReport = await DamageReport.create([{
                equipment: booking.equipment,
                booking: booking._id,
                reportedBy: booking.user,
                description: notes || `Equipment returned in ${condition} condition`,
                status: "reported",
                priority: condition === "damaged" ? "high" : "medium"
            }], { session });
            damageReport = damageReport[0];

            await MaintenanceRecord.create([{
                equipment: booking.equipment,
                damageReport: damageReport._id,
                title: `Post-return ${condition.replace(/_/g, " ")}: booking #${booking._id.toString().slice(-6)}`,
                description: notes || `Equipment returned in ${condition} condition after booking #${booking._id.toString().slice(-6)}`,
                priority: damageReport.priority,
                status: "reported",
                reportedBy: req.user._id
            }], { session });
        }

        await session.commitTransaction();

        await notify(booking.user, "return_confirmed",
            `Return confirmed for booking #${booking._id.toString().slice(-6)}${condition !== "working" ? ` — equipment marked ${condition.replace(/_/g, " ")}` : ""}.`,
            "/returns");

        return res.status(200).json({
            success: true,
            message: "Return confirmed",
            booking,
            damageReport: damageReport ? damageReport._id : null
        });
    } catch (error) {
        await session.abortTransaction().catch(() => {});
        console.error("Confirm return error:", error);
        return res.status(500).json({ success: false, message: "Failed to confirm return" });
    } finally {
        session.endSession();
    }
};
