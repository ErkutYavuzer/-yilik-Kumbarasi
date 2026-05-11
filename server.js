require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { moderate } = require('./contentModerator');

// Crash protection - prevent server from dying on errors
process.on('uncaughtException', (err) => {
    console.error('⚠️ Uncaught Exception:', err.message);
});
process.on('unhandledRejection', (reason) => {
    console.error('⚠️ Unhandled Rejection:', reason);
});
process.on('SIGTERM', () => {
    console.log('🛑 SIGTERM received, staying alive...');
});
process.stdin.resume(); // Keep process alive

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Uploads klasörünü oluştur
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

// Data klasörünü oluştur
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
}

// Uploads Archive klasörünü oluştur
const archiveDir = path.join(uploadsDir, 'archive');
if (!fs.existsSync(archiveDir)) {
    fs.mkdirSync(archiveDir, { recursive: true });
}

// Oturum (Session) Arşivleri için klasör oluştur
const sessionsDir = path.join(dataDir, 'sessions');
if (!fs.existsSync(sessionsDir)) {
    fs.mkdirSync(sessionsDir, { recursive: true });
}

const dataFile = path.join(dataDir, 'wishes.json');
const archiveFile = path.join(dataDir, 'archive_wishes.json');
const rejectedFile = path.join(dataDir, 'rejected_wishes.json');
const pendingFile = path.join(dataDir, 'pending_wishes.json');
const settingsFile = path.join(dataDir, 'settings.json');

// Ayarları dosyadan yükle
function loadSettings() {
    try {
        if (fs.existsSync(settingsFile)) {
            return JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
        }
    } catch (e) {
        console.error('⚠️ Settings yüklenemedi:', e.message);
    }
    return {};
}

// Ayarları dosyaya kaydet
function saveSettings(settings) {
    try {
        const current = loadSettings();
        const merged = { ...current, ...settings };
        fs.writeFileSync(settingsFile, JSON.stringify(merged, null, 2), 'utf8');
    } catch (e) {
        console.error('⚠️ Settings kaydedilemedi:', e.message);
    }
}

// JSON dosyasından dilekleri yükle
function loadWishes() {
    try {
        if (fs.existsSync(dataFile)) {
            const data = fs.readFileSync(dataFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Veri yükleme hatası:', err.message);
    }
    return [];
}

// Reddedilen dilekleri yükle
function loadRejectedWishes() {
    try {
        if (fs.existsSync(rejectedFile)) {
            const data = fs.readFileSync(rejectedFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) { }
    return [];
}

// Reddedilen dileği kaydet
function saveToRejected(wish, reason) {
    let rejected = loadRejectedWishes();
    rejected.push({ ...wish, rejectedReason: reason, rejectedAt: new Date().toISOString() });
    try {
        // Son 100 reddedilen kaydı tutalım
        if (rejected.length > 100) rejected.shift();
        fs.writeFileSync(rejectedFile, JSON.stringify(rejected, null, 2), 'utf8');
    } catch (err) {
        console.error('Red kaydetme hatası:', err.message);
    }
}

function clearRejectedWishes() {
    try {
        fs.writeFileSync(rejectedFile, JSON.stringify([], null, 2), 'utf8');
    } catch (err) {
        console.error('Red logu temizleme hatası:', err.message);
        throw err;
    }
}

// Bekleyen dilekleri dosyaya kaydet
function savePendingWishes() {
    try {
        fs.writeFileSync(pendingFile, JSON.stringify(pendingWishes, null, 2), 'utf8');
    } catch (err) {
        console.error('Bekleyen veri kaydetme hatası:', err.message);
    }
}

// Bekleyen dilekleri JSON dosyasından yükle
function loadPendingWishes() {
    try {
        if (fs.existsSync(pendingFile)) {
            const data = fs.readFileSync(pendingFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Bekleyen veri yükleme hatası:', err.message);
    }
    return [];
}

// Dilekleri JSON dosyasına kaydet
function saveWishes() {
    try {
        fs.writeFileSync(dataFile, JSON.stringify(wishes, null, 2), 'utf8');
    } catch (err) {
        console.error('Veri kaydetme hatası:', err.message);
    }
}

// Arşivlenen dilekleri yükle
function loadArchiveWishes() {
    try {
        if (fs.existsSync(archiveFile)) {
            const data = fs.readFileSync(archiveFile, 'utf8');
            return JSON.parse(data);
        }
    } catch (err) {
        console.error('Arşiv yükleme hatası:', err.message);
    }
    return [];
}

// Arşive dilek ekle ve kaydet
function saveToArchive(wish) {
    let archive = loadArchiveWishes();
    archive.push(wish);
    try {
        fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2), 'utf8');
    } catch (err) {
        console.error('Arşiv kaydetme hatası:', err.message);
    }
}

// Multer konfigürasyonu
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, uploadsDir);
    },
    filename: (req, file, cb) => {
        const uniqueName = `dilek_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.jpg`;
        cb(null, uniqueName);
    }
});

const upload = multer({ storage });

