# İyilik Kumbarası v2.2.0 — Proje Bağlamı

## 🎯 Ne Yapıyor?
Sultangazi Belediyesi çocuk etkinlikleri için interaktif dilek/iyilik duvarı. Çocuklar dileklerini kağıda yazar, fotoğrafını çeker → büyük ekranda animasyonlu gösterim.

## 🏗️ Mimari
```
Telefon (upload.html) ──HTTP POST──▶ server.js (Express/Multer) ──Socket.io──▶ display.html (Büyük Ekran)
                                                                        │
                                                                   admin.html
```

## 🔌 Port
| Servis | Port | Komut |
|--------|------|-------|
| Node Server | 3000 | `npm start` |

## 📁 Kritik Dosyalar
| Dosya | Ne Yapar |
|-------|---------|
| `server.js` | Ana server, Express + Socket.io + Multer |
| `public/display.html` | Büyük ekran gösterimi (projektör) |
| `public/upload.html` | Mobil fotoğraf yükleme sayfası |
| `public/admin.html` | Yönetim paneli (spotlight, tema, silme) |
| `public/js/display.js` | Animasyon motoru, spotlight, konfeti |
| `public/css/themes.css` | 7 tema (Ramazan, Doğum Günü, 23 Nisan...) |

## 🌐 URL'ler
| Sayfa | URL | Kullanım |
|-------|-----|---------|
| Yükleme | `http://[LAN-IP]:3000/upload` | Telefon (QR ile) |
| Ekran | `http://localhost:3000/display` | Projektör |
| Admin | `http://localhost:3000/admin` | Yönetici |
| LAN IP | `192.168.2.75` | Mevcut ağ IP'si |

## 🔧 Teknoloji Stack
- **Backend**: Node.js, Express, Socket.io, Multer
- **Frontend**: Vanilla HTML/CSS/JS (framework yok)
- **Depolama**: JSON dosya (`wishes.json`) + uploads klasörü

## ⚙️ Özellikler
- 7 tema (Ramazan varsayılan)
- Otomatik spotlight slayt gösterisi (5/10/15/30 sn)
- Konfeti animasyonu yeni dilek gelince
- QR kod otomatik oluşturma
- Ses efektleri

## ⚠️ Bilinen Sorunlar / Notlar
- Arka plan görseli dikey uzatma yapılmadı (AI müsait olunca)
- GitHub repo: `ErkutYavuzer/-yilik-Kumbarasi` (isim düzeltme: `-yilik` → `Iyilik`)
- LAN IP değişirse `server.js`'deki QR URL güncellenmeli

## 🚀 Hızlı Başlatma
```
BASLAT.bat  (veya: npm start)
```

- 🟢 QR kod bağlantı IP sorunu düzeltildi.
