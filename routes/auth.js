const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');

// Login Route
router.post('/login', async (req, res) => {
    const { key, password } = req.body;

    try {
        const db = admin.database();
       const studentRef = db.ref(key);

        studentRef.once("value", (snapshot) => {
            if (!snapshot.exists()) {
                return res.json({ success: false, message: "Student Not Found" });
            }

            const student = snapshot.val();

            if (student.password === password) {
                return res.json({ success: true, message: "Login Successful", student });
            } else {
                return res.json({ success: false, message: "Invalid Password" });
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, message: "Server Error" });
    }
});

module.exports = router;