function renderDisplayPage(req, res) {
    const displayPath = path.join(__dirname, 'public', 'display.html');
    const title = 'ASELSAN HBTKON - Dilek Ekranı';
    const siteName = 'ASELSAN HBTKON';
    let html = fs.readFileSync(displayPath, 'utf8');
    html = html
        .replace(/__DISPLAY_TITLE__/g, title)
        .replace(/__DISPLAY_SITE__/g, siteName);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

function renderAdminPage(req, res) {
    const adminPath = path.join(__dirname, 'public', 'admin.html');
    const title = 'ASELSAN HBTKON - Yönetim';
    const siteName = 'ASELSAN HBTKON';
    let html = fs.readFileSync(adminPath, 'utf8');
    html = html
        .replace(/__ADMIN_TITLE__/g, title)
        .replace(/__ADMIN_SITE__/g, siteName);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

function renderUploadPage(req, res) {
    const uploadPath = path.join(__dirname, 'public', 'upload.html');
    const title = 'ASELSAN HBTKON - Dileğini Paylaş';
    const siteName = 'ASELSAN HBTKON';
    let html = fs.readFileSync(uploadPath, 'utf8');
    html = html
        .replace(/__UPLOAD_TITLE__/g, title)
        .replace(/__UPLOAD_SITE__/g, siteName);
    res.set('Content-Type', 'text/html; charset=utf-8');
    res.send(html);
}

// Ana sayfa
app.get('/', (req, res) => {
    renderDisplayPage(req, res);
});

// Clean URLs - .html uzantısız erişim
app.get('/display', (req, res) => {
    renderDisplayPage(req, res);
});
app.get('/display.html', (req, res) => {
    renderDisplayPage(req, res);
});

// Static dosyalar
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

// Dilekleri dosyadan yükle
let wishes = loadWishes();
// Geriye dönük uyumluluk: Mevcut tüm dilekleri onaylı olarak işaretle
let wishesUpdated = false;
wishes.forEach(w => {
    if (!w.status) {
        w.status = 'approved';
        wishesUpdated = true;
    }
});
if (wishesUpdated) {
    saveWishes();
}

let pendingWishes = loadPendingWishes();
console.log(`📂 ${wishes.length} dilek yüklendi.`);
console.log(`📂 ${pendingWishes.length} bekleyen dilek yüklendi.`);

// Çekiliş Hafızası (Bu oturumda çıkan talihlilerin ID'lerini tutar)
let drawnWishes = [];

// AI Moderasyon ayarlari
const savedAppSettings = loadSettings();
const savedModerationSettings = savedAppSettings.moderationSettings || {};
let moderationSettings = {
    enabled: typeof savedModerationSettings.enabled === 'boolean' ? savedModerationSettings.enabled : true,
    checkText: typeof savedModerationSettings.checkText === 'boolean' ? savedModerationSettings.checkText : true,
    model: 'gemini-3-flash',
    strictness: ['strict', 'normal', 'lenient'].includes(savedModerationSettings.strictness) ? savedModerationSettings.strictness : 'normal',
    autoApprove: typeof savedModerationSettings.autoApprove === 'boolean' ? savedModerationSettings.autoApprove : false
};

// Ekran (Gösterim) Ayarları
const savedDisplaySettings = savedAppSettings.displaySettings || {};
const normalizeMessageWallEntranceStyle = (value) => {
    if (value === 'soft') return 'glide';
    return value;
};
let displaySettings = {
    speedMultiplier: savedDisplaySettings.speedMultiplier || 1.0,
    scaleMultiplier: savedDisplaySettings.scaleMultiplier || 1.0,
    messageWallEntranceStyle: ['standard', 'glide', 'pop'].includes(normalizeMessageWallEntranceStyle(savedDisplaySettings.messageWallEntranceStyle)) ? normalizeMessageWallEntranceStyle(savedDisplaySettings.messageWallEntranceStyle) : 'standard',
    maxVisible: savedDisplaySettings.maxVisible || 20,
    logoOffsetPx: typeof savedDisplaySettings.logoOffsetPx === 'number' ? savedDisplaySettings.logoOffsetPx : 0,
    headerOffsetPx: typeof savedDisplaySettings.headerOffsetPx === 'number' ? savedDisplaySettings.headerOffsetPx : 0,
    logoScale: typeof savedDisplaySettings.logoScale === 'number' ? savedDisplaySettings.logoScale : 1,
    headerScale: typeof savedDisplaySettings.headerScale === 'number' ? savedDisplaySettings.headerScale : 1,
    bakanlikScale: typeof savedDisplaySettings.bakanlikScale === 'number' ? savedDisplaySettings.bakanlikScale : 1,
    akmScale: typeof savedDisplaySettings.akmScale === 'number' ? savedDisplaySettings.akmScale : 1,
    bakanlikX: typeof savedDisplaySettings.bakanlikX === 'number' ? savedDisplaySettings.bakanlikX : 0,
    bakanlikY: typeof savedDisplaySettings.bakanlikY === 'number' ? savedDisplaySettings.bakanlikY : 0,
    akmX: typeof savedDisplaySettings.akmX === 'number' ? savedDisplaySettings.akmX : 0,
    akmY: typeof savedDisplaySettings.akmY === 'number' ? savedDisplaySettings.akmY : 0,
    logoTopX: typeof savedDisplaySettings.logoTopX === 'number' ? savedDisplaySettings.logoTopX : 0,
    logoTopY: typeof savedDisplaySettings.logoTopY === 'number' ? savedDisplaySettings.logoTopY : 0,
    headerX: typeof savedDisplaySettings.headerX === 'number' ? savedDisplaySettings.headerX : 0,
    headerY: typeof savedDisplaySettings.headerY === 'number' ? savedDisplaySettings.headerY : 0,
    dayMode: typeof savedDisplaySettings.dayMode === 'boolean' ? savedDisplaySettings.dayMode : false,
    qrVisible: typeof savedDisplaySettings.qrVisible === 'boolean' ? savedDisplaySettings.qrVisible : false,
    qrSize: typeof savedDisplaySettings.qrSize === 'number' ? savedDisplaySettings.qrSize : 220,
    qrTop: typeof savedDisplaySettings.qrTop === 'number' ? savedDisplaySettings.qrTop : 160,
    qrRight: typeof savedDisplaySettings.qrRight === 'number' ? savedDisplaySettings.qrRight : 80
};

function persistModerationSettings() {
    saveSettings({ moderationSettings });
}

function approveWishDirect(wish) {
    wish.status = 'approved';
    wishes.push(wish);
    saveWishes();
    io.emit('new-wish', wish);
    return wish;
}

app.get('/upload', (req, res) => {
    renderUploadPage(req, res);
});
app.get('/upload.html', (req, res) => {
    renderUploadPage(req, res);
});
app.get('/admin', (req, res) => {
    renderAdminPage(req, res);
});
app.get('/admin.html', (req, res) => {
    renderAdminPage(req, res);
});
app.get('/marka-bulusmalari-qr-flyer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marka-bulusmalari-qr-flyer.html'));
});
app.get('/marka-bulusmalari-qr-flyer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marka-bulusmalari-qr-flyer.html'));
});
app.get('/aselsan-qr-flyer', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marka-bulusmalari-qr-flyer.html'));
});
app.get('/aselsan-qr-flyer.html', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'marka-bulusmalari-qr-flyer.html'));
});

