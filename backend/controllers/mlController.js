
import dotenv from "dotenv";
dotenv.config();

const ML_SERVICE_URL =
    process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

async function callMLService(endpoint) {
    const response = await fetch(`${ML_SERVICE_URL}${endpoint}`);

    const data = await response.json();

    if (!response.ok) {
        throw new Error(data.detail || "ML service request failed");
    }

    return data;
}

// Equipment recommendations
export const getRecommendations = async (req, res) => {
    try {
        const { q, top_n } = req.query;

        if (!q || q.trim().length < 2) {
            return res.status(400).json({
                success: false,
                message: "Please provide an experiment requirement."
            });
        }

        const params = new URLSearchParams({
            q: q.trim(),
            top_n: String(top_n || 5)
        });

        const result = await callMLService(
            `/ai/recommend?${params.toString()}`
        );

        return res.status(200).json({
            success: true,
            message: "Equipment recommendations generated",
            data: result
        });
    } catch (error) {
        console.error("Recommendation error:", error.message);

        return res.status(503).json({
            success: false,
            message: "Recommendation service unavailable"
        });
    }
};

// Equipment usage analysis
export const getUsageAnalysis = async (req, res) => {
    try {
        const params = new URLSearchParams();

        if (req.query.start) params.set("start", req.query.start);
        if (req.query.end) params.set("end", req.query.end);

        const query = params.toString();
        const endpoint = query
            ? `/ai/usage?${query}`
            : "/ai/usage";

        const result = await callMLService(endpoint);

        return res.status(200).json({
            success: true,
            message: "Usage analysis generated",
            data: result
        });
    } catch (error) {
        console.error("Usage analysis error:", error.message);

        return res.status(503).json({
            success: false,
            message: "Usage analysis service unavailable"
        });
    }
};

// Equipment maintenance analysis
export const getMaintenanceAnalysis = async (req, res) => {
    try {
        const result = await callMLService("/ai/maintenance");

        return res.status(200).json({
            success: true,
            message: "Maintenance analysis generated",
            data: result
        });
    } catch (error) {
        console.error("Maintenance analysis error:", error.message);

        return res.status(503).json({
            success: false,
            message: "Maintenance analysis service unavailable"
        });
    }
};
