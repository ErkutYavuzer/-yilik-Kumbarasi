/**
 * İyilik Kumbarası - Display Module
 * Gösterim ekranı için dilek animasyonları, spotlight, ses ve konfeti
 */

class WishDisplay {
    constructor() {
        this.container = document.getElementById('wishes-container');
        this.emptyState = document.getElementById('empty-state');
        this.counterNumber = document.getElementById('counter-number');
        this.spotlightOverlay = document.getElementById('spotlight-overlay');
        this.spotlightLabel = document.getElementById('spotlight-label');
        this.spotlightName = document.getElementById('spotlight-name');

        this.wishes = [];
        this.wishCards = [];
        this.allServerWishes = []; // Tüm dilek havuzu eklendi
        this.socket = null;
        this.isMuted = false;
        this.audioCtx = null;
        this.displaySettings = { speedMultiplier: 1.0, scaleMultiplier: 1.0 }; // Global ekran ayarları

        this.init();
    }

    init() {
        this.connectSocket();
        this.bindEvents();
        this.startFloatingAnimation();
        this.setupAudio();
        this.loadTheme();
    }

    // === AUDIO ===
    setupAudio() {
        // AudioContext'i kullanici etkilesiminde olustur (autoplay policy)
        const createCtx = () => {
            if (!this.audioCtx) {
                this.audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            document.removeEventListener('click', createCtx);
        };
        document.addEventListener('click', createCtx);
    }

    playSound(type) {
        if (this.isMuted || !this.audioCtx) return;
        try {
            const ctx = this.audioCtx;
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);

            if (type === 'newWish') {
                // Mutlu "ding" sesi
                osc.type = 'sine';
                osc.frequency.setValueAtTime(880, ctx.currentTime);
                osc.frequency.setValueAtTime(1100, ctx.currentTime + 0.1);
                osc.frequency.setValueAtTime(1320, ctx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.3, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.5);
            } else if (type === 'spotlight') {
                // Buyulu spotlight sesi
                osc.type = 'sine';
                osc.frequency.setValueAtTime(440, ctx.currentTime);
                osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3);
                osc.frequency.exponentialRampToValueAtTime(1760, ctx.currentTime + 0.6);
                gain.gain.setValueAtTime(0.2, ctx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.8);
                osc.start(ctx.currentTime);
                osc.stop(ctx.currentTime + 0.8);
            }
        } catch (e) {
            // Ses calmazsa sessizce devam et
        }
    }

    // === CONFETTI ===
    fireConfetti(amount = 50) {
        const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8E8E'];

        for (let i = 0; i < amount; i++) {
            const conf = document.createElement('div');
            conf.className = 'display-confetti';
            conf.style.left = Math.random() * 100 + 'vw';
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            conf.style.animationDelay = Math.random() * 2 + 's';
            conf.style.animationDuration = (Math.random() * 2 + 2) + 's';

            document.body.appendChild(conf);

            // Temizle
            setTimeout(() => {
                if (conf && conf.parentNode) {
                    conf.remove();
                }
            }, 5000);
        }
    }

    // === RAFFLE ANIMATION ===
    showRaffleAnimation(winners) {
        const overlay = document.getElementById('raffle-overlay');
        const container = document.getElementById('raffle-winners-container');

        if (!overlay || !container || !winners || winners.length === 0) return;

        // Önceki sonuçları temizle
        container.innerHTML = '';

        // Modal'ı göster
        overlay.classList.add('show');

        // Şanslı kalpleri "raffle-item" stiliyle hazırla ama gizli tut (opacity 0 - reveal class'ı yok)
        winners.forEach((w, idx) => {
            const item = document.createElement('div');
            item.className = 'raffle-item';
            // Tekil gösterim için daha vurgulu metin
            item.innerHTML = `<div style="font-size:32px; color:rgba(255,255,255,0.9); margin-bottom:15px;">Sıradaki Talihli!</div>
                              <div style="color:#FFD700; font-size: 80px; text-shadow:0 0 30px rgba(255,215,0,0.8);">${w.childName}</div>`;
            container.appendChild(item);

            // Biraz heyecan yaratıp göster
            setTimeout(() => {
                this.playSound('newWish'); // Davul/zil sesi efekti
                item.classList.add('reveal');

                // Büyük final konfetisi
                this.fireConfetti(150);
            }, 1500);
        });
    }

    // === SOCKET ===
    connectSocket() {
        this.socket = io();

        this.socket.on('all-wishes', (serverWishes) => {
            console.log('📥 Mevcut dilekler:', serverWishes.length);
            // Reconnect'te duplicate olmaması icin once temizle
            this.container.querySelectorAll('.wish-card').forEach(c => c.remove());
            this.wishes = [];
            this.wishCards = [];

            // Gerçek toplam sayıyı saklayalım ki sayaçta doğrusu yazsın
            this.totalWishesCount = serverWishes.length;
            this.allServerWishes = [...serverWishes]; // Tüm veriyi havuza al

            // Görsel kalabalığı (Density) düşürmek için Limit 15'e çekildi
            const maxVisible = 15;
            const shuffled = [...serverWishes].sort(() => 0.5 - Math.random());
            const selected = shuffled.slice(0, maxVisible);

            selected.forEach(wish => this.addWish(wish, false));
            this.updateCounter();
        });

        this.socket.on('new-wish', (wish) => {
            console.log('🎈 Yeni dilek:', wish.childName);
            if (this.totalWishesCount !== undefined) {
                this.totalWishesCount++;
            }
            this.addWish(wish, true);
            this.updateCounter();
            this.showNewWishToast(wish.childName);
            this.playSound('newWish');
            this.fireConfetti();
        });

        this.socket.on('spotlight', (wish) => {
            console.log('🌟 Spotlight:', wish.childName);
            this.showSpotlight(wish);
            this.playSound('spotlight');
        });

        this.socket.on('spotlight-off', () => {
            this.hideSpotlight();
        });

        this.socket.on('wish-deleted', (data) => {
            console.log('🗑️ Dilek silindi:', data.id);
            if (this.totalWishesCount !== undefined) {
                this.totalWishesCount = Math.max(0, this.totalWishesCount - 1);
            }
            this.removeWish(data.id);
            this.allServerWishes = this.allServerWishes.filter(w => w.id !== data.id); // Havuzdan da sil
            this.updateCounter();
        });

        this.socket.on('wish-updated', (wish) => {
            console.log('✏️ Dilek guncellendi:', wish.childName);
            const cardData = this.wishCards.find(c => c.element.dataset.wishId === wish.id);
            if (cardData && cardData.element) {
                // Balonu yeni verilerle güncelle
                const body = cardData.element.querySelector('.balloon-body');
                if (body) {
                    const textHtml = wish.wishText ? '<div class="wish-text">' + wish.wishText.replace(/\\n/g, '<br>') + '</div>' : '';
                    body.innerHTML = textHtml + '<div class="child-name">' + wish.childName + '</div>';
                }
            }

            // Havuzdaki veriyi de güncelle
            const poolIndex = this.allServerWishes.findIndex(w => w.id === wish.id);
            if (poolIndex > -1) {
                this.allServerWishes[poolIndex] = wish;
            }

            // Dizi içindeki orjinal veriyi de güncelle (spotlight için gerekli)
            const idx = this.wishes.findIndex(w => w.id === wish.id);
            if (idx !== -1) {
                this.wishes[idx] = wish;
            }

            // Eğer o an bu dilek Spotlight modundaysa, spotlight penceresindeki yazıyı da güncelle
            if (this.spotlightOverlay.classList.contains('show') &&
                this.spotlightWishText &&
                this.wishes[idx].isSpotlight) {
                this.spotlightWishText.textContent = wish.wishText || '';
            }
        });

        this.socket.on('all-cleared', () => {
            console.log('🗑️ Tüm dilekler silindi');
            this.totalWishesCount = 0;
            this.clearAll();
        });

        // === RAFFLE (ÇEKİLİŞ) SOCKET OLAYLARI ===
        this.socket.on('raffle-winners', (winners) => {
            console.log('🎁 Çekiliş Sonuçları Geldi!', winners);
            this.showRaffleAnimation(winners);
        });

        this.socket.on('raffle-close', () => {
            console.log('🎁 Çekiliş Ekranı Kapatıldı');
            const overlay = document.getElementById('raffle-overlay');
            if (overlay) overlay.classList.remove('show');
        });

        this.socket.on('theme-change', (theme) => {
            console.log('🎨 Tema değişti:', theme);
            this.applyTheme(theme);
        });

        // EKRAN AYARLARI SOCKET
        this.socket.on('display-settings', (settings) => {
            console.log('📺 Ekran Ayarları Geldi:', settings);
            this.displaySettings = { ...this.displaySettings, ...settings };
            this.applyDisplaySettings();
        });
    }

    // === AYARLARI UYGULA ===
    applyDisplaySettings() {
        const scale = this.displaySettings.scaleMultiplier || 1.0;
        const speed = this.displaySettings.speedMultiplier || 1.0;
        console.log(`📺 Ayarlar uygulanıyor: Hız=${speed}x, Ölçek=${scale}x`);

        // CSS değişkenini ayarla (transform'da kullanılıyor)
        document.documentElement.style.setProperty('--card-scale', scale);

        // Mevcut tüm kartlara ölçeği anında uygula
        this.wishCards.forEach(cardData => {
            cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${scale}) rotate(${cardData.rotation}deg)`;
        });
    }

    // === EVENTS ===
    bindEvents() {
        // Spotlight overlay'e tıklayınca kapat
        this.spotlightOverlay.addEventListener('click', () => {
            this.hideSpotlight();
        });

        // Pencere boyutu değişince pozisyonları güncelle (Y sınırlandırması kaldırıldı)
        window.addEventListener('resize', () => {
            // Balonlar yeni algoritmada tamamen özgür aktığı için resize sırasında 
            // balonların yerini zorla sınırlandırmaya gerek yoktur.
        });

        // Fullscreen
        const fsBtn = document.getElementById('fullscreen-btn');
        if (fsBtn) {
            fsBtn.addEventListener('click', () => {
                if (!document.fullscreenElement) {
                    document.documentElement.requestFullscreen().catch(() => { });
                    fsBtn.innerHTML = '&#x2716;';
                } else {
                    document.exitFullscreen();
                    fsBtn.innerHTML = '&#x26F6;';
                }
            });
        }

        document.addEventListener('fullscreenchange', () => {
            const fsBtn = document.getElementById('fullscreen-btn');
            if (fsBtn) {
                fsBtn.innerHTML = document.fullscreenElement ? '&#x2716;' : '&#x26F6;';
            }
        });

        // Mute toggle
        const muteBtn = document.getElementById('mute-btn');
        if (muteBtn) {
            muteBtn.addEventListener('click', () => {
                this.isMuted = !this.isMuted;
                muteBtn.textContent = this.isMuted ? '🔇' : '🔊';
                muteBtn.classList.toggle('muted', this.isMuted);
            });
        }
    }

    // === WISH CARDS ===
    addWish(wish, animate = true) {
        // Duplicate guard: ayni ID zaten varsa ekleme
        if (this.wishes.some(w => w.id === wish.id)) {
            console.warn('⚠️ Duplicate wish skipped:', wish.id);
            return;
        }

        this.emptyState.style.display = 'none';

        // Rich balloon colors with dark variants for gradient
        const balloonPalette = [
            { color: '#FF6B6B', dark: '#D94949', rgb: '255,107,107' },
            { color: '#4ECDC4', dark: '#35A89F', rgb: '78,205,196' },
            { color: '#FFE66D', dark: '#DAC044', rgb: '255,230,109' },
            { color: '#A8E6CF', dark: '#7DC4A7', rgb: '168,230,207' },
            { color: '#FF8E8E', dark: '#D96A6A', rgb: '255,142,142' },
            { color: '#88D8F7', dark: '#5FB8D6', rgb: '136,216,247' },
            { color: '#DDA0DD', dark: '#B87DB8', rgb: '221,160,221' },
            { color: '#FFB347', dark: '#D9922E', rgb: '255,179,71' },
            { color: '#FF85A2', dark: '#D96483', rgb: '255,133,162' },
            { color: '#7EC8E3', dark: '#5AA3BD', rgb: '126,200,227' },
            { color: '#C3AED6', dark: '#9E89B1', rgb: '195,174,214' },
            { color: '#95E1D3', dark: '#6FC1B3', rgb: '149,225,211' }
        ];
        const palette = balloonPalette[Math.floor(Math.random() * balloonPalette.length)];

        const card = document.createElement('div');
        card.className = 'wish-card' + (animate ? ' entering' : '');
        card.dataset.wishId = wish.id;
        card.style.setProperty('--balloon-color', palette.color);
        card.style.setProperty('--balloon-color-dark', palette.dark);
        card.style.setProperty('--balloon-color-rgb', palette.rgb);
        // Random bob animation timing for natural feel
        card.style.setProperty('--bob-duration', (3 + Math.random() * 3) + 's');
        card.style.setProperty('--bob-delay', (Math.random() * -5) + 's');

        card.innerHTML = `
            <div class="balloon-body">
                ${wish.wishText ? `<div class="wish-text">${wish.wishText.replace(/\n/g, '<br>')}</div>` : ''}
                <div class="child-name">${wish.childName}</div>
            </div>
            <div class="balloon-string"></div>
        `;

        // Görsel kalabalığı azaltmak için ekran maksimum limit koruması (15 Balon)
        const maxVisible = 15;
        if (this.wishCards.length >= maxVisible) {
            // En eski giren balonu ekran dizisinden çıkart ve DOM'dan sil
            const oldestCard = this.wishCards.shift();
            if (oldestCard && oldestCard.element) {
                const wishIdToRemove = oldestCard.element.dataset.wishId;
                this.wishes = this.wishes.filter(w => w.id !== wishIdToRemove);
                oldestCard.element.remove();
            }
        }

        // Remove constraints so they can spawn edge-to-edge
        const cw = this.container.offsetWidth;
        const ch = this.container.offsetHeight;
        const padding = 0;
        const maxX = cw - 520;

        // X ekseninde rastgele bir konum
        let x = padding + Math.random() * Math.max(0, maxX - padding);
        // Y ekseni: Hem başlangıçta yoğunluğu dağıtmak hem de sonsuz uçuş efekti için 
        // daha geniş bir aralığa yayıyoruz. İlk yüklenen kartlar daha aşağıdan gelecek.
        const spawnOffset = this.wishCards.length * 150;
        let y = ch + 200 + spawnOffset + Math.random() * 1000;

        const rotation = (Math.random() - 0.5) * 8;

        // CSS left/top yerine performansı artırmak için GPU hızlandırmalı transform3d kullanıyoruz.
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;

        card.addEventListener('click', () => {
            this.showSpotlight(wish);
        });

        this.container.appendChild(card);
        this.wishes.push(wish);

        const cardData = {
            element: card,
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 1.5,    // Sadece hafif sağ/sol sallanma drifti
            vy: -(1.5 + Math.random() * 2),     // Aşağıdan yukarıya doğru süzülme (Negatif Y)
            rotation: rotation,
            rotationSpeed: (Math.random() - 0.5) * 0.8, // Reduced rotation for calmer movement
            radius: 260
        };
        this.wishCards.push(cardData);

        if (animate) {
            setTimeout(() => {
                card.classList.remove('entering');
            }, 1000);
        }
    }

    // === ANIMATION WITHOUT PHYSICS (TOP-TO-BOTTOM) ===
    startFloatingAnimation() {
        // Layout Thrashing Fix: Cache the dimensions outside the animation loop
        // Otherwise reading offsetWidth inside the 60FPS loop for 380 items causes 22,800 layout recalcs per second!
        let cw = this.container.offsetWidth;
        let ch = this.container.offsetHeight;

        window.addEventListener('resize', () => {
            cw = this.container.offsetWidth;
            ch = this.container.offsetHeight;
        });

        const animate = () => {
            const cards = this.wishCards;

            const currentScale = this.displaySettings.scaleMultiplier || 1.0;
            const currentSpeedMulti = this.displaySettings.speedMultiplier || 1.0;
            const paddingSides = -200;
            const maxX = cw;

            cards.forEach(cardData => {
                // Admin panelinden gelen hızı doğrudan harekete çarparak uygula
                cardData.x += cardData.vx * currentSpeedMulti;
                cardData.y += cardData.vy * currentSpeedMulti;
                cardData.rotation += cardData.rotationSpeed;

                // === LOGO ÇARPIŞMA (REPULSION) ALGORİTMASI ===
                // Logonun 1920x1080 ekrandaki kapsadığı hayali yeşil kutu (Bounding Box)
                const logoStartX = cw * 0.25; // %25'ten başlar
                const logoEndX = cw * 0.75;   // %75'e kadar (toplam genişlik %50)
                const logoBottomY = ch * 0.45; // Görünmez kutunun alt sınırı (%45)

                // Eğer balonun merkez noktası logonun altından o tehlikeli bölgeye girmek üzereyse
                if (cardData.y < logoBottomY && cardData.y > 0 && cardData.x > logoStartX && cardData.x < logoEndX) {
                    // Balon tehlikeli kutuya girdiği an itme kuvveti başlar (Force Field)
                    const logoCenterX = cw * 0.50; // Tam orta nokta

                    // Sağa mı sola mı itilecek? Balon o an hangi yarıdasa o tarafa kavis çizer.
                    if (cardData.x < logoCenterX) {
                        // Sol yarıda: Kuvvetle sola fırlat
                        cardData.vx -= 0.15 * currentSpeedMulti;
                    } else {
                        // Sağ yarıda: Kuvvetle sağa fırlat
                        cardData.vx += 0.15 * currentSpeedMulti;
                    }
                }

                // Yan duvarlardan hafifçe sekmesi (drift sınırı)
                if (cardData.x < paddingSides) { cardData.x = paddingSides; cardData.vx *= -1; }
                if (cardData.x > maxX) { cardData.x = maxX; cardData.vx *= -1; }

                if (Math.abs(cardData.rotation) > 15) {
                    cardData.rotationSpeed *= -1;
                }

                // Balon ekranın tavanından tamamen çıktığında tekrar aşağı fırlat ve İÇERİĞİNİ GÜNCELLE
                if (cardData.y < -600) {
                    cardData.y = ch + 200 + Math.random() * 2000;
                    cardData.x = Math.random() * maxX;

                    // Havuzda birden fazla dilek varsa farklı, rastgele bir dilek seç ve balona uygula
                    if (this.allServerWishes && this.allServerWishes.length > 0) {
                        const randomWish = this.allServerWishes[Math.floor(Math.random() * this.allServerWishes.length)];
                        cardData.element.dataset.wishId = randomWish.id;

                        const textEl = cardData.element.querySelector('.wish-text');
                        const nameEl = cardData.element.querySelector('.child-name');
                        if (textEl && randomWish.wishText) textEl.innerHTML = randomWish.wishText.replace(/\n/g, '<br>');
                        if (nameEl && randomWish.childName) nameEl.textContent = randomWish.childName;
                    }
                }

                // SADECE GÖRÜNTÜ MATRİSİNİ VE EKSENİNİ (GPU) GÜNCELLE
                // 'left' ve 'top' değiştirmek tarayıcıya korkunç bir layout reflow yükü bindirir (Lag Sebebi)
                cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${currentScale}) rotate(${cardData.rotation}deg)`;
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    clampPosition(cardData) {
        // Balonların yukarıdan (ekstra negatif Y değerlerinden) doğmasını sağlamak 
        // ve serbestçe aşağı akabilmesini bozmamak için bu kısıtlamalar kaldırılmıştır.
        // Yeni Kar/Yağmur akışında X ve Y ekseni tamamen serbest bırakılmalıdır.
    }

    updateCounter() {
        const count = this.totalWishesCount !== undefined ? this.totalWishesCount : this.wishes.length;
        this.counterNumber.textContent = count;
    }

    // === SPOTLIGHT ===
    showSpotlight(wish) {
        const prev = this.container.querySelector('.spotlight-active');
        if (prev) prev.classList.remove('spotlight-active');

        const card = this.container.querySelector(`[data-wish-id="${wish.id}"]`);
        if (card) {
            card.classList.add('spotlight-active');
        }

        this.spotlightName.textContent = wish.childName;
        this.container.classList.add('spotlight-mode');
        this.spotlightOverlay.classList.add('active');
        this.spotlightLabel.classList.add('active');
    }

    hideSpotlight() {
        this.container.classList.remove('spotlight-mode');
        this.spotlightOverlay.classList.remove('active');
        this.spotlightLabel.classList.remove('active');
        const active = this.container.querySelector('.spotlight-active');
        if (active) active.classList.remove('spotlight-active');
    }

    // === WISH MANAGEMENT ===
    removeWish(id) {
        const card = this.container.querySelector(`[data-wish-id="${id}"]`);
        if (card) {
            card.style.transition = 'all 0.5s ease';
            card.style.opacity = '0';
            card.style.transform = 'scale(0)';
            setTimeout(() => card.remove(), 500);
        }

        this.wishes = this.wishes.filter(w => w.id !== id);
        this.wishCards = this.wishCards.filter(c => c.element.dataset.wishId !== id);

        if (this.wishes.length === 0) {
            this.emptyState.style.display = '';
        }
    }

    clearAll() {
        const cards = this.container.querySelectorAll('.wish-card');
        cards.forEach((card, i) => {
            card.style.transition = 'all 0.5s ease';
            card.style.transitionDelay = (i * 0.05) + 's';
            card.style.opacity = '0';
            card.style.transform = 'scale(0)';
        });

        setTimeout(() => {
            cards.forEach(c => c.remove());
        }, 800);

        this.wishes = [];
        this.wishCards = [];
        this.emptyState.style.display = '';
        this.updateCounter();
    }

    showNewWishToast(name) {
        const toast = document.getElementById('new-wish-toast');
        if (!toast) return;
        toast.textContent = '\u{1F389} ' + name + ' bir dilek atti!';
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    }

    // === THEME ===
    async loadTheme() {
        try {
            const res = await fetch('/api/theme');
            const data = await res.json();
            this.applyTheme(data.theme);
        } catch (e) { }
    }

    applyTheme(theme) {
        if (theme === 'default') {
            document.documentElement.removeAttribute('data-theme');
        } else {
            document.documentElement.setAttribute('data-theme', theme);
        }
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    new WishDisplay();
});
