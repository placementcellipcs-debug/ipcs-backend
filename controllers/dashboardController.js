const connectSheet = require('../config/db');
const axios = require('axios');

const BRANCH_LOCATIONS = {
  "Kochi": { lat: 9.9934, lng: 76.2904 }, 
  "Calicut": { lat: 11.2588, lng: 75.7804 },
  "Trivandrum": { lat: 8.5241, lng: 76.9366 },
  "Attingal": { lat: 8.6943, lng: 76.8184 },
  "Kollam": { lat: 8.8932, lng: 76.6141 },
  "Kannur": { lat: 11.8745, lng: 75.3704 },
  "Thrissur": { lat: 10.5276, lng: 76.2144 },
  "Perinthalmanna": { lat: 10.9760, lng: 76.2254 },
  "Kottayam": { lat: 9.5916, lng: 76.5222 },
  "Pathanamthitta": { lat: 9.2648, lng: 76.7870 },
  "Palakkad": { lat: 10.7867, lng: 76.6548 },
  "Coimbatore": { lat: 11.0168, lng: 76.9558 },
  "Chennai": { lat: 13.0827, lng: 80.2707 },
  "Tambaram": { lat: 12.9249, lng: 80.1000 },
  "Trichy": { lat: 10.7905, lng: 78.7047 },
  "Salem": { lat: 11.6643, lng: 78.1460 },
  "Madurai": { lat: 9.9252, lng: 78.1198 },
  "Erode": { lat: 11.3410, lng: 77.7172 },
  "Tirunelveli": { lat: 8.7139, lng: 77.7567 },
  "Bangalore": { lat: 12.9716, lng: 77.5946 },
  "Mangalore": { lat: 12.9141, lng: 74.8560 },
  "Mysore": { lat: 12.2958, lng: 76.6394 },
  "Mumbai": { lat: 19.0760, lng: 72.8777 },
  "Pune": { lat: 18.5204, lng: 73.8567 },
  "Nagpur": { lat: 21.1458, lng: 79.0882 },
  "Kolkata": { lat: 22.5726, lng: 88.3639 },
  "Siliguri": { lat: 26.7271, lng: 88.3953 },
  "Hyderabad (Telangana)": { lat: 17.3850, lng: 78.4867 },
  "Ranchi (Jharkhand)": { lat: 23.3441, lng: 85.3096 },
  "Raipur (Chhattisgarh)": { lat: 21.2514, lng: 81.6296 },
  "Bhopal (Madhya Pradesh)": { lat: 23.2599, lng: 77.4126 },
  "Dubai (UAE)": { lat: 25.2048, lng: 55.2708 },
  "Riyadh (Saudi Arabia)": { lat: 24.7136, lng: 46.6753 }
};

function isSameDay(dateStr, now) {
    if (!dateStr) return false;
    const parsedDate = new Date(dateStr.toString().replace(/,/g, '').replace(/\s+/g, ' ').trim());
    if (!isNaN(parsedDate.getTime())) {
        return (parsedDate.getDate() === now.getDate() && parsedDate.getMonth() === now.getMonth() && parsedDate.getFullYear() === now.getFullYear());
    }
    return false;
}

