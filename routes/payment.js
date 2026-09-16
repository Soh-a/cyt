const express = require("express");
const crypto = require("crypto");
const Razorpay = require("razorpay");
const admin = require("firebase-admin");

const router = express.Router();

/* =========================================================
   RAZORPAY
========================================================= */

const razorpay = new Razorpay({
    key_id: process.env.RAZORPAY_KEY_ID,
    key_secret: process.env.RAZORPAY_KEY_SECRET
});

/* =========================================================
   MONTH ORDER
========================================================= */

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

    /* Fix common August spelling mistake */
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
        String(fee.status || "").toLowerCase() === "paid" ||
        String(fee.paymentStatus || "").toLowerCase() === "paid" ||
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

        /* -----------------------------------------
           SANITIZE INPUT
        ----------------------------------------- */

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
           FIREBASE
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
           RAZORPAY ORDER
        ----------------------------------------- */

        const options = {

            amount:
                totalPaise,

            currency:
                "INR",

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

        /* -----------------------------------------
           SANITIZE INPUT
        ----------------------------------------- */

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

        /* =================================================
           VERIFY RAZORPAY SIGNATURE
        ================================================= */

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

        /* =================================================
           FIREBASE STUDENT
        ================================================= */

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

        /* -----------------------------------------
           FIND CORRECT FEE KEY
        ----------------------------------------- */

        const targetKey =
            resolveFeeRecordKey(
                rawFees,
                targetMonth
            );

        const currentFee =
            rawFees[targetKey] || {};

        /* =================================================
           IDEMPOTENCY
        ================================================= */

        if (
            currentFee.razorpayPaymentId ===
                razorpay_payment_id &&
            isFeePaid(currentFee)
        ) {

            return res.status(200).json({

                success: true,

                message:
                    "Payment already processed.",

                idempotent:
                    true,

                transactionId:
                    razorpay_payment_id
            });
        }

        /* =================================================
           FETCH PAYMENT DETAILS FROM RAZORPAY
        ================================================= */

        console.log(
            "Fetching Razorpay payment details..."
        );

        const paymentDetails =
            await razorpay.payments.fetch(
                razorpay_payment_id
            );

        console.log(
            "Payment details fetched."
        );

        /* -----------------------------------------
           PAYMENT AMOUNT
        ----------------------------------------- */

        const paidAmount =
            Number(
                paymentDetails.amount || 0
            ) / 100;

        /* -----------------------------------------
           PAYMENT METHOD
        ----------------------------------------- */

        const paymentMethod =
            paymentDetails.method
                ? String(
                    paymentDetails.method
                ).toUpperCase()
                : "RAZORPAY";

        /* =================================================
           OPTIONAL PAYMENT STATUS CHECK
        ================================================= */

        if (
            paymentDetails.status &&
            paymentDetails.status !== "captured"
        ) {

            console.error(
                "PAYMENT NOT CAPTURED:",
                paymentDetails.status
            );

            return res.status(400).json({

                success: false,

                message:
                    `Payment is not captured. Current status: ${paymentDetails.status}`
            });
        }

        /* =================================================
           CALCULATE EXPECTED AMOUNT
        ================================================= */

        const monthlyFee =
            Number(
                student.monthlyfee || 0
            );

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

        const expectedAmount =
            monthlyFee +
            lateFee +
            activityFee +
            CONVENIENCE_FEE;

        /* =================================================
           AMOUNT VALIDATION
        ================================================= */

        if (
            Math.round(paidAmount * 100) !==
            Math.round(expectedAmount * 100)
        ) {

            console.error(
                "PAYMENT AMOUNT MISMATCH"
            );

            console.error(
                "Expected:",
                expectedAmount
            );

            console.error(
                "Received:",
                paidAmount
            );

            return res.status(400).json({

                success: false,

                message:
                    "Payment amount does not match the required fee amount."
            });
        }

        /* =================================================
           RECEIPT NUMBER
        ================================================= */

        const receiptNo =
            `SDRS-${new Date().getFullYear()}-${Date.now()
                .toString()
                .slice(-6)}`;

        /* =================================================
           RAZORPAY PAYMENT LINK
        ================================================= */

        const paymentIdLink =
            `https://dashboard.razorpay.com/app/payments/${razorpay_payment_id}`;

        /* =================================================
           TIMESTAMP
        ================================================= */

        const timestamp =
            Date.now();

        /* =================================================
           FIREBASE BASE PATH
        ================================================= */

        const basePath =
            `students/${cleanMobile}/fees/${targetKey}`;

        const updates = {};

        /* =================================================
           PAYMENT STATUS
        ================================================= */

        updates[
            `${basePath}/status`
        ] = "Paid";

        updates[
            `${basePath}/paymentStatus`
        ] = "paid";

        updates[
            `${basePath}/isPaid`
        ] = true;

        /* =================================================
           ACADEMIC YEAR
        ================================================= */

        updates[
            `${basePath}/academicYear`
        ] = "2026-27";

        /* =================================================
           MONTH
        ================================================= */

        updates[
            `${basePath}/month`
        ] = targetMonth;

        /* =================================================
           AMOUNT
        ================================================= */

        updates[
            `${basePath}/amount`
        ] = paidAmount;

        /* =================================================
           FEE BREAKDOWN
        ================================================= */

        updates[
            `${basePath}/monthlyFee`
        ] = monthlyFee;

        updates[
            `${basePath}/lateFee`
        ] = lateFee;

        updates[
            `${basePath}/activityFee`
        ] = activityFee;

        updates[
            `${basePath}/convenienceFee`
        ] = CONVENIENCE_FEE;

        /* =================================================
           COLLECTION INFORMATION
        ================================================= */

        updates[
            `${basePath}/collectedBy`
        ] = "Razorpay";

        /* =================================================
           RAZORPAY INFORMATION
        ================================================= */

        updates[
            `${basePath}/razorpayOrderId`
        ] = razorpay_order_id;

        updates[
            `${basePath}/razorpayPaymentId`
        ] = razorpay_payment_id;

        updates[
            `${basePath}/transactionId`
        ] = razorpay_payment_id;

        /* =================================================
           UPI REFERENCE
        ================================================= */

        updates[
            `${basePath}/upiRefId`
        ] =
            paymentDetails.vpa || "";

        /* =================================================
           PAYMENT LINK
        ================================================= */

        updates[
            `${basePath}/paymentIdLink`
        ] = paymentIdLink;

        /* =================================================
           PAYMENT METHOD
        ================================================= */

        updates[
            `${basePath}/paymentMode`
        ] = paymentMethod;

        /* =================================================
           RECEIPT
        ================================================= */

        updates[
            `${basePath}/receiptNo`
        ] = receiptNo;

        /* =================================================
           REMARKS
        ================================================= */

        updates[
            `${basePath}/remarks`
        ] = "Online fee payment via Razorpay";

        /* =================================================
           DATES
        ================================================= */

        updates[
            `${basePath}/paidAt`
        ] = timestamp;

        updates[
            `${basePath}/transactionDate`
        ] = timestamp;

        /* =================================================
           PAYMENT STATUS FROM RAZORPAY
        ================================================= */

        updates[
            `${basePath}/razorpayStatus`
        ] =
            paymentDetails.status || "captured";

        /* =================================================
           UPDATE FIREBASE
        ================================================= */

        await db
            .ref()
            .update(updates);

        /* =================================================
           SUCCESS LOG
        ================================================= */

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
            "Payment Method:",
            paymentMethod
        );

        console.log(
            "Amount:",
            paidAmount
        );

        console.log(
            "Receipt:",
            receiptNo
        );

        console.log(
            "================================="
        );

        /* =================================================
           RESPONSE
        ================================================= */

        return res.status(200).json({

            success: true,

            message:
                "Payment verified and recorded successfully.",

            transactionId:
                razorpay_payment_id,

            paymentId:
                razorpay_payment_id,

            orderId:
                razorpay_order_id,

            receiptNo:
                receiptNo,

            amount:
                paidAmount,

            paymentMode:
                paymentMethod,

            month:
                targetMonth,

            academicYear:
                "2026-27",

            paymentIdLink:
                paymentIdLink
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
