const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');

function getVal(row, headers, possibleNames, fallbackIndex = -1, defaultValue = "N/A") {
    if (headers && headers.length > 0) {
        for (let name of possibleNames) {
            const idx = headers.findIndex(h => h && h.toString().trim().toLowerCase().includes(name.toLowerCase()));
            if (idx !== -1 && row[idx] !== undefined && row[idx] !== "") {
                return row[idx].toString().trim();
            }
        }
    }
    if (fallbackIndex !== -1 && row[fallbackIndex] !== undefined && row[fallbackIndex] !== "") {
        return row[fallbackIndex].toString().trim();
    }
    return defaultValue;
}

const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: 'Data!A:AD' });
        const rows = getRows.data.values || [];
        let userObj = null;

        for (let i = rows.length - 1; i > 0; i--) {
            const row = rows[i];
            
            // Check Mail ID (Col D/Idx 3) and Password (Col E/Idx 4)
            if (row[3] === email && row[4] === password) {
                // PERFECTLY MAPPED TO NEW SCREENSHOTS
                userObj = {
                    name: row[1] || "Student",                 // B: 1
                    phone: row[2] || "N/A",                    // C: 2
                    email: row[3],                             // D: 3
                    rollNo: row[5] || "N/A",                   // F: 5
                    joiningDate: row[6] || "N/A",              // G: 6
                    course: row[7] || "N/A",                   // H: 7
                    branch: row[8] || "Bangalore",             // I: 8
                    photo: row[9] || "",                       // J: 9 (PROFILE PHOTO)
                    homeTown: row[10] || "N/A",                // K: 10
                    qualification: row[11] || "N/A",           // L: 11
                    stream: row[12] || "N/A",                  // M: 12
                    fresherStatus: row[13] || "N/A",           // N: 13
                    linkedin: row[14] || "N/A",                // O: 14
                    instagram: row[15] || "N/A",               // P: 15
                    placementReq: row[16] || "N/A",            // Q: 16
                    friend1Name: row[17] || "N/A",             // R: 17
                    friend1Phone: row[18] || "N/A",            // S: 18
                    friend2Name: row[19] || "N/A",             // T: 19
                    friend2Phone: row[20] || "N/A",            // U: 20
                    resume: row[21] || "N/A",                  // V: 21
                    parentName: row[22] || "N/A",              // W: 22
                    parentContact: row[23] || "N/A",           // X: 23
                    studyStatus: row[24] || "Currently Studying", // Y: 24
                    completedDate: row[25] || "N/A",           // Z: 25
                    age: row[26] || "N/A",                     // AA: 26
                    gender: row[27] || "N/A",                  // AB: 27
                    certificate: row[28] || "N/A",             // AC: 28
                    vacancyOpen: row[29] || "No"               // AD: 29
                };
                break; 
            }
        }

        if (!userObj) return res.status(404).json({ success: false, message: "Account not found or incorrect password." });

        const token = jwt.sign(
            { email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch }, 
            process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', 
            { expiresIn: '7d' }
        );
        return res.status(200).json({ success: true, message: "Login successful!", token, user: userObj });
        
    } catch (error) { 
        console.error("Login Error:", error);
        return res.status(500).json({ success: false, message: "Server error during login." }); 
    }
};

const registerUser = async (req, res) => {
    try {
        const formData = req.body;
        if (!formData || !formData.email || !formData.password) {
            return res.status(400).json({ success: false, message: "Email and password are required." });
        }

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AD" });
        const rows = getRows.data.values || [];
        const headers = rows[0] || [];
        
        const cleanEmail = formData.email.toString().trim().toLowerCase();

        for (let i = rows.length - 1; i >= 1; i--) {
            const existingEmail = getVal(rows[i], headers, ["email", "mail"], 3, "");
            if (existingEmail && existingEmail.toLowerCase() === cleanEmail) {
                return res.status(400).json({ success: false, message: "An account with this email already exists." });
            }
        }

        let photoUrl = "";
        if (formData.photoBase64) {
             try {
                 const photoResponse = await fetch(process.env.APPS_SCRIPT_PHOTO_URL, {
                     method: 'POST',
                     headers: { 'Content-Type': 'application/json' },
                     body: JSON.stringify({
                         action: "uploadOnly",
                         base64: formData.photoBase64.replace(/^data:image\/\w+;base64,/, ""),
                         filename: `${formData.rollNo || 'Profile'}_Profile.jpg`,
                         folderName: "Profile Photo",
                         mimeType: "image/jpeg"
                     })
                 });
                 const photoResult = await photoResponse.json();
                 if (photoResult && photoResult.success) photoUrl = photoResult.url;
             } catch(e) { console.log("Photo upload failed:", e.message || e); }
        }

        // PERFECTLY MAPPED TO NEW SCREENSHOTS
        const newRow = [
            new Date().toLocaleString('en-GB'),            // A (0): Timestamp
            String(formData.name || "N/A"),                // B (1): Name
            String(formData.phone || "N/A"),               // C (2): Phone No.
            String(formData.email || "").trim(),           // D (3): Mail ID
            String(formData.password || ""),               // E (4): Password
            String(formData.rollNo || "N/A"),              // F (5): Roll Number
            String(formData.joiningDate || "N/A"),         // G (6): Joining Date
            String(formData.course || "N/A"),              // H (7): Course
            String(formData.branch || "Bangalore"),        // I (8): Branch
            String(photoUrl || ""),                        // J (9): Profile Photo
            String(formData.homeTown || "N/A"),            // K (10): Home Town
            String(formData.qualification || "N/A"),       // L (11): Qualification
            String(formData.stream || "N/A"),              // M (12): Stream
            String(formData.fresherStatus || "N/A"),       // N (13): Fresher Status
            String(formData.linkedin || "N/A"),            // O (14): LinkedIn
            String(formData.instagram || "N/A"),           // P (15): Instagram
            String(formData.placementReq || "N/A"),        // Q (16): Placement Req
            String(formData.friend1Name || "N/A"),         // R (17): Friend 1 Name
            String(formData.friend1Phone || "N/A"),        // S (18): Friend 1 Contact
            String(formData.friend2Name || "N/A"),         // T (19): Friend 2 Name
            String(formData.friend2Phone || "N/A"),        // U (20): Friend 2 Contact
            "N/A",                                         // V (21): Resume
            String(formData.parentName || "N/A"),          // W (22): Parent Name
            String(formData.parentContact || "N/A"),       // X (23): Parent Contact
            "Currently Studying",                          // Y (24): Study Status
            "N/A",                                         // Z (25): Completed Date
            String(formData.age || "N/A"),                 // AA (26): Age
            String(formData.gender || "N/A"),              // AB (27): Gender
            "N/A",                                         // AC (28): Certificate
            "Yes"                                          // AD (29): Vacancy Open
        ];

        await googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: "Data!A:AD",
            valueInputOption: "USER_ENTERED",
            resource: { values: [newRow] }
        });

        const token = jwt.sign(
            { email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "Bangalore" },
            process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026',
            { expiresIn: '7d' }
        );

        const userObj = {
            name: formData.name || "Student",
            email: formData.email,
            rollNo: formData.rollNo || "N/A",
            branch: formData.branch || "Bangalore",
            course: formData.course || "N/A",
            photo: photoUrl || "",
            vacancyOpen: "Yes"
        };

        return res.status(200).json({ success: true, message: "Account created!", token, userObj });
    } catch (error) { 
        console.error("Registration Error details:", error);
        return res.status(500).json({ success: false, message: error.message || "Server error during registration." }); 
    }
};

module.exports = { loginUser, registerUser };