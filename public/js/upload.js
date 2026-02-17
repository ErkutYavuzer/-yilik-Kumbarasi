/**
 * İyilik Kumbarası - Upload Module
 * Telefon arayüzü için fotoğraf çekme ve gönderme işlemleri
 */

class WishUploader {
    constructor() {
        this.video = document.getElementById('video-preview');
        this.photoPreview = document.getElementById('photo-preview');
        this.canvas = document.getElementById('photo-canvas');
        this.placeholder = document.getElementById('camera-placeholder');
        this.captureControls = document.getElementById('capture-controls');
        this.confirmControls = document.getElementById('confirm-controls');
        this.btnCapture = document.getElementById('btn-capture');
        this.btnRetake = document.getElementById('btn-retake');
        this.btnSubmit = document.getElementById('btn-submit');
        this.childNameInput = document.getElementById('child-name');
        this.successOverlay = document.getElementById('success-overlay');

        this.stream = null;
        this.photoBlob = null;

        this.init();
    }

    async init() {
        await this.startCamera();
        this.bindEvents();
    }

    async startCamera() {
        try {
            // Arka kamerayı tercih et (mobilde)
            this.stream = await navigator.mediaDevices.getUserMedia({
                video: {
                    facingMode: 'environment',
                    width: { ideal: 1280 },
                    height: { ideal: 720 }
                },
                audio: false
            });

            this.video.srcObject = this.stream;
            this.placeholder.style.display = 'none';
            this.video.style.display = 'block';

        } catch (error) {
            console.error('Kamera hatası:', error);
            this.placeholder.innerHTML = `
                <div style="font-size: 48px;">⚠️</div>
                <p>Kamera erişimi gerekli</p>
                <p style="font-size: 12px; margin-top: 10px;">Lütfen kamera iznini verin</p>
            `;
        }
    }

    bindEvents() {
        this.btnCapture.addEventListener('click', () => this.capturePhoto());
        this.btnRetake.addEventListener('click', () => this.retakePhoto());
        this.btnSubmit.addEventListener('click', () => this.submitWish());
        this.childNameInput.addEventListener('input', () => this.validateForm());
    }

    capturePhoto() {
        // Canvas'a çiz
        this.canvas.width = this.video.videoWidth;
        this.canvas.height = this.video.videoHeight;
        const ctx = this.canvas.getContext('2d');
        ctx.drawImage(this.video, 0, 0);

        // Blob olarak kaydet
        this.canvas.toBlob((blob) => {
            this.photoBlob = blob;

            // Preview göster
            this.photoPreview.src = URL.createObjectURL(blob);
            this.photoPreview.style.display = 'block';
            this.video.style.display = 'none';

            // Butonları değiştir
            this.captureControls.style.display = 'none';
            this.confirmControls.style.display = 'block';

            this.validateForm();
        }, 'image/jpeg', 0.85);
    }

    retakePhoto() {
        this.photoBlob = null;
        this.photoPreview.style.display = 'none';
        this.video.style.display = 'block';
        this.captureControls.style.display = 'block';
        this.confirmControls.style.display = 'none';
        this.validateForm();
    }

    validateForm() {
        const hasPhoto = this.photoBlob !== null;
        const hasName = this.childNameInput.value.trim().length >= 2;
        this.btnSubmit.disabled = !(hasPhoto && hasName);
    }

    async submitWish() {
        if (!this.photoBlob || !this.childNameInput.value.trim()) {
            return;
        }

        this.btnSubmit.disabled = true;
        this.btnSubmit.innerHTML = '⏳ Gönderiliyor...';

        try {
            const formData = new FormData();
            formData.append('photo', this.photoBlob, 'dilek.jpg');
            formData.append('childName', this.childNameInput.value.trim());

            const response = await fetch('/api/upload', {
                method: 'POST',
                body: formData
            });

            const result = await response.json();

            if (result.success) {
                this.showSuccess();
            } else {
                throw new Error(result.error || 'Bilinmeyen hata');
            }

        } catch (error) {
            console.error('Gönderme hatası:', error);
            alert('Gönderme başarısız: ' + error.message);
            this.btnSubmit.disabled = false;
            this.btnSubmit.innerHTML = '✨ Kumbaraya At';
        }
    }

    showSuccess() {
        this.successOverlay.classList.add('show');

        setTimeout(() => {
            this.successOverlay.classList.remove('show');
            this.resetForm();
        }, 2000);
    }

    resetForm() {
        this.photoBlob = null;
        this.childNameInput.value = '';
        this.photoPreview.style.display = 'none';
        this.video.style.display = 'block';
        this.captureControls.style.display = 'block';
        this.confirmControls.style.display = 'none';
        this.btnSubmit.disabled = true;
        this.btnSubmit.innerHTML = '✨ Kumbaraya At';
    }
}

// Başlat
document.addEventListener('DOMContentLoaded', () => {
    new WishUploader();
});