function calculateDistanceInMeters(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * (2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

const getDashboardData = async (req, res) => {
    try {
        const { email, branch } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        let userInfo = {};
        try {
            const dataSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AD" });
            const userDataRows = dataSheet.data.values || [];
            for (let i = 1; i < userDataRows.length; i++) {
                if (userDataRows[i][3] && userDataRows[i][3].toLowerCase() === email.toLowerCase()) {
                    userInfo = {
                        name: userDataRows[i][1] || "Student",
                        phone: userDataRows[i][2] || "N/A",
                        email: userDataRows[i][3] || email,
                        rollNo: userDataRows[i][5] || "N/A",
                        course: userDataRows[i][7] || "N/A",
                        branch: userDataRows[i][8] || "Bangalore",
                        photo: userDataRows[i][9] || "",
                        homeTown: userDataRows[i][10] || "N/A",
                        qualification: userDataRows[i][11] || "N/A",
                        stream: userDataRows[i][12] || "N/A",
                        fresherStatus: userDataRows[i][13] || "N/A",
                        linkedin: userDataRows[i][14] || "N/A",
                        instagram: userDataRows[i][15] || "N/A",
                        placementReq: userDataRows[i][16] || "N/A",
                        friend1Name: userDataRows[i][17] || "N/A",
                        friend1Phone: userDataRows[i][18] || "N/A",
                        friend2Name: userDataRows[i][19] || "N/A",
                        friend2Phone: userDataRows[i][20] || "N/A",
                        resume: userDataRows[i][21] || "N/A",
                        parentName: userDataRows[i][22] || "N/A",
                        parentContact: userDataRows[i][23] || "N/A",
                        studyStatus: userDataRows[i][24] || "Currently Studying",
                        completedDate: userDataRows[i][25] || "N/A",
                        age: userDataRows[i][26] || "N/A",
                        gender: userDataRows[i][27] || "N/A",
                        certificate: userDataRows[i][28] || "N/A",
                        vacancyOpen: userDataRows[i][29] || "No"
                    };
                    break;
                }
            }
        } catch(e) {}

        let appliedJobs = [], stats = { applied: 0, interviews: 0, offers: 0, attended: 0, totalConducted: 0, onLeave: 0 };
        try {
            const applySheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Opening_Applied!A:O" });
            const appData = applySheet.data.values || [];
            for (let i = 1; i < appData.length; i++) {
                if (appData[i][3] && appData[i][3].toLowerCase() === email.toLowerCase()) {
                    let status = appData[i][13] || "Applied";
                    stats.applied++;
                    if (status.toLowerCase().includes("interview")) stats.interviews++;
                    if (status.toLowerCase().includes("offer") || status.toLowerCase().includes("hired") || status.toLowerCase().includes("placed")) stats.offers++;
                    appliedJobs.push({ jobId: appData[i][9] || "N/A", company: appData[i][10] || "Unknown", status: status, date: appData[i][0] || "Recently" });
                }
            }
        } catch(e) {}

        let events = [];
        try {
            const eventSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Event!A:I" });
            const evData = eventSheet.data.values || [];
            for (let i = 1; i < evData.length; i++) {
                let evBranch = (evData[i][1] || "all").toLowerCase();
                if (evBranch.includes("all") || evBranch.includes((branch || "Bangalore").toLowerCase())) {
                    events.push({ 
                        date: evData[i][0] || "TBA", 
                        branch: evData[i][1] || "All",
                        type: evData[i][2] || "GENERAL",
                        title: evData[i][3] || "Event", 
                        description: evData[i][4] || "", 
                        time: evData[i][5] || "", 
                        location: evData[i][6] || "",
                        posterLink: evData[i][7] || "",
                        id: evData[i][8] || `DRK-${1000 + i}`,
                        driveId: evData[i][8] || `DRK-${1000 + i}`
                    });
                }
            }
        } catch(e) {}

        // --- NEW: FETCH EVENT REGISTRATION HISTORY ---
        let driveRSVPs = [];
        try {
            const driveSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Drive_Registration!A:J" });
            const driveData = driveSheet.data.values || [];
            for (let i = 1; i < driveData.length; i++) {
                if (driveData[i][3] && driveData[i][3].toLowerCase() === email.toLowerCase()) {
                    driveRSVPs.push({ driveId: driveData[i][0] || "", status: driveData[i][8] || "" });
                }
            }
        } catch(e) {}

        let attendanceHistory = [], hasMarkedToday = false, isScheduledToday = false;
        const now = new Date(), todayStr = now.toLocaleDateString('en-GB');
        try {
            const schedSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" });
            const schedData = schedSheet.data.values || [];
            for (let i = 1; i < schedData.length; i++) {
                const schedBranch = (schedData[i][2] || "").toLowerCase();
                if (schedBranch.includes((branch || "bangalore").toLowerCase())) {
                    stats.totalConducted++;
                    if (isSameDay(schedData[i][0], now)) isScheduledToday = true;
                }
            }
            const attSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" });
            const attData = attSheet.data.values || [];
            for (let i = 1; i < attData.length; i++) {
                if (attData[i][1] && attData[i][1].toLowerCase() === email.toLowerCase()) {
                    stats.attended++;
                    let recDate = attData[i][8] || "";
                    let numRating = parseInt((attData[i][6] || "0").charAt(0)) || 0;
                    attendanceHistory.push({ timestamp: attData[i][0], rating: numRating, dateStr: recDate });
                    if (recDate === todayStr || attData[i][0].includes(now.toLocaleDateString())) hasMarkedToday = true;
                }
            }
            attendanceHistory.reverse();
            stats.onLeave = Math.max(0, stats.totalConducted - stats.attended);
        } catch(e) {}

        let vacancies = [];
        try {
            const nlSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" });
            const nlData = nlSheet.data.values || [];
            const cleanStudentCourse = (userInfo.course || "").trim().toLowerCase();
            const itCoursesList = ["python and data science", "artificial intelligence", "python full stack", "java full stack", "mern stack", "cyber security"];
            const isStudentIT = itCoursesList.includes(cleanStudentCourse);

            for (let i = 1; i < nlData.length; i++) {
                let status = (nlData[i][18] || "yes").toLowerCase();
                if (status.includes("no") || status.includes("closed") || status === "false") continue;
                let rowCourse = (nlData[i][16] || "all").toLowerCase();
                let isCourseMatch = false;

                if (rowCourse.includes("all") || rowCourse === "") isCourseMatch = true;
                else if (cleanStudentCourse && rowCourse.includes(cleanStudentCourse)) isCourseMatch = true;
                else if (isStudentIT && rowCourse.includes("information technology")) isCourseMatch = true;
                else if (cleanStudentCourse) isCourseMatch = cleanStudentCourse.split(" ").some(w => w.length > 3 && rowCourse.includes(w));

                if (!isCourseMatch) continue;
                let company = nlData[i][2] || "Placement Partner";
                let position = nlData[i][4] || "Technical Role";
                if (!company && !position) continue;

                vacancies.push({
                    date: nlData[i][1] || "", company: company, position: position, state: nlData[i][5] || "OTHER STATES", location: nlData[i][6] || "Multiple Locations", modeOfWork: nlData[i][7] || "On-site", openings: nlData[i][8] || "01-02", qualification: nlData[i][9] || "Degree", description: nlData[i][10] || "", experience: nlData[i][11] || "Fresher", salary: nlData[i][12] || "Market Standard", interviewDate: nlData[i][14] || "Will inform once scheduled", lastDate: nlData[i][15] || "Open", course: nlData[i][16] || "All", newsletterId: nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}`
                });
            }
        } catch (e) {}

        let tpoInfo = { name: "Placement Officer", email: "placement@ipcsglobal.com", phone: "N/A", sittingBranch: "N/A", assignedBranches: "N/A", profilePhoto: "" };
        try {
            const contactSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Contact!A:H" });
            const contactData = contactSheet.data.values || [];
            for (let k = 1; k < contactData.length; k++) {
                if ((contactData[k][4] || "").toLowerCase().includes((branch || "Bangalore").toLowerCase())) {
                    tpoInfo = { 
                        name: contactData[k][0] || "Placement Officer", 
                        phone: contactData[k][1] || "N/A", 
                        email: contactData[k][2] || "placement@ipcsglobal.com", 
                        sittingBranch: contactData[k][3] || "N/A",
                        assignedBranches: contactData[k][4] || "N/A", 
                        profilePhoto: contactData[k][6] || ""         
                    };
                    break;
                }
            }
        } catch (e) {}

        res.status(200).json({ success: true, userInfo, stats, appliedJobs, events, attendanceHistory, isScheduledToday, hasMarkedToday, vacancies, tpoInfo, driveRSVPs });
    } catch (error) { res.status(500).json({ success: false, message: "Server Error fetching dashboard." }); }
};

const markAttendance = async (req, res) => {
    try {
        const { email, name, branch, course, rating, location, feedback, userLat, userLng } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const now = new Date();
        const timestamp = now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" });
        const istDate = new Date(now.toLocaleString("en-US", { timeZone: "Asia/Kolkata" }));
        const dateOnly = `${istDate.getDate().toString().padStart(2, '0')}/${(istDate.getMonth() + 1).toString().padStart(2, '0')}/${istDate.getFullYear()}`;

        const currentTimeMins = istDate.getHours() * 60 + istDate.getMinutes();
        const isTimeValid = (currentTimeMins >= (9 * 60 + 30) && currentTimeMins <= (19 * 60));

        let isScheduledToday = false;
        const schedSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" });
        const schedData = schedSheet.data.values || [];
        for (let i = 1; i < schedData.length; i++) {
            if ((schedData[i][2] || "").toLowerCase().includes((branch || "").toLowerCase()) && isSameDay(schedData[i][0], now)) {
                isScheduledToday = true; break;
            }
        }

        let isWithinGeofence = false, calculatedDistance = 999999;
        if (userLat && userLng) {
            const studentBranchKey = Object.keys(BRANCH_LOCATIONS).find(b => b.toLowerCase() === (branch || "").trim().toLowerCase());
            const targetCampus = studentBranchKey ? BRANCH_LOCATIONS[studentBranchKey] : BRANCH_LOCATIONS["Bangalore"];
            calculatedDistance = calculateDistanceInMeters(parseFloat(userLat), parseFloat(userLng), targetCampus.lat, targetCampus.lng);
            if (calculatedDistance <= 500) isWithinGeofence = true;
        }

        let alreadyMarked = false;
        const attSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" });
        const attData = attSheet.data.values || [];
        for (let i = 1; i < attData.length; i++) {
            if (attData[i][1] && attData[i][1].toLowerCase() === email.toLowerCase()) {
                if (attData[i][8] === dateOnly || attData[i][0].includes(dateOnly)) { alreadyMarked = true; break; }
            }
        }

        if (alreadyMarked) return res.status(400).json({ success: false, message: `Attendance Already Marked for today (${dateOnly}).` });
        if (!isScheduledToday) return res.status(400).json({ success: false, message: "No active session scheduled today." });
        if (!isTimeValid) return res.status(400).json({ success: false, message: "Attendance allowed only between 9:30 AM and 7:00 PM." });
        if (!userLat) return res.status(400).json({ success: false, message: "GPS required. Please enable Location Services." });
        if (!isWithinGeofence) return res.status(400).json({ success: false, message: `Location Restriction. Must be within 500m of campus. (You are ${Math.round(calculatedDistance)}m away).` });

        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Talentino_Attendance!A:J", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, email, name, branch, course, location, `${rating} / 5 Stars`, feedback || "None", dateOnly, "None"]] },
        });

        res.status(200).json({ success: true, message: "Attendance marked successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to submit attendance." }); }
};

const applyForJob = async (req, res) => {
    try {
        const { email, jobId, companyName, name, phone, rollNo, course, branch, qualification, resume } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString();

        let position = "N/A", placementOfficer = "TPO Auto-Assigned";
        try {
            const nlSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" });
            const nlData = nlSheet.data.values || [];
            for (let i = 1; i < nlData.length; i++) {
                let currentId = nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}`;
                if (currentId.toString().trim() === jobId.toString().trim()) {
                    position = nlData[i][4] || "N/A"; placementOfficer = nlData[i][17] || "TPO Auto-Assigned"; break;
                }
            }
        } catch (e) { }

        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Opening_Applied!A:N", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, name, phone, email, rollNo, course, branch, qualification || "N/A", resume || "N/A", jobId, companyName || "N/A", position, placementOfficer, "Applied"]] },
        });

        res.status(200).json({ success: true, message: "Applied successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to apply for job." }); }
};

const updateProfile = async (req, res) => {
    try {
        const { email, age, gender, studyStatus, completedDate, stream, homeTown, fresherStatus, qualification, linkedin, instagram, placementReq } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) { targetRowIndex = i + 1; break; }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        await googleSheets.spreadsheets.values.batchUpdate({
            auth, spreadsheetId,
            resource: {
                valueInputOption: "USER_ENTERED",
                data: [
                    { range: `Data!K${targetRowIndex}:Q${targetRowIndex}`, values: [[homeTown, qualification, stream, fresherStatus, linkedin, instagram, placementReq]] },
                    { range: `Data!Y${targetRowIndex}:Z${targetRowIndex}`, values: [[studyStatus, completedDate || "N/A"]] },
                    { range: `Data!AA${targetRowIndex}:AB${targetRowIndex}`, values: [[age, gender]] }
                ]
            }
        });

        const updatedRow = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: `Data!A${targetRowIndex}:AD${targetRowIndex}` });
        const user = updatedRow.data.values[0];

        res.status(200).json({ success: true, message: "Profile updated successfully!", user: {
            homeTown: user[10] || "N/A", qualification: user[11] || "N/A", stream: user[12] || "N/A",
            fresherStatus: user[13] || "N/A", linkedin: user[14] || "N/A", instagram: user[15] || "N/A",
            placementReq: user[16] || "N/A", parentName: user[22] || "N/A", parentContact: user[23] || "N/A",
            studyStatus: user[24] || "Currently Studying", completedDate: user[25] || "N/A", age: user[26] || "N/A", gender: user[27] || "N/A"
        } });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to update profile." }); }
};