// Moderasyon Ayarları API'leri (Frontend Arayüzüne Uygun)
app.get('/api/moderation', (req, res) => {
    res.json(moderationSettings);
});

// Moderasyon Logu Getir
app.get('/api/moderation/log', (req, res) => {
    res.json(loadRejectedWishes());
});

app.delete('/api/moderation/log', (req, res) => {
    try {
        clearRejectedWishes();
        console.log('🧹 Moderasyon logu temizlendi');
        res.json({ success: true });
    } catch (err) {
        res.status(500).json({ success: false, error: 'Moderasyon logu temizlenemedi' });
    }
});

// Moderasyon açık/kapalı (Toggle)
app.post('/api/moderation/toggle', (req, res) => {
    moderationSettings.enabled = !moderationSettings.enabled;
    const state = moderationSettings.enabled ? 'AÇIK' : 'KAPALI';
    console.log(`\n⚙️ Moderasyon durumu toggle:`, state);
    persistModerationSettings();
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

// Moderasyon seviyesi, vb tüm ayarların güncellenmesi
app.post('/api/moderation/settings', (req, res) => {
    // Arayüzden artık "model" gönderilmeyeceği/gönderilse de arka planda geçerli olmayacağı için sabit tutuyoruz.
    const { enabled, strictness, checkText, autoApprove } = req.body;

    if (typeof enabled === 'boolean') moderationSettings.enabled = enabled;
    if (['strict', 'normal', 'lenient'].includes(strictness)) moderationSettings.strictness = strictness;
    if (typeof checkText === 'boolean') moderationSettings.checkText = checkText;
    if (typeof autoApprove === 'boolean') moderationSettings.autoApprove = autoApprove;

    console.log(`\n⚙️ Moderasyon Ayarları Güncellendi:`, moderationSettings);
    persistModerationSettings();
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

// Ekran Ayarları API'si
app.get('/api/display-settings', (req, res) => {
    res.json(displaySettings);
});

// Ekran Ayarlarını Güncelle API'si
app.post('/api/display-settings', (req, res) => {
    const { speedMultiplier, scaleMultiplier, messageWallEntranceStyle, maxVisible, logoOffsetPx, headerOffsetPx, logoScale, headerScale, bakanlikScale, akmScale, bakanlikX, bakanlikY, akmX, akmY, logoTopX, logoTopY, headerX, headerY, dayMode, qrVisible, qrSize, qrTop, qrRight } = req.body;
    const normalizedEntranceStyle = normalizeMessageWallEntranceStyle(messageWallEntranceStyle);

    if (typeof speedMultiplier === 'number') displaySettings.speedMultiplier = speedMultiplier;
    if (typeof scaleMultiplier === 'number') displaySettings.scaleMultiplier = scaleMultiplier;
    if (['standard', 'glide', 'pop'].includes(normalizedEntranceStyle)) displaySettings.messageWallEntranceStyle = normalizedEntranceStyle;
    if (typeof maxVisible === 'number') displaySettings.maxVisible = Math.max(1, Math.min(100, maxVisible));
    if (typeof logoOffsetPx === 'number') displaySettings.logoOffsetPx = Math.max(-2160, Math.min(2160, logoOffsetPx));
    if (typeof headerOffsetPx === 'number') displaySettings.headerOffsetPx = Math.max(-2160, Math.min(2160, headerOffsetPx));
    if (typeof logoScale === 'number') displaySettings.logoScale = Math.max(0.2, Math.min(3.0, logoScale));
    if (typeof headerScale === 'number') displaySettings.headerScale = Math.max(0.2, Math.min(3.0, headerScale));
    if (typeof bakanlikScale === 'number') displaySettings.bakanlikScale = Math.max(0.2, Math.min(3.0, bakanlikScale));
    if (typeof akmScale === 'number') displaySettings.akmScale = Math.max(0.2, Math.min(3.0, akmScale));
    if (typeof bakanlikX === 'number') displaySettings.bakanlikX = Math.max(-2160, Math.min(2160, bakanlikX));
    if (typeof bakanlikY === 'number') displaySettings.bakanlikY = Math.max(-2160, Math.min(2160, bakanlikY));
    if (typeof akmX === 'number') displaySettings.akmX = Math.max(-2160, Math.min(2160, akmX));
    if (typeof akmY === 'number') displaySettings.akmY = Math.max(-2160, Math.min(2160, akmY));
    if (typeof logoTopX === 'number') displaySettings.logoTopX = Math.max(-2160, Math.min(2160, logoTopX));
    if (typeof logoTopY === 'number') displaySettings.logoTopY = Math.max(-2160, Math.min(2160, logoTopY));
    if (typeof headerX === 'number') displaySettings.headerX = Math.max(-2160, Math.min(2160, headerX));
    if (typeof headerY === 'number') displaySettings.headerY = Math.max(-2160, Math.min(2160, headerY));
    if (typeof dayMode === 'boolean') displaySettings.dayMode = dayMode;
    if (typeof qrVisible === 'boolean') displaySettings.qrVisible = qrVisible;
    if (typeof qrSize === 'number') displaySettings.qrSize = Math.max(120, Math.min(480, qrSize));
    if (typeof qrTop === 'number') displaySettings.qrTop = Math.max(0, Math.min(2160, qrTop));
    if (typeof qrRight === 'number') displaySettings.qrRight = Math.max(0, Math.min(2160, qrRight));

    console.log(`
📺 Ekran Ayarları Güncellendi: Hız: ${displaySettings.speedMultiplier}x, Büyüklük: ${displaySettings.scaleMultiplier}x, Max: ${displaySettings.maxVisible}`);
    io.emit('display-settings', displaySettings);
    saveSettings({ displaySettings });
    res.json({ success: true, ...displaySettings });
});

// Arşivlenen tüm dilekleri getir
app.get('/api/archive', (req, res) => {
    const archived = loadArchiveWishes();
    res.json(archived);
});

// Oturumları (Sessions) Listele
app.get('/api/sessions', (req, res) => {
    try {
        if (!fs.existsSync(sessionsDir)) {
            return res.json([]);
        }

        const files = fs.readdirSync(sessionsDir).filter(f => f.endsWith('.json') && !f.endsWith('.restored.json'));
        const sessions = files.map(file => {
            const filePath = path.join(sessionsDir, file);
            const stats = fs.statSync(filePath);
            const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

            return {
                filename: file,
                createdAt: stats.birthtime,
                count: data.length
            };
        });

        // En yeniler üstte
        res.json(sessions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)));
    } catch (e) {
        console.error('Oturum okuma hatası:', e);
        res.status(500).json({ error: 'Oturumlar okunamadı' });
    }
});

// Oturumu topluca geri yükle
app.post('/api/sessions/:filename/restore', (req, res) => {
    const { filename } = req.params;
    const sessionFile = path.join(sessionsDir, filename);

    if (!fs.existsSync(sessionFile)) {
        return res.status(404).json({ error: 'Oturum dosyası bulunamadı' });
    }

    try {
        const sessionWishes = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
        let archive = loadArchiveWishes();
        let restoredCount = 0;

        sessionWishes.forEach(sw => {
            const wishIndex = archive.findIndex(aw => aw.id === sw.id);
            if (wishIndex !== -1) {
                const wishToRestore = archive[wishIndex];

                // Fotoğrafı Geri Al
                if (wishToRestore.photoUrl && wishToRestore.photoUrl.includes('/uploads/archive/')) {
                    const fname = path.basename(wishToRestore.photoUrl);
                    const oldPath = path.join(archiveDir, fname);
                    const newPath = path.join(uploadsDir, fname);

                    if (fs.existsSync(oldPath)) {
                        fs.renameSync(oldPath, newPath);
                        wishToRestore.photoUrl = `/uploads/${fname}`;
                    }
                }

                delete wishToRestore.archivedAt;

                // Aktif listeye ekle, arşivden sil
                wishes.push(wishToRestore);
                archive.splice(wishIndex, 1);
                restoredCount++;
                io.emit('new-wish', wishToRestore); // Canlı ekrana yansıt
            }
        });

        // Veritabanını güncelle
        saveWishes();
        fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2), 'utf8');

        // Oturum dosyasının adını değiştirerek geri yüklendiğini işaretle
        fs.renameSync(sessionFile, sessionFile.replace('.json', '.restored.json'));

        console.log(`♻️ ${restoredCount} dilek '${filename}' oturumundan geri yüklendi.`);
        res.json({ success: true, count: restoredCount });

    } catch (e) {
        console.error('Oturum kurtarma hatası:', e);
        res.status(500).json({ error: 'Oturum kurtarılamadı' });
    }
});

