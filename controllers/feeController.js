const Razorpay = require('razorpay');
const crypto = require('crypto');
const { db } = require('../server');

const razorpay = new Razorpay({
    key_id: 'YOUR_RAZORPAY_KEY_ID',
    key_secret: 'YOUR_RAZORPAY_KEY_SECRET'
});

// Create order
const createRazorpayOrder = async (req, res) => {
    const { studentKey, amount } = req.body; // amount in INR

    const options = {
        amount: amount * 100, // in paise
        currency: "INR",
        receipt: `receipt_${studentKey}_${Date.now()}`,
    };

    try {
        const order = await razorpay.orders.create(options);
        res.json(order);
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
};

// Verify payment
const verifyPayment = async (req, res) => {
    const { studentKey, razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;

    const hmac = crypto.createHmac('sha256', razorpay.key_secret);
    hmac.update(razorpay_order_id + "|" + razorpay_payment_id);
    const generatedSignature = hmac.digest('hex');

    if (generatedSignature === razorpay_signature) {
        // Update student fee payment in Firebase
        const studentRef = db.collection('students').doc(studentKey);
        await studentRef.update({ feePaid: true, paymentId: razorpay_payment_id });

        res.json({ success: true, message: 'Payment verified successfully' });
    } else {
        res.status(400).json({ success: false, message: 'Payment verification failed' });
    }
};

module.exports = { createRazorpayOrder, verifyPayment };
