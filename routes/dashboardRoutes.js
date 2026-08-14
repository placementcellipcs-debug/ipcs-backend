const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { getStudyMaterialsList, streamMaterialPdf } = require('../controllers/studyMaterialController');

// Dashboard endpoints
router.post('/data', dashboardController.getDashboardData);
router.post('/attendance', dashboardController.markAttendance);
router.post('/apply', dashboardController.applyForJob);

// NEW: Event Registration Endpoint
router.post('/drive-response', dashboardController.submitDriveResponse); // <--- ADD THIS LINE

// Profile & Settings endpoints
router.post('/profile/update', dashboardController.updateProfile);
router.post('/profile/document', dashboardController.uploadDocument);
router.post('/profile/password', dashboardController.updatePassword);

// Support
router.post('/support/issue', dashboardController.submitIssue);

module.exports = router;

router.post('/study-materials', getStudyMaterialsList);
router.post('/study-materials/stream', streamMaterialPdf);

const { getAptitudeTest, submitAptitudeTest, getTestHistory } = require('../controllers/aptitudeController');

// Aptitude Assessment Endpoints
router.post('/aptitude/start', getAptitudeTest);
router.post('/aptitude/submit', submitAptitudeTest);
router.post('/aptitude/history', getTestHistory);