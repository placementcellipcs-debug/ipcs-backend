const connectSheet = require('../config/db');
const axios = require('axios');
const NodeCache = require('node-cache');

// Initialize NodeCache: Default Time-To-Live (TTL) is 180 seconds (3 minutes)
const cache = new NodeCache({ stdTTL: 5, checkperiod: 120 });

// Exponential Backoff Retry Function to handle Google Sheets API limits
const withRetry = async (fn, retries = 5, delay = 1000) => {
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error) {
            if (i === retries - 1 || (error.code !== 429 && !error.message?.includes('quota') && !error.message?.includes('rate limit'))) {
                throw error;
            }
            console.log(`Google API Rate Limit hit. Retrying in ${delay}ms... (Attempt ${i + 1} of ${retries})`);
            await new Promise(res => setTimeout(res, delay));
            delay *= 2;
        }
    }
};

const BRANCH_LOCATIONS = {
  "Kochi": { lat: 9.9934, lng: 76.2904 }, 
  "Calicut": { lat: 11.259287, lng: 75.780641 },
  "Trivandrum": { lat: 8.488688, lng: 76.949653 },
  "Attingal": { lat: 8.695674, lng: 76.818799 },
  "Kollam": { lat: 8.886614, lng: 76.588570 },
  "Kannur": { lat: 11.874601, lng: 75.380053 },
  "Thrissur": { lat: 10.523251, lng: 76.225573 },
  "Perinthalmanna": { lat: 10.9760, lng: 76.2254 },
  "Kottayam": { lat: 9.588883, lng: 76.529856 },
  "Pathanamthitta": { lat: 10.977459, lng:  76.220611 },
  "Palakkad": { lat: 10.767220, lng: 76.659672 },
  "Coimbatore": { lat: 11.0168, lng: 76.9558 },
  "Chennai": { lat: 13.048633, lng: 80.208111 },
  "Tambaram": { lat: 12.9249, lng: 80.1000 },
  "Trichy": { lat: 10.832903, lng: 78.693117 },
  "Salem": { lat: 11.6643, lng: 78.1460 },
  "Madurai": { lat: 9.944061, lng: 78.141930 },
  "Erode": { lat: 11.3410, lng: 77.7172 },
  "Tirunelveli": { lat: 8.698488, lng: 77.727497 },
  "Bangalore": { lat: 12.9097, lng: 77.5730 },
  "Mangalore": { lat: 12.9141, lng: 74.8560 },
  "Mysore": { lat: 12.337981, lng: 76.618691 },
  "Mumbai": { lat: 19.066361, lng: 72.999029 },
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

// --- NEW HELPER: Maps Subcourses to Main Courses from the Courses Sheet ---
const buildCourseMap = async (googleSheets, auth, spreadsheetId) => {
    try {
        const getRows = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Courses!A:B" }));
        const rows = getRows.data.values || [];
        let courseMap = {};
        let currentMainCourse = "";

        for (let i = 0; i < rows.length; i++) {
            const colA = rows[i][0] ? rows[i][0].toString().trim() : "";
            const colB = rows[i][1] ? rows[i][1].toString().trim() : "";

            if (colA !== "") {
                // Remove numbers like "1. " from the main course name
                currentMainCourse = colA.replace(/^\d+\.\s*/, '').trim().toLowerCase();
            }

            if (colB !== "" && currentMainCourse !== "") {
                courseMap[colB.toLowerCase()] = currentMainCourse;
            }
        }
        return courseMap;
    } catch (e) {
        console.error("Error building course map:", e);
        return {};
    }
};

function isSameDay(dateStr, now) {
    if (!dateStr) return false;
    let cleanStr = String(dateStr).replace(/,/g, '').replace(/\s+/g, ' ').trim();
    let parts = cleanStr.split(/[-/]/);
    let parsedDate;
    if (parts.length === 3) {
        if (parts[0].length <= 2) parsedDate = new Date(parts[2], parts[1] - 1, parts[0]);
        else parsedDate = new Date(parts[0], parts[1] - 1, parts[2]);
    } else {
        parsedDate = new Date(cleanStr);
    }
    
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

// Safe helper for reading Google Sheet row indexes
const getCol = (row, idx, fallback = "") => (row && row[idx] !== undefined && row[idx] !== null) ? row[idx].toString().trim() : fallback;

const getDashboardData = async (req, res) => {
    try {
        const { email, branch } = req.body;
        const cacheKey = `dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`;

        const cachedDashboard = cache.get(cacheKey);
        if (cachedDashboard) {
            return res.status(200).json(cachedDashboard);
        }

        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        // FETCH COURSE MAPPING DICTIONARY
        const courseMap = await buildCourseMap(googleSheets, auth, spreadsheetId);

        let userInfo = {};
        try {
            // STRICTLY A:AF for 32 columns
            const dataSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AF" }));
            const userDataRows = dataSheet.data.values || [];
            
            for (let i = userDataRows.length - 1; i >= 1; i--) {
                const rowEmail = userDataRows[i][3] || "";
                if (rowEmail.toLowerCase() === email.toLowerCase()) {
                    userInfo = {
                        name: userDataRows[i][1] || "Student",
                        phone: userDataRows[i][2] || "N/A",
                        email: userDataRows[i][3],
                        rollNo: userDataRows[i][5] || "N/A",
                        joiningDate: userDataRows[i][6] || "N/A",
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

        // SECURE BRANCH FETCH: Always use the live Google Sheet branch over the frontend cache
        const actualBranch = (userInfo.branch || branch || "Bangalore").toString().trim().toLowerCase();

        let appliedJobs = [], stats = { applied: 0, interviews: 0, offers: 0, attended: 0, totalConducted: 0, onLeave: 0 };
        try {
            const applySheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Opening_Applied!A:O" }));
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
            const eventSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Event!A:K" }));
            const evData = eventSheet.data.values || [];
            for (let i = 1; i < evData.length; i++) {
                let evBranch = (evData[i][2] || "all").toLowerCase();
                // FIX: Check against the live actualBranch, not the cached request branch
                if (evBranch.includes("all") || evBranch.includes(actualBranch)) {
                    events.push({
                        date: evData[i][0] || "TBA", 
                        branch: evData[i][2] || "All", 
                        type: evData[i][3] || "GENERAL", 
                        title: evData[i][4] || "Event", 
                        description: evData[i][5] || "", 
                        time: evData[i][6] || "", 
                        location: evData[i][7] || "", 
                        posterLink: evData[i][8] || "", 
                        id: evData[i][9] || `DRK-${1000 + i}`, 
                        driveId: evData[i][9] || `DRK-${1000 + i}`
                    });
                }
            }
        } catch(e) {}

        let driveRSVPs = [];
        try {
            const driveSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Drive_Registration!A:J" }));
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
            const schedSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" }));
            const schedData = schedSheet.data.values || [];
            for (let i = 1; i < schedData.length; i++) {
                const schedBranch = (schedData[i][2] || "").toLowerCase();
                // FIX: Use actualBranch for accurate schedule counting
                if (schedBranch.includes(actualBranch)) {
                    stats.totalConducted++;
                    if (isSameDay(schedData[i][0], now)) isScheduledToday = true;
                }
            }
            const attSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" }));
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
            const nlSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" }));
            const nlData = nlSheet.data.values || [];
            
            // MAP THE STUDENT'S SUBCOURSE TO THE MAIN COURSE
            const cleanStudentSubcourse = (userInfo.course || "").trim().toLowerCase();
            const studentMainCourse = courseMap[cleanStudentSubcourse] || cleanStudentSubcourse;

            for (let i = 1; i < nlData.length; i++) {
                let status = (nlData[i][18] || "yes").toLowerCase();
                if (status.includes("no") || status.includes("closed") || status === "false") continue;
                
                let rowCourse = (nlData[i][4] || "all").toLowerCase();
                let isCourseMatch = false;

                // CHECK MATCH AGAINST MAPPED MAIN COURSE OR EXACT SUBCOURSE
                if (rowCourse.includes("all") || rowCourse === "") isCourseMatch = true;
                else if (rowCourse.includes(studentMainCourse) || studentMainCourse.includes(rowCourse)) isCourseMatch = true;
                else if (rowCourse.includes(cleanStudentSubcourse) || cleanStudentSubcourse.includes(rowCourse)) isCourseMatch = true;

                if (!isCourseMatch) continue;
                
                let company = nlData[i][2] || "Placement Partner";
                let position = nlData[i][5] || "Technical Role";
                if (!company && !position) continue;

                vacancies.push({
                    date: nlData[i][1] || "",
                    company: company, 
                    position: position, 
                    state: nlData[i][6] || "OTHER STATES",
                    location: nlData[i][7] || "Multiple Locations",
                    modeOfWork: nlData[i][8] || "On-site",
                    openings: nlData[i][9] || "01-02",
                    qualification: nlData[i][10] || "Degree",
                    description: nlData[i][11] || "",
                    experience: nlData[i][12] || "Fresher",
                    salary: nlData[i][13] || "Market Standard",
                    interviewDate: nlData[i][15] || "Will inform once scheduled",
                    lastDate: nlData[i][16] || "Open",
                    course: nlData[i][4] || "All",
                    newsletterId: nlData[i][19] || nlData[i][20] || `JOB-${1000 + i}` 
                });
            }
        } catch (e) {
            console.error("Vacancies loop error:", e);
        }

        let tpoInfo = { name: "Placement Officer", email: "placement@ipcsglobal.com", phone: "N/A", sittingBranch: "N/A", assignedBranches: "N/A", profilePhoto: "" };
        try {
            const contactSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Contact!A:H" }));
            const contactData = contactSheet.data.values || [];
            
            for (let k = 1; k < contactData.length; k++) {
                const assignedRegion = contactData[k][4] || "";
                // FIX: Use actualBranch for accurate TPO mapping
                if (assignedRegion.toLowerCase().includes(actualBranch) || assignedRegion.toLowerCase().includes("all")) {
                    tpoInfo = {
                        name: contactData[k][0] || "Placement Officer", 
                        phone: contactData[k][1] || "N/A", 
                        email: contactData[k][2] || "placement@ipcsglobal.com", 
                        sittingBranch: contactData[k][3] || "N/A",
                        assignedBranches: assignedRegion, 
                        profilePhoto: contactData[k][6] || ""         
                    };
                    break;
                }
            }
        } catch (e) {}

        const responsePayload = { success: true, userInfo, stats, appliedJobs, events, attendanceHistory, isScheduledToday, hasMarkedToday, vacancies, tpoInfo, driveRSVPs };

        cache.set(cacheKey, responsePayload);

        res.status(200).json(responsePayload);
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
        const schedSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Schedule!A:D" }));
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
            if (calculatedDistance <= 1000) isWithinGeofence = true; 
        }

        let alreadyMarked = false;
        const attSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Talentino_Attendance!A:J" }));
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
        if (!isWithinGeofence) return res.status(400).json({ success: false, message: `Location Restriction. Must be within 1000m of campus. (You are ${Math.round(calculatedDistance)}m away).` }); 

        await withRetry(() => 
            googleSheets.spreadsheets.values.append({
                auth, spreadsheetId, range: "Talentino_Attendance!A:J", valueInputOption: "USER_ENTERED",
                resource: { values: [[timestamp, email, name, branch, course, location, `${rating} / 5 Stars`, feedback || "None", dateOnly, "None"]] },
            })
        );

        cache.del(`dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`);
        res.status(200).json({ success: true, message: "Attendance marked successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to submit attendance." }); }
};

const applyForJob = async (req, res) => {
    try {
        const { email, jobId, companyName, name, phone, rollNo, course, branch, qualification, resume } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

        let position = "N/A", placementOfficer = "TPO Auto-Assigned";
        try {
            const nlSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "NewsLetter!A:U" }));
            const nlData = nlSheet.data.values || [];
            for (let i = 1; i < nlData.length; i++) {
                let currentId = getCol(nlData[i], 19, "") || getCol(nlData[i], 20, "") || `JOB-${1000 + i}`;
                if (currentId.toString().trim() === jobId.toString().trim()) {
                    position = getCol(nlData[i], 5, "N/A"); 
                    placementOfficer = getCol(nlData[i], 17, "TPO Auto-Assigned"); break;
                }
            }
        } catch (e) { }

        // 1. Write the record to Opening_Applied
        await withRetry(() => 
            googleSheets.spreadsheets.values.append({
                auth, spreadsheetId, range: "Opening_Applied!A:N", valueInputOption: "USER_ENTERED",
                resource: { values: [[timestamp, name, phone, email, rollNo, course, branch, qualification || "N/A", resume || "N/A", jobId, companyName || "N/A", position, placementOfficer, "Applied"]] },
            })
        );

        // 2. Write the synchronized record to TPO_Log (Now exactly 22 columns A to V)
        const newTpoLogRow = [
            timestamp,                 // A: TimeStamp
            name || "Student",         // B: Student Name
            phone || "N/A",            // C: Contact
            email,                     // D: Mail ID
            rollNo || "N/A",           // E: Roll Number
            course || "N/A",           // F: Course
            branch || "Bangalore",     // G: Branch
            qualification || "N/A",    // H: Qualification
            resume || "N/A",           // I: Resume
            jobId,                     // J: Job ID
            companyName || "N/A",      // K: Company Name
            position || "N/A",         // L: Position
            placementOfficer,          // M: Placement Officer
            "Applied",                 // N: Status
            "",                        // O: Interview Date
            "",                        // P: Interview Time
            "",                        // Q: Interview Venue
            "",                        // R: Remarks
            "",                        // S: DATE PLACED
            "",                        // T: PACKAGE (LPA)
            "",                        // U: Offer Letter Status
            ""                         // V: Joining Status
        ];

        await withRetry(() => 
            googleSheets.spreadsheets.values.append({
                auth, spreadsheetId, range: "TPO_Log!A:V", valueInputOption: "USER_ENTERED",
                resource: { values: [newTpoLogRow] },
            })
        );

        // CLEAR RAM CACHE
        if (cache && typeof cache.del === 'function') {
            cache.del(`dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`);
        }

        res.status(200).json({ success: true, message: "Applied successfully!" });
    } catch (error) { 
        console.error("Job Application Error:", error);
        res.status(500).json({ success: false, message: "Failed to apply for job." }); 
    }
};

const updateProfile = async (req, res) => {
    try {
        const { email, age, gender, studyStatus, completedDate, stream, homeTown, fresherStatus, qualification, linkedin, instagram, placementReq, parentName, parentContact, branch } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AF" }));
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        
        for (let i = rows.length - 1; i >= 1; i--) {
            const rowEmail = getCol(rows[i], 3, "");
            if (rowEmail.toLowerCase() === email.toLowerCase()) { 
                targetRowIndex = i + 1; 
                break; 
            }
        }
        
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        // FIX: Google Sheets API strictly requires "requestBody" for batch updates, not "resource".
        await withRetry(() => 
            googleSheets.spreadsheets.values.batchUpdate({
                auth, 
                spreadsheetId,
                requestBody: {
                    valueInputOption: "USER_ENTERED",
                    data: [
                        { range: `Data!K${targetRowIndex}:Q${targetRowIndex}`, values: [[homeTown || "N/A", qualification || "N/A", stream || "N/A", fresherStatus || "N/A", linkedin || "N/A", instagram || "N/A", placementReq || "N/A"]] },
                        { range: `Data!W${targetRowIndex}:X${targetRowIndex}`, values: [[parentName || "N/A", parentContact || "N/A"]] },
                        { range: `Data!Y${targetRowIndex}:Z${targetRowIndex}`, values: [[studyStatus || "Currently Studying", completedDate || "N/A"]] },
                        { range: `Data!AA${targetRowIndex}:AB${targetRowIndex}`, values: [[age || "N/A", gender || "N/A"]] }
                    ]
                }
            })
        );

        // Fetch the updated row to send back the fresh data to frontend
        const updatedSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: `Data!A:AF` }));
        const allRows = updatedSheet.data.values || [];
        const updatedRow = allRows[targetRowIndex - 1];

        const completeUserObj = {
            name: getCol(updatedRow, 1, "Student"), phone: getCol(updatedRow, 2, "N/A"), email: getCol(updatedRow, 3), rollNo: getCol(updatedRow, 5, "N/A"),
            joiningDate: getCol(updatedRow, 6, "N/A"), course: getCol(updatedRow, 7, "N/A"), branch: getCol(updatedRow, 8, "Bangalore"), photo: getCol(updatedRow, 9, ""),
            homeTown: getCol(updatedRow, 10, "N/A"), qualification: getCol(updatedRow, 11, "N/A"), stream: getCol(updatedRow, 12, "N/A"), fresherStatus: getCol(updatedRow, 13, "N/A"),
            linkedin: getCol(updatedRow, 14, "N/A"), instagram: getCol(updatedRow, 15, "N/A"), placementReq: getCol(updatedRow, 16, "N/A"), friend1Name: getCol(updatedRow, 17, "N/A"),
            friend1Phone: getCol(updatedRow, 18, "N/A"), friend2Name: getCol(updatedRow, 19, "N/A"), friend2Phone: getCol(updatedRow, 20, "N/A"), resume: getCol(updatedRow, 21, "N/A"),
            parentName: getCol(updatedRow, 22, "N/A"), parentContact: getCol(updatedRow, 23, "N/A"), studyStatus: getCol(updatedRow, 24, "Currently Studying"),
            completedDate: getCol(updatedRow, 25, "N/A"), age: getCol(updatedRow, 26, "N/A"), gender: getCol(updatedRow, 27, "N/A"), certificate: getCol(updatedRow, 28, "N/A"),
            vacancyOpen: getCol(updatedRow, 29, "Yes"), studyMaterialAccess: getCol(updatedRow, 30, "Yes"), placementStatus: getCol(updatedRow, 31, "Pending"), 
            techExamAccess: "Yes" // Manually inject access to the technical exam without needing an extra sheet column
        };

        // Clear RAM cache so it updates instantly
        cache.del(`dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`);

        res.status(200).json({ success: true, message: "Profile updated successfully!", user: completeUserObj });
    } catch (error) { 
        console.error("Profile Update Error Details:", error);
        res.status(500).json({ success: false, message: "Failed to update profile." }); 
    }
};

