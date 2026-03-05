const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

// Ensure upload directory exists
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// 1. Configure Multer (10MB Limit)
const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/'),
    filename: (req, file, cb) => {
        const uniqueName = `${uuidv4()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const upload = multer({ 
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 } 
});

// 2. Serve the UI and the Files
app.use(express.static('public'));
app.use('/view', express.static('uploads'));

// 3. Upload Route
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file uploaded or file too large.');
    
    const viewLink = `${req.protocol}://${req.get('host')}/view/${req.file.filename}`;
    res.json({ link: viewLink });
});

// 4. The "Reaper" (Cleanup Script)
// Runs every 30 minutes to check for expired files
setInterval(() => {
    const now = Date.now();
    const expirationTime = 12 * 60 * 60 * 1000; // 12 Hours

    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(UPLOAD_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (err) return;
                if (now - stats.mtimeMs > expirationTime) {
                    fs.unlink(filePath, () => console.log(`Deleted: ${file}`));
                }
            });
        });
    });
}, 30 * 60 * 1000); 

app.listen(PORT, () => console.log(`Server active on port ${PORT}`));
