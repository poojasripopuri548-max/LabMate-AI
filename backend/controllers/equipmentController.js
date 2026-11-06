import mongoose from "mongoose";
import Equipment from "../models/Equipment.js";
import Laboratory from "../models/Laboratory.js";

// CREATE EQUIPMENT
export const createEquipment = async (req, res) => {
    try {
        const {
            name,
            inventoryCode,
            category,
            model,
            manufacturer,
            specifications,
            totalQuantity,
            laboratory,
            block,
            roomNumber,
            shelfLocation,
            purchaseDate,
            supplier,
            condition,
            status,
            description
        } = req.body;

        if (
            !name ||
            !category ||
            !laboratory ||
            totalQuantity === undefined
        ) {
            return res.status(400).json({
                success: false,
                message: "Name, category, laboratory and totalQuantity are required"
            });
        }

        if (
            !Number.isInteger(totalQuantity) ||
            totalQuantity < 1
        ) {
            return res.status(400).json({
                success: false,
                message: "Total quantity must be a positive integer"
            });
        }

        const existingLab = await Laboratory.findById(laboratory);

        if (!existingLab) {
            return res.status(404).json({
                success: false,
                message: "Laboratory not found"
            });
        }

        if (inventoryCode) {
            const codeExists = await Equipment.findOne({ inventoryCode: inventoryCode.trim() });
            if (codeExists) {
                return res.status(409).json({
                    success: false,
                    message: `Inventory code "${inventoryCode}" is already in use`
                });
            }
        }

        const equipment = await Equipment.create({
            name,
            inventoryCode: inventoryCode || "",
            category,
            model,
            manufacturer,
            specifications,
            totalQuantity,
            laboratory,
            block: block || "",
            roomNumber: roomNumber || "",
            shelfLocation: shelfLocation || "",
            purchaseDate: purchaseDate || null,
            supplier: supplier || "",
            condition,
            status,
            description,
            createdBy: req.user._id
        });

        res.status(201).json({
            success: true,
            message: "Equipment added successfully",
            equipment
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// GET ALL EQUIPMENT
export const getAllEquipment = async (req, res) => {
    try {
        const filter = {};

        if (req.query.category) {
            filter.category = req.query.category;
        }

        if (req.query.laboratory) {
            filter.laboratory = req.query.laboratory;
        }

        if (req.query.condition) {
            filter.condition = req.query.condition;
        }

        if (req.query.status) {
            filter.status = req.query.status;
        }

        if (req.query.block) {
            filter.block = req.query.block;
        }

        const equipment = await Equipment.find(filter)
            .populate("laboratory", "name department building roomNumber")
            .populate("createdBy", "name email")
            .sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            count: equipment.length,
            equipment
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};


// GET EQUIPMENT BY ID
export const getEquipmentById = async (req, res) => {
    try {
        const equipment = await Equipment.findById(req.params.id)
            .populate("laboratory", "name department building roomNumber")
            .populate("createdBy", "name email");

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: "Equipment not found"
            });
        }

        res.status(200).json({
            success: true,
            equipment
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: "Invalid equipment ID"
        });
    }
};


// UPDATE EQUIPMENT
export const updateEquipment = async (req, res) => {
    try {
        const allowedFields = [
            "name",
            "inventoryCode",
            "category",
            "model",
            "manufacturer",
            "specifications",
            "totalQuantity",
            "laboratory",
            "block",
            "roomNumber",
            "shelfLocation",
            "purchaseDate",
            "supplier",
            "condition",
            "status",
            "description"
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

        if (
            updates.totalQuantity !== undefined &&
            (!Number.isInteger(updates.totalQuantity) ||
                updates.totalQuantity < 1)
        ) {
            return res.status(400).json({
                success: false,
                message: "Total quantity must be a positive integer"
            });
        }

        if (updates.inventoryCode) {
            const dup = await Equipment.findOne({
                inventoryCode: updates.inventoryCode,
                _id: { $ne: req.params.id }
            });
            if (dup) {
                return res.status(409).json({
                    success: false,
                    message: `Inventory code "${updates.inventoryCode}" is already in use`
                });
            }
        }

        if (updates.laboratory) {
            const existingLab = await Laboratory.findById(updates.laboratory);

            if (!existingLab) {
                return res.status(404).json({
                    success: false,
                    message: "Laboratory not found"
                });
            }
        }

        const equipment = await Equipment.findByIdAndUpdate(
            req.params.id,
            updates,
            {
                new: true,
                runValidators: true
            }
        ).populate("laboratory", "name department building roomNumber");

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: "Equipment not found"
            });
        }

        res.status(200).json({
            success: true,
            message: "Equipment updated successfully",
            equipment
        });

    } catch (error) {
        res.status(400).json({
            success: false,
            message: error.message
        });
    }
};


