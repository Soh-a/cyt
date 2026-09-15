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
    "april",
    "may",
    "june",
    "july",
    "august",
    "september",
    "october",
    "november",
    "december",
    "january",
    "february",
    "march"
];

const CONVENIENCE_FEE = 15;

/* =========================================================
   HELPERS
========================================================= */

function sanitizeMobile(mobile) {
    if (!mobile) return "";
    return String(mobile)
        .trim()
        .replace(/\D/g, "");
}

function normalizeMonth(month) {
    if (!month) return "";

    const clean = String(month)
        .toLowerCase()
        .trim();

    if (clean.includes("agust")) {
        return "august";
    }

    return (
        MONTHS_ORDER.find(monthName =>
            clean.includes(monthName)
        ) || ""
    );
}

function resolveFeeRecordKey(feesData, targetMonth) {
    if (!feesData) {
        return targetMonth;
    }

    const existingKeys = Object.keys(feesData);

    const matchedKey = existingKeys.find(key => {
        const clean = key
            .toLowerCase()
            .trim();

        return (
            clean.includes(targetMonth) ||
            (
                targetMonth === "august" &&
                clean.includes("agust")
            )
        );
    });

    return matchedKey || targetMonth;
}

function isFeePaid(fee) {
    if (!fee) return false;

    return (
        fee.status === "paid" ||
        fee.paymentStatus === "paid" ||
        fee.isPaid === true
    );
}

/* =========================================================
   CREATE RAZORPAY ORDER
   POST /api/payment/order
========================================================= */

router.post("/order", async (req, res) => {
    try {
        const {
            mobile,
            month,
            session
        } = req.body;

        console.log("=================================");
        console.log("PAYMENT ORDER REQUEST");
        console.log("Mobile:", mobile);
        console.log("Month:", month);
        console.log("Session:", session);
        console.log("=================================");

        const cleanMobile =
            sanitizeMobile(mobile);

        const targetMonth =
            normalizeMonth(month);

        /* -----------------------------------------
           VALIDATION
        ----------------------------------------- */

        if (
            !cleanMobile ||
            cleanMobile.length < 10
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid student mobile number."
            });
        }

        if (!targetMonth) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid fee month requested."
            });
        }

        /* -----------------------------------------
           FIREBASE STUDENT
        ----------------------------------------- */

        const db = admin.database();

        const studentRef =
            db.ref(`students/${cleanMobile}`);

        const snapshot =
            await studentRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({
                success: false,
                message:
                    "Student record not found."
            });
        }

        const student =
            snapshot.val();

        const rawFees =
            student.fees || {};

        /* -----------------------------------------
           SEQUENTIAL PAYMENT CHECK
        ----------------------------------------- */

        const targetIndex =
            MONTHS_ORDER.indexOf(targetMonth);

        for (
            let i = 0;
            i < targetIndex;
            i++
        ) {
            const previousMonth =
                MONTHS_ORDER[i];

            const previousKey =
                resolveFeeRecordKey(
                    rawFees,
                    previousMonth
                );

            const previousFee =
                rawFees[previousKey] || {};

            if (!isFeePaid(previousFee)) {
                return res.status(400).json({
                    success: false,
                    message:
                        `Sequential Payment Violation: Must pay ${previousMonth.toUpperCase()} first.`
                });
            }
        }

        /* -----------------------------------------
           CURRENT MONTH
        ----------------------------------------- */

        const targetKey =
            resolveFeeRecordKey(
                rawFees,
                targetMonth
            );

        const currentFee =
            rawFees[targetKey] || {};

        if (isFeePaid(currentFee)) {
            return res.status(400).json({
                success: false,
                message:
                    "This month's fee is already paid."
            });
        }

        /* -----------------------------------------
           FEE CALCULATION
        ----------------------------------------- */

        const monthlyFee =
            Number(student.monthlyfee || 0);

        const lateFee =
            Number(
                currentFee.fine ||
                currentFee.lateFee ||
                0
            );

        const activityFee =
            Number(
                currentFee.activity ||
                currentFee.activityFee ||
                0
            );

        const totalRupees =
            monthlyFee +
            lateFee +
            activityFee +
            CONVENIENCE_FEE;

        if (totalRupees <= 0) {
            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment amount."
            });
        }

        const totalPaise =
            Math.round(totalRupees * 100);

        /* -----------------------------------------
           RAZORPAY ORDER OPTIONS
        ----------------------------------------- */

        const options = {
            amount: totalPaise,
            currency: "INR",

            receipt:
                `rcpt_${cleanMobile}_${targetMonth}_${Date.now()
                    .toString()
                    .slice(-6)}`,

            notes: {
                studentMobile:
                    cleanMobile,

                month:
                    targetMonth,

                session:
                    session || "2026-27"
            }
        };

        console.log(
            "Creating Razorpay order..."
        );

        console.log(
            "Amount:",
            totalRupees,
            "INR"
        );

        /* -----------------------------------------
           CREATE ORDER
        ----------------------------------------- */

        const order =
            await razorpay.orders.create(
                options
            );

        console.log(
            "Razorpay order created:",
            order.id
        );

        return res.status(200).json({
            success: true,

            orderId:
                order.id,

            amount:
                order.amount,

            currency:
                order.currency,

            keyId:
                process.env.RAZORPAY_KEY_ID
        });

    } catch (error) {

        console.error(
            "ORDER CREATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Failed to initialize payment order with gateway."
        });
    }
});

/* =========================================================
   VERIFY RAZORPAY PAYMENT
   POST /api/payment/verify
========================================================= */

