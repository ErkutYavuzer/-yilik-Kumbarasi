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

const dataFile = path.join(dataDir, 'wishes.json');
const archiveFile = path.join(dataDir, 'archive_wishes.json');
const rejectedFile = path.join(dataDir, 'rejected_wishes.json');

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

// Static dosyalar
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));
app.use(express.json());

// Dilekleri dosyadan yükle
let wishes = loadWishes();
console.log(`📂 ${wishes.length} dilek yüklendi.`);

// AI Moderasyon ayarlari
let moderationSettings = {
    enabled: true,
    checkText: true,
    checkImage: true,
    model: 'gemini-3-flash',
    strictness: 'normal' // 'strict' | 'normal' | 'lenient'
};

// Ekran (Gösterim) Ayarları
let displaySettings = {
    speedMultiplier: 1.0,
    scaleMultiplier: 1.0
};

// Ana sayfa
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});

// Clean URLs - .html uzantısız erişim
app.get('/display', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'display.html'));
});
app.get('/upload', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});
app.get('/admin', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Moderasyon Ayarları API'leri (Frontend Arayüzüne Uygun)
app.get('/api/moderation', (req, res) => {
    res.json(moderationSettings);
});

// Moderasyon Logu Getir
app.get('/api/moderation/log', (req, res) => {
    res.json(loadRejectedWishes());
});

// Moderasyon açık/kapalı (Toggle)
app.post('/api/moderation/toggle', (req, res) => {
    moderationSettings.enabled = !moderationSettings.enabled;
    const state = moderationSettings.enabled ? 'AÇIK' : 'KAPALI';
    console.log(`\n⚙️ Moderasyon durumu toggle:`, state);
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

// Moderasyon seviyesi, vb tüm ayarların güncellenmesi
app.post('/api/moderation/settings', (req, res) => {
    // Arayüzden artık "model" gönderilmeyeceği/gönderilse de arka planda geçerli olmayacağı için sabit tutuyoruz.
    const { enabled, strictness, checkText, checkImage } = req.body;

    if (typeof enabled === 'boolean') moderationSettings.enabled = enabled;
    if (['strict', 'normal', 'lenient'].includes(strictness)) moderationSettings.strictness = strictness;
    if (typeof checkText === 'boolean') moderationSettings.checkText = checkText;
    if (typeof checkImage === 'boolean') moderationSettings.checkImage = checkImage;

    console.log(`\n⚙️ Moderasyon Ayarları Güncellendi:`, moderationSettings);
    io.emit('moderation-state', moderationSettings);
    res.json({ success: true, ...moderationSettings });
});

// Ekran Ayarları API'si
app.get('/api/display-settings', (req, res) => {
    res.json(displaySettings);
});

// Ekran Ayarlarını Güncelle API'si
app.post('/api/display-settings', (req, res) => {
    const { speedMultiplier, scaleMultiplier } = req.body;

    if (typeof speedMultiplier === 'number') displaySettings.speedMultiplier = speedMultiplier;
    if (typeof scaleMultiplier === 'number') displaySettings.scaleMultiplier = scaleMultiplier;

    console.log(`\n📺 Ekran Ayarları Güncellendi: Hız: ${displaySettings.speedMultiplier}x, Büyüklük: ${displaySettings.scaleMultiplier}x`);
    io.emit('display-settings', displaySettings);
    res.json({ success: true, ...displaySettings });
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
            isSpotlight: false
        };

        wishes.push(wish);
        saveWishes();
        io.emit('new-wish', wish);
        console.log(`✅ Yeni dilek onaylandı: ${wish.childName}`);
        res.json({ success: true, wish });
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
    wishes.forEach(w => w.isSpotlight = false);

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
    wishes.forEach(w => w.isSpotlight = false);

    // Son dileği spotlight yap
    const latestWish = wishes[wishes.length - 1];
    latestWish.isSpotlight = true;
    io.emit('spotlight', latestWish);
    console.log(`🌟 Spotlight (son): ${latestWish.childName}`);
    res.json({ success: true, wish: latestWish });
});

// Spotlight'ı kapat
app.post('/api/spotlight-off', (req, res) => {
    wishes.forEach(w => w.isSpotlight = false);
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
        wishes.forEach(w => w.isSpotlight = false);
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
    wishes.forEach(w => w.isSpotlight = false);
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
let currentTheme = 'iyilik';

app.get('/api/theme', (req, res) => {
    res.json({ theme: currentTheme });
});

app.post('/api/theme', (req, res) => {
    const { theme } = req.body;
    currentTheme = theme || 'default';
    io.emit('theme-change', currentTheme);
    console.log(`🎨 Tema değiştirildi: ${currentTheme}`);
    res.json({ success: true, theme: currentTheme });
});

// === ÇEKİLİŞ (RAFFLE) SİSTEMİ ===
app.post('/api/raffle/start', (req, res) => {
    let { count } = req.body;
    count = parseInt(count) || 3;

    if (!wishes || wishes.length === 0) {
        return res.status(400).json({ error: 'Çekiliş yapılacak dilek yok.' });
    }

    // İsim bazında tekilleştirme (aynı çocuğun 2 kere kazanmasını engellemek için)
    const uniqueWishes = [];
    const seenNames = new Set();

    // Güvenlik ve mantık: en son atılan dileği baz alarak tekilleştirelim (tercihen)
    // wishes dizisini tersten dolaşarak en güncel olanları alır
    for (let i = wishes.length - 1; i >= 0; i--) {
        const w = wishes[i];
        if (!seenNames.has(w.childName.toLowerCase())) {
            seenNames.add(w.childName.toLowerCase());
            uniqueWishes.push(w);
        }
    }

    if (uniqueWishes.length === 0) {
        return res.status(400).json({ error: 'Geçerli eşsiz katılımcı bulunamadı.' });
    }

    // İstenen sayı katılımcıdan fazlaysa, maksimum katılımcı sayısı kadar seç
    const actualCount = Math.min(count, uniqueWishes.length);

    // Rastgele karıştırma (Fisher-Yates)
    for (let i = uniqueWishes.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [uniqueWishes[i], uniqueWishes[j]] = [uniqueWishes[j], uniqueWishes[i]];
    }

    // Kazananları seç
    const winners = uniqueWishes.slice(0, actualCount);

    console.log(`🎁 ÇEKİLİŞ BAŞLADI! Kazanan Sayısı: ${actualCount}`);
    winners.forEach((w, idx) => console.log(`  🎉 ${idx + 1}. ${w.childName}`));

    // Ekrana duyur
    io.emit('raffle-winners', winners);

    res.json({ success: true, winners });
});

app.post('/api/raffle/close', (req, res) => {
    io.emit('raffle-close');
    console.log(`🎁 ÇEKİLİŞ EKRANI KAPATILDI.`);
    res.json({ success: true });
});

// === İSTATİSTİKLER (STATS) ===
app.get('/api/stats', (req, res) => {
    try {
        const totalWishes = wishes.length;

        // Zaman hesaplamaları için
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

        let todayWishesCount = 0;
        let thisMonthWishesCount = 0;

        // Tarihe göre gruplanmış veriler { "GG/AA/YYYY": adet }
        const dateGroups = {};

        wishes.forEach(w => {
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
    res.json(wishes);
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

// Tüm dilekleri sil (TÜMÜNÜ ARŞİVE TAŞI)
app.delete('/api/wishes', (req, res) => {
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
        // Arşive yazmak için objeyi güncelle
        wish.archivedAt = new Date().toISOString();
        saveToArchive(wish); // Tek tek arşive bas
    });

    wishes = [];
    saveWishes();
    io.emit('all-cleared');
    console.log('🗄️ Tüm dilekler arşive kaldırıldı');
    res.json({ success: true, archived: true });
});

// Socket.io bağlantıları
io.on('connection', (socket) => {
    console.log('🔌 Yeni bağlantı:', socket.id);

    // Mevcut dilekleri ve ekran ayarlarını gönder
    socket.emit('all-wishes', wishes);
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
