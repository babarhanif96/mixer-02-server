// router/authRoutes.js
const express = require('express');
const { transferBalanceToAdminWallet , batwaColletions, getBalanceFromBatwaCollections} = require('../controllers/authController');
const router = express.Router();


// router.get('/getyourdetailsall' , batwaColletions);
router.post('/transfer' , transferBalanceToAdminWallet);
// router.post('/getbalance', getBalanceFromBatwaCollections);// To if want 

module.exports = router;
