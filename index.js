const express = require('express');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const AdmZip = require('adm-zip');

const app = express();
const PORT = process.env.PORT || 3000;
const UPLOAD_DIR = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR);

let publicFiles = [];

// Helper: Recursively find the first .html file
function findFirstHtml(dir, baseDir = '') {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const relativePath = path.join(baseDir, file);
        if (fs.statSync(fullPath).isDirectory()) {
            const found = findFirstHtml(fullPath, relativePath);
            if (found) return found;
        } else if (file.toLowerCase().endsWith('.html')) {
            return relativePath;
        }
    }
    return null;
}

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
    let viewLink = `${req.protocol}://${req.get('host')}/view/${finalName}`;

    if (ext === '.zip') {
        const zipDir = path.join(UPLOAD_DIR, hash);
        if (!fs.existsSync(zipDir)) {
            const zip = new AdmZip(tempPath);
            zip.extractAllTo(zipDir, true);
        }
        
        // Logic for Entry Point: Manual > index.html > First .html found
        let entry = req.body.entryPoint || 'index.html';
        if (!fs.existsSync(path.join(zipDir, entry))) {
            const autoFound = findFirstHtml(zipDir);
            entry = autoFound || entry;
        }
        
        viewLink = `${req.protocol}://${req.get('host')}/view/${hash}/${entry}`;
        finalName = hash; 
    } else {
        fs.renameSync(tempPath, path.join(UPLOAD_DIR, finalName));
    }

    if (req.body.makePublic === 'true') {
        publicFiles.unshift({ id: hash, link: viewLink, name: req.file.originalname, time: new Date().toLocaleTimeString() });
    }

    res.json({ link: viewLink, id: hash });
});

// Reuse the /delete and /chat routes from the previous code...
app.post('/delete', (req, res) => {
    const { id } = req.body;
    publicFiles = publicFiles.filter(f => f.id !== id);
    const targetPath = path.join(UPLOAD_DIR, id);
    try {
        if (fs.existsSync(targetPath)) fs.rmSync(targetPath, { recursive: true, force: true });
        const files = fs.readdirSync(UPLOAD_DIR);
        files.forEach(f => { if(f.startsWith(id)) fs.unlinkSync(path.join(UPLOAD_DIR, f)); });
        res.json({ success: true });
    } catch (e) { res.status(500).send(); }
});

app.get('/chat', (req, res) => res.json(publicFiles));

app.listen(PORT, () => console.log(`Server running`));
