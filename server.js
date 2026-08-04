const express = require('express');
const dotenv = require('dotenv');
const cors = require('cors');
const connectSheet = require('./config/db');
const authRoutes = require('./routes/authRoutes'); 
const dashboardRoutes = require('./routes/dashboardRoutes');

dotenv.config();

const app = express();
app.use(express.json({ limit: '10mb' })); 
app.use(cors());

connectSheet();

app.use('/api/auth', authRoutes);
app.use('/api/dashboard', dashboardRoutes);

app.get('/', (req, res) => {
    res.send('IPCS Portal Backend connected to Google Sheets!');
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});