// DELETE EQUIPMENT
export const deleteEquipment = async (req, res) => {
    try {
        const equipment = await Equipment.findById(req.params.id);

        if (!equipment) {
            return res.status(404).json({
                success: false,
                message: "Equipment not found"
            });
        }

        await equipment.deleteOne();

        res.status(200).json({
            success: true,
            message: "Equipment deleted successfully"
        });

    } catch (error) {
        res.status(500).json({
            success: false,
            message: error.message
        });
    }
};
// BULK IMPORT — validate every row, then insert valid ones in a transaction.
// Accepts { items: [...] } where each item mirrors createEquipment fields.
export const bulkImportEquipment = async (req, res) => {
    const session = await mongoose.startSession();
    try {
        const { items } = req.body;
        if (!Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ success: false, message: "Provide a non-empty items array" });
        }
        if (items.length > 500) {
            return res.status(400).json({ success: false, message: "Maximum 500 rows per import" });
        }

        const MAX_QTY = 1000000;
        const results = [];
        const valid = [];
        const seenCodes = new Set();

        // Pre-load existing inventory codes for duplicate detection
        const existingCodes = new Set(
            (await Equipment.find({ inventoryCode: { $ne: "" } }).select("inventoryCode")).map((e) => e.inventoryCode)
        );

        items.forEach((item, i) => {
            const row = i + 1;
            const errors = [];
            const name = (item.name || "").toString().trim();
            const qty = Number(item.totalQuantity);
            const lab = item.laboratory;

            if (!name) errors.push("name is required");
            if (!item.category || !item.category.toString().trim()) errors.push("category is required");
            if (!lab || !mongoose.Types.ObjectId.isValid(lab)) errors.push("valid laboratory ID is required");
            if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) {
                errors.push(`quantity must be an integer between 1 and ${MAX_QTY}`);
            }

            const code = (item.inventoryCode || "").toString().trim();
            if (code) {
                if (existingCodes.has(code) || seenCodes.has(code)) {
                    errors.push(`duplicate inventory code "${code}"`);
                }
            }

            if (errors.length) {
                results.push({ row, status: "failed", errors, name: name || "(unnamed)" });
            } else {
                if (code) seenCodes.add(code);
                valid.push({
                    row,
                    doc: {
                        name,
                        inventoryCode: code,
                        category: item.category.toString().trim(),
                        model: item.model || "",
                        manufacturer: item.manufacturer || "",
                        specifications: item.specifications || {},
                        totalQuantity: qty,
                        laboratory: lab,
                        block: item.block || "",
                        roomNumber: item.roomNumber || "",
                        shelfLocation: item.shelfLocation || "",
                        purchaseDate: item.purchaseDate || null,
                        supplier: item.supplier || "",
                        condition: ["working", "damaged", "under_maintenance"].includes(item.condition) ? item.condition : "working",
                        status: ["active", "unavailable", "retired"].includes(item.status) ? item.status : "active",
                        description: item.description || "",
                        createdBy: req.user._id
                    }
                });
            }
        });

        let created = 0;
        if (valid.length) {
            session.startTransaction();
            try {
                await Equipment.insertMany(valid.map((v) => v.doc), { session });
                await session.commitTransaction();
                created = valid.length;
                valid.forEach((v) => results.push({ row: v.row, status: "created", name: v.doc.name }));
            } catch (txError) {
                await session.abortTransaction();
                console.error("Bulk import transaction failed:", txError.message);
                return res.status(500).json({
                    success: false,
                    message: "Import failed — no records were saved",
                    results
                });
            }
        }

        return res.status(207).json({
            success: true,
            message: `Import complete: ${created} created, ${results.filter((r) => r.status === "failed").length} failed`,
            created,
            failed: results.filter((r) => r.status === "failed").length,
            results: results.sort((a, b) => a.row - b.row)
        });
    } catch (error) {
        console.error("Bulk import error:", error);
        return res.status(500).json({ success: false, message: "Bulk import failed" });
    } finally {
        session.endSession();
    }
};
