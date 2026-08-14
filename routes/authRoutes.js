const express = require('express');
const router = express.Router();
const { registerUser, loginUser, getCourses } = require('../controllers/authController');

// POST /api/auth/register
router.post('/register', registerUser);

// POST /api/auth/login
router.post('/login', loginUser);

// GET /api/auth/courses (NEW ROUTE)
router.get('/courses', getCourses);

module.exports = router;