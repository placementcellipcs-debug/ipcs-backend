const connectSheet = require('../config/db');
const jwt = require('jsonwebtoken');

// BULLETPROOF VALUE FETCH
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

        const response = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AD" });
        const rows = response.data.values || [];
        if (rows.length <= 1) return res.status(404).json({ success: false, message: "No registered users found." });

        const headers = rows[0] || [];
        let foundUser = null;
        
        // SEARCH BOTTOM-UP TO GRAB LATEST ROW
        for (let i = rows.length - 1; i >= 1; i--) {
            const rowEmail = getVal(rows[i], headers, ["email", "mail"], 3, "");
            if (rowEmail && rowEmail.toLowerCase() === email.trim().toLowerCase()) {
                const rowPass = getVal(rows[i], headers, ["password", "pass"], 4, "");
                if (rowPass === password) { foundUser = rows[i]; break; } 
                else return res.status(401).json({ success: false, message: "Incorrect password." });
            }
        }

        if (!foundUser) return res.status(404).json({ success: false, message: "Account not found." });

        const userObj = {
            name: getVal(foundUser, headers, ["full name", "name"], 1, "Student"),
            phone: getVal(foundUser, headers, ["phone number", "phone", "contact"], 2, "N/A"),
            email: getVal(foundUser, headers, ["email", "mail"], 3, email),
            rollNo: getVal(foundUser, headers, ["roll", "id"], 5, "N/A"),
            joiningDate: getVal(foundUser, headers, ["joining date", "joining"], 6, "N/A"),
            course: getVal(foundUser, headers, ["course"], 7, "N/A"),
            branch: getVal(foundUser, headers, ["branch"], 8, "Bangalore"),
            photo: getVal(foundUser, headers, ["profile photo", "photo"], 9, ""),
            homeTown: getVal(foundUser, headers, ["home town", "town"], 10, "N/A"),
            qualification: getVal(foundUser, headers, ["qualification"], 11, "N/A"),
            stream: getVal(foundUser, headers, ["stream"], 12, "N/A"),
            fresherStatus: getVal(foundUser, headers, ["fresher", "experience"], 13, "N/A"),
            linkedin: getVal(foundUser, headers, ["linkedin"], 14, "N/A"),
            instagram: getVal(foundUser, headers, ["instagram"], 15, "N/A"),
            placementReq: getVal(foundUser, headers, ["placement req", "requirement"], 16, "N/A"),
            friend1Name: getVal(foundUser, headers, ["friend 1 name", "friend1"], 17, "N/A"),
            friend1Phone: getVal(foundUser, headers, ["friend 1 contact", "friend 1 phone"], 18, "N/A"),
            friend2Name: getVal(foundUser, headers, ["friend 2 name", "friend2"], 19, "N/A"),
            friend2Phone: getVal(foundUser, headers, ["friend 2 contact", "friend 2 phone"], 20, "N/A"),
            resume: getVal(foundUser, headers, ["resume"], 21, "N/A"),
            parentName: getVal(foundUser, headers, ["parent name", "parent"], 22, "N/A"),
            parentContact: getVal(foundUser, headers, ["parent contact"], 23, "N/A"),
            studyStatus: getVal(foundUser, headers, ["study status"], 24, "Currently Studying"),
            completedDate: getVal(foundUser, headers, ["completed date"], 25, "N/A"),
            age: getVal(foundUser, headers, ["age"], 26, "N/A"),
            gender: getVal(foundUser, headers, ["gender"], 27, "N/A"),
            certificate: getVal(foundUser, headers, ["certificate"], 28, "N/A"),
            vacancyOpen: getVal(foundUser, headers, ["vaccancy", "vacancy", "open"], 29, "No")
        };

        const token = jwt.sign({ email: userObj.email, rollNo: userObj.rollNo, branch: userObj.branch }, process.env.JWT_SECRET || 'super_secret_key_for_ipcs_portal_2026', { expiresIn: '7d' });
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