const uploadDocument = async (req, res) => {
    try {
        const { email, rollNo, base64, docType } = req.body;
        
        const base64Clean = docType === 'Photo' 
            ? base64.replace(/^data:image\/\w+;base64,/, "") 
            : base64.replace(/^data:application\/pdf;base64,/, "");
        
        const action = docType === 'Photo' ? 'updateProfilePhoto' : 'updateDocument';

        const response = await axios.post(process.env.APPS_SCRIPT_PHOTO_URL, { 
            action: action,
            email: email, 
            rollNo: rollNo,
            base64: base64Clean, 
            docType: docType 
        });
        
        const result = response.data;
        
        if (!result.success) {
            return res.status(500).json({ success: false, message: result.message || "Drive upload failed in Apps Script" });
        }

        res.status(200).json({ success: true, message: `${docType} uploaded successfully!`, url: result.url });
    } catch (error) { 
        console.error("Upload error details:", error.response?.data || error.message);
        res.status(500).json({ success: false, message: "Node server failed to reach Google Apps Script." }); 
    }
};

const updatePassword = async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:E" });
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        for (let i = 0; i < rows.length; i++) {
            if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                if (rows[i][4] !== currentPassword) return res.status(400).json({ success: false, message: "Incorrect current password." });
                targetRowIndex = i + 1; break;
            }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        await googleSheets.spreadsheets.values.update({ auth, spreadsheetId, range: `Data!E${targetRowIndex}`, valueInputOption: "USER_ENTERED", resource: { values: [[newPassword]] } });
        res.status(200).json({ success: true, message: "Password updated successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to update password." }); }
};