// Arşivden dileği geri yükle
app.post('/api/restore/:id', (req, res) => {
    const { id } = req.params;
    let archive = loadArchiveWishes();
    const wishIndex = archive.findIndex(w => w.id === id);

    if (wishIndex === -1) {
        return res.status(404).json({ error: 'Arşivde dilek bulunamadı' });
    }

    const wish = archive[wishIndex];

    // Fotoğrafı Arşiv Klasöründen Uploads Klasörüne Geri Taşı
    if (wish.photoUrl && wish.photoUrl.includes('/uploads/archive/')) {
        const filename = path.basename(wish.photoUrl);
        const oldPath = path.join(archiveDir, filename);
        const newPath = path.join(uploadsDir, filename);

        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath);
            wish.photoUrl = `/uploads/${filename}`;
        }
    }

    // Arşivden sil
    archive.splice(wishIndex, 1);
    try {
        fs.writeFileSync(archiveFile, JSON.stringify(archive, null, 2), 'utf8');
    } catch (err) {
        console.error('Arşivden silme hatası:', err.message);
        return res.status(500).json({ error: 'Dilek arşivden silinemedi' });
    }

    // Aktif listeye ekle
    delete wish.archivedAt; // Arşivlenme tarihini temizle
    wishes.push(wish);
    saveWishes();

    // Ekrana bildir
    io.emit('new-wish', wish);
    console.log(`♻️ Dilek geri yüklendi: ${wish.childName}`);

    res.json({ success: true, restoredWish: wish });
});

