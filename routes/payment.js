const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

const router = express.Router();

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

const MONTHS_ORDER = [
    "april", "may", "june", "july", "august", "september",
    "october", "november", "december", "january", "february", "march"
];

function sanitizeMobile(mobile) {
    if (!mobile) return "";
    return String(mobile).trim().replace(/\D/g, "");
}

function normalizeMonth(month) {
    if (!month) return "";
    const clean = String(month).toLowerCase().trim();
    if (clean.includes("agust")) return "august";
    return MONTHS_ORDER.find(m => clean.includes(m)) || "";
}

function resolveFeeRecordKey(feesData, targetMonth) {
    if (!feesData) return targetMonth;
    const existingKeys = Object.keys(feesData);
    const matchedKey = existingKeys.find(k => {
        const clean = k.toLowerCase().trim();
        return clean.includes(targetMonth) || (targetMonth === "august" && clean.includes("agust"));
    });
    return matchedKey || targetMonth;
}

// POST /api/payment/order
router.post("/order", async (req, res) => {
    try {
        const { mobile, month, session } = req.body;
        const cleanMobile = sanitizeMobile(mobile);
        const targetMonth = normalizeMonth(month);

        if (!cleanMobile || cleanMobile.length < 10) {
            return res.status(400).json({ success: false, message: "Invalid student mobile number." });
        }
        if (!targetMonth) {
            return res.status(400).json({ success: false, message: "Invalid fee month requested." });
        }

        const db = admin.database();
        const studentRef = db.ref(`students/${cleanMobile}`);
        const snapshot = await studentRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: "Student record not found." });
        }

        const student = snapshot.val();
        const rawFees = student.fees || {};

        // Sequential Check
        const targetIdx = MONTHS_ORDER.indexOf(targetMonth);
        for (let i = 0; i < targetIdx; i++) {
            const prevMonth = MONTHS_ORDER[i];
            const prevKey = resolveFeeRecordKey(rawFees, prevMonth);
            const prevFee = rawFees[prevKey] || {};
            const isPaid = prevFee.status === "paid" || prevFee.paymentStatus === "paid" || prevFee.isPaid === true;
            if (!isPaid) {
                return res.status(400).json({ 
                    success: false, 
                    message: `Sequential Payment Violation: Must pay ${prevMonth.toUpperCase()} first.` 
                });
            }
        }

        const targetKey = resolveFeeRecordKey(rawFees, targetMonth);
        const currentFee = rawFees[targetKey] || {};
        const isAlreadyPaid = currentFee.status === "paid" || currentFee.paymentStatus === "paid" || currentFee.isPaid === true;

        if (isAlreadyPaid) {
            return res.status(400).json({ success: false, message: "This month's fee is already paid." });
        }

        const monthlyFee = Number(student.monthlyfee || 0);
        const lateFee = Number(currentFee.fine || currentFee.lateFee || 0);
        const activityFee = Number(currentFee.activity || currentFee.activityFee || 0);
        const convenienceFee = 15;

        const totalRupees = monthlyFee + lateFee + activityFee + convenienceFee;
        const totalPaise = totalRupees * 100;

        const options = {
            amount: totalPaise,
            currency: "INR",
            receipt: `rcpt_${cleanMobile}_${targetMonth}_${Date.now().toString().slice(-6)}`,
            notes: {
                studentMobile: cleanMobile,
                month: targetMonth,
                session: session || "2026-27"
            }
        };

        const order = await razorpay.orders.create(options);

        return res.status(200).json({
            success: true,
            orderId: order.id,
            amount: order.amount,
            currency: order.currency,
            keyId: process.env.RAZORPAY_KEY_ID
        });

    } catch (err) {
        console.error("Order Creation Error:", err);
        return res.status(500).json({ success: false, message: "Failed to initialize payment order with gateway." });
    }
});

// POST /api/payment/verify
router.post("/verify", async (req, res) => {
    try {
        const { mobile, month, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
        const cleanMobile = sanitizeMobile(mobile);
        const targetMonth = normalizeMonth(month);

        if (!cleanMobile || !targetMonth || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
            return res.status(400).json({ success: false, message: "Missing required verification parameters." });
        }

        // Cryptographic HMAC Verification
        const generatedSignature = crypto
            .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest("hex");

        const isSignatureValid = crypto.timingSafeEqual(
            Buffer.from(generatedSignature, "utf-8"),
            Buffer.from(razorpay_signature, "utf-8")
        );

        if (!isSignatureValid) {
            return res.status(400).json({ success: false, message: "Invalid payment signature." });
        }

        const db = admin.database();
        const studentRef = db.ref(`students/${cleanMobile}`);
        const snapshot = await studentRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({ success: false, message: "Student record not found." });
        }

        const student = snapshot.val();
        const rawFees = student.fees || {};
        const targetKey = resolveFeeRecordKey(rawFees, targetMonth);
        const currentFee = rawFees[targetKey] || {};

        // Idempotency check
        if (currentFee.razorpayPaymentId === razorpay_payment_id && currentFee.status === "paid") {
            return res.status(200).json({ success: true, message: "Payment already processed.", idempotent: true });
        }

        const monthlyFee = Number(student.monthlyfee || 0);
        const lateFee = Number(currentFee.fine || currentFee.lateFee || 0);
        const activityFee = Number(currentFee.activity || currentFee.activityFee || 0);
        const convenienceFee = 15;
        const finalAmount = monthlyFee + lateFee + activityFee + convenienceFee;

        const timestamp = Date.now();
        const updates = {};
        const basePath = `students/${cleanMobile}/fees/${targetKey}`;

        updates[`${basePath}/status`] = "paid";
        updates[`${basePath}/paymentStatus`] = "paid";
        updates[`${basePath}/isPaid`] = true;
        updates[`${basePath}/razorpayOrderId`] = razorpay_order_id;
        updates[`${basePath}/razorpayPaymentId`] = razorpay_payment_id;
        updates[`${basePath}/transactionId`] = razorpay_payment_id;
        updates[`${basePath}/upiRefId`] = razorpay_payment_id;
        updates[`${basePath}/paymentMode`] = "Online/Razorpay";
        updates[`${basePath}/convenienceFee`] = convenienceFee;
        updates[`${basePath}/amount`] = finalAmount;
        updates[`${basePath}/paidAt`] = timestamp;
        updates[`${basePath}/transactionDate`] = timestamp;

        await db.ref().update(updates);

        return res.status(200).json({
            success: true,
            message: "Payment verified and recorded successfully.",
            transactionId: razorpay_payment_id
        });

    } catch (err) {
        console.error("Verification Error:", err);
        return res.status(500).json({ success: false, message: "Server error while processing payment verification." });
    }
});

module.exports = router;