const uploadDocument = async (req, res) => {
    try {
        const { email, rollNo, base64, docType, branch } = req.body;
        
        const base64Clean = docType === 'Photo' 
            ? base64.replace(/^data:image\/\w+;base64,/, "") 
            : base64.replace(/^data:application\/pdf;base64,/, "");
        
        const action = docType === 'Photo' ? 'updateProfilePhoto' : 'updateDocument';

        const response = await axios.post(process.env.APPS_SCRIPT_PHOTO_URL, { 
            action: action, email: email, rollNo: rollNo, base64: base64Clean, docType: docType,
            filename: `${rollNo}_${docType}`, mimeType: docType === 'Photo' ? 'image/jpeg' : 'application/pdf',
            folderName: docType === 'Photo' ? 'Profile Photo' : (docType === 'Resume' ? 'Resumes' : 'Certificates')
        }, { timeout: 30000 });
        
        const result = response.data;
        
        if (!result || !result.success) {
            return res.status(500).json({ success: false, message: result?.message || "Drive upload failed in Apps Script" });
        }

        try {
            const { googleSheets, auth } = await connectSheet();
            const spreadsheetId = process.env.SPREADSHEET_ID;
            const getRows = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:D" }));
            const rows = getRows.data.values || [];
            let targetRowIndex = -1;
            
            for (let i = rows.length - 1; i >= 1; i--) {
                if (rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                    targetRowIndex = i + 1; 
                    break;
                }
            }
            
            if (targetRowIndex !== -1) {
                let columnLetter = docType === 'Photo' ? 'J' : (docType === 'Resume' ? 'V' : 'AC');
                await withRetry(() => 
                    googleSheets.spreadsheets.values.update({
                        auth, spreadsheetId, range: `Data!${columnLetter}${targetRowIndex}`,
                        valueInputOption: "USER_ENTERED", resource: { values: [[result.url]] }
                    })
                );
            }
        } catch (sheetUpdateErr) {}

        cache.del(`dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`);

        res.status(200).json({ success: true, message: `${docType} uploaded successfully!`, url: result.url });
    } catch (error) { res.status(500).json({ success: false, message: error.response?.data?.message || "Node server failed to reach Google Apps Script." }); }
};

