const admin = require("firebase-admin");
const Razorpay = require("razorpay");

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: "rzp_live_Rj5xUBobFRRWHb",
    key_secret: "SWdeCBNrytsbdmfSVn0WLA7W",
});

// -------------------------------
// 1. CHECK & UPDATE FINES
// -------------------------------
exports.checkFines = async (req, res) => {
    try {
        const { studentKey } = req.params;

        const db = admin.database();
        const ref = db.ref(`students/${studentKey}/fees`);
        
        const snapshot = await ref.once("value");
        const fees = snapshot.val();

        if (!fees) return res.json({ success: true, message: "No fees found" });

        const today = new Date();
        const currentDate = today.getDate();

        for (const month in fees) {
            const entry = fees[month];

            // apply ₹500 fine ONLY after 20th
            if (entry.status === "unpaid" && currentDate > 20) {
                await ref.child(month).update({ fine: 500 });
            }
        }

        res.json({ success: true, message: "Fines checked & updated" });

    } catch (error) {
        console.error("Fine update error:", error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
};


// -------------------------------
// 2. CREATE RAZORPAY ORDER
// -------------------------------
exports.createOrder = async (req, res) => {
    try {
        const { amount, month, studentKey } = req.body;

        if (!amount || !month || !studentKey) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        const options = {
            amount: amount * 100,   // Razorpay amount in paise
            currency: "INR",
            receipt: `receipt_${studentKey}_${month}`
        };

        const order = await razorpay.orders.create(options);

        res.json({
            success: true,
            orderId: order.id,
            amount: amount,
            month: month
        });

    } catch (error) {
        console.error("Order creation error:", error);
        res.status(500).json({ success: false, message: "Order creation failed" });
    }
};


// -------------------------------
// 3. PAYMENT SUCCESS → UPDATE FIREBASE
// -------------------------------
exports.verifyPayment = async (req, res) => {
    try {
        const { studentKey, month, paymentId } = req.body;

        if (!studentKey || !month || !paymentId) {
            return res.status(400).json({ success: false, message: "Missing fields" });
        }

        const db = admin.database();
        const ref = db.ref(`students/${studentKey}/fees/${month}`);

        await ref.update({
            status: "paid",
            fine: 0,
            paymentId: paymentId,
            paidAt: new Date().toISOString()
        });

        res.json({ success: true, message: "Payment recorded successfully" });

    } catch (error) {
        console.error("Payment update error:", error);
        res.status(500).json({ success: false, message: "Server error" });
    }
};

