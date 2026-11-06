import Notification from "../models/Notification.js";

export const getMyNotifications = async (req, res) => {
    try {
        const notifications = await Notification.find({ user: req.user._id })
            .sort({ createdAt: -1 })
            .limit(50);
        const unread = notifications.filter((n) => !n.read).length;
        return res.status(200).json({ success: true, unread, notifications });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to fetch notifications" });
    }
};

export const markRead = async (req, res) => {
    try {
        await Notification.updateMany(
            { user: req.user._id, read: false },
            { $set: { read: true } }
        );
        return res.status(200).json({ success: true, message: "All notifications marked read" });
    } catch (error) {
        return res.status(500).json({ success: false, message: "Failed to update notifications" });
    }
};
