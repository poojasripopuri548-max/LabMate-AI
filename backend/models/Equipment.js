import mongoose from "mongoose";

const equipmentSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        inventoryCode: {
            type: String,
            trim: true,
            default: ""
        },

        block: {
            type: String,
            trim: true,
            default: ""
        },

        roomNumber: {
            type: String,
            trim: true,
            default: ""
        },

        shelfLocation: {
            type: String,
            trim: true,
            default: ""
        },

        purchaseDate: {
            type: Date,
            default: null
        },

        supplier: {
            type: String,
            trim: true,
            default: ""
        },

        category: {
            type: String,
            required: true,
            trim: true
        },

        model: {
            type: String,
            default: ""
        },

        manufacturer: {
            type: String,
            default: ""
        },

        specifications: {
            type: Map,
            of: String,
            default: {}
        },

        totalQuantity: {
            type: Number,
            required: true,
            min: 1
        },

        laboratory: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "Laboratory",
            required: true
        },

        condition: {
            type: String,
            enum: ["working", "damaged", "under_maintenance"],
            default: "working"
        },

        status: {
            type: String,
            enum: ["active", "unavailable", "retired"],
            default: "active"
        },

        description: {
            type: String,
            default: ""
        },

        createdBy: {
            type: mongoose.Schema.Types.ObjectId,
            ref: "User",
            required: true
        }
    },
    {
        timestamps: true
    }
);

const Equipment = mongoose.model("Equipment", equipmentSchema);

export default Equipment;