const updatePassword = async (req, res) => {
    try {
        const { email, currentPassword, newPassword } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;

        const getRows = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Data!A:AF" }));
        const rows = getRows.data.values || [];
        let targetRowIndex = -1;
        
        for (let i = rows.length - 1; i >= 1; i--) {
            const rowEmail = rows[i][3] || "";
            if (rowEmail.toLowerCase() === email.toLowerCase()) {
                const rowPass = rows[i][4] || "";
                if (rowPass !== currentPassword) return res.status(400).json({ success: false, message: "Incorrect current password." });
                targetRowIndex = i + 1; 
                break;
            }
        }
        if (targetRowIndex === -1) return res.status(404).json({ success: false, message: "User not found." });

        await withRetry(() => googleSheets.spreadsheets.values.update({ auth, spreadsheetId, range: `Data!E${targetRowIndex}`, valueInputOption: "USER_ENTERED", resource: { values: [[newPassword]] } }));
        res.status(200).json({ success: true, message: "Password updated successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to update password." }); }
};

const submitIssue = async (req, res) => {
    try {
        const { email, name, phone, rollNo, branch, course, issueDetails, location } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

        const newTicket = [ timestamp, name, phone || "N/A", rollNo || "N/A", email, branch || "Bangalore", course || "N/A", location || "N/A", issueDetails, "Pending", "" ];

        await withRetry(() => googleSheets.spreadsheets.values.append({ auth, spreadsheetId, range: "Issues!A:K", valueInputOption: "USER_ENTERED", resource: { values: [newTicket] }, }));
        res.status(200).json({ success: true, message: "Issue reported successfully!" });
    } catch (error) { res.status(500).json({ success: false, message: "Failed to submit issue." }); }
};

