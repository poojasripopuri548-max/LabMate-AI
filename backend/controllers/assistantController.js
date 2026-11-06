import Equipment from "../models/Equipment.js";
import Booking from "../models/Booking.js";
import DamageReport from "../models/DamageReport.js";
import MaintenanceRecord from "../models/MaintenanceRecord.js";
import Laboratory from "../models/Laboratory.js";
import mongoose from "mongoose";

const ML_URL = process.env.ML_SERVICE_URL || "http://127.0.0.1:8001";

const STOPWORDS = new Set(("do we have is are the a an any some show me find tell about for my our equipment lab laboratory where which what when how many much available status booking issued return suggest need want get can could please check current currently".split(" ")));

const keywords = (text) =>
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
        .filter((w) => w.length > 1 && !STOPWORDS.has(w));

const fmtLocation = (e) => {
    const lab = e.laboratory;
    const parts = [e.block, lab?.name || lab, e.roomNumber || lab?.roomNumber].filter(Boolean);
    return parts.length ? parts.join(" – ") : "location not recorded";
};

const eqLine = (e, avail) =>
    `• ${e.name}${e.inventoryCode ? ` (${e.inventoryCode})` : ""} — ${e.totalQuantity} unit(s) total` +
    (avail != null ? `, ${avail} available now` : "") +
    ` — ${fmtLocation(e)} — ${e.condition}/${e.status}`;

// Available-now quantity: total minus overlapping approved/issued bookings covering now
async function availableNow(equipmentIds) {
    const now = new Date();
    const bookings = await Booking.find({
        equipment: { $in: equipmentIds },
        status: { $in: ["approved", "issued"] },
        startTime: { $lte: now },
        endTime: { $gt: now }
    }).select("equipment quantity");
    const used = {};
    bookings.forEach((b) => { used[b.equipment.toString()] = (used[b.equipment.toString()] || 0) + b.quantity; });
    return used;
}

