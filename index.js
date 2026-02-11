const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const cron = require('node-cron');

const app = express();

app.use(cors());
app.use(express.json());

// ----------------------
// Firebase Initialization
// ----------------------
const serviceAccount = require('./firebaseServiceAccountKey.json');

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: "https://students-6e271-default-rtdb.firebaseio.com/"
});

const db = admin.database();

// ----------------------
// Routes Import
// ----------------------
const authRoutes = require('./routes/auth');
const paymentRoutes = require('./routes/payment');
const fineRoutes = require('./routes/fine');
const studentsRoutes = require('./routes/students');
app.use('/api/students', studentsRoutes);

// ----------------------
// Routes Mount
// ----------------------
app.use('/api/auth', authRoutes);
app.use('/api/payment', paymentRoutes); // only ONCE
app.use('/api/fine', fineRoutes);

// ----------------------
// AUTO APPLY FINE SYSTEM
// Runs every day at 12:01 AM
// ----------------------
cron.schedule('1 0 * * *', async () => {
    console.log("Running daily fine check...");

    const ref = db.ref("/");
    const snapshot = await ref.once("value");

    const data = snapshot.val();
    if (!data) return;

    const months = [
        "april", "may", "june", "july", "august", "september",
        "october", "november", "december", "january", "february", "march"
    ];

    const today = new Date();
    const currentDay = today.getDate();

    for (let studentId in data) {
        const student = data[studentId];
        if (!student.fees) continue;

        months.forEach(month => {
            const fee = student.fees[month];
            if (!fee) return;

            if (fee.status === "unpaid" && !fee.fineWaived) {
                if (currentDay > 20 && fee.fine === 0) {
                    db.ref(`${studentId}/fees/${month}`).update({
                        fine: 500,
                        fineAppliedDate: new Date().toISOString()
                    });
                    console.log(`Fine applied for ${studentId} - Month: ${month}`);
                }
            }
        });
    }
});

// ----------------------
// Start Server
// ----------------------
const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});

