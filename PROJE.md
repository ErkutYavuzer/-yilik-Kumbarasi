# İyilik Kumbarası v3.0.0 — Proje Bağlamı

## 🎯 Ne Yapıyor?
Sultangazi Belediyesi çocuk etkinlikleri için interaktif dilek/iyilik duvarı. Çocuklar dileklerini kağıda yazar, fotoğrafını çeker → büyük ekranda animasyonlu gösterim.

## 🏗️ Mimari
```
Telefon (upload.html) ──HTTP POST──▶ server.js (Express/Multer) ──Socket.io──▶ display.html (Büyük Ekran)
                                          │
                                     admin.html (Yönetim)
```

## 🔌 Port
| Servis | Port | Komut |
|--------|------|-------|
| Node Server | `process.env.PORT` veya `3000` | `npm start` |

## 📁 Kritik Dosyalar
| Dosya | Ne Yapar |
|-------|---------| 
| `server.js` | Ana server — Express + Socket.io + Multer + API |
| `contentModerator.js` | AI içerik moderasyon modülü |
| `public/display.html` | Büyük ekran gösterimi (projektör) |
| `public/upload.html` | Mobil fotoğraf yükleme sayfası |
| `public/admin.html` | Enterprise yönetim paneli |
| `public/js/display.js` | Animasyon motoru, fizik, spotlight, konfeti |
| `public/js/admin.js` | Admin panel JS (filtreler, kısayollar, Focus Mode) |
| `public/css/themes.css` | 8 tema stili |
| `public/css/admin.css` | Admin panel UI (Glassmorphism, Enterprise UX) |

## 🌐 URL'ler
| Sayfa | URL | Kullanım |
|-------|-----|---------| 
| Yükleme | `http://[LAN-IP]:3000/upload` | Telefon (QR ile) |
| Ekran | `http://localhost:3000/display` | Projektör |
| Admin | `http://localhost:3000/admin` | Yönetici (şifre: 1234) |

## 🔧 Teknoloji Stack
- **Backend**: Node.js, Express, Socket.io, Multer
- **Frontend**: Vanilla HTML/CSS/JS, Lucide Icons
- **AI**: OpenAI uyumlu API (Gemini 3 Flash) — moderasyon + OCR
- **Depolama**: JSON dosya (`wishes.json`, `archive_wishes.json`) + uploads klasörü

## ⚙️ Özellikler
- 8 tema
- AI metin & görsel moderasyonu (3 hassasiyet seviyesi)
- OCR (el yazısı okuma)
- Otomatik spotlight slayt gösterisi
- Çekiliş sistemi (Fisher-Yates algoritması)
- Enterprise Admin Panel (Glassmorphism, Focus Mode, Keyboard Shortcuts)
- Hızlı filtreler (Bugün, Fotoğraflı, Sadece Metin, Spotlight)
- Konfeti animasyonu, ses efektleri
- QR kod otomatik oluşturma
- Balon hız/büyüklük ayarı (canlı değişim)
- Docker desteği

## 🚀 Hızlı Başlatma
```bash
npm install
cp .env.example .env  # API key'leri düzenle
npm start
```
Windows: `BASLAT.bat` dosyasına çift tıkla.
