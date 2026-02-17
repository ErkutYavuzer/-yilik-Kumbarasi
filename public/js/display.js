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
        this.socket = null;
        this.isMuted = false;
        this.audioCtx = null;

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
    fireConfetti() {
        const colors = ['#FF6B6B', '#4ECDC4', '#FFE66D', '#FF8E8E', '#A8E6CF', '#DDA0DD', '#FFB347', '#88D8F7'];
        for (let i = 0; i < 50; i++) {
            const c = document.createElement('div');
            c.className = 'display-confetti';
            c.style.left = Math.random() * 100 + '%';
            c.style.top = '-10px';
            c.style.background = colors[Math.floor(Math.random() * colors.length)];
            c.style.animationDelay = (Math.random() * 1) + 's';
            const w = 6 + Math.random() * 12;
            c.style.width = w + 'px';
            c.style.height = w + 'px';
            if (Math.random() > 0.5) c.style.borderRadius = '50%';
            document.body.appendChild(c);
            setTimeout(() => c.remove(), 4000);
        }
    }

    // === SOCKET ===
    connectSocket() {
        this.socket = io();

        this.socket.on('all-wishes', (wishes) => {
            console.log('📥 Mevcut dilekler:', wishes.length);
            wishes.forEach(wish => this.addWish(wish, false));
            this.updateCounter();
        });

        this.socket.on('new-wish', (wish) => {
            console.log('🎈 Yeni dilek:', wish.childName);
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
            this.removeWish(data.id);
            this.updateCounter();
        });

        this.socket.on('all-cleared', () => {
            console.log('🗑️ Tüm dilekler silindi');
            this.clearAll();
        });

        this.socket.on('theme-change', (theme) => {
            console.log('🎨 Tema değişti:', theme);
            this.applyTheme(theme);
        });
    }

    // === EVENTS ===
    bindEvents() {
        // Spotlight overlay'e tıklayınca kapat
        this.spotlightOverlay.addEventListener('click', () => {
            this.hideSpotlight();
        });

        // Pencere boyutu değişince pozisyonları güncelle
        window.addEventListener('resize', () => {
            this.wishCards.forEach(cardData => {
                this.clampPosition(cardData);
            });
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
        this.emptyState.style.display = 'none';

        const balloonColors = [
            '#FF6B6B', '#4ECDC4', '#FFE66D', '#A8E6CF',
            '#FF8E8E', '#88D8F7', '#DDA0DD', '#FFB347',
            '#FF85A2', '#7EC8E3', '#C3AED6', '#95E1D3'
        ];
        const color = balloonColors[Math.floor(Math.random() * balloonColors.length)];

        const card = document.createElement('div');
        card.className = 'wish-card' + (animate ? ' entering' : '');
        card.dataset.wishId = wish.id;
        card.style.setProperty('--balloon-color', color);
        card.innerHTML = `
            <div class="balloon-body">
                <img src="${wish.photoUrl}" alt="${wish.childName}">
                <div class="child-name">${wish.childName}</div>
            </div>
            <div class="balloon-string"></div>
        `;

        const rect = this.container.getBoundingClientRect();
        const padding = 20;
        const maxX = rect.width - 250;
        const maxY = rect.height - 350;
        const x = padding + Math.random() * Math.max(0, maxX - padding);
        const y = padding + Math.random() * Math.max(0, maxY - padding);

        card.style.left = x + 'px';
        card.style.top = y + 'px';

        const rotation = (Math.random() - 0.5) * 8;
        card.style.transform = `rotate(${rotation}deg)`;

        card.addEventListener('click', () => {
            this.showSpotlight(wish);
        });

        this.container.appendChild(card);
        this.wishes.push(wish);

        const cardData = {
            element: card,
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 1.2,
            vy: (Math.random() - 0.5) * 1.2,
            rotation: rotation,
            rotationSpeed: (Math.random() - 0.5) * 0.3
        };
        this.wishCards.push(cardData);

        if (animate) {
            setTimeout(() => {
                card.classList.remove('entering');
            }, 1000);
        }
    }

    // === ANIMATION ===
    startFloatingAnimation() {
        const animate = () => {
            this.wishCards.forEach(cardData => {
                cardData.x += cardData.vx;
                cardData.y += cardData.vy;
                cardData.rotation += cardData.rotationSpeed;

                const rect = this.container.getBoundingClientRect();
                const padding = 20;
                const maxX = rect.width - 220;
                const maxY = rect.height - 280;

                if (cardData.x < padding) { cardData.x = padding; cardData.vx *= -1; }
                if (cardData.x > maxX) { cardData.x = maxX; cardData.vx *= -1; }
                if (cardData.y < padding) { cardData.y = padding; cardData.vy *= -1; }
                if (cardData.y > maxY) { cardData.y = maxY; cardData.vy *= -1; }

                if (Math.abs(cardData.rotation) > 15) {
                    cardData.rotationSpeed *= -1;
                }

                cardData.element.style.left = cardData.x + 'px';
                cardData.element.style.top = cardData.y + 'px';
                cardData.element.style.transform = `rotate(${cardData.rotation}deg)`;
            });

            requestAnimationFrame(animate);
        };

        animate();
    }

    clampPosition(cardData) {
        const rect = this.container.getBoundingClientRect();
        const padding = 20;
        const maxX = rect.width - 220;
        const maxY = rect.height - 280;
        cardData.x = Math.max(padding, Math.min(maxX, cardData.x));
        cardData.y = Math.max(padding, Math.min(maxY, cardData.y));
    }

    updateCounter() {
        this.counterNumber.textContent = this.wishes.length;
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
