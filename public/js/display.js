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
        this.displaySettings = { speedMultiplier: 1.0, scaleMultiplier: 1.0, maxVisible: 20, logoOffsetPx: 0, headerOffsetPx: 0, logoScale: 1, headerScale: 1, dayMode: false }; // Global ekran ayarları
        this.displayMode = 'balloon'; // 'balloon' veya 'lantern'
        this._raffleAnimating = false; // Çekiliş animasyonu aktif mi

        this.init();
    }

    async init() {
        try {
            await this.loadDisplayMode();
            this.applyDisplayMode();
            await this.loadDisplaySettings();
            this.connectSocket();
            this.bindEvents();
            this.initHeaderLogoObservers();
            this.startFloatingAnimation();
            this.setupAudio();
            this.loadTheme();
        } catch (e) {
            console.error('WishDisplay init hatası:', e);
            // Retry after 2s — mobilde ilk yüklemede ağ gecikmesi olabilir
            setTimeout(() => {
                this.connectSocket();
                this.bindEvents();
                this.startFloatingAnimation();
                this.setupAudio();
            }, 2000);
        }
    }

    isMessageWallMode() {
        return this.displayMode === 'messagewall';
    }

    getVisibleWishLimit() {
        if (this.isMessageWallMode()) {
            return 5;
        }
        if (this.displayMode === 'lantern') return this.getAdaptiveMaxVisible();
        return ((this.displaySettings && this.displaySettings.maxVisible) || 12);
    }

    getVisibleWishes(pool) {
        if (!Array.isArray(pool) || pool.length === 0) return [];
        if (this.isMessageWallMode()) {
            return [...pool].slice(0, this.getVisibleWishLimit());
        }
        const shuffled = [...pool].sort(() => 0.5 - Math.random());
        return shuffled.slice(0, this.getVisibleWishLimit());
    }

    rebuildVisibleWishes(options = {}) {
        const { animateHighlightId = null } = options;
        this.container.querySelectorAll('.wish-card').forEach(card => card.remove());
        this.wishes = [];
        this.wishCards = [];
        this.pendingMessageWallWishes = [];

        const selected = this.getVisibleWishes(this.allServerWishes);
        selected.forEach((wish) => {
            const shouldAnimate = this.isMessageWallMode() ? true : animateHighlightId === wish.id;
            this.addWish(wish, shouldAnimate);
        });

        this.emptyState.style.display = selected.length ? 'none' : '';
    }

    applyDisplayMode() {
        const messageWall = this.isMessageWallMode();
        document.documentElement.classList.toggle('display-mode-messagewall', messageWall);
        if (typeof window.setDisplayCanvasSize === 'function') {
            window.setDisplayCanvasSize(messageWall ? 1920 : 960, messageWall ? 1080 : 2160);
        }

        const legacyTitle = document.querySelector('.header-line2');
        if (legacyTitle) {
            legacyTitle.textContent = messageWall ? 'Dilekler Markalarin Gelecegi Icin' : 'Dilekler Kadinlar Icin';
        }

        const stageTitle = document.querySelector('.message-stage__headline-text');
        if (stageTitle) {
            stageTitle.textContent = 'PEKI SENIN MARKAN ICIN DILEGIN NE?';
        }

        const stagePrefix = document.querySelector('.message-stage__headline-prefix');
        if (stagePrefix) {
            stagePrefix.textContent = 'DILEKLER MARKALARIN GELECEGI ICIN';
        }

        const emptyText = document.querySelector('#empty-state .empty-text');
        const emptySub = document.querySelector('#empty-state .empty-sub');
        if (emptyText) emptyText.textContent = 'Dilekler Bekleniyor...';
        if (emptySub) emptySub.textContent = 'Ilk dilek paylasildiginda burada gorunecek';
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

        if (!overlay || !container || !winners || winners.length === 0) {
            console.log('🎁 Raffle ABORT: overlay=', !!overlay, 'container=', !!container, 'winners=', winners);
            return;
        }

        // Önceki sonuçları temizle
        container.innerHTML = '';

        // Animasyon aktif işaretle
        this._raffleAnimating = true;
        console.log('🎁 Raffle overlay SHOW — animasyon başlıyor');

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
            // Animasyon tamamlandı
            this._raffleAnimating = false;
            console.log('🎁 Raffle animasyon tamamlandı');
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
            this.totalWishesCount = serverWishes.length;
            this.allServerWishes = [...serverWishes];
            this.rebuildVisibleWishes();
            this.updateCounter();
        });

        this.socket.on('new-wish', (wish) => {
            console.log('🎈 Yeni dilek:', wish.childName);
            if (this.totalWishesCount !== undefined) {
                this.totalWishesCount++;
            }
            this.allServerWishes = [wish, ...this.allServerWishes.filter(existing => existing.id !== wish.id)];
            if (this.isMessageWallMode() && this.wishCards.length >= this.getVisibleWishLimit()) {
                this.queueMessageWallWish(wish);
            } else {
                this.addWish(wish, true);
            }
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
            this.allServerWishes = this.allServerWishes.filter(w => w.id !== data.id);
            this.removeWish(data.id);
            this.updateCounter();
        });

        this.socket.on('wish-updated', (wish) => {
            console.log('✏️ Dilek guncellendi:', wish.childName);
            const poolIndex = this.allServerWishes.findIndex(w => w.id === wish.id);
            if (poolIndex > -1) {
                this.allServerWishes[poolIndex] = wish;
            }

            const cardData = this.wishCards.find(c => c.element.dataset.wishId === wish.id);
            if (cardData && cardData.element) {
                if (cardData.isMessageWall) {
                    this.applyMessageWallContent(cardData.element, wish);
                } else {
                    const renderedText = wish.wishText
                        ? (wish.wishText.length > 180 ? wish.wishText.substring(0, 180) + '…' : wish.wishText).replace(/\n/g, '<br>')
                        : '';
                    const messageShell = cardData.element.querySelector('.message-card-shell');
                    if (messageShell) {
                        messageShell.innerHTML = `
                            ${renderedText ? `<div class="wish-text">${renderedText}</div>` : '<div class="wish-text">Dilek metni bekleniyor.</div>'}
                            <div class="child-name">${wish.childName}</div>
                        `;
                    } else {
                        // Balonu yeni verilerle güncelle
                        const body = cardData.element.querySelector('.balloon-body') || cardData.element.querySelector('.lantern-text');
                        if (body) {
                            const textHtml = wish.wishText ? '<div class="wish-text">' + wish.wishText.replace(/\\n/g, '<br>') + '</div>' : '';
                            body.innerHTML = textHtml + '<div class="child-name">' + wish.childName + '</div>';
                        }
                    }
                }
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
            // Animasyon devam ediyorsa close'u yoksay
            if (this._raffleAnimating) {
                console.log('🎁 Çekiliş CLOSE yoksayıldı — animasyon devam ediyor');
                return;
            }
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
            this.applyDisplayMode();
            this.rebuildVisibleWishes();
            this.updateCounter();
        });
    }

    // === AYARLARI UYGULA ===
    applyDisplaySettings() {
        const scale = this.displaySettings.scaleMultiplier || 1.0;
        const speed = this.displaySettings.speedMultiplier || 1.0;
        const maxVisible = this.getVisibleWishLimit();
        const logoOffsetPx = typeof this.displaySettings.logoOffsetPx === 'number' ? this.displaySettings.logoOffsetPx : 0;
        const headerOffsetPx = typeof this.displaySettings.headerOffsetPx === 'number' ? this.displaySettings.headerOffsetPx : 0;
        const logoScale = typeof this.displaySettings.logoScale === 'number' ? this.displaySettings.logoScale : 1;
        const headerScale = typeof this.displaySettings.headerScale === 'number' ? this.displaySettings.headerScale : 1;
        console.log(`📺 Ayarlar uygulanıyor: Hız=${speed}x, Ölçek=${scale}x, Max=${maxVisible}`);

        // screenMode artık otomatik — her ekran kendi aspect ratio'suna göre ayarlanıyor

        // CSS değişkenini ayarla (transform'da kullanılıyor)
        document.documentElement.style.setProperty('--card-scale', scale);
        document.documentElement.style.setProperty('--logo-offset', `${logoOffsetPx}px`);
        document.documentElement.style.setProperty('--header-offset', `${headerOffsetPx}px`);
        document.documentElement.style.setProperty('--logo-scale', logoScale.toString());
        document.documentElement.style.setProperty('--header-scale', headerScale.toString());

        // Ayrı logo boyutları
        const bakanlikScale = typeof this.displaySettings.bakanlikScale === 'number' ? this.displaySettings.bakanlikScale : 1;
        const akmScale = typeof this.displaySettings.akmScale === 'number' ? this.displaySettings.akmScale : 1;
        document.documentElement.style.setProperty('--bakanlik-scale', bakanlikScale.toString());
        document.documentElement.style.setProperty('--akm-scale', akmScale.toString());

        // Ayrı logo X/Y pozisyon (piksel)
        const bakanlikX = typeof this.displaySettings.bakanlikX === 'number' ? this.displaySettings.bakanlikX : 0;
        const bakanlikY = typeof this.displaySettings.bakanlikY === 'number' ? this.displaySettings.bakanlikY : 0;
        const akmX = typeof this.displaySettings.akmX === 'number' ? this.displaySettings.akmX : 0;
        const akmY = typeof this.displaySettings.akmY === 'number' ? this.displaySettings.akmY : 0;
        document.documentElement.style.setProperty('--bakanlik-x', `${bakanlikX}px`);
        document.documentElement.style.setProperty('--bakanlik-y', `${bakanlikY}px`);
        document.documentElement.style.setProperty('--akm-x', `${akmX}px`);
        document.documentElement.style.setProperty('--akm-y', `${akmY}px`);

        // Logo X/Y pozisyon (piksel)
        const logoTopX = typeof this.displaySettings.logoTopX === 'number' ? this.displaySettings.logoTopX : 0;
        const logoTopY = typeof this.displaySettings.logoTopY === 'number' ? this.displaySettings.logoTopY : 0;
        document.documentElement.style.setProperty('--logo-top-x', `${logoTopX}px`);
        document.documentElement.style.setProperty('--logo-top-y', `${logoTopY}px`);

        // Başlık X/Y pozisyon (piksel)
        const headerX = typeof this.displaySettings.headerX === 'number' ? this.displaySettings.headerX : 0;
        const headerY = typeof this.displaySettings.headerY === 'number' ? this.displaySettings.headerY : 0;
        document.documentElement.style.setProperty('--header-x', `${headerX}px`);
        document.documentElement.style.setProperty('--header-y', `${headerY}px`);

        // Gündüz modu sınıfı
        document.documentElement.classList.toggle('day-mode', !!this.displaySettings.dayMode);

        // Logo ve başlık çakışmasını önle (ekranlar arası ölçek farkı)
        this.updateHeaderLogoSpacing();
        requestAnimationFrame(() => this.updateHeaderLogoSpacing());

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
            toAdd.forEach(wish => {
                this.addWish(wish, false);
            });
        }
    }

    updateHeaderLogoSpacing() {
        const logoBar = document.querySelector('.logos-top-bar');
        const headerBox = document.querySelector('.header-title-box');
        if (!logoBar || !headerBox) return;

        const gap = 16;
        const logoRect = logoBar.getBoundingClientRect();
        const headerRect = headerBox.getBoundingClientRect();
        const overlap = (logoRect.bottom + gap) - headerRect.top;
        const safeOffset = overlap > 0 ? -Math.ceil(overlap) : 0;

        document.documentElement.style.setProperty('--header-safe-offset', `${safeOffset}px`);
    }

    initHeaderLogoObservers() {
        const logoBar = document.querySelector('.logos-top-bar');
        const headerBox = document.querySelector('.header-title-box');
        if (!logoBar || !headerBox) return;

        const schedule = () => {
            this.updateHeaderLogoSpacing();
            requestAnimationFrame(() => this.updateHeaderLogoSpacing());
        };

        if (this._headerLogoObserver) {
            this._headerLogoObserver.disconnect();
        }

        if (typeof ResizeObserver !== 'undefined') {
            this._headerLogoObserver = new ResizeObserver(() => schedule());
            this._headerLogoObserver.observe(logoBar);
            this._headerLogoObserver.observe(headerBox);
        }

        const logoImg = logoBar.querySelector('img');
        if (logoImg && !logoImg.complete) {
            logoImg.addEventListener('load', schedule, { once: true });
        }

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(schedule).catch(() => { });
        }

        window.addEventListener('load', schedule, { once: true });
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
            this.updateHeaderLogoSpacing();
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
    getAdaptiveMaxVisible() {
        const cw = this.container.offsetWidth;
        const cardWidth = 320;
        const scale = this.displaySettings.scaleMultiplier || 1.0;
        // How many non-overlapping columns fit with 80% packing factor
        const maxAllowed = Math.floor(cw / (cardWidth * scale * 0.8));
        // Never exceed admin setting, never below 2
        const adminMax = (this.displaySettings && this.displaySettings.maxVisible) || 20;
        return Math.max(2, Math.min(adminMax, maxAllowed));
    }

    getMessageWallSlots() {
        const cw = this.container.offsetWidth || DESIGN_WIDTH;
        const ch = this.container.offsetHeight || DESIGN_HEIGHT;
        const scaleX = cw / 1920;
        const scaleY = ch / 1080;
        const baseSlots = [
            { key: 'hero', className: 'messagewall-slot--hero', variant: 'large', x: 789, y: 565, width: 344, height: 386, zIndex: 46, delay: 120 },
            { key: 'left-high', className: 'messagewall-slot--small', variant: 'small', x: 509, y: 445, width: 225, height: 252, zIndex: 42, delay: 260 },
            { key: 'right-high', className: 'messagewall-slot--small', variant: 'small', x: 1186, y: 445, width: 225, height: 252, zIndex: 42, delay: 360 },
            { key: 'left-low', className: 'messagewall-slot--small', variant: 'small', x: 229, y: 574, width: 225, height: 252, zIndex: 41, delay: 460 },
            { key: 'right-low', className: 'messagewall-slot--small', variant: 'small', x: 1465, y: 574, width: 225, height: 252, zIndex: 41, delay: 560 }
        ];

        return baseSlots.map((slot) => ({
            ...slot,
            x: Math.round(slot.x * scaleX),
            y: Math.round(slot.y * scaleY),
            width: Math.round(slot.width * scaleX),
            height: Math.round(slot.height * scaleY)
        }));
    }

    getMessageWallSlotByKey(key) {
        return this.getMessageWallSlots().find(slot => slot.key === key) || null;
    }

    getNextMessageWallSlot() {
        const occupied = new Set(
            this.wishCards
                .filter(card => card.isMessageWall)
                .map(card => card.slotKey)
        );
        return this.getMessageWallSlots().find(slot => !occupied.has(slot.key)) || null;
    }

    formatWishHtml(text) {
        if (!text) return '';
        const truncated = text.length > 180 ? text.substring(0, 180) + '…' : text;
        return truncated.replace(/\n/g, '<br>');
    }

    queueMessageWallWish(wish) {
        if (!wish || wish.id === undefined || wish.id === null) return;
        const wishId = String(wish.id);
        const alreadyVisible = this.wishCards.some(card => String(card.element.dataset.wishId) === wishId);
        const alreadyQueued = this.pendingMessageWallWishes.some(item => String(item.id) === wishId);
        if (!alreadyVisible && !alreadyQueued) {
            this.pendingMessageWallWishes.push(wish);
        }
    }

    getVisibleWishIdSet(excludeCard = null) {
        return new Set(
            this.wishCards
                .filter(card => card !== excludeCard)
                .map(card => String(card.element.dataset.wishId))
        );
    }

    getNextMessageWallWish(excludeIds = new Set(), currentWishId = null) {
        const excluded = new Set([...excludeIds].map(id => String(id)));

        for (let i = 0; i < this.pendingMessageWallWishes.length; i++) {
            const candidate = this.pendingMessageWallWishes[i];
            if (!excluded.has(String(candidate.id))) {
                this.pendingMessageWallWishes.splice(i, 1);
                return candidate;
            }
        }

        const pool = Array.isArray(this.allServerWishes) ? [...this.allServerWishes] : [];
        let available = pool.filter(candidate => !excluded.has(String(candidate.id)));
        if (available.length === 0 && currentWishId !== null && currentWishId !== undefined) {
            available = pool.filter(candidate => String(candidate.id) !== String(currentWishId));
        }
        if (available.length === 0) {
            available = pool;
        }
        if (available.length === 0) return null;

        return available[Math.floor(Math.random() * available.length)];
    }

    applyMessageWallContent(card, wish) {
        if (!card) return;
        const textEl = card.querySelector('.wish-text');
        const nameEl = card.querySelector('.child-name');
        if (textEl) {
            textEl.innerHTML = wish && wish.wishText
                ? this.formatWishHtml(wish.wishText)
                : 'Dilek metni bekleniyor.';
        }
        if (nameEl) {
            nameEl.textContent = wish && wish.childName ? wish.childName : 'ISIM BEKLENIYOR';
        }
    }

    easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }

    armMessageWallCard(cardData, wish, animate = true, delayMs = 0) {
        if (!cardData || !cardData.element || !cardData.slot) return;
        const slot = cardData.slot;
        const currentScale = this.displaySettings.scaleMultiplier || 1.0;
        const now = performance.now();
        const oldWishId = cardData.element.dataset.wishId;

        if (oldWishId) {
            this.wishes = this.wishes.filter(item => String(item.id) !== String(oldWishId));
        }
        if (wish) {
            this.wishes.push(wish);
        }

        this.applyMessageWallContent(cardData.element, wish);
        cardData.element.dataset.wishId = wish ? wish.id : '';
        cardData.element.dataset.slotKey = slot.key;
        cardData.element.className = `wish-card messagewall-mode ${slot.className}`.trim();
        cardData.element.style.setProperty('--message-card-width', `${slot.width}px`);
        cardData.element.style.setProperty('--message-card-height', `${slot.height}px`);
        cardData.element.style.setProperty('--message-card-z', `${slot.zIndex}`);

        cardData.cardWidth = slot.width;
        cardData.cardHeight = slot.height;
        cardData.rotation = 0;
        cardData.slotX = slot.x;
        cardData.slotY = slot.y;
        cardData.phase = animate ? 'entering' : 'holding';
        cardData.phaseStartedAt = now + (animate ? delayMs : 0);
        cardData.enterDuration = 560 + Math.random() * 120;
        cardData.holdDuration = 7200 + Math.random() * 1800;
        cardData.exitDuration = 380 + Math.random() * 140;
        cardData.startY = slot.y - (slot.variant === 'large' ? 180 : 140);
        cardData.endY = slot.y;
        cardData.x = slot.x;
        cardData.y = animate ? cardData.startY : slot.y;
        cardData.opacity = animate ? 0 : 1;
        cardData.renderScale = animate ? 0.94 : 1;
        cardData.element.style.opacity = cardData.opacity.toString();
        cardData.element.style.setProperty('--messagewall-blur', animate ? '7px' : '0px');
        cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${currentScale * cardData.renderScale}) rotate(0deg)`;
    }

    updateMessageWallCard(cardData, now, currentSpeedMulti) {
        if (!cardData || !cardData.slot) return;
        if (now < cardData.phaseStartedAt) {
            cardData.element.style.opacity = '0';
            cardData.element.style.setProperty('--messagewall-blur', '7px');
            return;
        }

        const elapsed = (now - cardData.phaseStartedAt) * currentSpeedMulti;
        const slot = cardData.slot;

        if (cardData.phase === 'entering') {
            const progress = Math.max(0, Math.min(1, elapsed / cardData.enterDuration));
            const eased = this.easeOutBack(progress);
            cardData.x = slot.x;
            cardData.y = cardData.startY + (slot.y - cardData.startY) * eased;
            cardData.opacity = Math.min(1, progress * 1.25);
            cardData.renderScale = 0.94 + (1 - 0.94) * eased;
            cardData.element.style.setProperty('--messagewall-blur', `${(1 - progress) * 7}px`);
            if (progress >= 1) {
                cardData.phase = 'holding';
                cardData.phaseStartedAt = now;
                cardData.x = slot.x;
                cardData.y = slot.y;
                cardData.opacity = 1;
                cardData.renderScale = 1;
                cardData.element.style.setProperty('--messagewall-blur', '0px');
            }
            return;
        }

        if (cardData.phase === 'holding') {
            cardData.x = slot.x;
            cardData.y = slot.y;
            cardData.opacity = 1;
            cardData.renderScale = 1;
            cardData.element.style.setProperty('--messagewall-blur', '0px');
            if (elapsed >= cardData.holdDuration) {
                cardData.phase = 'closing';
                cardData.phaseStartedAt = now;
            }
            return;
        }

        const progress = Math.max(0, Math.min(1, elapsed / cardData.exitDuration));
        const eased = progress * progress * progress;
        cardData.x = slot.x;
        cardData.y = slot.y + 18 * eased;
        cardData.opacity = 1 - eased;
        cardData.renderScale = 1 - 0.08 * eased;
        cardData.element.style.setProperty('--messagewall-blur', `${eased * 6}px`);

        if (progress >= 1) {
            const currentWishId = cardData.element.dataset.wishId;
            const visibleIds = this.getVisibleWishIdSet(cardData);
            const nextWish = this.getNextMessageWallWish(visibleIds, currentWishId);

            if (!nextWish) {
                cardData.element.remove();
                this.wishCards = this.wishCards.filter(item => item !== cardData);
                this.wishes = this.wishes.filter(item => String(item.id) !== String(currentWishId));
                this.emptyState.style.display = this.wishCards.length ? 'none' : '';
                return;
            }

            this.armMessageWallCard(cardData, nextWish, true, 0);
        }
    }

    addMessageWallWish(wish, animate = true) {
        const slot = this.getNextMessageWallSlot();
        const maxVisible = this.getVisibleWishLimit();

        if (!slot || this.wishCards.length >= maxVisible) {
            this.queueMessageWallWish(wish);
            return;
        }

        const card = document.createElement('div');
        card.className = `wish-card messagewall-mode ${slot.className}`;
        card.dataset.slotKey = slot.key;
        card.style.left = '0px';
        card.style.top = '0px';
        card.innerHTML = `
            <div class="message-card-shell">
                <div class="message-card-fill"></div>
                <div class="message-card-content">
                    <div class="wish-text"></div>
                    <div class="child-name"></div>
                </div>
            </div>
        `;

        this.container.appendChild(card);

        const cardData = {
            element: card,
            x: slot.x,
            y: slot.y,
            rotation: 0,
            zDepth: 1,
            renderScale: 1,
            opacity: 0,
            cardWidth: slot.width,
            cardHeight: slot.height,
            isMessageWall: true,
            slotKey: slot.key,
            slot,
            phase: 'entering',
            phaseStartedAt: performance.now(),
            enterDuration: 600,
            holdDuration: 7600,
            exitDuration: 420
        };

        this.wishCards.push(cardData);
        this.armMessageWallCard(cardData, wish, animate, slot.delay);
    }

    getMessageWallLayout(cardWidth = 240, cardHeight = 230) {
        const cw = this.container.offsetWidth || DESIGN_WIDTH;
        const ch = this.container.offsetHeight || DESIGN_HEIGHT;
        const laneCount = 4;
        const leftInset = 128;
        const rightInset = 520;
        const usableWidth = Math.max(1, cw - leftInset - rightInset - cardWidth);
        const lanes = Array.from({ length: laneCount }, (_, index) => {
            if (laneCount === 1) return leftInset;
            return Math.round(leftInset + ((usableWidth * index) / (laneCount - 1)));
        });
        const rows = [470, 650, 820].filter(row => row + cardHeight < ch - 72);

        return {
            cw,
            ch,
            lanes,
            rows,
            fadeStart: 430,
            exitY: 220 - cardHeight,
            safeAreas: [
                { left: 20, top: 18, right: 360, bottom: 190, penalty: 2600 },
                { left: 300, top: 86, right: 1630, bottom: 404, penalty: 4200 },
                { left: 18, top: 724, right: 250, bottom: ch, penalty: 2200 },
                { left: 1380, top: 420, right: cw, bottom: ch, penalty: 2600 }
            ]
        };
    }

    doRectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
        return ax < (bx + bw) && (ax + aw) > bx && ay < (by + bh) && (ay + ah) > by;
    }

    scoreMessageWallPosition(x, y, cardWidth, cardHeight, excludeCard = null) {
        const layout = this.getMessageWallLayout(cardWidth, cardHeight);
        let score = 0;

        for (const area of layout.safeAreas) {
            if (this.doRectsOverlap(x, y, cardWidth, cardHeight, area.left, area.top, area.right - area.left, area.bottom - area.top)) {
                score -= area.penalty;
            }
        }

        for (const card of this.wishCards) {
            if (!card || card === excludeCard) continue;
            const otherWidth = card.cardWidth || 260;
            const otherHeight = card.cardHeight || 240;
            const otherX = card.swayBaseX || card.x || 0;
            const otherY = card.y || 0;
            const dx = x - otherX;
            const dy = y - otherY;
            const distance = Math.sqrt((dx * 1.55) * (dx * 1.55) + dy * dy);

            score += Math.min(distance, 420);

            if (this.doRectsOverlap(x, y, cardWidth, cardHeight, otherX, otherY, otherWidth, otherHeight)) {
                score -= 3600;
            } else if (Math.abs(dx) < ((cardWidth + otherWidth) * 0.55) && Math.abs(dy) < ((cardHeight + otherHeight) * 0.65)) {
                score -= 1500;
            }
        }

        return score;
    }

    getBestMessageWallInitialPlacement(cardWidth, cardHeight) {
        const layout = this.getMessageWallLayout(cardWidth, cardHeight);
        const candidates = [];

        layout.rows.forEach((row) => {
            layout.lanes.forEach((lane) => {
                candidates.push({
                    x: lane + (Math.random() - 0.5) * 18,
                    y: row + (Math.random() - 0.5) * 26
                });
            });
        });

        let bestCandidate = candidates[0] || { x: 120, y: 420 };
        let bestScore = -Infinity;

        for (const candidate of candidates) {
            const score = this.scoreMessageWallPosition(candidate.x, candidate.y, cardWidth, cardHeight);
            if (score > bestScore) {
                bestScore = score;
                bestCandidate = candidate;
            }
        }

        return bestCandidate;
    }

    getBestMessageWallSpawnX(spawnY, cardWidth, cardHeight, excludeCard = null) {
        const layout = this.getMessageWallLayout(cardWidth, cardHeight);
        const candidates = layout.lanes.map((lane) => lane + (Math.random() - 0.5) * 14);
        let bestX = candidates[0] || 120;
        let bestScore = -Infinity;

        for (const candidateX of candidates) {
            const score = this.scoreMessageWallPosition(candidateX, spawnY, cardWidth, cardHeight, excludeCard);
            if (score > bestScore) {
                bestScore = score;
                bestX = candidateX;
            }
        }

        const minX = 72;
        const maxX = Math.max(minX, layout.cw - cardWidth - 72);
        return Math.max(minX, Math.min(maxX, bestX));
    }


    addWish(wish, animate = true) {
        // Duplicate guard: ayni ID zaten varsa ekleme
        if (this.wishes.some(w => w.id === wish.id)) {
            if (this.isMessageWallMode()) {
                this.queueMessageWallWish(wish);
            }
            console.warn('⚠️ Duplicate wish skipped:', wish.id);
            return;
        }

        this.emptyState.style.display = 'none';
        if (this.isMessageWallMode()) {
            this.addMessageWallWish(wish, animate);
            return;
        }

        const renderedText = wish.wishText
            ? (wish.wishText.length > 180 ? wish.wishText.substring(0, 180) + '…' : wish.wishText).replace(/\n/g, '<br>')
            : '';

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
        const isMessageWall = this.isMessageWallMode();
        let messageWallCardWidth = 0;
        let messageWallCardHeight = 0;
        let messageWallLayer = 'foreground';

        if (isMessageWall) {
            const accent = Math.random() > 0.72 ? '#ff86a6' : '#ffffff';
            const cardWidth = accent === '#ff86a6' ? 308 : 256;
            const cardHeight = accent === '#ff86a6' ? 308 : 244;
            messageWallCardWidth = cardWidth;
            messageWallCardHeight = cardHeight;
            messageWallLayer = 'foreground';
            card.className = `wish-card messagewall-mode ${animate ? 'card-entering' : ''} is-foreground-layer`.trim();
            card.style.setProperty('--message-card-width', `${cardWidth}px`);
            card.style.setProperty('--message-card-height', `${cardHeight}px`);
            card.style.setProperty('--message-border', accent);
            card.innerHTML = `
                <div class="message-card-shell">
                    ${renderedText ? `<div class="wish-text">${renderedText}</div>` : '<div class="wish-text">Dilek metni bekleniyor.</div>'}
                    <div class="child-name">${wish.childName}</div>
                </div>
            `;
        } else if (this.displayMode === 'lantern') {
            card.className = 'wish-card lantern-mode' + (animate ? ' entering' : '');
            card.innerHTML = `
                <div class="lantern-body">
                    <div class="lantern-flame"></div>
                </div>
                <div class="lantern-string"></div>
                <div class="lantern-text">
                    ${wish.wishText ? `<div class="wish-text">${(wish.wishText.length > 140 ? wish.wishText.substring(0, 140) + '…' : wish.wishText).replace(/\n/g, '<br>')}</div>` : ''}
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
                    ${wish.wishText ? `<div class="wish-text">${(wish.wishText.length > 140 ? wish.wishText.substring(0, 140) + '…' : wish.wishText).replace(/\n/g, '<br>')}</div>` : ''}
                    <div class="child-name">${wish.childName}</div>
                </div>
                <div class="balloon-string"></div>
            `;
        }


        // Görsel kalabalığı azaltmak için ekran maksimum limit koruması

        // Görsel kalabalığı azaltmak için ekran maksimum limit koruması
        const maxVisible = this.getVisibleWishLimit();
        if (this.wishCards.length >= maxVisible) {
            // En eski giren balonu ekran dizisinden çıkart (fade-out ile)
            const removableCard = isMessageWall
                ? this.wishCards.reduce((topCard, current) => (current.y < topCard.y ? current : topCard), this.wishCards[0])
                : this.wishCards[0];
            const removeIndex = this.wishCards.indexOf(removableCard);
            if (removeIndex > -1) {
                this.wishCards.splice(removeIndex, 1);
            }
            if (removableCard && removableCard.element) {
                const wishIdToRemove = removableCard.element.dataset.wishId;
                this.wishes = this.wishes.filter(w => w.id !== wishIdToRemove);
                removableCard.element.style.transition = 'opacity 0.5s ease';
                removableCard.element.style.opacity = '0';
                setTimeout(() => {
                    if (removableCard.element.parentNode) removableCard.element.remove();
                }, 500);
            }
        }

        // Remove constraints so they can spawn edge-to-edge
        const cw = this.container.offsetWidth;
        const ch = this.container.offsetHeight;
        const padding = 0;
        const cardWidth = isMessageWall ? (messageWallCardWidth || 280) : (this.displayMode === 'lantern' ? 320 : 320);
        const maxX = cw - cardWidth;

        // Y ekseni: fener modunda ekranın tam altından doğar, rastgele dağılım ile
        const maxSpawnDepth = Math.min(this.wishCards.length * (isMessageWall ? 45 : (this.displayMode === 'lantern' ? 250 : 150)), isMessageWall ? 360 : ch);
        const spawnOffset = Math.random() * maxSpawnDepth;
        let y;
        if (isMessageWall) {
            y = animate
                ? ch + 120 + spawnOffset + Math.random() * 80
                : 0;
        } else if (animate && this.displayMode === 'lantern') {
            y = ch - 200 - Math.random() * 200;
        } else {
            y = this.displayMode === 'lantern'
                ? -200 + Math.random() * (ch + 400)   // Distribute across full visible screen + margins
                : ch + 200 + spawnOffset + Math.random() * 1000;
        }

        // X ekseninde konum — 2D aday skorlama ile en iyi pozisyon
        const tempSwayAmp = isMessageWall ? (7 + Math.random() * 7) : (30 + Math.random() * 30);  // 30-60px (daraltıldı — overlap önleme)
        let x;
        if (isMessageWall) {
            if (animate) {
                x = this.getBestMessageWallSpawnX(y, cardWidth, messageWallCardHeight || 230);
            } else {
                const initialPlacement = this.getBestMessageWallInitialPlacement(cardWidth, messageWallCardHeight || 230);
                x = initialPlacement.x;
                y = initialPlacement.y;
            }
        } else if (this.displayMode === 'lantern') {
            x = this.findBestSpawnX(y, tempSwayAmp, cardWidth);
        } else {
            x = padding + Math.random() * Math.max(0, maxX - padding);
        }

        const zDepth = 1.0;

        const rotation = (Math.random() - 0.5) * (isMessageWall ? 2.5 : (this.displayMode === 'lantern' ? 3 : 8));

        // CSS left/top yerine performansı artırmak için GPU hızlandırmalı transform3d kullanıyoruz.
        card.style.left = '0px';
        card.style.top = '0px';
        card.style.opacity = isMessageWall ? (animate ? '0' : (messageWallLayer === 'background' ? '0.24' : '0.96')) : ((animate && this.displayMode === 'lantern') ? '1' : (this.displayMode === 'lantern' ? '0' : '1'));
        card.style.transform = `translate3d(${x}px, ${y}px, 0) rotate(${rotation}deg)`;

        card.addEventListener('click', () => {
            const currentWishId = card.dataset.wishId;
            const currentWish = this.allServerWishes.find(w => w.id === currentWishId) || wish;
            this.showSpotlight(currentWish);
        });

        this.container.appendChild(card);
        this.wishes.push(wish);

        // zDepth yukarıda (spawn overlap kontrolünden önce) hesaplandı
        const isNewWishEntry = animate && this.displayMode === 'lantern';
        const cardData = {
            element: card,
            x: x,
            y: y,
            vx: isMessageWall ? (Math.random() - 0.5) * 0.05 : (Math.random() - 0.5) * (this.displayMode === 'lantern' ? 0.5 : 1.5),
            vy: -(isMessageWall ? (0.72 + Math.random() * 0.22) : (this.displayMode === 'lantern' ? (0.5 + Math.random() * 0.2) : (1.5 + Math.random() * 2))),
            rotation: rotation,
            rotationSpeed: (Math.random() - 0.5) * (isMessageWall ? 0.04 : (this.displayMode === 'lantern' ? 0.1 : 0.8)),
            radius: isMessageWall ? 160 : (this.displayMode === 'lantern' ? 250 : 180),
            zDepth: zDepth,
            // Salınım: çoklu sinüs ile doğal rüzgar akışı
            swayPhase: Math.random() * Math.PI * 2,
            swayFreq: isMessageWall ? (0.0018 + Math.random() * 0.0013) : (0.004 + Math.random() * 0.004),
            swayAmp: tempSwayAmp,
            sway2Phase: Math.random() * Math.PI * 2,
            sway2Freq: isMessageWall ? (0.003 + Math.random() * 0.0018) : (0.009 + Math.random() * 0.007),
            sway2Amp: isMessageWall ? (2 + Math.random() * 4) : (10 + Math.random() * 15),   // 10-25px (daraltıldı)
            swayYPhase: Math.random() * Math.PI * 2,
            swayYFreq: isMessageWall ? (0.0012 + Math.random() * 0.0012) : (0.003 + Math.random() * 0.003),
            swayYAmp: isMessageWall ? (1 + Math.random() * 2) : (5 + Math.random() * 8),
            swayBaseX: x,
            rising: isMessageWall ? animate : !isNewWishEntry,                  // Yeni dilek zaten görünür
            opacity: isMessageWall ? (animate ? 0 : (messageWallLayer === 'background' ? 0.24 : 0.96)) : (isNewWishEntry ? (0.5 + zDepth * 0.5) : 0),
            isNewWish: isMessageWall ? false : isNewWishEntry,                 // Yeni dilek giriş efekti
            cardWidth: cardWidth,
            cardHeight: isMessageWall ? (messageWallCardHeight || 260) : (this.displayMode === 'lantern' ? 400 : 300),
            isMessageWall: isMessageWall,
            targetOpacity: isMessageWall ? (messageWallLayer === 'background' ? 0.24 : 0.96) : 1,
            renderScale: isMessageWall ? (messageWallLayer === 'background' ? 0.9 : 1) : 1,
            laneLayer: messageWallLayer
        };
        this.wishCards.push(cardData);

        if (animate) {
            setTimeout(() => {
                card.classList.remove('entering');
                card.classList.remove('card-entering');
            }, isMessageWall ? 2200 : 1000);

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
        let cw = this.container.offsetWidth || DESIGN_WIDTH;
        let ch = this.container.offsetHeight || DESIGN_HEIGHT;

        window.addEventListener('resize', () => {
            cw = this.container.offsetWidth || DESIGN_WIDTH;
            ch = this.container.offsetHeight || DESIGN_HEIGHT;
        });

        const animate = () => {
            const cards = this.wishCards;
            const now = performance.now();

            const currentScale = this.displaySettings.scaleMultiplier || 1.0;
            const currentSpeedMulti = this.displaySettings.speedMultiplier || 1.0;
            const paddingSides = 80; // Min kenar boşluğu — fenerler kenara yapışmasın
            const isMessageWall = this.isMessageWallMode();
            const cardWidth = isMessageWall ? 280 : (this.displayMode === 'lantern' ? 320 : 320);
            const maxX = cw - cardWidth; // Account for card width so right edge doesn't clip

            cards.forEach(cardData => {
                // Spotlight modunda aktif kartı dondur — animasyonu atla
                if (cardData.element.classList.contains('spotlight-active')) return;
                if (isMessageWall) {
                    this.updateMessageWallCard(cardData, now, currentSpeedMulti);
                    cardData.element.style.opacity = cardData.opacity.toString();
                    cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${currentScale * (cardData.renderScale || 1)}) rotate(${cardData.rotation || 0}deg)`;
                    return;
                }
                // Admin panelinden gelen hızı doğrudan harekete çarparak uygula
                if (!isMessageWall) {
                    cardData.y += cardData.vy * currentSpeedMulti;
                }

                if (isMessageWall) {
                    cardData.y += cardData.vy * currentSpeedMulti;
                    cardData.swayPhase += cardData.swayFreq * currentSpeedMulti;
                    cardData.sway2Phase += cardData.sway2Freq * currentSpeedMulti;
                    cardData.swayYPhase += cardData.swayYFreq * currentSpeedMulti;
                    cardData.swayBaseX += cardData.vx * currentSpeedMulti;
                    const messageWallLayout = this.getMessageWallLayout(cardData.cardWidth || cardWidth, cardData.cardHeight || 230);
                    const activeCardHeight = cardData.cardHeight || 260;
                    const localCardWidth = cardData.cardWidth || cardWidth;
                    const minMessageX = 72 + cardData.swayAmp;
                    const maxMessageX = Math.max(minMessageX, cw - localCardWidth - 72 - cardData.swayAmp);
                    cardData.swayBaseX = Math.max(minMessageX, Math.min(maxMessageX, cardData.swayBaseX));

                    const swayX = Math.sin(cardData.swayPhase) * cardData.swayAmp
                        + Math.sin(cardData.sway2Phase) * cardData.sway2Amp;
                    cardData.x = cardData.swayBaseX + swayX;
                    cardData.x = Math.max(40, Math.min(cw - localCardWidth - 40, cardData.x));

                    cardData.rotation += cardData.rotationSpeed;
                    if (Math.abs(cardData.rotation) > 4) {
                        cardData.rotationSpeed *= -1;
                    }

                    if (cardData.rising) {
                        const fadeZone = 320;
                        const progress = Math.max(0, Math.min(1, (ch + activeCardHeight * 0.18 - cardData.y) / fadeZone));
                        cardData.opacity = progress * (cardData.targetOpacity || 1);
                        cardData.element.style.opacity = cardData.opacity.toString();
                        if (progress >= 1) cardData.rising = false;
                    } else {
                        const fadeStart = messageWallLayout.fadeStart;
                        const exitY = messageWallLayout.exitY;
                        const fadeOut = Math.max(0, Math.min(1, (cardData.y - exitY) / Math.max(1, fadeStart - exitY)));
                        cardData.opacity = fadeOut * (cardData.targetOpacity || 1);
                        cardData.element.style.opacity = cardData.opacity.toString();
                    }

                    if (!cardData.rising && cardData.y < messageWallLayout.exitY) {
                        const currentMaxVisible = this.getVisibleWishLimit();
                        if (this.wishCards.length > currentMaxVisible) {
                            cardData.element.remove();
                            const idx = this.wishCards.indexOf(cardData);
                            if (idx > -1) this.wishCards.splice(idx, 1);
                            this.wishes = this.wishes.filter(w => w.id !== cardData.element.dataset.wishId);
                            return;
                        }

                        if (this.allServerWishes && this.allServerWishes.length > 0) {
                            const occupiedIds = new Set(cards
                                .filter(other => other !== cardData)
                                .map(other => String(other.element.dataset.wishId)));
                            const replacementPool = this.allServerWishes.filter(candidate => !occupiedIds.has(String(candidate.id)));
                            const sourcePool = replacementPool.length > 0 ? replacementPool : this.allServerWishes;
                            const randomWish = sourcePool[Math.floor(Math.random() * sourcePool.length)];
                            const accent = Math.random() > 0.72 ? '#ff86a6' : '#ffffff';
                            const nextCardWidth = accent === '#ff86a6' ? 308 : 256;
                            const nextCardHeight = accent === '#ff86a6' ? 308 : 244;
                            const nextLayer = 'foreground';
                            cardData.element.dataset.wishId = randomWish.id;
                            cardData.cardWidth = nextCardWidth;
                            cardData.cardHeight = nextCardHeight;
                            cardData.targetOpacity = nextLayer === 'background' ? 0.24 : 0.96;
                            cardData.renderScale = nextLayer === 'background' ? 0.9 : 1;
                            cardData.laneLayer = nextLayer;
                            cardData.element.classList.toggle('is-background-layer', nextLayer === 'background');
                            cardData.element.classList.toggle('is-foreground-layer', nextLayer !== 'background');
                            cardData.element.style.setProperty('--message-card-width', `${nextCardWidth}px`);
                            cardData.element.style.setProperty('--message-card-height', `${nextCardHeight}px`);
                            cardData.element.style.setProperty('--message-border', accent);
                            const textEl = cardData.element.querySelector('.wish-text');
                            const nameEl = cardData.element.querySelector('.child-name');
                            if (textEl) {
                                textEl.innerHTML = randomWish.wishText
                                    ? (randomWish.wishText.length > 180 ? randomWish.wishText.substring(0, 180) + '…' : randomWish.wishText).replace(/\n/g, '<br>')
                                    : 'Dilek metni bekleniyor.';
                            }
                            if (nameEl && randomWish.childName) nameEl.textContent = randomWish.childName;
                        }

                        cardData.isNewWish = false;
                        cardData.element.classList.remove('new-wish-highlight');
                        cardData.y = ch + 120 + Math.random() * 140;
                        cardData.swayBaseX = this.getBestMessageWallSpawnX(cardData.y, cardData.cardWidth || cardWidth, cardData.cardHeight || activeCardHeight, cardData);
                        cardData.x = cardData.swayBaseX;
                        cardData.vx = (Math.random() - 0.5) * 0.05;
                        cardData.vy = -(0.72 + Math.random() * 0.22);
                        cardData.rotation = (Math.random() - 0.5) * 2.5;
                        cardData.rotationSpeed = (Math.random() - 0.5) * 0.04;
                        cardData.swayPhase = Math.random() * Math.PI * 2;
                        cardData.sway2Phase = Math.random() * Math.PI * 2;
                        cardData.swayYPhase = Math.random() * Math.PI * 2;
                        cardData.rising = true;
                        cardData.opacity = 0;
                        cardData.element.style.opacity = '0';
                    }
                } else if (this.displayMode === 'lantern') {
                    // === FENER SALINIMU (SINÜS) — sadece lantern modunda ===
                    cardData.swayPhase += cardData.swayFreq * currentSpeedMulti;
                    cardData.sway2Phase += cardData.sway2Freq * currentSpeedMulti;
                    cardData.swayYPhase += cardData.swayYFreq * currentSpeedMulti;
                    const swayX = Math.sin(cardData.swayPhase) * cardData.swayAmp
                        + Math.sin(cardData.sway2Phase) * cardData.sway2Amp;
                    // === SOFT ANTI-OVERLAP DRIFT ===
                    // Very gentle horizontal push when cards get too close
                    const scaledCardW = cardWidth * currentScale;
                    const scaledCardH = (this.displayMode === 'lantern' ? 400 : 300) * currentScale;
                    for (const other of cards) {
                        if (other === cardData) continue;
                        const dx = cardData.x - other.x;
                        const dy = cardData.y - other.y;
                        if (Math.abs(dx) < scaledCardW * 0.8 && Math.abs(dy) < scaledCardH * 0.7) {
                            // Cards are overlapping — very gentle push
                            const pushDir = dx >= 0 ? 1 : -1;
                            const overlap = scaledCardW * 0.8 - Math.abs(dx);
                            const pushForce = overlap * 0.005; // Very gentle
                            cardData.swayBaseX += pushDir * pushForce;
                        }
                    }
                    // Clamp swayBaseX drift to prevent edge accumulation
                    const driftFromOriginal = cardData.swayBaseX - cardData.x;
                    // (swayBaseX IS the original spawn X, x is computed from it — no clamping needed on swayBaseX itself, 
                    //  but we clamp it to stay within screen bounds)
                    const swayMaxX = cw - cardWidth;
                    const swayMinX = 80;
                    cardData.swayBaseX = Math.max(swayMinX, Math.min(swayMaxX, cardData.swayBaseX));

                    cardData.x = cardData.swayBaseX + swayX;

                    // Soft boundary clamp — pencere küçültüldüğünde fener ekran dışına çıkmasın
                    cardData.x = Math.max(80, Math.min(cw - 320 - 80, cardData.x));

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
                        const maxOpacity = 1.0;
                        cardData.opacity = progress * maxOpacity;
                        cardData.element.style.opacity = cardData.opacity;
                        if (progress >= 1) cardData.rising = false;
                    }

                    // === FADE-OUT + RESPAWN: header bölgesine yaklaşırken kaybol ===
                    // Header y≈40-200 arasında — fenerler y<300'den itibaren solmaya başlar
                    if (!cardData.rising && cardData.y < 300) {
                        // y=300 → opacity=1, y=-200 → opacity=0 (500px fade zone)
                        const fadeOut = Math.max(0, Math.min(1, (cardData.y + 200) / 500));
                        cardData.element.style.opacity = fadeOut;

                        if (cardData.y < -200) {
                            const currentMaxVisible = this.displayMode === 'lantern' ? this.getAdaptiveMaxVisible() : ((this.displaySettings && this.displaySettings.maxVisible) || 12);
                            if (this.wishCards.length > currentMaxVisible) {
                                cardData.element.remove();
                                const idx = this.wishCards.indexOf(cardData);
                                if (idx > -1) this.wishCards.splice(idx, 1);
                                this.wishes = this.wishes.filter(w => w.id !== cardData.element.dataset.wishId);
                                return;
                            }
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
                            cardData.zDepth = 1.0;
                            cardData.vy = -(0.5 + Math.random() * 0.2);
                            // Ekranın altından yeni spawn — 2D aday skorlama ile en iyi pozisyon
                            cardData.y = ch + 100 + Math.random() * 400;
                            cardData.swayBaseX = this.findBestSpawnX(cardData.y, cardData.swayAmp, cardData.cardWidth || cardWidth);
                            cardData.x = cardData.swayBaseX;
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
                const rot = isMessageWall
                    ? cardData.rotation
                    : this.displayMode === 'lantern'
                        ? (Math.sin(cardData.swayPhase) + Math.sin(cardData.sway2Phase) * 0.5) * 1.3  // Doğal salınım eğimi
                        : cardData.rotation;
                const depthScale = isMessageWall ? currentScale * (cardData.renderScale || 1) : currentScale;
                cardData.element.style.transform = `translate3d(${cardData.x}px, ${cardData.y}px, 0) scale(${depthScale}) rotate(${rot}deg)`;
            });

            // Removed zAwareSoftDrift

            requestAnimationFrame(animate);
        };

        animate();
    }

    clampPosition(cardData) {
        // Balonların yukarıdan (ekstra negatif Y değerlerinden) doğmasını sağlamak 
        // ve serbestçe aşağı akabilmesini bozmamak için bu kısıtlamalar kaldırılmıştır.
        // Yeni Kar/Yağmur akışında X ve Y ekseni tamamen serbest bırakılmalıdır.
    }


    findBestSpawnX(spawnY, swayAmp, cardWidth = 320) {
        const cw = this.container.offsetWidth;
        // minX/maxX account for sway amplitude so cards don't swing off-screen
        const minX = 68 + swayAmp;  // paddingSides + swayAmp — kenara yapışmasın
        const maxX = Math.max(minX, cw - cardWidth - 68 - swayAmp);

        // Collect positions of on-screen cards
        const ch = this.container.offsetHeight;
        const onScreen = this.wishCards.filter(c => c.y > -600 && c.y < ch + 500);

        if (onScreen.length === 0) {
            // No cards — random position
            return minX + Math.random() * Math.max(0, maxX - minX);
        }

        // Generate 12 evenly-spaced candidate X positions
        const numCandidates = 12;
        const candidates = [];
        for (let i = 0; i < numCandidates; i++) {
            candidates.push(minX + (i / (numCandidates - 1)) * Math.max(0, maxX - minX));
        }

        // Score each candidate: find minimum 2D distance to any existing card
        let bestX = candidates[0];
        let bestMinDist = -1;

        for (const cx of candidates) {
            let minDist = Infinity;
            for (const card of onScreen) {
                const dx = cx - (card.swayBaseX || card.x);
                const dy = spawnY - card.y;
                // Weight X more heavily (1.5x) since horizontal overlap is more visible
                const dist = Math.sqrt((dx * 1.5) * (dx * 1.5) + dy * dy);
                if (dist < minDist) minDist = dist;
            }
            if (minDist > bestMinDist) {
                bestMinDist = minDist;
                bestX = cx;
            }
        }

        // Add small random jitter (±5% of available width) for organic feel
        const jitter = (Math.random() - 0.5) * (maxX - minX) * 0.1;
        bestX = Math.max(minX, Math.min(maxX, bestX + jitter));

        return bestX;
    }


    updateCounter() {
        if (!this.counterNumber) return;
        const count = this.totalWishesCount !== undefined ? this.totalWishesCount : this.wishes.length;
        this.counterNumber.textContent = count;
    }

    // === SPOTLIGHT ===
    showSpotlight(wish) {
        if (this.isMessageWallMode()) return;
        const prev = this.container.querySelector('.spotlight-active');
        if (prev) prev.classList.remove('spotlight-active');

        const card = this.container.querySelector(`[data-wish-id="${wish.id}"]`);
        if (card) {
            if (this.isMessageWallMode()) {
                const cardData = this.wishCards.find(c => c.element === card);
                if (cardData) {
                    card.style.setProperty('--spotlight-x', `${cardData.x}px`);
                    card.style.setProperty('--spotlight-y', `${cardData.y}px`);
                    card.style.setProperty('--spotlight-rot', `${cardData.rotation || 0}deg`);
                }
            }
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
        if (this.isMessageWallMode()) {
            this.pendingMessageWallWishes = this.pendingMessageWallWishes.filter(item => String(item.id) !== String(id));
            const cardData = this.wishCards.find(c => String(c.element.dataset.wishId) === String(id));
            if (cardData) {
                cardData.phase = 'closing';
                cardData.phaseStartedAt = performance.now() - (cardData.exitDuration || 400) * 0.35;
            }
            this.wishes = this.wishes.filter(w => String(w.id) !== String(id));
            if (!cardData && this.wishes.length === 0) {
                this.emptyState.style.display = '';
            }
            return;
        }

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
        this.pendingMessageWallWishes = [];
        const cards = this.container.querySelectorAll('.wish-card');
        cards.forEach((card, i) => {
            card.style.transition = 'all 0.5s ease';
            card.style.transitionDelay = (i * 0.05) + 's';
            card.style.opacity = '0';
            card.style.transform = 'scale(0)';
        });

        setTimeout(() => {
            cards.forEach(c => {
                c.remove();
            });
        }, 800);

        this.wishes = [];
        this.wishCards = [];
        this.emptyState.style.display = '';
        this.updateCounter();
    }

    showNewWishToast(name) {
        const toast = document.getElementById('new-wish-toast');
        if (!toast) return;
        toast.textContent = '\u{1F389} ' + name + ' bir dilek paylasti!';
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
        const stageTitle = document.querySelector('.message-stage__headline-text');
        if (stageTitle && this.isMessageWallMode()) {
            stageTitle.textContent = 'PEKI SENIN MARKAN ICIN DILEGIN NE?';
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
