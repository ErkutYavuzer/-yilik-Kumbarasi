# İyilik Kumbarası — PROJECT MEMORY (main branch)

> ⚠️ **DİKKAT:** Bu proje **main** branch'tir. Aynı reponun **beta** branch'i ayrı bir klasörde (`-yilik-Kumbarasi-beta`) bulunmaktadır. İki versiyon birbirinden **bağımsız** olarak aktif kullanılmaktadır. Karışıklığı önlemek için her düzenleme öncesinde hangi klasörde olduğunuza dikkat edin.

---

## 📌 Proje Bilgisi

| Alan | Değer |
|------|-------|
| **Proje** | İyilik Kumbarası v3.0.0 |
| **Repo** | `ErkutYavuzer/-yilik-Kumbarasi` |
| **Branch** | `main` |
| **Yerel Klasör** | `/Users/erkut/Documents/projeler/-yilik-Kumbarasi` |
| **K8s Namespace** | `dilek-kumbarasi` |
| **Teknoloji** | Node.js, Express, Socket.io, Multer, Vanilla HTML/CSS/JS |
| **Açıklama** | Sultangazi Belediyesi çocuk etkinlikleri için interaktif dilek/iyilik duvarı |

## 🔀 Versiyon Ayrımı

| Özellik | main (bu klasör) | beta (`-yilik-Kumbarasi-beta`) |
|---------|-------------------|-------------------------------|
| **Branch** | `main` | `beta` |
| **Klasör** | `-yilik-Kumbarasi` | `-yilik-Kumbarasi-beta` |
| **K8s Yapısı** | Yok (ana deploy) | `k8s/beta/` dizini mevcut |
| **Public dosyaları** | Daha sade (1 image) | Daha zengin (12 image, fonts dizini) |
| **server.js boyutu** | ~31 KB | ~39 KB (daha fazla özellik) |
| **Son commit** | Cache/ses düzeltmeleri | Beta image digest ve display düzeltmeleri |

## 📝 Oturum Kayıtları

### 2026-03-12 — Upload Sayfasından Fotoğraf Kaldırıldı
- `upload.html`: Fotoğraf/Yazı tab sistemi, kamera butonu, dosya seçici, fotoğraf önizleme tamamen kaldırıldı
- Sadece **yazı ile dilek ekleme** modu bırakıldı
- Backend (server.js) hiç değiştirilmedi — admin panelden fotoğraflı ekleme hâlâ çalışır
- Onay (Step 3) ekranında artık dilek metninin önizlemesi gösteriliyor

### 2026-03-05 — İlk Kurulum
- Beta branch ayrı klasöre klonlandı (`-yilik-Kumbarasi-beta`)
- Her iki versiyon için `PROJECT_MEMORY.md` oluşturuldu
- İki versiyon birbirinden bağımsız olarak aktif kullanılmakta

## ❌ İptal Edilen Özellikler
_(Henüz yok)_

## 🔮 Sonraki Adımlar
_(Kullanıcı yönlendirecek)_
