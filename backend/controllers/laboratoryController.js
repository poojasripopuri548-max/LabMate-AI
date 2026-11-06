import Laboratory from "../models/Laboratory.js";
import Equipment from "../models/Equipment.js";

// CREATE LABORATORY
export const createLaboratory = async (req, res) => {
    try {
        const {
            name,
            department,
            building,
            roomNumber,
            description
        } = req.body;

        if (!name || !department || !building || !roomNumber) {
            return res.status(400).json({
                success: false,
                message: "Name, department, building and room number are required"
            });
        }

        const laboratory = await Laboratory.create({
            name,
            department,
            building,
            roomNumber,
            description,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: "Laboratory created successfully",
            laboratory
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// GET ALL LABORATORIES
export const getLaboratories = async (req, res) => {
    try {
        const laboratories = await Laboratory.find()
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: laboratories.length,
            laboratories
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// GET SINGLE LABORATORY
export const getLaboratoryById = async (req, res) => {
    try {
        const laboratory = await Laboratory.findById(req.params.id)
            .populate("createdBy", "name email");

        if (!laboratory) {
            return res.status(404).json({
                success: false,
                message: "Laboratory not found"
            });
        }

        res.status(200).json({
            success: true,
            laboratory
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid laboratory ID"
        });
    }
};


// UPDATE LABORATORY
export const updateLaboratory = async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "department",
            "building",
            "roomNumber",
            "description",
            "isActive"
        ];

        const updates = {};

        for (const field of allowedFields) {
            if (req.body[field] !== undefined) {
                updates[field] = req.body[field];
            }
        }

        if (Object.keys(updates).length === 0) {
            return res.status(400).json({
                success: false,
                message: "No valid fields provided for update"
            });
        }

        const laboratory = await Laboratory.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        );

        if (!laboratory) {
            return res.status(404).json({
                success: false,
                message: "Laboratory not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Laboratory updated successfully",
            laboratory
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// DELETE LABORATORY
export const deleteLaboratory = async (req, res) => {
    try {
        const laboratory = await Laboratory.findById(req.params.id);

        if (!laboratory) {
            return res.status(404).json({
                success: false,
                message: "Laboratory not found"
            });
        }

        const equipmentExists = await Equipment.exists({
            laboratory: laboratory._id
        });

        if (equipmentExists) {
            return res.status(409).json({
                success: false,
                message: "Cannot delete laboratory because equipment is assigned to it"
            });
        }

        await laboratory.deleteOne();

        res.status(200).json({
            success: true,
            message: "Laboratory deleted successfully"
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};