// Dilek yukleme endpoint'i
app.post('/api/upload', upload.single('photo'), async (req, res) => {
    try {
        const { childName, manualText } = req.body;

        // Dosya veya Manuel Metin ikisinden biri kesin olmak zorunda
        if (!req.file && !manualText) {
            return res.status(400).json({ error: 'Fotograf veya metin gerekli' });
        }
        if (!childName || childName.trim().length < 2) {
            return res.status(400).json({ error: 'Isim gerekli (en az 2 karakter)' });
        }
        if (manualText && manualText.trim().length > 140) {
            return res.status(400).json({ error: 'Dilek metni en fazla 140 karakter olabilir' });
        }

        let wishText = '';
        let filePath = null;
        let photoUrl = null;

        // EĞER FOTOĞRAF GELDİYSE FOTOĞRAF İŞLEMLERİ:
        if (req.file) {
            filePath = path.join(uploadsDir, req.file.filename);
            photoUrl = `/uploads/${req.file.filename}`;

            // 🤖 AI İçerik Moderasyonu (Fotoğraf ve İsim)
            if (moderationSettings.enabled) {
                const modResult = await moderate(childName.trim(), filePath, moderationSettings);
                if (!modResult.allowed) {
                    saveToRejected({ childName: childName.trim(), photoUrl: photoUrl }, modResult.reason);
                    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
                    console.log(`🚫 İçerik reddedildi: ${childName} — ${modResult.reason}`);
                    return res.status(400).json({
                        error: 'İçerik uygunsuz bulundu',
                        reason: modResult.reason
                    });
                }
            } else {
                console.log(`⏭️ Moderasyon devre dışı — ${childName} direkt geçirildi`);
            }
        }
        // EĞER MANUEL METİN GELDİYSE MODERASYON:
        else if (manualText) {
            wishText = manualText.trim();
            // 🤖 Yalnızca metin ve isim için içerik moderasyonu
            // Dikkat: Mevcut 'moderate' fonskiyonunun 2. parametresi fotoğraf yoludur, yoksa metin moderasyonu yapar.
            if (moderationSettings.enabled) {
                const modResult = await moderate(wishText + " " + childName.trim(), null, moderationSettings);
                if (!modResult.allowed) {
                    saveToRejected({ childName: childName.trim(), wishText: wishText }, modResult.reason);
                    console.log(`🚫 Metin reddedildi: ${childName} — ${modResult.reason}`);
                    return res.status(400).json({
                        error: 'İçerik uygunsuz bulundu',
                        reason: modResult.reason
                    });
                }
            } else {
                console.log(`⏭️ Moderasyon devre dışı — Metin direkt geçirildi`);
            }
        }

        // 🔍 EĞER FOTOĞRAF VARSA OCR İLE METİN OKUTMA
        if (req.file) {
            try {
                const imageData = fs.readFileSync(filePath);
                const base64Image = imageData.toString('base64');
                const ext = req.file.originalname.split('.').pop().toLowerCase();
                const mimeType = (ext === 'png') ? 'image/png' : 'image/jpeg';

                const OpenAI = require('openai');
                const client = new OpenAI({
                    baseURL: process.env.ANTIGRAVITY_BASE_URL,
                    apiKey: process.env.ANTIGRAVITY_API_KEY,
                });

                const ocrResp = await client.chat.completions.create({
                    model: 'gemini-3-flash',
                    messages: [{
                        role: 'user',
                        content: [
                            {
                                type: 'image_url',
                                image_url: { url: `data:${mimeType};base64,${base64Image}` }
                            },
                            {
                                type: 'text',
                                text: 'Bu fotoğrafta el yazısı ile yazılmış bir metin/şiir var. Lütfen fotoğraftaki TÜM metni baştan sona, satır satır, EKSİKSİZ bir şekilde oku ve metne dök. Hiçbir satırı, kelimeyi veya paragrafı kesinlikle atlama. Özetleme yapma. Sadece okuduğun metnin kendisini çıktı olarak ver.'
                            }
                        ]
                    }],
                    max_tokens: 800,
                    temperature: 0.2,
                });
                wishText = (ocrResp.choices[0]?.message?.content || '').trim();
                console.log(`📝 OCR sonucu: "${wishText}"`);
            } catch (ocrErr) {
                console.warn('⚠️ OCR hatasi:', ocrErr.message);
            }
        }

        const wish = {
            id: Date.now().toString(),
            childName: childName.trim(),
            wishText,
            photoUrl: photoUrl, // Fotoğraf yoksa null olacak, display.js bu durumu sorunsuz halleder
            timestamp: new Date().toISOString(),
            isSpotlight: false,
            status: 'pending'
        };

        if (moderationSettings.autoApprove) {
            approveWishDirect(wish);
            console.log(`✅ Yeni dilek direkt onaylandı: ${wish.childName}`);
            res.json({ success: true, wish, approvalMode: 'auto-approved' });
            return;
        }

        pendingWishes.push(wish);
        savePendingWishes();
        io.emit('new-pending-wish', wish);
        console.log(`⏳ Yeni dilek onaya gönderildi: ${wish.childName}`);
        res.json({ success: true, wish, approvalMode: 'pending' });
    } catch (error) {
        console.error('Yukleme hatasi:', error);
        res.status(500).json({ error: 'Sunucu hatasi' });
    }
});

// --- Mükerrer API yolları yukarıda tanımlandığı için buradan temizlendi ---

// Spotlight modunu aktiflesir (kumbaradan cekilen dilek)
app.post('/api/spotlight/:id', (req, res) => {
    const { id } = req.params;

    // Tüm spotlight'ları kapat
    wishes.forEach(w => {
        w.isSpotlight = false;
    });

    // Seçilen dileği spotlight yap
    const wish = wishes.find(w => w.id === id);
    if (wish) {
        wish.isSpotlight = true;
        io.emit('spotlight', wish);
        console.log(`🌟 Spotlight: ${wish.childName}`);
        res.json({ success: true, wish });
    } else {
        res.status(404).json({ error: 'Dilek bulunamadı' });
    }
});

// Son eklenen dileği spotlight yap
app.post('/api/spotlight-latest', (req, res) => {
    if (wishes.length === 0) {
        return res.status(404).json({ error: 'Henüz dilek yok' });
    }

    // Tüm spotlight'ları kapat
    wishes.forEach(w => {
        w.isSpotlight = false;
    });

    // Son dileği spotlight yap
    const latestWish = wishes[wishes.length - 1];
    latestWish.isSpotlight = true;
    io.emit('spotlight', latestWish);
    console.log(`🌟 Spotlight (son): ${latestWish.childName}`);
    res.json({ success: true, wish: latestWish });
});

