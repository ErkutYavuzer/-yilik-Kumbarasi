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
        this.displaySettings = { speedMultiplier: 1.0, scaleMultiplier: 1.0, maxVisible: 20, screenMode: 'led' }; // Global ekran ayarları
        this.displayMode = 'balloon'; // 'balloon' veya 'lantern'

        this.init();
    }

    async init() {
        await this.loadDisplayMode();
        await this.loadDisplaySettings();
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
                conf.style.left = (Math.random() * 1920) + 'px';
                conf.style.top = '-40px';
            } else if (mode === 'left') {
                conf.style.left = '-60px';
                conf.style.top = (800 + Math.random() * 2500) + 'px';
            } else if (mode === 'right') {
                conf.style.left = (1920 + 60) + 'px';
                conf.style.top = (800 + Math.random() * 2500) + 'px';
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

    // === RAFFLE ANIMATION (3-2-1 Countdown → Name Reveal) ===
    showRaffleAnimation(winners) {
        const overlay = document.getElementById('raffle-overlay');
        const container = document.getElementById('raffle-winners-container');

        if (!overlay || !container || !winners || winners.length === 0) return;

        // Önceki sonuçları temizle
        container.innerHTML = '';

        // Modal'ı göster
        overlay.classList.add('show');

        // Geri sayım elemanı oluştur
        const countdownEl = document.createElement('div');
        countdownEl.className = 'raffle-countdown';
        countdownEl.textContent = '3';
        container.appendChild(countdownEl);

        // 3-2-1 Geri Sayım
        let count = 3;
        const countInterval = setInterval(() => {
            count--;
            if (count > 0) {
                countdownEl.textContent = count;
                countdownEl.classList.remove('countdown-pop');
                void countdownEl.offsetWidth; // Force reflow
                countdownEl.classList.add('countdown-pop');
            } else {
                clearInterval(countInterval);
                // Geri sayım bitti — ismi göster
                countdownEl.remove();

                winners.forEach((w) => {
                    const item = document.createElement('div');
                    item.className = 'raffle-item';
                    const wishHtml = w.wishText ? `<div style="font-size:26px; color:rgba(255,255,255,0.85); margin-top:15px; font-style:italic; line-height:1.4; max-width:800px;">"${w.wishText}"</div>` : '';
                    item.innerHTML = `<div style="font-size:28px; color:rgba(255,255,255,0.9); margin-bottom:15px;">\u2728 Sıradaki Talihli! \u2728</div>
                                      <div style="color:#FFD700; font-size:64px; font-weight:900; text-shadow:0 0 30px rgba(255,215,0,0.6);">${w.childName}</div>${wishHtml}`;
                    container.appendChild(item);

                    // İsim reveal animasyonu
                    setTimeout(() => {
                        this.playSound('spotlight');
                        item.classList.add('reveal');

                        // Raffle box golden pulse
                        const raffleBox = overlay.querySelector('.raffle-box');
                        if (raffleBox) raffleBox.classList.add('celebrating');

                        // Büyük kutlama — konfeti patlaması + havai fişek + sparkles
                        this.fireConfetti(80, 'top');
                        this.fireConfetti(50, 'left');
                        this.fireConfetti(50, 'right');
                        this.fireGoldenSparkles();
                        this.fireEmojiRain();
                        this.fireFirework(30, 30);
                        this.fireFirework(70, 25);
                        this.fireFirework(50, 40);
                        // 2. dalga — 1.5 saniye sonra
                        setTimeout(() => {
                            this.fireConfetti(60, 'top');
                            this.fireFirework(20, 35);
                            this.fireFirework(80, 30);
                        }, 1500);
                    }, 200);
                });
            }
        }, 1000);

        // İlk pop animasyonu
        countdownEl.classList.add('countdown-pop');
    }

    // === GOLDEN SPARKLES (Çekiliş kutlama efekti) ===
    fireGoldenSparkles() {
        const colors = ['#FFD700', '#FFA500', '#FFEC8B', '#FFE4B5', '#FFFFFF'];
        for (let i = 0; i < 75; i++) {
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
        for (let i = 0; i < 18; i++) {
            const em = document.createElement('div');
            em.className = 'celebration-emoji';
            em.textContent = emojis[Math.floor(Math.random() * emojis.length)];
            em.style.left = (Math.random() * 1800) + 'px';
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

            // Görsel kalabalığı düşürmek için maxVisible ayarı kullan
            const maxVisible = (this.displaySettings && this.displaySettings.maxVisible) || (this.displayMode === 'lantern' ? 20 : 12);
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
                const body = cardData.element.querySelector('.balloon-body') || cardData.element.querySelector('.lantern-text');
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
            const maxVisible = (this.displaySettings && this.displaySettings.maxVisible) || (this.displayMode === 'lantern' ? 20 : 12);
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
        const maxVisible = (this.displaySettings && this.displaySettings.maxVisible) || 20;
        console.log(`📺 Ayarlar uygulanıyor: Hız=${speed}x, Ölçek=${scale}x, Max=${maxVisible}`);

        // Screen mode değişimini uygula
        const screenMode = this.displaySettings.screenMode || 'led';
        if (this._lastScreenMode !== screenMode && typeof window.applyScreenMode === 'function') {
            this._lastScreenMode = screenMode;
            window.applyScreenMode(screenMode);
        }

        // CSS değişkenini ayarla (transform'da kullanılıyor)
        document.documentElement.style.setProperty('--card-scale', scale);

        // Mevcut tüm kartlara ölçeği anında uygula
        this.wishCards.forEach(cardData => {
            const depthScale = this.displayMode === 'lantern' ? scale * (cardData.zDepth || 1) : scale;
            cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${depthScale}) rotate(${cardData.rotation}deg)`;
        });

        // maxVisible değiştiğinde: fazla kartları sil veya eksik kartları ekle
        if (this.wishCards.length > maxVisible) {
            // Fazla kartları sil
            while (this.wishCards.length > maxVisible) {
                const removed = this.wishCards.shift();
                if (removed && removed.element) {
                    const wishId = removed.element.dataset.wishId;
                    this.wishes = this.wishes.filter(w => w.id !== wishId);
                    removed.element.style.transition = 'opacity 0.5s ease';
                    removed.element.style.opacity = '0';
                    setTimeout(() => { if (removed.element.parentNode) removed.element.remove(); }, 500);
                }
            }
        } else if (this.wishCards.length < maxVisible && this.allServerWishes && this.allServerWishes.length > 0) {
            // Eksik kartları havuzdan ekle
            const currentIds = new Set(this.wishes.map(w => w.id));
            const available = this.allServerWishes.filter(w => !currentIds.has(w.id));
            const shuffled = [...available].sort(() => 0.5 - Math.random());
            const toAdd = shuffled.slice(0, maxVisible - this.wishCards.length);
            toAdd.forEach(wish => this.addWish(wish, false));
        }
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
                <div class="lantern-text">
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

        // Görsel kalabalığı azaltmak için ekran maksimum limit koruması
        const maxVisible = (this.displaySettings && this.displaySettings.maxVisible) || (this.displayMode === 'lantern' ? 20 : 12);
        if (this.wishCards.length >= maxVisible) {
            // En eski giren balonu ekran dizisinden çıkart (fade-out ile)
            const oldestCard = this.wishCards.shift();
            if (oldestCard && oldestCard.element) {
                const wishIdToRemove = oldestCard.element.dataset.wishId;
                this.wishes = this.wishes.filter(w => w.id !== wishIdToRemove);
                oldestCard.element.style.transition = 'opacity 0.5s ease';
                oldestCard.element.style.opacity = '0';
                setTimeout(() => {
                    if (oldestCard.element.parentNode) oldestCard.element.remove();
                }, 500);
            }
        }

        // Remove constraints so they can spawn edge-to-edge
        const cw = this.container.offsetWidth;
        const ch = this.container.offsetHeight;
        const padding = 0;
        const cardWidth = this.displayMode === 'lantern' ? 320 : 320;
        const maxX = cw - cardWidth;

        // X ekseninde konum — fener modunda sütun bazlı dağılım
        let x;
        if (this.displayMode === 'lantern') {
            const columns = 4;
            const colWidth = Math.max(0, maxX) / columns;
            const colIndex = this.wishCards.length % columns;
            x = colIndex * colWidth + Math.random() * colWidth * 0.6 + colWidth * 0.2;
        } else {
            x = padding + Math.random() * Math.max(0, maxX - padding);
        }

        // Y ekseni: fener modunda ekranın tam altından doğar, rastgele dağılım ile
        // balon modunda eski davranış korunur
        // spawnOffset: viewport yüksekliğiyle sınırlı — büyük maxVisible'da binlerce px aşağıda doğmasını engelle
        const maxSpawnDepth = Math.min(this.wishCards.length * (this.displayMode === 'lantern' ? 250 : 150), ch);
        const spawnOffset = Math.random() * maxSpawnDepth;
        let y;
        if (animate && this.displayMode === 'lantern') {
            // Yeni dilek: ekranın alt kısmında görünür alanda doğ
            y = ch - 200 - Math.random() * 200;
        } else {
            y = this.displayMode === 'lantern'
                ? ch + 100 + spawnOffset          // Ekranın altından doğar (viewport ile sınırlı)
                : ch + 200 + spawnOffset + Math.random() * 1000;
        }

        const rotation = (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 3 : 8);

        // CSS left/top yerine performansı artırmak için GPU hızlandırmalı transform3d kullanıyoruz.
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.opacity = (animate && this.displayMode === 'lantern') ? '1' : (this.displayMode === 'lantern' ? '0' : '1');
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;

        card.addEventListener('click', () => {
            const currentWishId = card.dataset.wishId;
            const currentWish = this.allServerWishes.find(w => w.id === currentWishId) || wish;
            this.showSpotlight(currentWish);
        });

        this.container.appendChild(card);
        this.wishes.push(wish);

        const zDepth = this.displayMode === 'lantern' ? (0.5 + Math.random() * 0.5) : 1.0;
        const isNewWishEntry = animate && this.displayMode === 'lantern';
        const cardData = {
            element: card,
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 0.5 : 1.5),
            vy: -(this.displayMode === 'lantern' ? (0.4 + Math.random() * 0.6) * zDepth : (1.5 + Math.random() * 2)),
            rotation: rotation,
            rotationSpeed: (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 0.1 : 0.8),
            radius: this.displayMode === 'lantern' ? 250 : 180,
            zDepth: zDepth,
            // Salınım: çoklu sinüs ile doğal rüzgar akışı
            swayPhase: Math.random() * Math.PI * 2,
            swayFreq:  0.004 + Math.random() * 0.004,
            swayAmp:   40 + Math.random() * 60,
            sway2Phase: Math.random() * Math.PI * 2,
            sway2Freq:  0.009 + Math.random() * 0.007,
            sway2Amp:   15 + Math.random() * 25,
            swayYPhase: Math.random() * Math.PI * 2,
            swayYFreq:  0.003 + Math.random() * 0.003,
            swayYAmp:   5 + Math.random() * 8,
            swayBaseX: x,
            rising: !isNewWishEntry,                  // Yeni dilek zaten görünür
            opacity: isNewWishEntry ? (0.5 + zDepth * 0.5) : 0,
            isNewWish: isNewWishEntry                 // Yeni dilek giriş efekti
        };
        this.wishCards.push(cardData);

        if (animate) {
            setTimeout(() => {
                card.classList.remove('entering');
            }, 1000);

            // Fener modunda yeni dilek giriş efekti — 5 saniyelik altın parıltı
            if (this.displayMode === 'lantern') {
                card.classList.add('new-wish-highlight');
                setTimeout(() => {
                    card.classList.remove('new-wish-highlight');
                    cardData.isNewWish = false;
                }, 5000);
            }
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
            const cardWidth = this.displayMode === 'lantern' ? 320 : 320;
            const maxX = cw - cardWidth; // Account for card width so right edge doesn't clip

            cards.forEach(cardData => {
                // Spotlight modunda aktif kartı dondur — animasyonu atla
                if (cardData.element.classList.contains('spotlight-active')) return;
                // Admin panelinden gelen hızı doğrudan harekete çarparak uygula
                cardData.y += cardData.vy * currentSpeedMulti;

                // === FENER SALINIMU (SINÜS) — sadece lantern modunda ===
                if (this.displayMode === 'lantern') {
                    cardData.swayPhase += cardData.swayFreq * currentSpeedMulti;
                    cardData.sway2Phase += cardData.sway2Freq * currentSpeedMulti;
                    cardData.swayYPhase += cardData.swayYFreq * currentSpeedMulti;
                    const swayX = Math.sin(cardData.swayPhase) * cardData.swayAmp
                              + Math.sin(cardData.sway2Phase) * cardData.sway2Amp;
                    cardData.x = cardData.swayBaseX + swayX;
                    cardData.y += Math.sin(cardData.swayYPhase) * cardData.swayYAmp * 0.02;

                    // swayBaseX sınırları — fener kenara çıkmasın
                    if (cardData.swayBaseX < paddingSides + cardData.swayAmp) {
                        cardData.swayBaseX = paddingSides + cardData.swayAmp;
                    }
                    if (cardData.swayBaseX > maxX - cardData.swayAmp) {
                        cardData.swayBaseX = maxX - cardData.swayAmp;
                    }

                    // === FADE-IN: ekran altından yükselirken belirginleş ===
                    if (cardData.rising) {
                        // ch'den ch-400'e kadar olan bölgede opacity 0→maxOpacity
                        const fadeZone = 400;
                        const progress = Math.max(0, Math.min(1, (ch - cardData.y) / fadeZone));
                        const maxOpacity = 0.5 + cardData.zDepth * 0.5; // Uzak=0.75, yakın=1.0
                        cardData.opacity = progress * maxOpacity;
                        cardData.element.style.opacity = cardData.opacity;
                        if (progress >= 1) cardData.rising = false;
                    }

                    // === FADE-OUT + RESPAWN: tavandan çıkınca aşağıya dön ===
                    if (cardData.y < -200) {
                        // Fade-out: -200 ile -600 arasında opacity düş
                        const fadeOut = Math.max(0, 1 - (Math.abs(cardData.y) - 200) / 400);
                        cardData.element.style.opacity = fadeOut;

                        if (cardData.y < -600) {
                            // Yeni dilek yükle
                            if (this.allServerWishes && this.allServerWishes.length > 0) {
                                const randomWish = this.allServerWishes[Math.floor(Math.random() * this.allServerWishes.length)];
                                cardData.element.dataset.wishId = randomWish.id;
                                const textEl = cardData.element.querySelector('.wish-text');
                                const nameEl = cardData.element.querySelector('.child-name');
                                if (textEl && randomWish.wishText) textEl.innerHTML = randomWish.wishText.replace(/\n/g, '<br>');
                                if (nameEl && randomWish.childName) nameEl.textContent = randomWish.childName;
                            }
                            // Recycling guard: yeni dilek efektini kaldır
                            cardData.isNewWish = false;
                            cardData.element.classList.remove('new-wish-highlight');
                            // Yeni zDepth ata (derinlik çeşitliliği)
                            cardData.zDepth = 0.5 + Math.random() * 0.5;
                            cardData.vy = -(0.4 + Math.random() * 0.6) * cardData.zDepth;
                            // Ekranın altından yeni spawn — rastgele X merkezi
                            cardData.swayBaseX = paddingSides + cardData.swayAmp + Math.random() * (maxX - cardData.swayAmp * 2);
                            cardData.x = cardData.swayBaseX;
                            cardData.y = ch + 100 + Math.random() * 400;
                            cardData.swayPhase = Math.random() * Math.PI * 2;
                            cardData.sway2Phase = Math.random() * Math.PI * 2;
                            cardData.swayYPhase = Math.random() * Math.PI * 2;
                            cardData.rising = true;
                            cardData.opacity = 0;
                            cardData.element.style.opacity = '0';
                        }
                    }

                } else {
                    // Balon modu — eski davranış
                    cardData.x += cardData.vx * currentSpeedMulti;

                    // Rotasyon güncelle + sınır kontrolü
                    cardData.rotation += cardData.rotationSpeed;
                    if (Math.abs(cardData.rotation) > 15) {
                        cardData.rotationSpeed *= -1;
                    }

                    // Yan duvarlardan hafifçe sekmesi
                    if (cardData.x < paddingSides) {
                        cardData.x = paddingSides;
                        cardData.vx *= -0.3;
                    }
                    if (cardData.x > maxX) {
                        cardData.x = maxX;
                        cardData.vx *= -0.3;
                    }

                    // Balon ekranın tavanından tamamen çıktığında tekrar aşağı fırlat
                    if (cardData.y < -600) {
                        cardData.y = ch + 200 + Math.random() * 2000;
                        cardData.x = Math.random() * maxX;

                        if (this.allServerWishes && this.allServerWishes.length > 0) {
                            const randomWish = this.allServerWishes[Math.floor(Math.random() * this.allServerWishes.length)];
                            cardData.element.dataset.wishId = randomWish.id;
                            const textEl = cardData.element.querySelector('.wish-text');
                            const nameEl = cardData.element.querySelector('.child-name');
                            if (textEl && randomWish.wishText) textEl.innerHTML = randomWish.wishText.replace(/\n/g, '<br>');
                            if (nameEl && randomWish.childName) nameEl.textContent = randomWish.childName;
                        }
                    }
                }

                // SADECE GÖRÜNTÜ MATRİSİNİ VE EKSENİNİ (GPU) GÜNCELLE
                // Fener modunda salınım x'i halleder, rotation sadece hafif eğim
                const rot = this.displayMode === 'lantern'
                    ? (Math.sin(cardData.swayPhase) + Math.sin(cardData.sway2Phase) * 0.5) * 1.3  // Doğal salınım eğimi
                    : cardData.rotation;
                const depthScale = this.displayMode === 'lantern' ? currentScale * cardData.zDepth : currentScale;
                cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${depthScale}) rotate(${rot}deg)`;
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
        // Sadece TT teması — her zaman İyilik Feneri
        const titleText = document.querySelector('.title-text');
        if (titleText) {
            titleText.textContent = 'İyilik Feneri';
        }
    }

    async loadDisplayMode() {
        try {
            const res = await fetch('/api/display-mode');
            const data = await res.json();
            this.displayMode = data.displayMode || 'balloon';
        } catch (e) { }
    }

    async loadDisplaySettings() {
        try {
            const res = await fetch('/api/display-settings');
            const data = await res.json();
            this.displaySettings = { ...this.displaySettings, ...data };
            this.applyDisplaySettings();
        } catch (e) { }
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    new WishDisplay();
});
