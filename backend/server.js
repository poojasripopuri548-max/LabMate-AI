import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import connectDB from "./config/db.js";
import authRoutes from "./routes/authRoutes.js";
import userRoutes from "./routes/userRoutes.js";
import laboratoryRoutes from "./routes/laboratoryRoutes.js";
import equipmentRoutes from "./routes/equipmentRoutes.js";
import bookingRoutes from "./routes/bookingRoutes.js";
import availabilityRoutes from "./routes/availabilityRoutes.js";
import mlRoutes from "./routes/mlRoutes.js";
import damageRoutes from "./routes/damageRoutes.js";
import maintenanceRoutes from "./routes/maintenanceRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";
import assistantRoutes from "./routes/assistantRoutes.js";

console.log("LABORATORY ROUTES IMPORTED SUCCESSFULLY");
console.log("EQUIPMENT ROUTES IMPORTED SUCCESSFULLY");

dotenv.config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
// Routes
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/laboratories", laboratoryRoutes);
app.use("/api/equipment", equipmentRoutes);
app.use("/api/bookings", bookingRoutes);
app.use("/api/availability", availabilityRoutes);
app.use("/api/ml", mlRoutes);
app.use("/api/damage-reports", damageRoutes);
app.use("/api/maintenance", maintenanceRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/assistant", assistantRoutes);

// Home route
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to LabMate AI Backend"
    });
});

// Health check
app.get("/api/health", (req, res) => {
    res.status(200).json({
        success: true,
        message: "LabMate AI Backend is running",
        database: "MongoDB"
    });
});
app.get("/test", (req, res) => {
    res.status(200).json({
        message: "Server is working"
    });
});
// Start server
const PORT = process.env.PORT || 5000;

const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
};

startServer();