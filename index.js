const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip'); // New dependency

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

let publicFiles = [];

const storage = multer.diskStorage({
    destination: 'uploads/',
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const upload = multer({ storage: storage, limits: { fileSize: 10 * 1024 * 1024 } });

app.use(express.static('public'));
app.use('/view', express.static('uploads'));
app.use(express.json());

app.post('/upload', upload.single('file'), (req, res) => {
    if (!req.file) return res.status(400).send('No file.');

    const tempPath = req.file.path;
    const fileBuffer = fs.readFileSync(tempPath);
    const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex').substring(0, 12);
    const ext = path.extname(req.file.originalname).toLowerCase();
    
    let finalName = `${hash}${ext}`;
    let finalPath = path.join(UPLOAD_DIR, finalName);
    let viewLink = `${req.protocol}://${req.get('host')}/view/${finalName}`;

    if (ext === '.zip') {
        const zipDir = path.join(UPLOAD_DIR, hash);
        if (!fs.existsSync(zipDir)) {
            const zip = new AdmZip(tempPath);
            zip.extractAllTo(zipDir, true);
        }
        viewLink = `${req.protocol}://${req.get('host')}/view/${hash}/index.html`;
        finalName = hash; // Reference the folder for deletion
    } else {
        fs.renameSync(tempPath, finalPath);
    }

    if (req.body.makePublic === 'true') {
        publicFiles.unshift({ id: hash, link: viewLink, name: req.file.originalname, time: new Date().toLocaleTimeString() });
    }

    res.json({ link: viewLink, id: hash });
});

// Delete Route
app.post('/delete', (req, res) => {
    const { id } = req.body;
    // Remove from Public Chat
    publicFiles = publicFiles.filter(f => f.id !== id);
    
    // Remove from Disk (Checking for file or directory)
    const targetPath = path.join(UPLOAD_DIR, id);
    try {
        if (fs.existsSync(targetPath)) {
            fs.rmSync(targetPath, { recursive: true, force: true });
        }
        // Also check if it's a file with an extension (non-zip)
        const files = fs.readdirSync(UPLOAD_DIR);
        files.forEach(f => { if(f.startsWith(id)) fs.unlinkSync(path.join(UPLOAD_DIR, f)); });
        
        res.json({ success: true });
    } catch (e) {
        res.status(500).json({ error: "Failed to delete" });
    }
});

app.get('/chat', (req, res) => res.json(publicFiles));

// Reaper (every 15 mins)
setInterval(() => {
    const now = Date.now();
    fs.readdir(UPLOAD_DIR, (err, items) => {
        if (err) return;
        items.forEach(item => {
            const p = path.join(UPLOAD_DIR, item);
            const stats = fs.statSync(p);
            if (now - stats.mtimeMs > 12 * 60 * 60 * 1000) {
                fs.rmSync(p, { recursive: true, force: true });
                publicFiles = publicFiles.filter(f => f.id !== item.split('.')[0]);
            }
        });
    });
}, 15 * 60 * 1000);

app.listen(PORT, () => console.log(`Server on ${PORT}`));
