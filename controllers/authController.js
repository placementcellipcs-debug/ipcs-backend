const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');

// ==========================================
// LOGIN FUNCTION
// ==========================================
const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        
        if (!email || !password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // Fetch the Data sheet
        const response = await googleSheets.spreadsheets.values.get({
            auth,
            spreadsheetId,
            range: "Data!A:AD"
        });

        const rows = response.data.values || [];
        if (rows.length <= 1) {
             return res.status(404).json({ success: false, message: "No registered users found in database." });
        }

        let foundUser = null;

        // Scan rows for matching email and password (Email is index 3, Password is index 4)
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toString().trim().toLowerCase() === email.trim().toLowerCase()) {
                if (rows[i][4] === password) {
                    foundUser = rows[i];
                    break;
                } else {
                    return res.status(401).json({ success: false, message: "Incorrect password." });
                }
            }
        }

        if (!foundUser) {
            return res.status(404).json({ success: false, message: "Account not found. Please create an account." });
        }

        // Map the user data exactly as your frontend expects it
        const userObj = {
            name: foundUser[1] || "Student",
            phone: foundUser[2] || "N/A",
            email: foundUser[3] || email,
            rollNo: foundUser[5] || "N/A",
            course: foundUser[7] || "N/A",
            branch: foundUser[8] || "Bangalore",
            photo: foundUser[9] || "",
            homeTown: foundUser[10] || "N/A",
            qualification: foundUser[11] || "N/A",
            stream: foundUser[12] || "N/A",
            fresherStatus: foundUser[13] || "N/A",
            vacancyOpen: foundUser[29] || "No"
        };

        // Generate JWT Token
        const token = jwt.sign(
            { email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch },
            process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026',
            { expiresIn: '7d' }
        );

        return res.status(200).json({
            success: true,
            message: "Login successful!",
            token: token,
            user: userObj
        });

    } catch (error) {
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Server connection error." });
    }
};

// ==========================================
// REGISTER FUNCTION
// ==========================================
const registerUser = async (req, res) => {
    try {
        const formData = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // Check for existing user
        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        for (let i = 1; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toString().trim().toLowerCase() === formData.email.trim().toLowerCase()) {
                return res.status(400).json({ success: false, message: "An account with this email already exists." });
            }
        }

        // Upload Profile Photo via Apps Script Bridge
        let photoUrl = "";
        if (formData.photoBase64) {
             try {
                 const photoResponse = await fetch(process.env.APPS_SCRIPT_PHOTO_URL, {
                     method: 'POST',
                     body: JSON.stringify({
                         base64: formData.photoBase64.replace(/^data:image\/\w+;base64,/, ""),
                         filename: `${formData.rollNo}_Profile.jpg`,
                         folderId: process.env.DRIVE_FOLDER_ID
                     })
                 });
                 const photoResult = await photoResponse.json();
                 if (photoResult.success) photoUrl = photoResult.url;
             } catch(e) { console.log("Photo upload failed:", e); }
        }

        // Map new row exactly to your Google Sheet columns
        const newRow = [
            new Date().toLocaleString('en-GB'), // A: Timestamp
            formData.name || "N/A",             // B: Name
            formData.phone || "N/A",            // C: Phone
            formData.email,                     // D: Email
            formData.password,                  // E: Password
            formData.rollNo || "N/A",           // F: Roll No
            formData.joiningDate || "N/A",      // G: Joining Date
            formData.course || "N/A",           // H: Course
            formData.branch || "N/A",           // I: Branch
            photoUrl || "",                     // J: Photo Base64/Link
            formData.homeTown || "N/A",         // K: Home Town
            formData.qualification || "N/A",    // L: Qual
            formData.stream || "N/A",           // M: Stream
            formData.fresherStatus || "N/A",    // N: Fresher/Exp
            formData.linkedin || "N/A",         // O: LinkedIn
            formData.instagram || "N/A",        // P: Insta
            formData.placementReq || "N/A",     // Q: Req
            "N/A", "N/A", "N/A",                // R, S, T (fillers to push resume back)
            "N/A",                              // U: Resume
            formData.parentName || "N/A",       // V
            formData.parentContact || "N/A",    // W
            "Currently Studying",               // X: Status
            "N/A",                              // Y: Completed Date
            formData.age || "N/A",              // Z: Age
            formData.gender || "N/A",           // AA: Gender
            "N/A",                              // AB: Cert
            "No"                                // AC: Vacancy Open (Default No)
        ];

        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Data!A:AC",
            valueInputOption: "USER_ENTERED",
            resource: { values: [newRow] }
        });

        // Auto-login after registration
        const token = jwt.sign(
            { email: formData.email, rollNo: formData.rollNo, branch: formData.branch },
            process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026',
            { expiresIn: '7d' }
        );

        const userObj = { name: formData.name, email: formData.email, rollNo: formData.rollNo, branch: formData.branch, course: formData.course, photo: photoUrl };

        return res.status(200).json({ success: true, message: "Account created!", token, user: userObj });

    } catch (error) {
        console.error("Register Error:", error);
        return res.status(500).json({ success: false, message: "Server error during registration." });
    }
};

// Export the functions properly so authRoutes.js can use them
module.exports = {
    loginUser,
    registerUser
};