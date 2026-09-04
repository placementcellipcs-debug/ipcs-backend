const jwt = require('jsonwebtoken');

const authenticateToken = (req, res, next) => {
    // Look for the token in the headers
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Format: "Bearer <token>"

    if (!token) {
        return res.status(401).json({ success: false, message: "Access Denied. No token provided." });
    }

    jwt.verify(token, process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', (err, user) => {
        if (err) return res.status(403).json({ success: false, message: "Invalid or expired token. Please log in again." });
        
        req.user = user; // Attach the decoded user payload to the request
        next(); // Proceed to the actual route
    });
};

module.exports = authenticateToken;