async function equipmentSearch(q) {
    const kws = keywords(q);
    if (!kws.length) return { tier: "none", items: [] };

    const or = [];

    // Tier 1: exact-ish name match (all keywords present in name)
    const nameRegexes = kws.map((k) => new RegExp(k.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
    let items = await Equipment.find({
        name: { $regex: nameRegexes.map((r) => r.source).join("|"), $options: "i" },
        status: "active",
    }).populate("laboratory", "name building roomNumber").limit(10);

    if (!items.length) {
        // Tier 2: any keyword in name or category
        items = await Equipment.find({
            $or: [
                { name: { $regex: kws.join("|"), $options: "i" } },
                { category: { $regex: kws.join("|"), $options: "i" } },
                { description: { $regex: kws.join("|"), $options: "i" } }
            ],
            status: "active"
        }).populate("laboratory", "name building roomNumber").limit(10);
    }

    return { items };
}

async function answerEquipment(q, user) {
    const { items } = await equipmentSearch(q);

    if (!items.length) {
        return null; // caller decides: inventory-miss message vs casual chat
    }

    const availMap = await availableNow(items.map((i) => i._id));

    // Multiple distinct matches → ask which one
    const uniqueNames = [...new Set(items.map((i) => i.name.toLowerCase()))];
    if (uniqueNames.length > 1 && items.length > 1) {
        const lines = items.slice(0, 6).map((e) => eqLine(e, Math.max(0, e.totalQuantity - (availMap[e._id] || 0))));
        return `I found multiple matches — which one do you mean?\n${lines.join("\n")}`;
    }

    const e = items[0];
    const used = availMap[e._id] || 0;
    const avail = Math.max(0, e.totalQuantity - used);
    const working = e.status === "active" && e.condition === "working";

    if (!working) {
        return `${e.name} is in the inventory at ${fmtLocation(e)}, but it is currently ${e.status === "active" ? e.condition.replace(/_/g, " ") : e.status} and cannot be booked. Check the Maintenance page for status.`;
    }
    if (avail <= 0) {
        return `${e.name} exists at ${fmtLocation(e)} (${e.totalQuantity} unit(s) total), but all units are currently issued or reserved. Please check expected return dates under Returns.`;
    }
    return `${e.name} is available — ${avail} of ${e.totalQuantity} unit(s) free right now at ${fmtLocation(e)}. Condition: ${e.condition}. You can book it from the Equipment page.`;
}

// Route project/recommendation questions to the ML service
async function mlRecommend(q) {
    try {
        const params = new URLSearchParams({ q, top_n: "5" });
        const res = await fetch(`${ML_URL}/ai/recommend?${params}`);
        if (!res.ok) return null;
        const data = await res.json();
        return data?.recommendations || [];
    } catch {
        return null;
    }
}

const CASUAL_REPLIES = [
    "I'm doing great, thanks for asking! I'm Labby — ready to help with equipment, bookings, labs, or just chat. What's on your mind?",
    "All systems nominal! Labs are running, equipment is being booked, and I'm here if you need anything — equipment questions or casual conversation both work.",
    "I'm good! Just keeping an eye on inventory and maintenance queues. What can I do for you today?",
];

function casualReply(q) {
    if (/how are you|how's it going|hows it going|you ok|you okay/.test(q)) {
        return CASUAL_REPLIES[Math.floor(Math.random() * CASUAL_REPLIES.length)];
    }
    if (/thank|thanks|thx/.test(q)) {
        return "You're welcome! Happy to help — whether it's lab equipment or just a chat.";
    }
    if (/^(bye|goodbye|see you|gtg)/.test(q)) {
        return "See you later! Don't forget to return your equipment on time.";
    }
    if (/joke|funny|make me laugh/.test(q)) {
        return "Why did the electron go to the lab? To get a little positive feedback! ...Okay, I'll stick to equipment questions — those I can actually answer.";
    }
    if (/your name|who are you/.test(q)) {
        return "I'm Labby AI — the floating assistant inside LabMate AI at VFSTR. I chat casually, and I can also query the live lab database for equipment, bookings, and maintenance.";
    }
    if (/love|like you|awesome|great app|nice/.test(q)) {
        return "Aww, thanks! Glad LabMate AI is useful. Anything else — equipment, bookings, or just chatting?";
    }
    return null;
}

// Optional general-purpose chat via OpenAI-compatible API (set OPENAI_API_KEY in backend/.env)
async function chatLLM(message, role) {
    const key = process.env.OPENAI_API_KEY;
    if (!key) return null;
    try {
        const r = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify({
                model: process.env.OPENAI_MODEL || "gpt-4o-mini",
                max_tokens: 300,
                messages: [
                    { role: "system", content: `You are Labby AI, a friendly lab assistant inside LabMate AI at VFSTR (Vignan's Foundation). The user's role is "${role}". Keep replies short and warm. For equipment, booking, or maintenance questions, remind them you can fetch live data if they ask specifically, or guide them to the right page.` },
                    { role: "user", content: message }
                ]
            })
        });
        const d = await r.json();
        return d.choices?.[0]?.message?.content || null;
    } catch {
        return null;
    }
}

