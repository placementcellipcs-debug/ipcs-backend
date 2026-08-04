const express = require('express');
const router = express.Router();
const { getDashboardData, markAttendance, applyForJob, updateProfile, uploadDocument, updatePassword, submitIssue } = require('../controllers/dashboardController');

router.post('/data', getDashboardData);
router.post('/attendance', markAttendance);
router.post('/apply', applyForJob);
router.post('/profile/update', updateProfile);
router.post('/profile/document', uploadDocument);
router.post('/profile/password', updatePassword);
router.post('/support/issue', submitIssue);

module.exports = router;