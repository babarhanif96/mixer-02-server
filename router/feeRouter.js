const express = require('express');
const { updateFees, createFees, getFees, verifyPassword } = require('../controllers/feeController');

// const {  admin, protect } = require('../controllers/authController');

const router = express.Router();
router.get('/', getFees);
router.post('/create', createFees);
// Update fees
router.put('/update', updateFees);
router.post('/verify-password', verifyPassword);


module.exports = router;