export const assistantChat = async (req, res) => {
    try {
        const { message } = req.body;
        if (typeof message !== "string" || message.trim().length < 2) {
            return res.status(400).json({ success: false, message: "Please send a message" });
        }
        const q = message.toLowerCase().trim();
        const user = req.user;
        const isStudent = user.role === "student";

        // --- Personal booking status / collection location / return date ---
        if (/my (booking|equipment|books)|status of my|collect|return.*(when|date|my)|issued to me/.test(q)) {
            const mine = await Booking.find({ user: user._id })
                .populate("equipment", "name")
                .sort({ createdAt: -1 }).limit(8);
            if (!mine.length) {
                return res.json({ success: true, reply: "You have no bookings yet. Search equipment and submit a booking request to get started." });
            }
            const lines = mine.map((b) =>
                `• ${b.equipment?.name} — ${b.status}` +
                (b.collectionLocation ? ` — collect at: ${b.collectionLocation}` : "") +
                (b.status === "issued" ? ` — due ${new Date(b.endTime).toLocaleDateString()}` : "")
            );
            return res.json({ success: true, reply: `Your bookings:\n${lines.join("\n")}`, data: { bookings: mine } });
        }

        // --- Pending approvals / overdue (staff) ---
        if (/pending|approv|overdue|late return/.test(q)) {
            if (isStudent) {
                const mine = await Booking.find({ user: user._id, status: "pending" }).populate("equipment", "name");
                return res.json({
                    success: true,
                    reply: mine.length
                        ? `You have ${mine.length} pending request(s):\n` + mine.map((b) => `• ${b.equipment?.name} — ${b.collectionLocation || "location pending"}`).join("\n")
                        : "You have no pending booking requests."
                });
            }
            const pending = await Booking.find({ status: "pending" }).populate("equipment", "name").populate("user", "name email").sort({ createdAt: 1 }).limit(10);
            const now = new Date();
            const overdue = await Booking.find({ status: "issued", endTime: { $lt: now } }).populate("equipment", "name").populate("user", "name email");
            let reply = pending.length
                ? `Pending booking requests (${pending.length}):\n` + pending.map((b) =>
                    `• ${b.user?.name} — ${b.equipment?.name} ×${b.quantity}${b.collectionLocation ? ` — collect at ${b.collectionLocation}` : ""}`).join("\n")
                : "No pending booking requests.";
            if (overdue.length) {
                reply += `\n\nOverdue returns (${overdue.length}):\n` + overdue.map((b) =>
                    `• ${b.user?.name} — ${b.equipment?.name} (due ${new Date(b.endTime).toLocaleDateString()})`).join("\n");
            }
            return res.json({ success: true, reply, data: { pending, overdue } });
        }

        // --- Maintenance / damage ---
        if (/maintenance|under repair|broken|damaged|fault|repair/.test(q)) {
            const records = await MaintenanceRecord.find({ status: { $in: ["reported", "pending", "under_maintenance"] } })
                .populate("equipment", "name").sort({ createdAt: -1 }).limit(10);
            return res.json({
                success: true,
                reply: records.length
                    ? `Open maintenance records:\n` + records.map((r) => `• ${r.equipment?.name} — ${r.status} [${r.priority}] ${r.title}`).join("\n")
                    : "No open maintenance records. All equipment is operational.",
                data: { records }
            });
        }

        // --- Usage stats ---
        if (/frequent|popular|most used|underutili[sz]|unused|idle|usage/.test(q)) {
            const since = new Date(Date.now() - 90 * 864e5);
            const bookings = await Booking.find({ status: { $in: ["approved", "issued", "completed"] }, createdAt: { $gte: since } })
                .populate("equipment", "name");
            const counts = {};
            bookings.forEach((b) => {
                const n = b.equipment?.name || "Unknown";
                counts[n] = (counts[n] || 0) + (b.quantity || 1);
            });
            const ranked = Object.entries(counts).sort((a, b) => b[1] - a[1]);
            if (!ranked.length) {
                return res.json({ success: true, reply: "Not enough booking history yet to compute usage stats. The Analytics page will populate as bookings accumulate." });
            }
            const isUnder = /underutili[sz]|unused|idle/.test(q);
            const slice = isUnder ? ranked.slice(-5).reverse() : ranked.slice(0, 5);
            return res.json({
                success: true,
                reply: `${isUnder ? "Least used equipment (last 90 days):" : "Most used equipment (last 90 days):"}\n` +
                    slice.map(([n, c], i) => `${i + 1}. ${n} — ${c} unit booking(s)`).join("\n"),
                data: { ranked }
            });
        }

        // --- Damage reports ---
        if (/damage report|complaint/.test(q)) {
            const filter = isStudent ? { reportedBy: user._id } : {};
            const reports = await DamageReport.find(filter).populate("equipment", "name").populate("reportedBy", "name").sort({ createdAt: -1 }).limit(8);
            return res.json({
                success: true,
                reply: reports.length
                    ? `Damage reports:\n` + reports.map((r) => `• ${r.equipment?.name} — ${r.status} [${r.priority}]: ${r.description.slice(0, 60)}`).join("\n")
                    : "No damage reports on record.",
                data: { reports }
            });
        }

        // --- Inventory/lab summary ---
        if (/how many (lab|laborator)|inventory|labs? (are|do) we have|list.*lab/.test(q)) {
            const labs = await Laboratory.find({ isActive: { $ne: false } });
            const grouped = await Equipment.aggregate([
                { $match: { status: { $ne: "retired" } } },
                { $group: { _id: "$laboratory", types: { $sum: 1 }, units: { $sum: "$totalQuantity" } } }
            ]);
            const byLab = {};
            grouped.forEach((g) => { byLab[g._id?.toString()] = g; });
            const reply = labs.length
                ? `Laboratories (${labs.length}):\n` + labs.map((l) => {
                    const g = byLab[l._id.toString()];
                    return `• ${l.name} (${l.roomNumber}) — ${g?.types || 0} equipment type(s), ${g?.units || 0} unit(s)`;
                }).join("\n")
                : "No laboratories found.";
            return res.json({ success: true, reply, data: { labs } });
        }

        // --- Availability overview ---
        if (/available equipment|what.*available|in stock/.test(q)) {
            const items = await Equipment.find({ status: "active", condition: "working" }).populate("laboratory", "name roomNumber");
            const availMap = await availableNow(items.map((i) => i._id));
            const free = items.map((e) => ({ ...e.toObject(), free: Math.max(0, e.totalQuantity - (availMap[e._id] || 0)) })).filter((e) => e.free > 0);
            return res.json({
                success: true,
                reply: free.length
                    ? `${free.length} equipment type(s) currently available:\n` + free.slice(0, 8).map((e) => eqLine(e, e.free)).join("\n")
                    : "No equipment is currently available for booking.",
                data: { count: free.length }
            });
        }

        // --- Project recommendations → ML service ---
        if (/recommend|suggest|project|need.*(equipment|kit|board)|looking for/.test(q)) {
            const recs = await mlRecommend(message.trim());
            if (recs === null) {
                return res.json({ success: true, reply: "The recommendation service is temporarily unavailable. Please try the AI Recommendations page." });
            }
            if (!recs.length) {
                // fall through to equipment search below
            } else {
                return res.json({
                    success: true,
                    reply: `AI recommendations for "${message.trim()}" (text-similarity — verify technical compatibility):\n` +
                        recs.map((r) => `• ${r.equipment_name} — ${r.category || "N/A"}, ${r.available_quantity} available`).join("\n"),
                    data: { recommendations: recs }
                });
            }
        }

        // --- Greeting / help ---
        if (/^(hi|hello|hey|help|what can you|who are you|good (morning|afternoon|evening)|how are you)/.test(q)) {
            return res.json({
                success: true,
                reply: "Hi! I'm Labby AI, your laboratory assistant — and yes, we can just chat too. Ask me about equipment locations, availability, bookings, maintenance, or usage stats. Or say 'how are you', 'tell me a joke', anything!"
            });
        }

        // --- Casual conversation (pattern-based) ---
        const casual = casualReply(q);
        if (casual) {
            return res.json({ success: true, reply: casual });
        }

        // --- Equipment search ---
        const eqAnswer = await answerEquipment(q, user);
        if (eqAnswer) {
            return res.json({ success: true, reply: eqAnswer });
        }

        // Keywords existed but no equipment matched → honest inventory miss
        if (keywords(q).length) {
            return res.json({
                success: true,
                reply: "I searched the current LabMate AI inventory (exact and partial name/category match) and could not find that equipment. Try a different spelling, a category name, or browse the Equipment catalog."
            });
        }

        // --- General chat via LLM (if configured) ---
        const llm = await chatLLM(message.trim(), user.role);
        if (llm) {
            return res.json({ success: true, reply: llm });
        }

        // --- Friendly fallback ---
        return res.json({
            success: true,
            reply: "Hmm, I'm not sure what you mean! I'm Labby — I can chat casually, or answer questions about equipment, lab locations, bookings, maintenance, and usage stats. Try one of those?"
        });
    } catch (error) {
        console.error("Assistant error:", error.message);
        return res.status(503).json({
            success: false,
            message: "I couldn't reach the database right now. This is a temporary error — please try again."
        });
    }
};
