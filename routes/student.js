const express = require('express');
const router = express.Router();
const admin = require('firebase-admin');
const db = admin.database();

// GET all students
router.get('/', async (req, res) => {
    try {
        // Adjust path if your students are under "students"
        const snapshot = await db.ref("/").once("value"); 
        const data = snapshot.val();
        if (!data) return res.status(404).json({ message: "No students found" });
        res.json(data);
    } catch (err) {
        console.error(err);
        res.status(500).json({ message: "Server error" });
    }
});

module.exports = router;
