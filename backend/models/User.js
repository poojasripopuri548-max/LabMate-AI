import mongoose from "mongoose";

const userSchema = new mongoose.Schema(
    {
        name: {
            type: String,
            required: true,
            trim: true
        },

        email: {
            type: String,
            required: true,
            unique: true,
            lowercase: true,
            trim: true
        },

        passwordHash: {
            type: String,
            required: true,
            select: false
        },

        role: {
            type: String,
            enum: ["student", "faculty", "admin"],
            default: "student"
        },

        facultyId: {
            type: String,
            trim: true,
            default: ""
        },

        department: {
            type: String,
            trim: true,
            default: ""
        },

        designation: {
            type: String,
            trim: true,
            default: ""
        },

        isActive: {
            type: Boolean,
            default: true
        },

        activityLog: {
            type: [{
                type: { type: String, enum: ["login", "logout"] },
                at: { type: Date, default: Date.now }
            }],
            default: []
        }
    },
    {
        timestamps: true
    }
);

const User = mongoose.model("User", userSchema);

export default User;