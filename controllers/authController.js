const admin = require('firebase-admin');

exports.studentLogin = async (req, res) => {
    try {
        const { username, password } = req.body;

        const db = admin.database();
       const studentRef = db.ref(key);

        ref.once("value", snapshot => {
            if (!snapshot.exists()) {
                return res.status(404).json({ message: "Student Not Found" });
            }

            const data = snapshot.val();

            if (data.password === password) {
                return res.json({ message: "Login Successful", student: data });
            } else {
                return res.status(401).json({ message: "Wrong Password" });
            }
        });

    } catch (err) {
        return res.status(500).json({ message: err.message });
    }
};