// Spotlight'ı kapat
app.post('/api/spotlight-off', (req, res) => {
    wishes.forEach(w => {
        w.isSpotlight = false;
    });
    io.emit('spotlight-off');
    console.log('💫 Spotlight kapatıldı');
    res.json({ success: true });
});

// === OTOMATİK SPOTLIGHT (SLAYT GÖSTERİSİ) ===
let autoSpotlightInterval = null;
let autoSpotlightIndex = 0;
let autoSpotlightDelay = 10000; // varsayilan 10 saniye

app.post('/api/auto-spotlight/start', (req, res) => {
    const { delay } = req.body || {};
    if (delay) autoSpotlightDelay = parseInt(delay) * 1000;

    if (wishes.length === 0) {
        return res.json({ success: false, error: 'Dilek yok' });
    }

    // Oncekini temizle
    if (autoSpotlightInterval) clearInterval(autoSpotlightInterval);

    autoSpotlightIndex = 0;
    const cycleSpotlight = () => {
        if (wishes.length === 0) return;
        autoSpotlightIndex = autoSpotlightIndex % wishes.length;
        const wish = wishes[autoSpotlightIndex];
        wishes.forEach(w => {
            w.isSpotlight = false;
        });
        wish.isSpotlight = true;
        io.emit('spotlight', wish);
        console.log(`🔄 Oto-Spotlight: ${wish.childName} (${autoSpotlightIndex + 1}/${wishes.length})`);
        autoSpotlightIndex++;
    };

    cycleSpotlight(); // ilk dileği hemen göster
    autoSpotlightInterval = setInterval(cycleSpotlight, autoSpotlightDelay);
    console.log(`▶️ Otomatik Spotlight başladı (${autoSpotlightDelay / 1000}s aralık)`);
    res.json({ success: true, delay: autoSpotlightDelay / 1000 });
});

app.post('/api/auto-spotlight/stop', (req, res) => {
    if (autoSpotlightInterval) {
        clearInterval(autoSpotlightInterval);
        autoSpotlightInterval = null;
    }
    wishes.forEach(w => {
        w.isSpotlight = false;
    });
    io.emit('spotlight-off');
    console.log('⏹️ Otomatik Spotlight durduruldu');
    res.json({ success: true });
});

app.get('/api/auto-spotlight/status', (req, res) => {
    res.json({
        active: !!autoSpotlightInterval,
        delay: autoSpotlightDelay / 1000,
        index: autoSpotlightIndex
    });
});

