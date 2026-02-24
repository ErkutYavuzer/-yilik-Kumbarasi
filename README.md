# 🏺 İyilik Kumbarası

**Sultangazi Belediyesi** çocuk etkinlikleri için geliştirilmiş interaktif dilek/iyilik duvarı sistemi. Çocuklar dileklerini kağıda yazar, fotoğrafını çeker ve dilekler büyük ekranda animasyonlu olarak gösterilir.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express)](https://expressjs.com)
[![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io)](https://socket.io)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

---

## 🎯 Ne Yapar?

Etkinliklerde çocuklar dileklerini kağıda yazıp bir operatörün telefonundan sisteme yükler. Dilekler büyük ekranda (projektör) balonlar içinde canlanarak gösterilir.

```
📱 Telefon (upload) ──HTTP POST──▶ 🖥️ server.js ──Socket.io──▶ 🎥 Büyük Ekran (display)
                                        │
                                   ⚙️ Admin Panel
```

## ✨ Özellikler

| Kategori | Özellik |
|----------|---------|
| **Gösterim** | Balon animasyonları, fizik motoru (çarpışma, sekme), hız/büyüklük ayarı |
| **Temalar** | 8 tema: Sultangazi Belediyesi, Kozmik Gece, Doğum Günü, 23 Nisan, Bayram, Kış, Yılbaşı, Bahar |
| **AI Moderasyon** | Gemini 3 Flash ile metin ve görsel İçerik denetimi (3 seviye: katı/normal/esnek) |
| **OCR** | Fotoğraftaki el yazısını otomatik okuyan AI metin çıkarma |
| **Çekiliş** | Katılımcılar arasından rastgele talihli seçimi, ekranda animasyonlu gösterim |
| **Slayt Gösterisi** | Otomatik spotlight döngüsü (5/10/15/30/60 sn aralıklarla) |
| **Admin Panel** | Enterprise UX, Lucide SVG ikonlar, Focus Mode, klavye kısayolları, hızlı filtreler |
| **Etkileşim** | Konfeti animasyonu, ses efektleri, fullscreen modu, QR kod paylaşım |

## 🚀 Hızlı Başlangıç

### Gereksinimler
- [Node.js](https://nodejs.org) 18+
- Aynı Wi-Fi ağında olmak (telefon → bilgisayar bağlantısı için)

### Kurulum

```bash
# Repoyu klonla
git clone https://github.com/ErkutYavuzer/-yilik-Kumbarasi.git
cd -yilik-Kumbarasi

# Bağımlılıkları kur
npm install

# Ortam değişkenlerini ayarla
cp .env.example .env
# .env dosyasını düzenle (AI Moderasyon & OCR için API key gerekli)

# Sunucuyu başlat
npm start
```

### Windows Kullanıcıları
```
BASLAT.bat
```
dosyasına çift tıklayarak otomatik başlatabilirsiniz.

## 🌐 Sayfalar

| Sayfa | URL | Açıklama |
|-------|-----|----------|
| **Gösterim** | `http://localhost:3000/display` | Projektöre bağlanan büyük ekran |
| **Yükleme** | `http://localhost:3000/upload` | Telefon/tablet'ten dilek yükleme |
| **Admin** | `http://localhost:3000/admin` | Yönetim paneli (şifre: `1234`) |

> **Not:** Sunucu başladığında terminalde yerel ağ IP adresi ve tüm bağlantılar otomatik gösterilir.

## ⌨️ Klavye Kısayolları (Admin)

| Tuş | İşlev |
|-----|-------|
| `F` | Odak Modu (Focus Mode) — menüleri gizle |
| `S` | Slayt gösterisini başlat/durdur |
| `Esc` | Açık modalı veya spotlight'ı kapat |

## 🐳 Docker

```bash
docker build -t iyilik-kumbarasi .
docker run -p 3000:3000 --env-file .env -v iyilik-data:/app/data -v iyilik-uploads:/app/uploads iyilik-kumbarasi
```

## 📁 Proje Yapısı

```
├── server.js              # Express + Socket.io sunucu
├── contentModerator.js    # AI içerik moderasyon modülü
├── public/
│   ├── admin.html         # Yönetim paneli
│   ├── display.html       # Büyük ekran gösterimi
│   ├── upload.html        # Mobil yükleme sayfası
│   ├── css/               # Stiller (admin, themes, ana stil)
│   ├── js/                # İstemci JavaScript
│   └── images/            # Arka plan ve logolar
├── data/                  # Dilek verileri (JSON)
├── uploads/               # Yüklenen fotoğraflar
├── Dockerfile             # Docker konfigürasyonu
├── BASLAT.bat             # Windows hızlı başlatıcı
└── .env.example           # Ortam değişkeni şablonu
```

## 🛡️ Güvenlik

- API anahtarları `.env` dosyasında tutulur (`.gitignore` tarafından korunur)
- Admin paneli şifre korumalı
- AI moderasyon ile uygunsuz içerik filtreleme
- Silinen dilekler arşivlenir (kalıcı olarak kaybolmaz)

## 📄 Lisans

[MIT](LICENSE) — Erkut Yavuzer
