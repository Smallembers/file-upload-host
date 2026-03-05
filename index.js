const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');

if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

// Storage for the public "Chat" (Resets on Render restart)
let publicFiles = [];

// 1. Custom Storage Engine to Hash Files
const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => {
        // We temporarily name it to hash it later
        cb(null, Date.now() + '-' + file.originalname);
    }
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static('public'));
app.use('/view', express.static('uploads'));
app.use(express.json());

// 2. Upload and Hash Logic
app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file.');

    const tempPath = req.file.path;
    const fileBuffer = fs.readFileSync(tempPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 12);
    const ext = path.extname(req.file.originalname);
    const finalName = `${hash}${ext}`;
    const finalPath = path.join(UPLOAD_DIR, finalName);

    // Rename temp file to hashed name (overwrites if identical)
    fs.renameSync(tempPath, finalPath);

    const viewLink = `${req.protocol}://${req.get('host')}/view/${finalName}`;
    
    // If "Make Public" was checked
    if (req.body.makePublic === 'true') {
        publicFiles.unshift({ link: viewLink, name: req.file.originalname, time: new Date().toLocaleTimeString() });
        if (publicFiles.length > 20) publicFiles.pop(); // Keep last 20
    }

    res.json({ link: viewLink });
});

// 3. Chat/Feed Route
app.get('/chat', (req, res) => res.json(publicFiles));

// 4. Reaper (Cleans up files older than 12h)
setInterval(() => {
    const now = Date.now();
    fs.readdir(UPLOAD_DIR, (err, files) => {
        if (err) return;
        files.forEach(file => {
            const filePath = path.join(UPLOAD_DIR, file);
            fs.stat(filePath, (err, stats) => {
                if (!err && (now - stats.mtimeMs > 12 * 60 * 60 * 1000)) {
                    fs.unlink(filePath, () => {});
                }
            });
        });
    });
}, 15 * 60 * 1000);

app.listen(PORT, () => console.log(`Server running on ${PORT}`));
