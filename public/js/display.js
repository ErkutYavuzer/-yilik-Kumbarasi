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
        this.displayMode = 'balloon'; // 'balloon' veya 'lantern'

        this.init();
    }

    async init() {
        await this.loadDisplayMode();
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
    fireConfetti(amount = 50, mode = 'top') {
        const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF', '#FF8E8E', '#FF69B4', '#7B68EE', '#00CED1', '#FF4500', '#FFD700'];

        for (let i = 0; i < amount; i++) {
            const conf = document.createElement('div');
            const w = 6 + Math.random() * 16;
            const h = Math.random() > 0.5 ? w : w * (1.5 + Math.random());
            conf.className = 'display-confetti' + (mode === 'left' ? ' side-left' : mode === 'right' ? ' side-right' : '');
            if (mode === 'top') {
                conf.style.left = (Math.random() * 4224) + 'px';
                conf.style.top = '-40px';
            } else if (mode === 'left') {
                conf.style.left = '-60px';
                conf.style.top = (300 + Math.random() * 900) + 'px';
            } else if (mode === 'right') {
                conf.style.left = (4224 + 60) + 'px';
                conf.style.top = (300 + Math.random() * 900) + 'px';
            }
            conf.style.width = w + 'px';
            conf.style.height = h + 'px';
            conf.style.borderRadius = Math.random() > 0.4 ? '3px' : '50%';
            conf.style.backgroundColor = colors[Math.floor(Math.random() * colors.length)];
            conf.style.animationDelay = Math.random() * 2.5 + 's';
            conf.style.animationDuration = (Math.random() * 2 + 2.5) + 's';

            document.querySelector('.display-container').appendChild(conf);
            setTimeout(() => { if (conf && conf.parentNode) conf.remove(); }, 7000);
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

        winners.forEach((w, idx) => {
            const item = document.createElement('div');
            item.className = 'raffle-item';
            const wishHtml = w.wishText ? `<div style="font-size:36px; color:rgba(255,255,255,0.85); margin-top:20px; font-style:italic; line-height:1.4; max-width:1200px;">"${w.wishText}"</div>` : '';
            item.innerHTML = `<div style="font-size:32px; color:rgba(255,255,255,0.9); margin-bottom:15px;">Sıradaki Talihli!</div>
                              <div style="color:#FFD700; font-size: 80px; text-shadow:0 0 30px rgba(255,215,0,0.8);">${w.childName}</div>${wishHtml}`;
            container.appendChild(item);

            // 5 saniyelik MEGA görsel şölen
            setTimeout(() => {
                this.playSound('spotlight');
                item.classList.add('reveal');

                // Flash efekti — beyaz patlama
                this.fireFlash();

                // Raffle box golden pulse
                const raffleBox = overlay.querySelector('.raffle-box');
                if (raffleBox) raffleBox.classList.add('celebrating');

                // MEGA konfeti patlaması — 6 dalga, 5 saniye
                this.fireConfetti(300, 'top');
                this.fireConfetti(80, 'left');
                this.fireConfetti(80, 'right');
                setTimeout(() => { this.fireConfetti(250, 'top'); this.fireConfetti(60, 'left'); }, 800);
                setTimeout(() => { this.fireConfetti(200, 'top'); this.fireConfetti(60, 'right'); }, 1600);
                setTimeout(() => this.fireConfetti(200, 'top'), 2400);
                setTimeout(() => { this.fireConfetti(150, 'top'); this.fireConfetti(50, 'left'); this.fireConfetti(50, 'right'); }, 3200);
                setTimeout(() => this.fireConfetti(100, 'top'), 4200);

                // Altın parıltı efekti — 2 dalga
                this.fireGoldenSparkles();
                setTimeout(() => this.fireGoldenSparkles(), 2000);

                // Havai fişek — 4 patlama
                this.fireFirework(20 + Math.random() * 20, 20 + Math.random() * 30);
                setTimeout(() => this.fireFirework(60 + Math.random() * 20, 15 + Math.random() * 25), 600);
                setTimeout(() => this.fireFirework(10 + Math.random() * 25, 25 + Math.random() * 30), 1400);
                setTimeout(() => this.fireFirework(55 + Math.random() * 25, 20 + Math.random() * 25), 2200);
                setTimeout(() => this.fireFirework(35 + Math.random() * 20, 10 + Math.random() * 20), 3000);

                // Emoji yağmuru
                this.fireEmojiRain();
                setTimeout(() => this.fireEmojiRain(), 2500);
            }, 1500);
        });
    }

    // === GOLDEN SPARKLES (Çekiliş kutlama efekti) ===
    fireGoldenSparkles() {
        const colors = ['#FFD700', '#FFA500', '#FFEC8B', '#FFE4B5', '#FFFFFF'];
        for (let i = 0; i < 150; i++) {
            const spark = document.createElement('div');
            const rx = Math.random();
            const ry = Math.random();
            spark.style.cssText = `
                position: absolute;
                width: ${4 + Math.random() * 10}px;
                height: ${4 + Math.random() * 10}px;
                background: ${colors[Math.floor(Math.random() * colors.length)]};
                border-radius: 50%;
                z-index: 10001;
                pointer-events: none;
                left: ${25 + Math.random() * 50}%;
                top: ${15 + Math.random() * 50}%;
                --rx: ${rx};
                --ry: ${ry};
                animation: sparkleExplode ${1.5 + Math.random() * 2.5}s ease-out forwards;
                animation-delay: ${Math.random() * 2.5}s;
                opacity: 0;
                box-shadow: 0 0 ${8 + Math.random() * 14}px ${colors[Math.floor(Math.random() * colors.length)]};
            `;
            document.querySelector('.display-container').appendChild(spark);
            setTimeout(() => { if (spark.parentNode) spark.remove(); }, 7000);
        }
    }

    // === FIREWORK STARBURST ===
    fireFirework(x, y) {
        const rayCount = 24 + Math.floor(Math.random() * 12);
        const burstColors = ['#FFD700', '#FF6B6B', '#4ECDC4', '#FF69B4', '#FFA500', '#7B68EE', '#FFFFFF'];
        const color = burstColors[Math.floor(Math.random() * burstColors.length)];
        for (let i = 0; i < rayCount; i++) {
            const ray = document.createElement('div');
            ray.className = 'firework-ray';
            const angle = (360 / rayCount) * i;
            const len = 80 + Math.random() * 80;
            ray.style.cssText = `
                left: ${x}%;
                top: ${y}%;
                height: 0;
                width: ${3 + Math.random() * 3}px;
                background: linear-gradient(to top, ${color}, transparent);
                transform: rotate(${angle}deg);
                animation-duration: ${1.2 + Math.random() * 0.8}s;
                animation-delay: ${Math.random() * 0.3}s;
            `;
            document.querySelector('.display-container').appendChild(ray);
            setTimeout(() => { if (ray.parentNode) ray.remove(); }, 4000);
        }
    }

    // === EMOJI RAIN ===
    fireEmojiRain() {
        const emojis = ['🎉', '🎊', '⭐', '🌟', '✨', '💫', '🎁', '🏆', '💖', '🎈', '🥳', '🎆'];
        for (let i = 0; i < 35; i++) {
            const em = document.createElement('div');
            em.className = 'celebration-emoji';
            em.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            em.style.left = (Math.random() * 4000) + 'px';
            em.style.top = '-80px';
            em.style.fontSize = (40 + Math.random() * 50) + 'px';
            em.style.animationDelay = Math.random() * 3 + 's';
            em.style.animationDuration = (3 + Math.random() * 2) + 's';
            document.querySelector('.display-container').appendChild(em);
            setTimeout(() => { if (em.parentNode) em.remove(); }, 8000);
        }
    }

    // === FLASH EFFECT ===
    fireFlash() {
        const flash = document.createElement('div');
        flash.className = 'reveal-flash';
        document.querySelector('.display-container').appendChild(flash);
        setTimeout(() => { if (flash.parentNode) flash.remove(); }, 1000);
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
            const maxVisible = this.displayMode === 'lantern' ? 8 : 15;
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
                const body = cardData.element.querySelector('.balloon-body') || cardData.element.querySelector('.lantern-parchment');
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

        this.socket.on('display-mode-change', (mode) => {
            console.log('🎭 Gösterim modu değişti:', mode);
            this.displayMode = mode;
            // Tüm kartları temizle ve yeni modda yeniden oluştur
            this.container.querySelectorAll('.wish-card').forEach(c => c.remove());
            this.wishCards = [];
            this.wishes = [];
            const maxVisible = this.displayMode === 'lantern' ? 8 : 15;
            if (this.allServerWishes && this.allServerWishes.length > 0) {
                const shuffled = [...this.allServerWishes].sort(() => 0.5 - Math.random());
                const selected = shuffled.slice(0, maxVisible);
                selected.forEach(wish => this.addWish(wish, false));
            }
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
        card.dataset.wishId = wish.id;

        if (this.displayMode === 'lantern') {
            card.className = 'wish-card lantern-mode' + (animate ? ' entering' : '');
            card.innerHTML = `
                <div class="lantern-body">
                    <div class="lantern-flame"></div>
                </div>
                <div class="lantern-string"></div>
                <div class="lantern-parchment">
                    ${wish.wishText ? `<div class="wish-text">${wish.wishText.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="child-name">${wish.childName}</div>
                </div>
            `;
        } else {
            card.className = 'wish-card' + (animate ? ' entering' : '');
            card.style.setProperty('--balloon-color', palette.color);
            card.style.setProperty('--balloon-color-dark', palette.dark);
            card.style.setProperty('--balloon-color-rgb', palette.rgb);
            card.style.setProperty('--bob-duration', (3 + Math.random() * 3) + 's');
            card.style.setProperty('--bob-delay', (Math.random() * -5) + 's');
            card.innerHTML = `
                <div class="balloon-body">
                    ${wish.wishText ? `<div class="wish-text">${wish.wishText.replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="child-name">${wish.childName}</div>
                </div>
                <div class="balloon-string"></div>
            `;
        }

        // Görsel kalabalığı azaltmak için ekran maksimum limit koruması (15 Balon)
        const maxVisible = this.displayMode === 'lantern' ? 8 : 15;
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
        const cardWidth = this.displayMode === 'lantern' ? 400 : 520;
        const maxX = cw - cardWidth;

        // X ekseninde konum — fener modunda sütun bazlı dağılım
        let x;
        if (this.displayMode === 'lantern') {
            const columns = 8;
            const colWidth = Math.max(0, maxX) / columns;
            const colIndex = this.wishCards.length % columns;
            x = colIndex * colWidth + Math.random() * colWidth * 0.6 + colWidth * 0.2;
        } else {
            x = padding + Math.random() * Math.max(0, maxX - padding);
        }
        // Y ekseni: Hem başlangıçta yoğunluğu dağıtmak hem de sonsuz uçuş efekti için 
        // daha geniş bir aralığa yayıyoruz. İlk yüklenen kartlar daha aşağıdan gelecek.
        const spawnOffset = this.wishCards.length * (this.displayMode === 'lantern' ? 250 : 150);
        let y = ch + 200 + spawnOffset + Math.random() * 1000;

        const rotation = (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 3 : 8);

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
            vx: (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 0.5 : 1.5),
            vy: -(this.displayMode === 'lantern' ? (1.0 + Math.random() * 1.2) : (1.5 + Math.random() * 2)),
            rotation: rotation,
            rotationSpeed: (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 0.15 : 0.8),
            radius: this.displayMode === 'lantern' ? 300 : 260
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
            const paddingSides = -100; // Allow slight peek from left edge
            const cardWidth = this.displayMode === 'lantern' ? 400 : 520;
            const maxX = cw - cardWidth; // Account for card width so right edge doesn't clip

            cards.forEach(cardData => {
                // Admin panelinden gelen hızı doğrudan harekete çarparak uygula
                cardData.x += cardData.vx * currentSpeedMulti;
                cardData.y += cardData.vy * currentSpeedMulti;
                cardData.rotation += cardData.rotationSpeed;

                // Logo repulsion removed — balloons now pass freely under header banner
                // The .logo-layer CSS clip-path handles visual layering

                // === FENER ARASI İTME (LANTERN REPULSION) ===
                if (this.displayMode === 'lantern') {
                    const repulseRadius = 450; // Piksel mesafe eşiği
                    const repulseForce = 0.08;
                    for (let j = 0; j < cards.length; j++) {
                        const other = cards[j];
                        if (other === cardData) continue;
                        const dx = cardData.x - other.x;
                        const dy = cardData.y - other.y;
                        const dist = Math.sqrt(dx * dx + dy * dy);
                        if (dist < repulseRadius && dist > 1) {
                            const force = repulseForce * (1 - dist / repulseRadius);
                            cardData.vx += (dx / dist) * force;
                            // Y ekseninde çok az itme — dikey akışı bozmamak için
                            cardData.vy += (dy / dist) * force * 0.15;
                        }
                    }
                }

                // Yan duvarlardan hafifçe sekmesi (drift sınırı)
                if (cardData.x < paddingSides) {
                    cardData.x = paddingSides;
                    cardData.vx *= -0.3; // Sert sekme yerine hızı büyük oranda sönümle
                }
                if (cardData.x > maxX) {
                    cardData.x = maxX;
                    cardData.vx *= -0.3; // Sert sekme yerine hızı büyük oranda sönümle 
                }

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

    async loadDisplayMode() {
        try {
            const res = await fetch('/api/display-mode');
            const data = await res.json();
            this.displayMode = data.displayMode || 'balloon';
        } catch (e) { }
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    new WishDisplay();
});