const submitIssue = async (req, res) => {
    try {
        const { email, name, branch, course, issueDetails } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString();

        await googleSheets.spreadsheets.values.append({
            auth, spreadsheetId, range: "Issues!A:I", valueInputOption: "USER_ENTERED",
            resource: { values: [[timestamp, name, "N/A", email, branch, course, "N/A", issueDetails, "Pending"]] },
        });
        res.status(200).json({ success: true, message: "Issue reported successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to submit issue." }); }
};

const submitDriveResponse = async (req, res) => {
    try {
        const { driveId, title, name, phone, email, course, branch, qualification, resume, status } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        
        const targetDriveId = driveId || title || "N/A";

        // Check if the student has already responded to this drive
        try {
            const checkSheet = await googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Drive_Registration!A:D" });
            const rows = checkSheet.data.values || [];
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] === targetDriveId && rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                    return res.status(400).json({ success: false, message: 'You have already submitted a response for this drive.' });
                }
            }
        } catch (e) {
            // Sheet might be empty, proceed safely
        }

        // Get IST Timestamp
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

        // Append to 'Drive_Registration' sheet matching columns A through J
        await googleSheets.spreadsheets.values.append({
            auth, 
            spreadsheetId, 
            range: "Drive_Registration!A:J", 
            valueInputOption: "USER_ENTERED",
            resource: { 
                values: [[
                    targetDriveId, 
                    name || "N/A", 
                    phone || "N/A", 
                    email || "N/A", 
                    course || "N/A", 
                    branch || "N/A", 
                    resume || "N/A", 
                    qualification || "N/A", 
                    status || "N/A",
                    timestamp
                ]] 
            },
        });

        res.status(200).json({ success: true, message: `Status updated to: ${status}` });
    } catch (error) {
        console.error("Error recording drive response:", error);
        res.status(500).json({ success: false, message: 'Failed to record response.' });
    }
};

module.exports = { getDashboardData, markAttendance, applyForJob, updateProfile, uploadDocument, updatePassword, submitIssue, submitDriveResponse };