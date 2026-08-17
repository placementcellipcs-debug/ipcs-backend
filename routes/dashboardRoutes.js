const express = require('express');
const router = express.Router();
const dashboardController = require('../controllers/dashboardController');
const { getStudyMaterialsList, streamMaterialPdf } = require('../controllers/studyMaterialController');
const { getAptitudeTest, submitAptitudeTest, getTestHistory, getLeaderboard, getSpecificTest, submitSpecificTest } = require('../controllers/aptitudeController');

// Dashboard endpoints
router.post('/data', dashboardController.getDashboardData);
router.post('/attendance', dashboardController.markAttendance);
router.post('/apply', dashboardController.applyForJob);

// Event Registration Endpoint
router.post('/drive-response', dashboardController.submitDriveResponse);

// Profile & Settings endpoints
router.post('/profile/update', dashboardController.updateProfile);
router.post('/profile/document', dashboardController.uploadDocument);
router.post('/profile/password', dashboardController.updatePassword);

// Support
router.post('/support/issue', dashboardController.submitIssue);

// Study Materials
router.post('/study-materials', getStudyMaterialsList);
router.post('/study-materials/stream', streamMaterialPdf);

// Aptitude Assessment Endpoints
router.post('/aptitude/start', getAptitudeTest);
router.post('/aptitude/submit', submitAptitudeTest);
router.post('/aptitude/history', getTestHistory);
router.get('/aptitude/leaderboard', getLeaderboard);

// NEW: Talentino & Technical Exam Endpoints
router.post('/exam/start', getSpecificTest);
router.post('/exam/submit', submitSpecificTest);

// EXPORT MUST ALWAYS BE AT THE VERY BOTTOM
module.exports = router;