// === TEMA SİSTEMİ ===
let currentTheme = savedAppSettings.theme || 'turktelekom';
app.get('/api/theme', (req, res) => {
    res.json({ theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    currentTheme = theme || 'turktelekom';
    saveSettings({ theme: currentTheme });
    io.emit('theme-change', currentTheme);
    console.log(`🎨 Tema değiştirildi: ${currentTheme}`);
    res.json({ success: true, theme: currentTheme });
});

// === GÖSTERİM MODU SİSTEMİ ===
let currentDisplayMode = savedAppSettings.displayMode || 'balloon'; // 'balloon' veya 'lantern'

app.get('/api/display-mode', (req, res) => {
    res.json({ displayMode: currentDisplayMode });
});

app.post('/api/display-mode', (req, res) => {
    const { displayMode } = req.body;
    currentDisplayMode = displayMode || 'balloon';
    saveSettings({ displayMode: currentDisplayMode });
    io.emit('display-mode-change', currentDisplayMode);
    console.log(`🎭 Gösterim modu değiştirildi: ${currentDisplayMode}`);
    res.json({ success: true, displayMode: currentDisplayMode });
});

// === ÇEKİLİŞ (RAFFLE) SİSTEMİ ===
app.post('/api/raffle/start', (req, res) => {
    // Adet yerine her defasında 1 kişi seçeceğiz
    const count = 1;

    if (!wishes || wishes.length === 0) {
        return res.status(400).json({ error: 'Çekiliş yapılacak dilek yok.' });
    }

    // İsim bazında tekilleştirme ve DAHA ÖNCE ÇIKMAMIŞ olanları filtreleme
    const uniqueWishes = [];
    const seenNames = new Set();

    // wishes dizisini tersten dolaşarak en güncel olanları alır
    for (let i = wishes.length - 1; i >= 0; i--) {
        const w = wishes[i];
        const lowerName = w.childName.toLowerCase();

        // Daha önce çıkanlar listesinde (drawnWishes) varsa veya bu döngüde eklendiyse atla
        if (!drawnWishes.includes(w.id) && !seenNames.has(lowerName)) {
            seenNames.add(lowerName);
            uniqueWishes.push(w);
        }
    }

    if (uniqueWishes.length === 0) {
        return res.status(400).json({ error: 'Çekilişe katılacak yeni/kalmış kimse bulunamadı! Hafızayı sıfırlayın.' });
    }

    // Rastgele karıştırma (Fisher-Yates)
    for (let i = uniqueWishes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [uniqueWishes[i], uniqueWishes[j]] = [uniqueWishes[j], uniqueWishes[i]];
    }

    // 1 Kazanan seç
    const winners = uniqueWishes.slice(0, count);

    // Çekilen kişiyi (veya kişileri) hafızaya kaydet
    winners.forEach(w => {
        drawnWishes.push(w.id);
    });

    console.log(`🎁 ÇEKİLİŞ YAPILDI! Sıradaki Kazanan: ${winners[0].childName}`);

    // Ekrana duyur
    io.emit('raffle-winners', winners);

    res.json({ success: true, winners });
});

app.post('/api/raffle/close', (req, res) => {
    io.emit('raffle-close');
    console.log(`🎁 ÇEKİLİŞ EKRANI KAPATILDI.`);
    res.json({ success: true });
});

app.post('/api/raffle/reset', (req, res) => {
    drawnWishes = [];
    console.log(`🔄 Çekiliş hafızası sıfırlandı.`);
    res.json({ success: true });
});

// === İSTATİSTİKLER (STATS) ===
app.get('/api/stats', (req, res) => {
    try {
        const archivedWishes = loadArchiveWishes();
        const allWishes = [...wishes, ...archivedWishes]; // Toplam İstatistik Havuzu

        const totalWishes = allWishes.length;

        // Zaman hesaplamaları için
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let todayWishesCount = 0;
        let thisMonthWishesCount = 0;

        // Tarihe göre gruplanmış veriler { "GG/AA/YYYY": adet }
        const dateGroups = {};

        allWishes.forEach(w => {
            const wishDate = new Date(w.timestamp);

            // Bugün kontrolü
            if (wishDate >= today) {
                todayWishesCount++;
            }

            // Ay kontrolü
            if (wishDate >= firstDayOfMonth) {
                thisMonthWishesCount++;
            }

            // Günlük gruplama (Grafik/Tablo için)
            // DD/MM/YYYY formatı kuralım
            const dateStr = wishDate.toLocaleDateString('tr-TR', { day: '2-digit', month: '2-digit', year: 'numeric' });

            if (!dateGroups[dateStr]) {
                dateGroups[dateStr] = 0;
            }
            dateGroups[dateStr]++;
        });

        // Gruplanmış nesneyi diziye çevirip tarihe göre sıralayalım (en yenisi en üstte)
        const wishesByDate = Object.keys(dateGroups)
            .map(date => ({ date, count: dateGroups[date] }))
            .sort((a, b) => {
                // tr-TR (GG.AA.YYYY veya GG/AA/YYYY) formatını parse etmek için:
                const [dA, mA, yA] = a.date.split(/[./-]/);
                const [dB, mB, yB] = b.date.split(/[./-]/);
                return new Date(`${yB}-${mB}-${dB}`) - new Date(`${yA}-${mA}-${dA}`);
            });

        res.json({
            success: true,
            stats: {
                totalWishes,
                todayWishes: todayWishesCount,
                thisMonthWishes: thisMonthWishesCount,
                wishesByDate
            }
        });
    } catch (err) {
        console.error('İstatistik hesaplama hatası:', err);
        res.status(500).json({ success: false, error: 'İstatistikler hesaplanamadı' });
    }
});

// Tüm dilekleri getir
app.get('/api/wishes', (req, res) => {
    const approvedWishes = wishes.filter(w => !w.status || w.status === 'approved');
    res.json(approvedWishes);
});

// Dilek düzenle
app.put('/api/wishes/:id', (req, res) => {
    const { id } = req.params;
    const { childName, wishText } = req.body || {};
    const name = typeof childName === 'string' ? childName.trim() : '';
    const text = typeof wishText === 'string' ? wishText.trim() : '';

    if (name.length < 2) {
        return res.status(400).json({ success: false, error: 'İsim gerekli (en az 2 karakter)' });
    }
    if (text.length > 140) {
        return res.status(400).json({ success: false, error: 'Dilek metni en fazla 140 karakter olabilir' });
    }

    const wishIndex = wishes.findIndex(w => w.id === id);
    if (wishIndex !== -1) {
        wishes[wishIndex] = { ...wishes[wishIndex], childName: name, wishText: text };
        saveWishes();
        io.emit('wish-updated', wishes[wishIndex]);
        return res.json({ success: true, wish: wishes[wishIndex] });
    }

    const pendingIndex = pendingWishes.findIndex(w => w.id === id);
    if (pendingIndex !== -1) {
        pendingWishes[pendingIndex] = { ...pendingWishes[pendingIndex], childName: name, wishText: text };
        savePendingWishes();
        io.emit('pending-wish-updated', pendingWishes[pendingIndex]);
        return res.json({ success: true, wish: pendingWishes[pendingIndex] });
    }

    res.status(404).json({ success: false, error: 'Dilek bulunamadı' });
});

// Tüm bekleyen dilekleri getir
app.get('/api/pending-wishes', (req, res) => {
    res.json(pendingWishes);
});

// Dilek onayla
app.post('/api/wishes/:id/approve', (req, res) => {
    const { id } = req.params;
    const wishIndex = pendingWishes.findIndex(w => w.id === id);
    if (wishIndex === -1) {
        return res.status(404).json({ error: 'Bekleyen dilek bulunamadı' });
    }
    const wish = pendingWishes.splice(wishIndex, 1)[0];
    wish.status = 'approved';
    wishes.push(wish);
    saveWishes();
    savePendingWishes();
    io.emit('new-wish', wish);
    console.log(`✅ Dilek onaylandı: ${wish.childName}`);
    res.json({ success: true, wish });
});

// Dilek reddet
app.post('/api/wishes/:id/reject', (req, res) => {
    const { id } = req.params;
    const wishIndex = pendingWishes.findIndex(w => w.id === id);
    if (wishIndex === -1) {
        return res.status(404).json({ error: 'Bekleyen dilek bulunamadı' });
    }
    const wish = pendingWishes.splice(wishIndex, 1)[0];
    wish.status = 'rejected';
    saveToRejected(wish, 'Yönetici tarafından reddedildi');
    savePendingWishes();
    io.emit('wish-rejected', wish);
    console.log(`🚫 Dilek reddedildi: ${wish.childName}`);
    res.json({ success: true });
});

// Tüm bekleyenleri onayla
app.post('/api/pending-wishes/approve-all', (req, res) => {
    let count = 0;
    pendingWishes.forEach(wish => {
        wish.status = 'approved';
        wishes.push(wish);
        io.emit('new-wish', wish);
        count++;
    });
    pendingWishes.length = 0;
    saveWishes();
    savePendingWishes();
    console.log(`✅ ${count} dilek topluca onaylandı`);
    res.json({ success: true, count });
});

// Yerel IP adresini bul
function getLocalIP() {
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';

    // Ağ arayüzlerini tara ve 192., 10., veya belli 172. ile başlayan (yaygın LAN IP'leri) adresi bul
    for (const name of Object.keys(nets)) {
        for (const net of nets[name]) {
            // Dahili ve IPv6 değilse
            if (net.family === 'IPv4' && !net.internal) {
                // Hyper-V Default Switch'i atla (genelde 172.2x ile başlar)
                if (name.toLowerCase().includes('default switch')) continue;

                // Özellikle 192.168.x.x gibi yaygın yerel ağ adreslerine öncelik ver
                if (net.address.startsWith('192.168.') || net.address.startsWith('10.')) {
                    return net.address;
                }

                // Eğer hiçbiri eşleşmezse, ilk bulduğunu kaydet ama döngüye devam et (daha iyi bir eşleşme olabilir diye)
                if (localIP === 'localhost') {
                    localIP = net.address;
                }
            }
        }
    }
    return localIP;
}

// Yerel IP adresini getir
app.get('/api/local-ip', (req, res) => {
    if (process.env.PUBLIC_DOMAIN) {
        let domain = process.env.PUBLIC_DOMAIN.replace(/^https?:\/\//, '');
        return res.json({ ip: domain, isCustomUrl: true });
    }
    res.json({ ip: getLocalIP() });
});

// Tek dilek sil (ARŞİVE TAŞI)
app.delete('/api/wishes/:id', (req, res) => {
    const { id } = req.params;
    const wishIndex = wishes.findIndex(w => w.id === id);

    if (wishIndex === -1) {
        return res.status(404).json({ error: 'Dilek bulunamadı' });
    }

    const wish = wishes[wishIndex];

    // Fotoğrafı Arşiv Klasörüne Taşı
    if (wish.photoUrl) {
        const oldPath = path.join(__dirname, wish.photoUrl);
        const filename = path.basename(wish.photoUrl);
        const newPath = path.join(archiveDir, filename);

        if (fs.existsSync(oldPath)) {
            fs.renameSync(oldPath, newPath); // Dosyayı silme, taşı
            wish.photoUrl = `/uploads/archive/${filename}`; // URL'yi güncelle
        }
    }

    // JSON'da Arşive Taşı
    wish.archivedAt = new Date().toISOString();
    saveToArchive(wish);

    // Aktif listeden çıkar
    wishes.splice(wishIndex, 1);
    saveWishes();
    io.emit('wish-deleted', { id });
    console.log(`🗄️ Dilek arşivlendi: ${wish.childName}`);
    res.json({ success: true, archived: true });
});

// Tüm dilekleri sil (TÜMÜNÜ OTURUM OLARAK ARŞİVE TAŞI)
app.delete('/api/wishes', (req, res) => {
    if (wishes.length > 0) {
        // Oturum Dosyası Adı (session_YYYYMMDD_HHMMSS.json)
        const now = new Date();
        const timestamp = now.toISOString().replace(/[:.]/g, '-');
        const sessionFile = path.join(sessionsDir, `session_${timestamp}.json`);

        // Aktif veriyi olduğu gibi session dosyasına yazdır
        try {
            fs.writeFileSync(sessionFile, JSON.stringify(wishes, null, 2), 'utf8');
            console.log(`🗂️ Oturum Arşivlendi: ${sessionFile}`);
        } catch (err) {
            console.error('Oturum arşivleme hatası:', err.message);
        }
    }

    wishes.forEach(wish => {
        // Fotoğrafı Arşive Taşı
        if (wish.photoUrl) {
            const oldPath = path.join(__dirname, wish.photoUrl);
            const filename = path.basename(wish.photoUrl);
            const newPath = path.join(archiveDir, filename);

            if (fs.existsSync(oldPath)) {
                fs.renameSync(oldPath, newPath);
                wish.photoUrl = `/uploads/archive/${filename}`;
            }
        }
        // Mevcut toplu arşiv mantığı (archive_wishes.json) da korunsun
        wish.archivedAt = new Date().toISOString();
        saveToArchive(wish);
    });

    wishes = [];
    drawnWishes = []; // Silinince hafızası da temizlensin
    saveWishes();
    io.emit('all-cleared');
    console.log('🗄️ Tüm dilekler arşive kaldırıldı');
    res.json({ success: true, archived: true });
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
    console.log('🔌 Yeni bağlantı:', socket.id);

    // Mevcut dilekleri ve ekran ayarlarını gönder
    const approvedWishes = wishes.filter(w => !w.status || w.status === 'approved');
    socket.emit('all-wishes', approvedWishes);
    socket.emit('display-settings', displaySettings);

    socket.on('disconnect', () => {
        console.log('🔌 Bağlantı koptu:', socket.id);
    });
});

// Sunucuyu başlat
server.listen(PORT, '0.0.0.0', () => {
    // Yerel IP adresini bul
    const nets = require('os').networkInterfaces();
    let localIP = 'localhost';
    for (const name of Object.keys(nets)) {
        if (name.toLowerCase().includes('vethernet')) continue;
        for (const net of nets[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localIP = net.address;
                break;
            }
        }
    }
    console.log(`
╔══════════════════════════════════════════════════════╗
║          🏺 DİLEK KUMBARASI BAŞLATILDI 🏺            ║
╠══════════════════════════════════════════════════════╣
║                                                      ║
║  📱 Telefon:  http://${localIP}:${PORT}/upload
║  🖥️  Ekran:    http://${localIP}:${PORT}/display
║  ⚙️  Yönetim:  http://${localIP}:${PORT}/admin
║                                                      ║
╚══════════════════════════════════════════════════════╝
    `);
});
