const express = require("express");
const router = express.Router();

const paymentController = require("../controllers/payment");

// 1. Auto fine check
router.get("/check-fines/:studentKey", paymentController.checkFines);

// 2. Create Razorpay order
router.post("/create-order", paymentController.createOrder);

// 3. Verify payment and update Firebase
router.post("/verify-payment", paymentController.verifyPayment);

module.exports = router;
