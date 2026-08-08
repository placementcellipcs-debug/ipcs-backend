const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');

// Dashboard endpoints
router.post('/data', dashboardController.getDashboardData);
router.post('/attendance', dashboardController.markAttendance);
router.post('/apply', dashboardController.applyForJob);

// Profile & Settings endpoints
router.post('/profile/update', dashboardController.updateProfile);
router.post('/profile/document', dashboardController.uploadDocument);
router.post('/profile/password', dashboardController.updatePassword);

// Support
router.post('/support/issue', dashboardController.submitIssue);

module.exports = router;