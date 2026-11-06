
import mongoose from "mongoose";
import Equipment from "../models/Equipment.js";
import Booking from "../models/Booking.js";

// CHECK EQUIPMENT AVAILABILITY
export const checkAvailability = async (req, res) => {
    try {
        const { equipmentId, startTime, endTime } = req.query;

        // Validate required fields
        if (!equipmentId || !startTime || !endTime) {
            return res.status(400).json({
                success: false,
                message: "Please provide equipmentId, startTime and endTime"
            });
        }

        // Validate equipment ID
        if (!mongoose.Types.ObjectId.isValid(equipmentId)) {
            return res.status(400).json({
                success: false,
                message: "Invalid equipment ID"
            });
        }

        const start = new Date(startTime);
        const end = new Date(endTime);

        if (
            Number.isNaN(start.getTime()) ||
            Number.isNaN(end.getTime()) ||
            start <= new Date() ||
            end <= start
        ) {
            return res.status(400).json({
                success: false,
                message: "Please provide valid future dates and times"
            });
        }

        // Find equipment
        const equipment = await Equipment.findById(equipmentId);

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: "Equipment not found"
            });
        }

        // Check equipment condition
        if (
            equipment.status !== "active" ||
            equipment.condition !== "working"
        ) {
            return res.status(200).json({
                success: true,
                available: false,
                message: "Equipment is currently unavailable",
                totalQuantity: equipment.totalQuantity,
                availableQuantity: 0
            });
        }

        // Find approved bookings overlapping the requested period
        const bookings = await Booking.find({
            equipment: equipmentId,
            status: "approved",
            startTime: { $lt: end },
            endTime: { $gt: start }
        });

        // Calculate overlapping quantities accurately
        const events = [];

        for (const booking of bookings) {
            const overlapStart = Math.max(
                start.getTime(),
                booking.startTime.getTime()
            );

            const overlapEnd = Math.min(
                end.getTime(),
                booking.endTime.getTime()
            );

            events.push(
                { time: overlapStart, change: booking.quantity },
                { time: overlapEnd, change: -booking.quantity }
            );
        }

        // Process ending events before starting events
        // when both have the same time.
        events.sort((a, b) => {
            if (a.time !== b.time) {
                return a.time - b.time;
            }

            return a.change - b.change;
        });

        let currentBooked = 0;
        let maximumBooked = 0;

        for (const event of events) {
            currentBooked += event.change;

            maximumBooked = Math.max(
                maximumBooked,
                currentBooked
            );
        }

        const availableQuantity = Math.max(
            0,
            equipment.totalQuantity - maximumBooked
        );

        return res.status(200).json({
            success: true,
            equipment: equipment.name,
            totalQuantity: equipment.totalQuantity,
            bookedQuantity: maximumBooked,
            availableQuantity,
            available: availableQuantity > 0,
            requestedStartTime: start,
            requestedEndTime: end
        });

    } catch (error) {
        console.error("Availability error:", error);

        return res.status(500).json({
            success: false,
            message: "Failed to check equipment availability"
        });
    }
};