const submitDriveResponse = async (req, res) => {
    try {
        const { driveId, title, name, phone, email, course, branch, qualification, resume, status } = req.body;
        const { googleSheets, auth } = await connectSheet();
        const spreadsheetId = process.env.SPREADSHEET_ID;
        const targetDriveId = driveId || title || "N/A";

        try {
            const checkSheet = await withRetry(() => googleSheets.spreadsheets.values.get({ auth, spreadsheetId, range: "Drive_Registration!A:D" }));
            const rows = checkSheet.data.values || [];
            for (let i = 1; i < rows.length; i++) {
                if (rows[i][0] === targetDriveId && rows[i][3] && rows[i][3].toLowerCase() === email.toLowerCase()) {
                    return res.status(400).json({ success: false, message: 'You have already submitted a response for this drive.' });
                }
            }
        } catch (e) {}

        const timestamp = new Date().toLocaleString("en-US", { timeZone: "Asia/Kolkata" });

        await withRetry(() => googleSheets.spreadsheets.values.append({ auth, spreadsheetId, range: "Drive_Registration!A:J", valueInputOption: "USER_ENTERED", resource: { values: [[ targetDriveId, name || "N/A", phone || "N/A", email || "N/A", course || "N/A", branch || "N/A", resume || "N/A", qualification || "N/A", status || "N/A", timestamp ]] }, }));

        cache.del(`dashboard_${email.toLowerCase().trim()}_${(branch || 'Bangalore').toLowerCase().trim()}`);
        res.status(200).json({ success: true, message: `Status updated to: ${status}` });
    } catch (error) { res.status(500).json({ success: false, message: 'Failed to record response.' }); }
};

module.exports = { getDashboardData, markAttendance, applyForJob, updateProfile, uploadDocument, updatePassword, submitIssue, submitDriveResponse };