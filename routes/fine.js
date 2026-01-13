const express = require("express");
const router = express.Router();
const { waiveFine } = require("../controllers/finecontroller");

router.post("/waive", waiveFine);

module.exports = router;
