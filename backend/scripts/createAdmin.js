import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "../config/db.js";
import User from "../models/User.js";

dotenv.config();

const createAdmin = async () => {
    try {
        if (
            !process.env.ADMIN_NAME ||
            !process.env.ADMIN_EMAIL ||
            !process.env.ADMIN_PASSWORD
        ) {
            throw new Error("Admin environment variables are missing");
        }

        if (process.env.ADMIN_PASSWORD.length < 12) {
            throw new Error("Admin password must be at least 12 characters");
        }

        await connectDB();

        const existingAdmin = await User.findOne({
            role: "admin"
        });

        if (existingAdmin) {
            console.log("An admin account already exists.");
            return;
        }

        const existingUser = await User.findOne({
            email: process.env.ADMIN_EMAIL.toLowerCase()
        });

        if (existingUser) {
            console.log("This email already belongs to another account.");
            return;
        }

        const passwordHash = await bcrypt.hash(
            process.env.ADMIN_PASSWORD,
            12
        );

        await User.create({
            name: process.env.ADMIN_NAME,
            email: process.env.ADMIN_EMAIL,
            passwordHash,
            role: "admin"
        });

        console.log("Admin account created successfully.");

    } catch (error) {
        console.error("Admin setup failed:", error.message);
    } finally {
        process.exit();
    }
};

createAdmin();