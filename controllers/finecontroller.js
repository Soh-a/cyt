const admin = require("firebase-admin");
const db = admin.database();

exports.waiveFine = async (req, res) => {
    try {
        const { studentId, month } = req.body;

        if (!studentId || !month)
            return res.status(400).json({ message: "Missing required fields" });

        await db.ref(`students/${studentId}/fees/${month.toLowerCase()}`).update({
            fine: 0,
            fineWaived: true,
            fineWaivedDate: new Date().toISOString()
        });

        return res.json({ message: "Fine waived successfully" });

    } catch (error) {
        console.log("Fine waive error:", error);
        return res.status(500).json({ message: "Server error" });
    }
};
