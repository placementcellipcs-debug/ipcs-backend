const { google } = require('googleapis');
const path = require('path');

const connectSheet = async () => {
    try {
        const auth = new google.auth.GoogleAuth({
            keyFile: path.join(__dirname, '../google-credentials.json'),
            scopes: [
                'https://www.googleapis.com/auth/spreadsheets',
                'https://www.googleapis.com/auth/drive'
            ],
        });

        const client = await auth.getClient();
        const googleSheets = google.sheets({ version: 'v4', auth: client });
        
        console.log("Successfully connected to Google APIs!");
        return { auth, googleSheets };
    } catch (error) {
        console.error("Error connecting to Google APIs:", error.message);
    }
};

module.exports = connectSheet;