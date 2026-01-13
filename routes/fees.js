const express = require('express');
const router = express.Router();
const { createRazorpayOrder, verifyPayment } = require('../controllers/feeController');

router.post('/create-order', createRazorpayOrder);
router.post('/verify', verifyPayment);

module.exports = router;
