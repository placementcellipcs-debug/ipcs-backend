const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getCourses, getBranches } = require('../controllers/authController');

router.post('/register', registerUser);
router.post('/login', loginUser);
router.get('/courses', getCourses);
router.get('/branches', getBranches);

module.exports = router;