router.post("/verify", async (req, res) => {
    try {

        const {
            mobile,
            month,
            razorpay_order_id,
            razorpay_payment_id,
            razorpay_signature
        } = req.body;

        console.log(
            "Payment verification request:",
            {
                mobile,
                month,
                razorpay_order_id,
                razorpay_payment_id
            }
        );

        const cleanMobile =
            sanitizeMobile(mobile);

        const targetMonth =
            normalizeMonth(month);

        /* -----------------------------------------
           VALIDATION
        ----------------------------------------- */

        if (
            !cleanMobile ||
            !targetMonth ||
            !razorpay_order_id ||
            !razorpay_payment_id ||
            !razorpay_signature
        ) {
            return res.status(400).json({
                success: false,
                message:
                    "Missing required verification parameters."
            });
        }

        /* -----------------------------------------
           CREATE EXPECTED SIGNATURE
        ----------------------------------------- */

        const generatedSignature =
            crypto
                .createHmac(
                    "sha256",
                    process.env.RAZORPAY_KEY_SECRET
                )
                .update(
                    `${razorpay_order_id}|${razorpay_payment_id}`
                )
                .digest("hex");

        const generatedBuffer =
            Buffer.from(
                generatedSignature,
                "utf8"
            );

        const receivedBuffer =
            Buffer.from(
                razorpay_signature,
                "utf8"
            );

        /* -----------------------------------------
           SAFE SIGNATURE COMPARISON
        ----------------------------------------- */

        const isSignatureValid =
            generatedBuffer.length ===
                receivedBuffer.length &&
            crypto.timingSafeEqual(
                generatedBuffer,
                receivedBuffer
            );

        if (!isSignatureValid) {

            console.error(
                "INVALID RAZORPAY SIGNATURE"
            );

            return res.status(400).json({
                success: false,
                message:
                    "Invalid payment signature."
            });
        }

        console.log(
            "Razorpay signature verified."
        );

        /* -----------------------------------------
           FIND STUDENT
        ----------------------------------------- */

        const db =
            admin.database();

        const studentRef =
            db.ref(`students/${cleanMobile}`);

        const snapshot =
            await studentRef.once("value");

        if (!snapshot.exists()) {
            return res.status(404).json({
                success: false,
                message:
                    "Student record not found."
            });
        }

        const student =
            snapshot.val();

        const rawFees =
            student.fees || {};

        const targetKey =
            resolveFeeRecordKey(
                rawFees,
                targetMonth
            );

        const currentFee =
            rawFees[targetKey] || {};

        /* -----------------------------------------
           IDEMPOTENCY
        ----------------------------------------- */

        if (
            currentFee.razorpayPaymentId ===
                razorpay_payment_id &&
            currentFee.status === "paid"
        ) {

            return res.status(200).json({
                success: true,
                message:
                    "Payment already processed.",
                idempotent: true,
                transactionId:
                    razorpay_payment_id
            });
        }

        /* -----------------------------------------
           CALCULATE FINAL AMOUNT
        ----------------------------------------- */

        const monthlyFee =
            Number(student.monthlyfee || 0);

        const lateFee =
            Number(
                currentFee.fine ||
                currentFee.lateFee ||
                0
            );

        const activityFee =
            Number(
                currentFee.activity ||
                currentFee.activityFee ||
                0
            );

        const finalAmount =
            monthlyFee +
            lateFee +
            activityFee +
            CONVENIENCE_FEE;

        /* -----------------------------------------
           FIREBASE UPDATE
        ----------------------------------------- */

        const timestamp =
            Date.now();

        const basePath =
            `students/${cleanMobile}/fees/${targetKey}`;

        const updates = {};

        updates[
            `${basePath}/status`
        ] = "paid";

        updates[
            `${basePath}/paymentStatus`
        ] = "paid";

        updates[
            `${basePath}/isPaid`
        ] = true;

        updates[
            `${basePath}/razorpayOrderId`
        ] = razorpay_order_id;

        updates[
            `${basePath}/razorpayPaymentId`
        ] = razorpay_payment_id;

        updates[
            `${basePath}/transactionId`
        ] = razorpay_payment_id;

        updates[
            `${basePath}/upiRefId`
        ] = razorpay_payment_id;

        updates[
            `${basePath}/paymentMode`
        ] = "Online/Razorpay";

        updates[
            `${basePath}/convenienceFee`
        ] = CONVENIENCE_FEE;

        updates[
            `${basePath}/amount`
        ] = finalAmount;

        updates[
            `${basePath}/paidAt`
        ] = timestamp;

        updates[
            `${basePath}/transactionDate`
        ] = timestamp;

        await db
            .ref()
            .update(updates);

        console.log(
            "================================="
        );

        console.log(
            "PAYMENT SUCCESSFULLY RECORDED"
        );

        console.log(
            "Student:",
            cleanMobile
        );

        console.log(
            "Month:",
            targetMonth
        );

        console.log(
            "Payment ID:",
            razorpay_payment_id
        );

        console.log(
            "Amount:",
            finalAmount
        );

        console.log(
            "================================="
        );

        return res.status(200).json({
            success: true,
            message:
                "Payment verified and recorded successfully.",
            transactionId:
                razorpay_payment_id
        });

    } catch (error) {

        console.error(
            "VERIFICATION ERROR:",
            error
        );

        return res.status(500).json({
            success: false,
            message:
                "Server error while processing payment verification."
        });
    }
});


/* =========================================================
   EXPORT ROUTER
========================================================= */

module.exports = router;
