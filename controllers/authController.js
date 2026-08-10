const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');

// BULLETPROOF VALUE FETCH (Kept for registerUser)
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
        // 1. Get user input
        const { email, password } = req.body;
        if (!email || !password) return res.status(400).json({ success: false, message: "Email and password are required." });

        // 2. Connect to Google Sheets
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // 3. Fetch all rows from the Data tab (Columns A through AD)
        const getRows = await googleSheets.spreadsheets.values.get({ 
            auth, 
            spreadsheetId, 
            range: 'Data!A:AD' 
        });

        const rows = getRows.data.values || [];
        let userObj = null;

        // 4. Bottom-Up Search for Login using Static Indexing
        for (let i = rows.length - 1; i > 0; i--) {
            const row = rows[i];
            
            // Check if Mail ID (Column D / Index 3) and Password (Column E / Index 4) match the input
            if (row[3] === email && row[4] === password) {
                
                // Map the profile data strictly to the column arrays
                userObj = {
                    name: row[1] || "Student",                 // Column B
                    phone: row[2] || "N/A",                    // Column C
                    email: row[3],                             // Column D
                    rollNo: row[5] || "N/A",                   // Column F
                    joiningDate: row[6] || "N/A",              // Column G
                    course: row[7] || "N/A",                   // Column H
                    branch: row[8] || "Bangalore",             // Column I
                    photo: row[9] || "",                       // Column J
                    homeTown: row[10] || "N/A",                // Column K
                    qualification: row[11] || "N/A",           // Column L
                    stream: row[12] || "N/A",                  // Column M
                    fresherStatus: row[13] || "N/A",           // Column N
                    linkedin: row[14] || "N/A",                // Column O
                    instagram: row[15] || "N/A",               // Column P
                    placementReq: row[16] || "N/A",            // Column Q
                    friend1Name: row[17] || "N/A",             // Column R
                    friend1Phone: row[18] || "N/A",            // Column S
                    friend2Name: row[19] || "N/A",             // Column T
                    friend2Phone: row[20] || "N/A",            // Column U
                    resume: row[21] || "N/A",                  // Column V
                    parentName: row[22] || "N/A",              // Column W
                    parentContact: row[23] || "N/A",           // Column X
                    studyStatus: row[24] || "Currently Studying", // Column Y
                    completedDate: row[25] || "N/A",           // Column Z
                    age: row[26] || "N/A",                     // Column AA
                    gender: row[27] || "N/A",                  // Column AB
                    certificate: row[28] || "N/A",             // Column AC
                    vacancyOpen: row[29] || "No"               // Column AD
                };
                break; // Stop searching once the newest valid entry is found
            }
        }

        // 5. If no match is found, reject the login
        if (!userObj) return res.status(404).json({ success: false, message: "Account not found or incorrect password." });

        // 6. Generate secure session token
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

        const newRow = [
            new Date().toLocaleString('en-GB'),
            String(formData.name || "N/A"),
            String(formData.phone || "N/A"),
            String(formData.email || "").trim(),
            String(formData.password || ""),
            String(formData.rollNo || "N/A"),
            String(formData.joiningDate || "N/A"),
            String(formData.course || "N/A"),
            String(formData.branch || "N/A"),
            String(photoUrl || ""),
            String(formData.homeTown || "N/A"),
            String(formData.qualification || "N/A"),
            String(formData.stream || "N/A"),
            String(formData.fresherStatus || "N/A"),
            String(formData.linkedin || "N/A"),
            String(formData.instagram || "N/A"),
            String(formData.placementReq || "N/A"),
            String(formData.friend1Name || "N/A"),
            String(formData.friend1Phone || "N/A"),
            String(formData.friend2Name || "N/A"),
            String(formData.friend2Phone || "N/A"),
            "N/A",
            String(formData.parentName || "N/A"),
            String(formData.parentContact || "N/A"),
            "Currently Studying",
            "N/A",
            String(formData.age || "N/A"),
            String(formData.gender || "N/A"),
            "N/A",
            "Yes"
        ];

        await googleSheets.spreadsheets.values.append({
            auth,
            spreadsheetId,
            range: "Data!A:AD",
            valueInputOption: "USER_ENTERED",
            resource: { values: [newRow] }
        });

        const token = jwt.sign(
            { email: formData.email, rollNo: formData.rollNo || "N/A", branch: formData.branch || "N/A" },
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

        return res.status(200).json({ success: true, message: "Account created!", token, user: userObj });
    } catch (error) { 
        console.error("Registration Error details:", error);
        return res.status(500).json({ success: false, message: error.message || "Server error during registration." }); 
    }
};

module.exports = { loginUser, registerUser };