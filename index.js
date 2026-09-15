require("dotenv").config();
const express = require("express");
const cors = require("cors");
const admin = require("firebase-admin");
const cron = require("node-cron");

const app = express();

// ----------------------
// CORS Configuration
// ----------------------
const allowedOrigins = [
    "http://localhost:3000",
    "http://127.0.0.1:5500",
    process.env.feeguio.vercel.app // e.g., https://your-vercel-domain.vercel.app
].filter(Boolean);

app.use(cors({
    origin: function (origin, callback) {
        if (!origin || allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            callback(new Error("CORS validation failed for origin."));
        }
    },
    credentials: true
}));

app.use(express.json());

// ----------------------
// Firebase Initialization
// ----------------------
if (!admin.apps.length) {
    admin.initializeApp({
        credential: admin.credential.cert(
            JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT)
        ),
        databaseURL: process.env.FIREBASE_DATABASE_URL || process.env.FIREBASE_DB_URL
    });
}

const db = admin.database();

// ----------------------
// Routes Import
// ----------------------
const authRoutes = require("./routes/auth");
const paymentRoutes = require("./routes/payment");
const fineRoutes = require("./routes/fine");
const studentsRoutes = require("./routes/students");

// ----------------------
// Routes Mount
// ----------------------
app.use("/api/students", studentsRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/fine", fineRoutes);

// Health check endpoint for Render monitoring
app.get("/health", (req, res) => {
    res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

// ----------------------
// AUTO APPLY FINE SYSTEM
// ----------------------
cron.schedule("1 0 * * *", async () => {
    console.log("Running daily fine check...");

    try {
        const ref = db.ref("students");
        const snapshot = await ref.once("value");
        const data = snapshot.val();
        if (!data) return;

        const months = [
            "april", "may", "june", "july", "august", "september",
            "october", "november", "december", "january", "february", "march"
        ];

        const today = new Date();
        const currentDay = today.getDate();

        for (let studentId in data) {
            const student = data[studentId];
            if (!student || !student.fees) continue;

            months.forEach(month => {
                // Support variations like "August" or "agust" in legacy data
                const feeKey = Object.keys(student.fees).find(k => {
                    const clean = k.toLowerCase().trim();
                    return clean.includes(month) || (month === "august" && clean.includes("agust"));
                }) || month;

                const fee = student.fees[feeKey];
                if (!fee) return;

                const rawStatus = fee.status || fee.paymentStatus || fee.isPaid;
                const isPaid = rawStatus === true || String(rawStatus).toLowerCase().trim() === "paid";

                if (!isPaid && !fee.fineWaived) {
                    if (currentDay > 20 && Number(fee.fine || fee.lateFee || 0) === 0) {
                        db.ref(`students/${studentId}/fees/${feeKey}`).update({
                            fine: 500,
                            fineAppliedDate: new Date().toISOString()
                        });
                        console.log(`Fine applied for ${studentId} - Month: ${feeKey}`);
                    }
                }
            });
        }
    } catch (err) {
        console.error("Error executing daily fine check:", err);
    }
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Sai DRS Payment Security Server running on port ${PORT}`);
});
