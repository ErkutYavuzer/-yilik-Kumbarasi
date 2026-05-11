const socket = io();
let wishes = [];
let modalAction = null;
let autoTimer = null;
let autoIndex = 0;
let currentDisplayMode = 'balloon';
const PARTICIPATION_URL = 'https://dilekfeneri.mezodigi.ai/upload';
const PARTICIPATION_QR_SRC = '/images/participation-qr.png?v=1';
const QR_PREVIEW_STAGE = { width: 1920, height: 1280 };
const QR_PANEL_EXTRA_HEIGHT = 96;
let qrPreviewState = null;
let qrPreviewDrag = null;
let displaySettingsCache = {
    speedMultiplier: 1,
    scaleMultiplier: 1,
    messageWallEntranceStyle: 'standard',
    maxVisible: 20,
    logoOffsetPx: 0,
    headerOffsetPx: 0,
    logoScale: 1,
    headerScale: 1,
    bakanlikScale: 1,
    akmScale: 1,
    bakanlikX: 0,
    bakanlikY: 0,
    akmX: 0,
    akmY: 0,
    logoTopX: 0,
    logoTopY: 0,
    headerX: 0,
    headerY: 0,
    dayMode: false,
    qrVisible: false,
    qrSize: 260,
    qrTop: 120,
    qrRight: 64
};

// ─── AUTHENTICATION ───
if (sessionStorage.getItem('adminAuth') === 'true') {
    document.getElementById('auth-overlay').style.display = 'none';
}
function checkAuth() {
    const pass = document.getElementById('auth-pass').value;
    if (pass === '0360') {
        sessionStorage.setItem('adminAuth', 'true');
        document.getElementById('auth-overlay').style.display = 'none';
        showToast('Giriş başarılı');
    } else {
        document.getElementById('auth-error').style.display = 'block';
        setTimeout(() => document.getElementById('auth-error').style.display = 'none', 3000);
    }
}

// ─── UI MODE (Dark / Light) ───
const savedMode = localStorage.getItem('adminUIMode') || 'dark';
setUIMode(savedMode);

function setUIMode(mode) {
    document.documentElement.setAttribute('data-theme', mode);
    localStorage.setItem('adminUIMode', mode);
    const pillDark = document.getElementById('pill-dark');
    const pillLight = document.getElementById('pill-light');
    if (pillDark) pillDark.classList.toggle('active', mode === 'dark');
    if (pillLight) pillLight.classList.toggle('active', mode === 'light');
}

// ─── SIDEBAR TOGGLE ───
const sidebar = document.getElementById('sidebar');
const sidebarToggle = document.getElementById('sidebar-toggle');
const isCollapsed = localStorage.getItem('sidebarCollapsed') === 'true';

if (isCollapsed) {
    sidebar.classList.add('collapsed');
}

if (sidebarToggle) {
    sidebarToggle.addEventListener('click', () => {
        const collapsed = sidebar.classList.toggle('collapsed');
        localStorage.setItem('sidebarCollapsed', collapsed);
    });
}

// ─── SYSTEM STATUS ───
function updateStatus(id, state, text) {
    const indicator = document.getElementById(`status-${id}`);
    const textEl = document.getElementById(`status-${id}-text`);
    if (indicator) {
        indicator.className = 'status-indicator ' + state;
    }
    if (textEl) {
        textEl.textContent = text;
        textEl.className = 'status-value ' + state;
    }
}

// Socket Connection Status
socket.on('connect', () => {
    updateStatus('socket', 'online', 'Bağlı');
});

socket.on('disconnect', () => {
    updateStatus('socket', 'offline', 'Bağlantı Kesildi');
});

// Periodic Server Check
async function checkServerStatus() {
    try {
        const start = Date.now();
        const res = await fetch('/api/wishes', { method: 'HEAD' });
        const latency = Date.now() - start;
        if (res.ok) {
            updateStatus('server', 'online', `Aktif (${latency}ms)`);
        } else {
            updateStatus('server', 'warning', 'Sorunlu');
        }
    } catch (e) {
        updateStatus('server', 'offline', 'Erişilemiyor');
    }
}

setInterval(checkServerStatus, 5000);
checkServerStatus();

// Auto Spotlight Status Check
async function checkAutoStatus() {
    try {
        const res = await fetch('/api/auto-spotlight/status');
        const data = await res.json();
        const text = data.active ? `Aktif (${data.delay}s)` : 'Kapalı';
        const state = data.active ? 'online' : 'offline';
        updateStatus('slideshow', state, text);

        // UI elemanlarını senkronize et
        const startBtn = document.getElementById('auto-start-btn');
        const stopBtn = document.getElementById('auto-stop-btn');
        const statusEl = document.getElementById('auto-status');
        const delayEl = document.getElementById('auto-delay');

        if (startBtn && stopBtn && statusEl) {
            startBtn.style.display = data.active ? 'none' : '';
            stopBtn.style.display = data.active ? '' : 'none';
            statusEl.classList.toggle('active', data.active);
            if (data.delay && delayEl) delayEl.value = data.delay;
        }
    } catch (e) { }
}
setInterval(checkAutoStatus, 3000);
checkAutoStatus();

// ─── VIEW MODE (Table / Grid) ───
let viewMode = localStorage.getItem('adminViewMode') || 'table';

function setViewMode(mode) {
    viewMode = mode;
    localStorage.setItem('adminViewMode', mode);

    const tableBtn = document.getElementById('view-table-btn');
    const gridBtn = document.getElementById('view-grid-btn');
    if (tableBtn) tableBtn.classList.toggle('active', mode === 'table');
    if (gridBtn) gridBtn.classList.toggle('active', mode === 'grid');

    renderWishes();
}

// ─── TAB NAVIGATION ───
function switchTab(name, btn) {
    document.querySelectorAll('.tab-panel').forEach(p => {
        p.classList.remove('active');
    });
    document.querySelectorAll('.nav-item').forEach(n => {
        n.classList.remove('active');
    });

    const panel = document.getElementById('tab-' + name);
    if (panel) panel.classList.add('active');

    if (btn) btn.classList.add('active');

    const titles = {
        dashboard: '📊 Dashboard',
        pending: '⏳ Bekleyen Mesajlar',
        qr: '📱 QR Kod',
        moderation: '🤖 Moderasyon',
        slideshow: '🔄 Slayt Gösterisi',
        theme: '🎨 Tema',
        upload: '📸 Mesaj Ekle',
        wishes: '💬 Tüm Mesajlar',
        raffle: '🎁 Katılımcı Seçimi',
        stats: '📈 İstatistikler',
        archive: '📦 Arşiv & Kurtarma'
    };
    document.getElementById('topbar-title').textContent = titles[name] || '';

    // Sekmeye özel yüklemeler
    if (name === 'stats') {
        loadStats();
    }

    if (name === 'moderation') {
        loadModerationLog();
    }

    if (name === 'wishes') {
        setViewMode(viewMode);
    }

    if (name === 'archive') {
        loadArchivedWishes();
    }
    if (name === 'pending') {
        loadPendingWishes();
    }

}

// ─── SOCKET ───
socket.on('new-wish', () => loadWishes());
socket.on('wish-deleted', () => loadWishes());
socket.on('all-cleared', () => loadWishes());
socket.on('moderation-state', (data) => setModerationUI(data));

socket.on('new-pending-wish', () => loadPendingWishes());
socket.on('wish-rejected', () => loadPendingWishes());
// ─── LOAD WISHES ───
let currentQuickFilter = 'all';

function getFilteredWishes() {
    let filtered = [...wishes].reverse();

    if (currentQuickFilter === 'today') {
        const todayStr = new Date().toDateString();
        filtered = filtered.filter(w => new Date(w.timestamp).toDateString() === todayStr);
    } else if (currentQuickFilter === 'photo') {
        filtered = filtered.filter(w => w.photoUrl);
    } else if (currentQuickFilter === 'text') {
        filtered = filtered.filter(w => !w.photoUrl);
    } else if (currentQuickFilter === 'spotlight') {
        filtered = filtered.filter(w => w.isSpotlight);
    }

    const searchInput = document.querySelector('#tab-wishes .search-box input');
    const q = searchInput ? searchInput.value.toLowerCase() : '';
    if (q) {
        filtered = filtered.filter(w => {
            const text = (w.childName + ' ' + (w.wishText || '') + ' ' + formatTime(w.timestamp)).toLowerCase();
            return text.includes(q);
        });
    }

    return filtered;
}

function applyQuickFilter(filter, btnElement) {
    currentQuickFilter = filter;
    document.querySelectorAll('.filter-chips .btn').forEach(b => {
        b.classList.remove('active');
    });
    if (btnElement) btnElement.classList.add('active');
    renderWishes();
}

async function loadWishes() {
    try {
        const res = await fetch('/api/wishes');
        wishes = await res.json();
        renderWishes();
        renderRecent();
        updateStats();
        updateBulkActions();
    } catch (e) {
        console.error(e);
    }
}

function renderWishes() {
    const tableContainer = document.getElementById('wishes-table-container');
    const gridContainer = document.getElementById('wishes-grid-container');
    const empty = document.getElementById('empty-state');

    const filteredWishes = getFilteredWishes();

    if (!filteredWishes.length) {
        if (tableContainer) tableContainer.style.display = 'none';
        if (gridContainer) gridContainer.style.display = 'none';
        if (empty) {
            empty.style.display = 'block';
            const p = empty.querySelector('p');
            if (p) p.textContent = wishes.length > 0 ? 'Filtrelere uygun mesaj bulunamadı.' : 'Henüz mesaj eklenmemiş.';
        }
        updateBulkActions();
        return;
    }

    if (empty) empty.style.display = 'none';

    if (viewMode === 'table') {
        if (tableContainer) tableContainer.style.display = 'block';
        if (gridContainer) gridContainer.style.display = 'none';
        renderWishesTable(filteredWishes);
    } else {
        if (tableContainer) tableContainer.style.display = 'none';
        if (gridContainer) gridContainer.style.display = 'block';
        renderWishesGrid(filteredWishes);
    }

    updateBulkActions();
}

function renderWishesTable(filteredItems = []) {
    const tbody = document.getElementById('wishes-tbody');
    if (tbody) {
        tbody.innerHTML = filteredItems.map(w => `
        <tr class="wish-row" id="w-${w.id}">
            <td><input type="checkbox" class="wish-check" value="${w.id}" onchange="updateBulkActions()"></td>
            <td>
                ${w.photoUrl ? `
                <a href="${w.photoUrl}" target="_blank" title="Fotoğrafı büyük gör">
                    <img src="${w.photoUrl}" alt="${w.childName}" loading="lazy">
                </a>
                ` : `
                <div style="width:64px; height:64px; background:var(--bg2); border: 2px dashed var(--card-border); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--text3); cursor:help" title="Sadece metin paylaşıldı"><i data-lucide="type"></i></div>
                `}
            </td>
            <td style="font-weight:600;">${w.childName}</td>
            <td><div class="ocr-text" title="${(w.wishText || 'Okunamadi veya metin yok').replace(/"/g, '&quot;')}">${w.wishText || '<span style="color:var(--text3);font-style:italic">Metin yok</span>'}</div></td>
            <td style="color:var(--text2);font-size:13px">${formatTime(w.timestamp)}</td>
            <td>
                <div class="wish-actions" style="display:flex; gap:6px;">
                    <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" style="padding:6px 10px; font-size:12px;" title="Sahneye Al"><i data-lucide="star" style="width:14px;height:14px;"></i> Sahneye Al</button>
                    <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" style="padding:6px 10px; font-size:12px;" title="Düzenle"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                    <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`)" style="padding:6px 10px; font-size:12px;" title="Sil"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
                </div>
            </td>
        </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

function renderWishesGrid(filteredItems = []) {
    const grid = document.getElementById('wishes-grid');
    if (grid) {
        grid.innerHTML = filteredItems.map(w => `
        <div class="grid-wish-card wish-row">
            <input type="checkbox" class="wish-check grid-wish-check" value="${w.id}" onchange="updateBulkActions()">
            <div class="grid-wish-img-container">
                ${w.photoUrl ? `
                    <img src="${w.photoUrl}" alt="${w.childName}" class="grid-wish-img" loading="lazy">
                ` : `
                    <div style="width:100%; height:100%; background:var(--bg2); display:flex; align-items:center; justify-content:center; color:var(--text3);"><i data-lucide="type" style="width:48px;height:48px;opacity:0.6;"></i></div>
                `}
            </div>
            <div class="grid-wish-content">
                <div class="grid-wish-name">${w.childName}</div>
                <div class="grid-wish-time">${formatTime(w.timestamp)}</div>
                <div class="grid-wish-text" title="${(w.wishText || '').replace(/"/g, '&quot;')}">${w.wishText || 'Metin yok'}</div>
                <div class="grid-wish-actions">
                    <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" title="Sahneye Al"><i data-lucide="star" style="width:16px;height:16px;"></i></button>
                    <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" title="Düzenle"><i data-lucide="pencil" style="width:16px;height:16px;"></i></button>
                    <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\` )" title="Sil"><i data-lucide="trash-2" style="width:16px;height:16px;"></i></button>
                </div>
            </div>
        </div>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

// ─── BULK ACTIONS ───
function toggleSelectAll(checkbox) {
    document.querySelectorAll('.wish-check').forEach(c => {
        c.checked = checkbox.checked;
    });
    updateBulkActions();
}

function updateBulkActions() {
    const selected = document.querySelectorAll('.wish-check:checked');
    const bulkBar = document.getElementById('bulk-actions');
    const countEl = document.getElementById('selected-count');
    const selectAllCheck = document.getElementById('select-all-wishes');

    if (selected.length > 0) {
        if (bulkBar) bulkBar.style.display = 'flex';
        if (countEl) countEl.textContent = selected.length;
    } else {
        if (bulkBar) bulkBar.style.display = 'none';
    }

    // Select all check'i senkronize et
    if (selectAllCheck) {
        const total = document.querySelectorAll('.wish-check').length;
        selectAllCheck.checked = total > 0 && selected.length === total;
    }
}

function confirmDeleteSelected() {
    const selected = document.querySelectorAll('.wish-check:checked');
    if (selected.length === 0) return;

    document.getElementById('modal-text').textContent = `${selected.length} adet mesaj arşive kaldırılacak. Arşivden geri yüklenebilir.`;
    modalAction = () => deleteSelectedWishes();
    document.getElementById('modal-confirm-btn').textContent = 'Seçilenleri Sil';
    document.getElementById('modal-overlay').classList.add('show');
}

async function deleteSelectedWishes() {
    const selected = Array.from(document.querySelectorAll('.wish-check:checked')).map(c => c.value);

    let deletedCount = 0;
    for (const id of selected) {
        try {
            await fetch(`/api/wishes/${id}`, { method: 'DELETE' });
            deletedCount++;
        } catch (e) {
            console.error('Silme hatası id:', id, e);
        }
    }

    showToast(`🗑️ ${deletedCount} adet mesaj silindi`);
    loadWishes();
}

function renderRecent() {
    const grid = document.getElementById('recent-grid');
    if (!grid) return;
    const recent = [...wishes].reverse().slice(0, 6);
    if (!recent.length) {
        grid.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:20px;">Henüz mesaj yok</div>';
        return;
    }
    grid.innerHTML = recent.map(w => `
    <div class="wish-item">
        ${w.photoUrl ? `
        <img src="${w.photoUrl}" alt="${w.childName}" loading="lazy">
        ` : `
        <div style="width:100%; height:120px; background:var(--bg2); border-radius:8px; display:flex; align-items:center; justify-content:center; color:var(--text3);"><i data-lucide="type" style="width:40px;height:40px;opacity:0.6;"></i></div>
        `}
        <div class="wish-meta">
            <div class="wish-name" style="font-size:13px">${w.childName}</div>
            <div class="wish-time">${formatTime(w.timestamp)}</div>
            <div class="wish-actions" style="display:flex; gap:4px; margin-top:6px;">
                <button class="btn btn-ghost" onclick="spotlightWish('${w.id}')" style="font-size:11px;padding:5px 8px; flex:1" title="Sahneye Al"><i data-lucide="star" style="width:14px;height:14px;"></i></button>
                <button class="btn btn-primary" onclick="editWish('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`, \`${(w.wishText || '').replace(/`/g, '\\`')}\`)" style="font-size:11px;padding:5px 8px;" title="Düzenle"><i data-lucide="pencil" style="width:14px;height:14px;"></i></button>
                <button class="btn btn-danger" onclick="confirmDelete('${w.id}', \`${w.childName.replace(/`/g, '\\`')}\`)" style="font-size:11px;padding:5px 8px" title="Sil"><i data-lucide="trash-2" style="width:14px;height:14px;"></i></button>
            </div>
        </div>
    </div>
`).join('');
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function updateStats() {
    const total = wishes.length;
    const today = wishes.filter(w => new Date(w.timestamp).toDateString() === new Date().toDateString()).length;
    const spotW = wishes.find(w => w.isSpotlight);

    const totalEl = document.getElementById('stat-total');
    const todayEl = document.getElementById('stat-today');
    const spotlightEl = document.getElementById('stat-spotlight');
    const badgeEl = document.getElementById('sidebar-count');

    if (totalEl) totalEl.textContent = total;
    if (todayEl) todayEl.textContent = today;
    if (spotlightEl) spotlightEl.textContent = spotW ? spotW.childName : '—';
    if (badgeEl) badgeEl.textContent = total + ' Mesaj';

    // Stats tab stats
    const total2El = document.getElementById('stat-total-2');
    const today2El = document.getElementById('stat-today-2');
    if (total2El) total2El.textContent = total;
    if (today2El) today2El.textContent = today;
}

function formatTime(ts) {
    return new Date(ts).toLocaleString('tr-TR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
}

function filterWishes() {
    renderWishes();
}

// ─── ACTIONS ───
async function spotlightWish(id) {
    const res = await fetch(`/api/spotlight/${id}`, { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast(`${data.wish.childName} sahneye alındı!`);
        loadWishes();
    }
}

async function spotlightOff() {
    await fetch('/api/spotlight-off', { method: 'POST' }).catch(() => { });
    showToast('Öne çıkarma kapatıldı');
    loadWishes();
}

async function deleteWish(id) {
    await fetch(`/api/wishes/${id}`, { method: 'DELETE' });
    showToast('Mesaj silindi');
    loadWishes();
}

async function clearAllWishes() {
    await fetch('/api/wishes', { method: 'DELETE' });
    showToast('Tüm mesajlar silindi');
    loadWishes();
}

// ─── ARCHIVE & RECOVERY ───
async function loadArchivedWishes() {
    try {
        const res = await fetch('/api/archive');
        const archiveWishes = await res.json();
        renderArchivedWishes(archiveWishes);
        // Oturumları (Sessions) da yükle
        loadSessions();
    } catch (e) {
        console.error('Arşiv yüklenirken hata:', e);
    }
}

function renderArchivedWishes(archiveWishes = []) {
    const tbody = document.getElementById('archive-tbody');
    const emptyState = document.getElementById('archive-empty-state');
    const tableContainer = document.getElementById('archive-table-container');

    if (archiveWishes.length === 0) {
        if (tableContainer) tableContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (tableContainer) tableContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    if (tbody) {
        tbody.innerHTML = archiveWishes.reverse().map(w => `
        <tr class="wish-row">
            <td>
                ${w.photoUrl ? `
                <a href="${w.photoUrl}" target="_blank" title="Fotoğrafı büyük gör">
                    <img src="${w.photoUrl}" alt="${w.childName}" loading="lazy" style="width:48px;height:48px;border-radius:6px;object-fit:cover;">
                </a>
                ` : `
                <div style="width:48px; height:48px; background:var(--bg2); border: 2px dashed var(--card-border); border-radius:6px; display:flex; align-items:center; justify-content:center; color:var(--text3);" title="Sadece metin"><i data-lucide="type" style="width:20px;height:20px;"></i></div>
                `}
            </td>
            <td style="font-weight:600;">${w.childName}</td>
            <td style="color:var(--text2);font-size:13px">${new Date(w.archivedAt || w.timestamp).toLocaleString('tr-TR')}</td>
            <td>
                <div class="wish-actions">
                    <button class="btn btn-primary" onclick="restoreWish('${w.id}')" style="padding:6px 12px; font-size:13px; font-weight:600;" title="Geri Yükle"><i data-lucide="archive-restore" style="width:16px;height:16px;"></i> Geri Yükle</button>
                </div>
            </td>
        </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function restoreWish(id) {
    try {
        const res = await fetch(`/api/restore/${id}`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('♻️ Mesaj başarıyla geri yüklendi!');
            loadArchivedWishes(); // Arşiv listesini güncelle
            if (typeof loadStats === 'function') loadStats();
        } else {
            showToast('Hata: ' + (data.error || 'Geri yükleme başarısız'));
        }
    } catch (e) {
        showToast('Bağlantı hatası!');
    }
}

async function loadSessions() {
    try {
        const res = await fetch('/api/sessions');
        const sessions = await res.json();
        renderSessions(sessions);
    } catch (e) {
        console.error('Oturumlar yüklenirken hata:', e);
    }
}

function renderSessions(sessions = []) {
    const tbody = document.getElementById('sessions-tbody');
    const emptyState = document.getElementById('sessions-empty-state');
    const tableContainer = document.getElementById('sessions-table-container');

    if (sessions.length === 0) {
        if (tableContainer) tableContainer.style.display = 'none';
        if (emptyState) emptyState.style.display = 'block';
        return;
    }

    if (tableContainer) tableContainer.style.display = 'block';
    if (emptyState) emptyState.style.display = 'none';

    if (tbody) {
        tbody.innerHTML = sessions.map(s => `
        <tr class="wish-row">
            <td style="font-weight:600;"><i data-lucide="folder-archive" style="width:16px;height:16px;vertical-align:text-bottom;margin-right:4px;"></i>${s.filename}</td>
            <td style="color:var(--text2);font-size:13px">${new Date(s.createdAt).toLocaleString('tr-TR')}</td>
            <td style="color:var(--accent);font-weight:600;">${s.count} Mesaj</td>
            <td>
                <div class="wish-actions">
                    <button class="btn btn-primary" onclick="restoreSession('${s.filename}')" style="padding:6px 12px; font-size:13px; font-weight:600;" title="Tümünü Geri Yükle"><i data-lucide="package-plus" style="width:16px;height:16px;"></i> Oturumu Geri Yükle</button>
                </div>
            </td>
        </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function restoreSession(filename) {
    if (!confirm('DİKKAT: Bu oturumdaki TÜM mesajlar geri yüklenecektir. Onaylıyor musunuz?')) return;

    try {
        const res = await fetch(`/api/sessions/${filename}/restore`, { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`♻️ ${data.count} mesaj başarıyla geri yüklendi!`);
            loadArchivedWishes();
            if (typeof loadStats === 'function') loadStats();
        } else {
            showToast('Hata: ' + (data.error || 'Oturum geri yüklenemedi.'));
        }
    } catch (e) {
        console.error('Oturum kurtarma hatası:', e);
        showToast('Bağlantı hatası!');
    }
}

// ─── MODAL & EDIT ───
let editingWishId = null;

function editWish(id, name, text) {
    editingWishId = id;
    document.getElementById('edit-name').value = name;
    document.getElementById('edit-text').value = text;
    document.getElementById('edit-modal').classList.add('show');
}

function closeEditModal() {
    editingWishId = null;
    document.getElementById('edit-modal').classList.remove('show');
    document.getElementById('edit-name').value = '';
    document.getElementById('edit-text').value = '';
}

async function saveEditedWish() {
    if (!editingWishId) return;
    const newName = document.getElementById('edit-name').value.trim();
    const newText = document.getElementById('edit-text').value.trim();
    const btn = document.getElementById('edit-save-btn');

    if (!newName) {
        showToast('⚠️ Katılımcı adı boş bırakılamaz');
        return;
    }

    btn.disabled = true;
    btn.textContent = '⏳ Kaydediliyor...';

    try {
        const res = await fetch(`/api/wishes/${editingWishId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ childName: newName, wishText: newText })
        });

        const data = await res.json();
        if (data.success) {
            showToast('Kayıt başarıyla güncellendi!');
            closeEditModal();
            loadWishes();
        } else {
            showToast('Güncelleme hatası: ' + (data.error || 'Bilinmeyen Hata'));
        }
    } catch (err) {
        showToast('Bağlantı hatası!');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Kaydet';
    }
}

function confirmDelete(id, name) {
    document.getElementById('modal-text').textContent = `${name} isimli kayıt arşive kaldırılacak. Sonradan geri yüklenebilir.`;
    modalAction = () => deleteWish(id);
    document.getElementById('modal-confirm-btn').textContent = 'Sil';
    document.getElementById('modal-overlay').classList.add('show');
}

function confirmClearAll() {
    document.getElementById('modal-text').textContent = "Tüm mesajlar ve görseller arşive kaldırılacak ve bir 'Oturum' olarak kaydedilecek. Arşivden geri yüklenebilir.";
    modalAction = clearAllWishes;
    document.getElementById('modal-confirm-btn').textContent = 'Tümünü Arşivle';
    document.getElementById('modal-overlay').classList.add('show');
}

const confirmBtn = document.getElementById('modal-confirm-btn');
if (confirmBtn) {
    confirmBtn.addEventListener('click', () => {
        if (modalAction) { modalAction(); modalAction = null; }
        closeModal();
    });
}

function closeModal() {
    document.getElementById('modal-overlay').classList.remove('show');
}

// ─── UPLOAD ───
async function adminUpload() {
    const file = document.getElementById('admin-photo').files[0];
    const name = document.getElementById('admin-name').value.trim();
    if (!file && !name) { showToast('⚠️ En az bir katılımcı bilgisi girin'); return; }
    const btn = document.getElementById('admin-upload-btn');
    btn.disabled = true; btn.textContent = '⏳ Yükleniyor...';
    const fd = new FormData();
    if (file) fd.append('photo', file);
    fd.append('childName', name);
    try {
        const res = await fetch('/api/upload', { method: 'POST', body: fd });
        const data = await res.json();
        if (data.success) {
            showToast('Mesaj eklendi!');
            document.getElementById('admin-photo').value = '';
            document.getElementById('admin-name').value = '';
            loadWishes();
        } else {
            showToast('Hata: ' + (data.error || 'Bilinmeyen Hata'));
        }
    } catch (e) { showToast('Bağlantı hatası'); }
    btn.disabled = false; btn.innerHTML = '<i data-lucide="sparkles" style="width:16px;height:16px;"></i> Kaydı Ekle';
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

// ─── THEME ───
async function setTheme(theme) {
    await fetch('/api/theme', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ theme }) });
    document.querySelectorAll('#theme-grid .theme-option').forEach(b => {
        b.classList.toggle('active', b.dataset.theme === theme);
    });
    showToast('Tema değiştirildi!');
}

async function loadCurrentTheme() {
    try {
        const res = await fetch('/api/theme');
        const data = await res.json();
        document.querySelectorAll('#theme-grid .theme-option').forEach(b => {
            b.classList.toggle('active', b.dataset.theme === data.theme);
        });
    } catch (e) { }
}

// ─── DISPLAY MODE ───
function setSettingCardVisibility(inputId, visible) {
    const card = document.getElementById(inputId)?.closest('.setting-card');
    if (card) {
        card.style.display = visible ? '' : 'none';
    }
}

function syncDisplaySettingsModeUI(mode) {
    currentDisplayMode = mode || 'balloon';
    const isMessageWall = currentDisplayMode === 'messagewall';
    const titleEl = document.getElementById('display-settings-title');
    const subEl = document.getElementById('display-settings-sub');
    const legacySubEl = document.querySelector('.mod-title-group .mod-sub');
    const noteEl = document.getElementById('display-settings-note');
    const speedValue = document.getElementById('speed-value')?.textContent || '1.0x';
    const scaleValue = document.getElementById('scale-value')?.textContent || '1.0x';
    const maxVisibleValue = document.getElementById('maxvisible-value')?.textContent || '20';
    const speedLabel = document.getElementById('display-speed-label');
    const scaleLabel = document.getElementById('display-scale-label');
    const maxVisibleLabel = document.getElementById('display-maxvisible-label');

    if (titleEl) {
        titleEl.innerHTML = `<i data-lucide="monitor-cog" style="width:18px;height:18px;margin-right:8px;vertical-align:middle;"></i> ${isMessageWall ? 'HBTKON Sahnesi Ayarları' : 'Sahne Ayarları'}`;
    }
    if (subEl) {
        subEl.textContent = isMessageWall
            ? 'HBTKON Sahnesi için sadece çalışan kontroller gösterilir'
            : 'Aktif gösterim modu için geçerli sahne ayarları';
    }
    if (legacySubEl) {
        legacySubEl.style.display = 'none';
    }
    if (noteEl) {
        noteEl.style.display = isMessageWall ? 'block' : 'none';
    }
    if (noteEl && isMessageWall) {
        noteEl.textContent = 'HBTKON Sahnesi sabit kompozisyon kullanıyor. Bu modda kart giriş animasyonu, akış hızı ve kart ölçeği ayarlanabilir.';
    }
    if (speedLabel) {
        speedLabel.innerHTML = `<i data-lucide="gauge" style="width:14px;height:14px;vertical-align:middle;"></i> ${isMessageWall ? 'Geçiş Hızı' : 'Animasyon Hızı'} <span id="speed-value" style="color:var(--accent);font-weight:700;margin-left:6px;">${speedValue}</span>`;
    }
    if (scaleLabel) {
        scaleLabel.innerHTML = `<i data-lucide="scaling" style="width:14px;height:14px;vertical-align:middle;"></i> ${isMessageWall ? 'Kart Olcegi' : 'Sahne Olcegi'} <span id="scale-value" style="color:var(--accent);font-weight:700;margin-left:6px;">${scaleValue}</span>`;
    }
    if (maxVisibleLabel) {
        maxVisibleLabel.innerHTML = `<i data-lucide="layers" style="width:14px;height:14px;vertical-align:middle;"></i> Maksimum Kart Sayisi <span id="maxvisible-value" style="color:var(--accent);font-weight:700;margin-left:6px;">${maxVisibleValue}</span>`;
    }

    [
        'display-maxvisible',
        'display-logo-offset',
        'display-logo-scale',
        'display-bakanlik-scale',
        'display-akm-scale',
        'display-bakanlik-x',
        'display-bakanlik-y',
        'display-akm-x',
        'display-akm-y',
        'display-logo-x',
        'display-logo-y',
        'display-header-offset',
        'display-header-scale',
        'display-header-x',
        'display-header-y',
        'display-daymode'
    ].forEach((id) => setSettingCardVisibility(id, !isMessageWall));

    setSettingCardVisibility('display-speed', true);
    setSettingCardVisibility('display-scale', true);
    setSettingCardVisibility('display-messagewall-animation', isMessageWall);
    setSettingCardVisibility('display-qr-visible', true);
    setSettingCardVisibility('display-qr-size', true);
    setSettingCardVisibility('display-qr-top', true);
    setSettingCardVisibility('display-qr-right', true);

    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    updateSpeedLabel(document.getElementById('display-speed')?.value || 1);
    updateScaleLabel(document.getElementById('display-scale')?.value || 1);
    updateMaxVisibleLabel(document.getElementById('display-maxvisible')?.value || 20);
}

async function setDisplayMode(mode) {
    await fetch('/api/display-mode', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ displayMode: mode }) });
    document.querySelectorAll('.display-mode-option').forEach(b => {
        b.classList.toggle('active', b.dataset.mode === mode);
    });
    showToast('Gösterim teması güncellendi!');
}

async function loadCurrentDisplayMode() {
    try {
        const res = await fetch('/api/display-mode');
        const data = await res.json();
        document.querySelectorAll('.display-mode-option').forEach(b => {
            b.classList.toggle('active', b.dataset.mode === data.displayMode);
        });
    } catch (e) { }
}
loadCurrentDisplayMode();

// ─── AUTO SPOTLIGHT ───
async function startAutoSpotlight() {
    if (!wishes.length) { showToast('Mesaj yok!'); return; }
    const delay = document.getElementById('auto-delay').value;
    const res = await fetch('/api/auto-spotlight/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ delay: parseInt(delay) })
    });
    const data = await res.json();
    if (data.success) {
        showToast('▶️ Slayt gösterisi başladı');
        checkAutoStatus();
    }
}

async function stopAutoSpotlight() {
    const res = await fetch('/api/auto-spotlight/stop', { method: 'POST' });
    const data = await res.json();
    if (data.success) {
        showToast('⏹️ Slayt gösterisi durduruldu');
        checkAutoStatus();
    }
}

// ─── ENTERPRISE UX FEATURES ───

// Focus Mode (F tuşuyla gizle)
function toggleFocusMode() {
    document.body.classList.toggle('focus-mode');
    showToast(document.body.classList.contains('focus-mode') ? 'Odak Modu Açıldı (Çıkmak için F)' : 'Odak Modu Kapatıldı');
}

// Global Keyboard Shortcuts
document.addEventListener('keydown', (e) => {
    // Input alanındaysak kısayolları yoksay
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    switch (e.key.toLowerCase()) {
        case 'f': {
            toggleFocusMode();
            break;
        }
        case 's': {
            const startBtn = document.getElementById('auto-start-btn');
            const isPlaying = startBtn && startBtn.style.display === 'none';
            if (isPlaying) stopAutoSpotlight(); else startAutoSpotlight();
            break;
        }
        case 'escape': {
            // Varsa modalları kapat, yoksa spotlight kapat
            const overlay = document.getElementById('modal-overlay');
            const editObj = document.getElementById('edit-modal');
            if (overlay && overlay.classList.contains('show')) {
                closeModal();
            } else if (editObj && editObj.classList.contains('show')) {
                closeEditModal();
            } else {
                spotlightOff();
            }
            break;
        }
    }
});

// ─── MODERATION ───
async function loadModerationState() {
    try {
        const res = await fetch('/api/moderation');
        const data = await res.json();
        setModerationUI(data);
        loadModerationLog();
    } catch (e) { }
}

async function loadModerationLog() {
    const tbody = document.getElementById('mod-log-tbody');
    if (!tbody) return;
    try {
        const res = await fetch('/api/moderation/log');
        const data = await res.json();
        if (!data || data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text3);">Kayıt bulunamadı.</td></tr>';
            return;
        }
        tbody.innerHTML = data.reverse().map(log => `
            <tr>
                <td style="font-weight:600;">${log.childName}</td>
                <td style="font-size:12px; color:var(--text2);"><div style="display:flex; align-items:center; gap:4px;">${log.wishText || (log.photoUrl ? '<i data-lucide="image" style="width:12px;height:12px;"></i> Fotoğraf' : '-')}</div></td>
                <td style="color:var(--red); font-size:12px;"><div style="display:flex; align-items:center; gap:4px;"><i data-lucide="shield-alert" style="width:12px;height:12px;"></i> ${log.rejectedReason || 'Uygunsuz'}</div></td>
                <td style="font-size:11px; color:var(--text3);">${formatTime(log.rejectedAt)}</td>
            </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    } catch (e) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--red);">Yükleme hatası!</td></tr>';
    }
}

async function toggleModeration() {
    try {
        const res = await fetch('/api/moderation/toggle', { method: 'POST' });
        const data = await res.json();
        setModerationUI(data);
        showToast(data.enabled ? '🤖 Moderasyon AÇILDI' : '⚠️ Moderasyon KAPATILDI');
    } catch (e) { showToast('❌ Hata'); }
}

async function saveModerationSettings() {
    const enabledToggle = document.getElementById('moderation-enabled-toggle') || document.getElementById('mod-toggle');
    const strictnessEl = document.getElementById('moderation-strictness-compact') || document.getElementById('mod-strictness');
    const autoApproveEl = document.getElementById('moderation-auto-approve') || document.getElementById('mod-auto-approve');
    const settings = {
        enabled: enabledToggle ? enabledToggle.checked : true,
        checkText: true,
        strictness: strictnessEl ? strictnessEl.value : 'normal',
        autoApprove: autoApproveEl?.checked === true,
    };
    try {
        const res = await fetch('/api/moderation/settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await res.json();
        setModerationUI(data);
        showToast('💾 Moderasyon ayarları kaydedildi');
    } catch (e) { showToast('❌ Kaydetme hatası'); }
}

function setModerationUI(data) {
    const toggle = document.getElementById('mod-toggle');
    const compactToggle = document.getElementById('moderation-enabled-toggle');
    const badge = document.getElementById('mod-badge');
    const compactBadge = document.getElementById('moderation-status-summary');
    const statMod = document.getElementById('stat-mod');
    const on = data.enabled !== false;
    if (toggle) toggle.checked = on;
    if (compactToggle) compactToggle.checked = on;
    if (badge) {
        badge.textContent = on ? '✅ AÇIK' : '🚫 KAPALI';
        badge.className = 'mod-status-pill ' + (on ? 'on' : 'off');
    }
    if (statMod) {
        statMod.textContent = on ? 'AÇIK' : 'KAPALI';
        statMod.style.color = on ? 'var(--green)' : 'var(--red)';
    }
    if (compactBadge) {
        compactBadge.textContent = on ? 'Açık' : 'Kapalı';
        compactBadge.className = 'mod-status-pill ' + (on ? 'on' : 'off');
    }
    const strictEl = document.getElementById('mod-strictness');
    if (strictEl && data.strictness) strictEl.value = data.strictness;
    const compactStrictEl = document.getElementById('moderation-strictness-compact');
    if (compactStrictEl && data.strictness) compactStrictEl.value = data.strictness;
    const textEl = document.getElementById('mod-text');
    if (textEl && data.checkText !== undefined) {
        textEl.checked = data.checkText;
        const textLabel = document.getElementById('mod-text-label');
        if (textLabel) textLabel.textContent = data.checkText ? 'Açık' : 'Kapalı';
    }
    const autoApproveEl = document.getElementById('mod-auto-approve');
    const compactAutoApproveEl = document.getElementById('moderation-auto-approve');
    if ((autoApproveEl || compactAutoApproveEl) && data.autoApprove !== undefined) {
        if (autoApproveEl) autoApproveEl.checked = data.autoApprove;
        if (compactAutoApproveEl) compactAutoApproveEl.checked = data.autoApprove;
        const autoApproveLabel = document.getElementById('mod-auto-approve-label');
        if (autoApproveLabel) autoApproveLabel.textContent = data.autoApprove ? 'Açık' : 'Kapalı';
        const compactAutoApproveLabel = document.getElementById('moderation-auto-approve-label');
        if (compactAutoApproveLabel) compactAutoApproveLabel.textContent = data.autoApprove ? 'Açık' : 'Kapalı';
        const flowNote = document.getElementById('mod-flow-note');
        const compactFlowSummary = document.getElementById('moderation-flow-summary');
        if (flowNote) {
            flowNote.textContent = data.autoApprove
                ? (on
                    ? 'Açıksa AI kontrolden geçen kayıtlar doğrudan yayına alınır; uygunsuz içerik reddedilir.'
                    : 'Açıksa moderasyon kapalıyken kayıtlar doğrudan onaylanır ve yayına alınır.')
                : 'Kapalıysa kayıtlar bekleyen listesine düşer ve admin onayı gerekir.';
        }
        if (compactFlowSummary) {
            compactFlowSummary.textContent = data.autoApprove
                ? (on ? 'AI kontrolden geçen mesajlar otomatik yayına alınır.' : 'Moderasyon kapalı; mesajlar doğrudan yayına alınır.')
                : 'Mesajlar bekleyen listeye düşer ve admin onayı bekler.';
        }
    }
}

function confirmClearModerationLog() {
    document.getElementById('modal-text').textContent = 'Moderasyon logundaki tüm geçmiş kayıtlar silinecek. Bu işlem geri alınamaz.';
    modalAction = clearModerationLog;
    document.getElementById('modal-confirm-btn').textContent = 'Geçmişi Temizle';
    document.getElementById('modal-overlay').classList.add('show');
}

async function clearModerationLog() {
    try {
        const res = await fetch('/api/moderation/log', { method: 'DELETE' });
        const data = await res.json();
        if (data.success) {
            showToast('Moderasyon geçmişi temizlendi');
            loadModerationLog();
        } else {
            showToast('Hata: ' + (data.error || 'Moderasyon geçmişi temizlenemedi'));
        }
    } catch (e) {
        showToast('Bağlantı hatası!');
    }
}

// ─── EKRAN AYARLARI ───
function numberSettingFromControl(id, fallback, map = (value) => parseFloat(value)) {
    const el = document.getElementById(id);
    if (!el) return fallback;
    const value = map(el.value);
    return Number.isFinite(value) ? value : fallback;
}

function booleanSettingFromControl(id, fallback) {
    const el = document.getElementById(id);
    return el ? !!el.checked : !!fallback;
}

function booleanSettingFromControls(ids, fallback) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (el) return !!el.checked;
    }
    return !!fallback;
}

function numberSettingFromControls(ids, fallback, parser = parseFloat) {
    for (const id of ids) {
        const el = document.getElementById(id);
        if (!el || el.value === '') continue;
        const value = parser(el.value);
        if (Number.isFinite(value)) return value;
    }
    return fallback;
}

function setControlsValue(ids, value) {
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.value = value;
    });
}

function setLabelsText(ids, text) {
    ids.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.textContent = text;
    });
}

function getDefaultQrPlacement() {
    return {
        qrSize: 240,
        qrTop: 96,
        qrRight: 64
    };
}

function clampNumber(value, min, max) {
    return Math.max(min, Math.min(value, max));
}

function getQrPreviewLimits(size) {
    const minGap = 24;
    return {
        minTop: minGap,
        maxTop: Math.max(minGap, QR_PREVIEW_STAGE.height - size - QR_PANEL_EXTRA_HEIGHT - minGap),
        minRight: minGap,
        maxRight: Math.max(minGap, QR_PREVIEW_STAGE.width - size - 32)
    };
}

function getQrPreviewScale() {
    const stage = document.getElementById('qr-preview-stage');
    if (!stage) return 1;
    const rect = stage.getBoundingClientRect();
    return rect.width / QR_PREVIEW_STAGE.width;
}

function normalizeQrPreviewState(state) {
    const size = clampNumber(parseInt(state.qrSize, 10) || 240, 120, 480);
    const limits = getQrPreviewLimits(size);
    return {
        qrVisible: !!state.qrVisible,
        qrSize: size,
        qrTop: clampNumber(parseInt(state.qrTop, 10) || limits.minTop, limits.minTop, limits.maxTop),
        qrRight: clampNumber(parseInt(state.qrRight, 10) || limits.minRight, limits.minRight, limits.maxRight)
    };
}

function getQrStateFromControls() {
    return normalizeQrPreviewState({
        qrVisible: booleanSettingFromControls(['moderation-display-qr-visible', 'display-qr-visible'], displaySettingsCache.qrVisible),
        qrSize: numberSettingFromControls(['moderation-display-qr-size', 'display-qr-size'], displaySettingsCache.qrSize || 240, parseInt),
        qrTop: numberSettingFromControls(['moderation-display-qr-top', 'display-qr-top'], displaySettingsCache.qrTop || 96, parseInt),
        qrRight: numberSettingFromControls(['moderation-display-qr-right', 'display-qr-right'], displaySettingsCache.qrRight || 64, parseInt)
    });
}

function syncQrPreviewInputs() {
    if (!qrPreviewState) return;
    const sizeInput = document.getElementById('qr-preview-size');
    const topInput = document.getElementById('qr-preview-top');
    const rightInput = document.getElementById('qr-preview-right');
    const visibleInput = document.getElementById('qr-preview-visible');
    const limits = getQrPreviewLimits(qrPreviewState.qrSize);

    if (sizeInput) sizeInput.value = qrPreviewState.qrSize;
    if (topInput) {
        topInput.max = limits.maxTop;
        topInput.value = qrPreviewState.qrTop;
    }
    if (rightInput) {
        rightInput.max = limits.maxRight;
        rightInput.value = qrPreviewState.qrRight;
    }
    if (visibleInput) visibleInput.checked = !!qrPreviewState.qrVisible;

    setLabelsText(['qr-preview-size-value'], `${qrPreviewState.qrSize}px`);
    setLabelsText(['qr-preview-top-value'], `${qrPreviewState.qrTop}px`);
    setLabelsText(['qr-preview-right-value'], `${qrPreviewState.qrRight}px`);
}

function renderQrPreview() {
    if (!qrPreviewState) return;
    const panel = document.getElementById('qr-preview-panel');
    const stageSize = document.getElementById('qr-preview-stage-size');
    if (!panel) return;

    const scale = getQrPreviewScale();
    panel.style.setProperty('--qr-preview-scale', scale.toString());
    panel.style.width = `${qrPreviewState.qrSize * scale}px`;
    panel.style.top = `${qrPreviewState.qrTop * scale}px`;
    panel.style.right = `${qrPreviewState.qrRight * scale}px`;
    panel.style.opacity = qrPreviewState.qrVisible ? '1' : '0.5';
    if (stageSize) stageSize.textContent = `${QR_PREVIEW_STAGE.width} x ${QR_PREVIEW_STAGE.height}`;
}

function updateQrPreviewFromInputs() {
    if (!qrPreviewState) return;
    const sizeInput = document.getElementById('qr-preview-size');
    const topInput = document.getElementById('qr-preview-top');
    const rightInput = document.getElementById('qr-preview-right');
    const visibleInput = document.getElementById('qr-preview-visible');

    qrPreviewState = normalizeQrPreviewState({
        qrVisible: visibleInput ? visibleInput.checked : qrPreviewState.qrVisible,
        qrSize: sizeInput ? sizeInput.value : qrPreviewState.qrSize,
        qrTop: topInput ? topInput.value : qrPreviewState.qrTop,
        qrRight: rightInput ? rightInput.value : qrPreviewState.qrRight
    });
    syncQrPreviewInputs();
    renderQrPreview();
}

function openQrPreviewModal() {
    qrPreviewState = getQrStateFromControls();
    const modal = document.getElementById('qr-preview-modal');
    if (!modal) return;
    modal.classList.add('show');
    modal.setAttribute('aria-hidden', 'false');
    syncQrPreviewInputs();
    requestAnimationFrame(renderQrPreview);
    if (typeof lucide !== 'undefined') lucide.createIcons();
}

function closeQrPreviewModal() {
    const modal = document.getElementById('qr-preview-modal');
    if (modal) {
        modal.classList.remove('show');
        modal.setAttribute('aria-hidden', 'true');
    }
    const panel = document.getElementById('qr-preview-panel');
    if (panel) panel.classList.remove('dragging');
    qrPreviewDrag = null;
}

async function saveQrPreviewSettings() {
    if (!qrPreviewState) return;
    qrPreviewState = normalizeQrPreviewState(qrPreviewState);

    const visibleIds = ['moderation-display-qr-visible', 'display-qr-visible'];
    visibleIds.forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.checked = qrPreviewState.qrVisible;
    });
    setControlsValue(['moderation-display-qr-size', 'display-qr-size'], qrPreviewState.qrSize);
    setControlsValue(['moderation-display-qr-top', 'display-qr-top'], qrPreviewState.qrTop);
    setControlsValue(['moderation-display-qr-right', 'display-qr-right'], qrPreviewState.qrRight);
    updateQrSizeLabel(qrPreviewState.qrSize);
    updateQrTopLabel(qrPreviewState.qrTop);
    updateQrRightLabel(qrPreviewState.qrRight);

    await saveDisplaySettings({
        qrVisible: qrPreviewState.qrVisible,
        qrSize: qrPreviewState.qrSize,
        qrTop: qrPreviewState.qrTop,
        qrRight: qrPreviewState.qrRight
    });
    closeQrPreviewModal();
    showToast('QR sahne ayarı kaydedildi');
}

function startQrPreviewDrag(event) {
    if (!qrPreviewState) return;
    const stage = document.getElementById('qr-preview-stage');
    const panel = document.getElementById('qr-preview-panel');
    if (!stage || !panel) return;
    const panelRect = panel.getBoundingClientRect();
    qrPreviewDrag = {
        pointerId: event.pointerId,
        offsetX: event.clientX - panelRect.left,
        offsetY: event.clientY - panelRect.top
    };
    panel.classList.add('dragging');
    panel.setPointerCapture(event.pointerId);
    event.preventDefault();
}

function moveQrPreviewDrag(event) {
    if (!qrPreviewDrag || !qrPreviewState) return;
    const stage = document.getElementById('qr-preview-stage');
    if (!stage) return;
    const stageRect = stage.getBoundingClientRect();
    const scale = getQrPreviewScale();
    const panelWidth = qrPreviewState.qrSize * scale;
    const panelHeight = (qrPreviewState.qrSize + QR_PANEL_EXTRA_HEIGHT) * scale;
    const left = clampNumber(event.clientX - stageRect.left - qrPreviewDrag.offsetX, 0, stageRect.width - panelWidth);
    const top = clampNumber(event.clientY - stageRect.top - qrPreviewDrag.offsetY, 0, stageRect.height - panelHeight);
    const right = stageRect.width - left - panelWidth;

    qrPreviewState = normalizeQrPreviewState({
        ...qrPreviewState,
        qrTop: Math.round(top / scale),
        qrRight: Math.round(right / scale)
    });
    syncQrPreviewInputs();
    renderQrPreview();
}

function stopQrPreviewDrag(event) {
    if (!qrPreviewDrag) return;
    const panel = document.getElementById('qr-preview-panel');
    if (panel) {
        panel.classList.remove('dragging');
        try {
            panel.releasePointerCapture(event.pointerId);
        } catch (_) { }
    }
    qrPreviewDrag = null;
}

function initQrPreviewControls() {
    ['qr-preview-size', 'qr-preview-top', 'qr-preview-right', 'qr-preview-visible'].forEach((id) => {
        const el = document.getElementById(id);
        if (el) el.addEventListener('input', updateQrPreviewFromInputs);
        if (el) el.addEventListener('change', updateQrPreviewFromInputs);
    });

    const panel = document.getElementById('qr-preview-panel');
    if (panel) {
        panel.addEventListener('pointerdown', startQrPreviewDrag);
        panel.addEventListener('pointermove', moveQrPreviewDrag);
        panel.addEventListener('pointerup', stopQrPreviewDrag);
        panel.addEventListener('pointercancel', stopQrPreviewDrag);
    }

    window.addEventListener('resize', () => {
        if (document.getElementById('qr-preview-modal')?.classList.contains('show')) {
            renderQrPreview();
        }
    });
}

async function loadDisplaySettings() {
    try {
        const res = await fetch('/api/display-settings');
        const data = await res.json();
        displaySettingsCache = { ...displaySettingsCache, ...data };
        setDisplaySettingsUI(displaySettingsCache);
    } catch (e) { }
}

async function saveDisplaySettings(overrides = {}) {
    const settings = {
        speedMultiplier: numberSettingFromControls(['moderation-display-speed', 'display-speed'], displaySettingsCache.speedMultiplier || 1, parseFloat),
        scaleMultiplier: numberSettingFromControls(['moderation-display-scale', 'display-scale'], displaySettingsCache.scaleMultiplier || 1, parseFloat),
        messageWallEntranceStyle: ((document.getElementById('display-messagewall-animation')?.value || 'standard') === 'soft'
            ? 'glide'
            : (document.getElementById('display-messagewall-animation')?.value || 'standard')),
        maxVisible: numberSettingFromControls(['moderation-display-maxvisible', 'display-maxvisible'], displaySettingsCache.maxVisible || 20, parseInt),
        logoOffsetPx: numberSettingFromControls(['display-logo-offset'], displaySettingsCache.logoOffsetPx || 0, parseInt),
        headerOffsetPx: numberSettingFromControls(['display-header-offset'], displaySettingsCache.headerOffsetPx || 0, parseInt),
        logoScale: numberSettingFromControls(['display-logo-scale'], Math.round((displaySettingsCache.logoScale || 1) * 100), parseInt) / 100,
        headerScale: numberSettingFromControls(['display-header-scale'], Math.round((displaySettingsCache.headerScale || 1) * 100), parseInt) / 100,
        bakanlikScale: numberSettingFromControls(['display-bakanlik-scale'], Math.round((displaySettingsCache.bakanlikScale || 1) * 100), parseInt) / 100,
        akmScale: numberSettingFromControls(['display-akm-scale'], Math.round((displaySettingsCache.akmScale || 1) * 100), parseInt) / 100,
        bakanlikX: numberSettingFromControls(['display-bakanlik-x'], displaySettingsCache.bakanlikX || 0, parseInt),
        bakanlikY: numberSettingFromControls(['display-bakanlik-y'], displaySettingsCache.bakanlikY || 0, parseInt),
        akmX: numberSettingFromControls(['display-akm-x'], displaySettingsCache.akmX || 0, parseInt),
        akmY: numberSettingFromControls(['display-akm-y'], displaySettingsCache.akmY || 0, parseInt),
        qrVisible: booleanSettingFromControls(['moderation-display-qr-visible', 'display-qr-visible'], displaySettingsCache.qrVisible),
        qrSize: numberSettingFromControls(['moderation-display-qr-size', 'display-qr-size'], displaySettingsCache.qrSize || 240, parseInt),
        qrTop: numberSettingFromControls(['moderation-display-qr-top', 'display-qr-top'], displaySettingsCache.qrTop || 96, parseInt),
        qrRight: numberSettingFromControls(['moderation-display-qr-right', 'display-qr-right'], displaySettingsCache.qrRight || 64, parseInt),
        logoTopX: numberSettingFromControls(['display-logo-x'], displaySettingsCache.logoTopX || 0, parseInt),
        logoTopY: numberSettingFromControls(['display-logo-y'], displaySettingsCache.logoTopY || 0, parseInt),
        headerX: numberSettingFromControls(['display-header-x'], displaySettingsCache.headerX || 0, parseInt),
        headerY: numberSettingFromControls(['display-header-y'], displaySettingsCache.headerY || 0, parseInt),
        dayMode: !!document.getElementById('display-daymode')?.checked
    };
    Object.assign(settings, overrides);
    try {
        const res = await fetch('/api/display-settings', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(settings)
        });
        const data = await res.json();
        displaySettingsCache = { ...displaySettingsCache, ...data };
        setDisplaySettingsUI(displaySettingsCache);
        showToast('📺 Ekran ayarları güncellendi');
    } catch (e) { showToast('❌ Kaydetme hatası'); }
}

async function setDisplayQrVisibility(visible, resetOnShow = false) {
    const hiddenToggle = document.getElementById('display-qr-visible');
    const compactToggle = document.getElementById('moderation-display-qr-visible');
    if (hiddenToggle) hiddenToggle.checked = !!visible;
    if (compactToggle) compactToggle.checked = !!visible;
    const overrides = { qrVisible: !!visible };
    if (visible && resetOnShow) {
        Object.assign(overrides, getDefaultQrPlacement());
    }
    await saveDisplaySettings(overrides);
}

async function showDisplayQr() {
    await setDisplayQrVisibility(true);
}

function setDisplaySettingsUI(data) {
    if (data.speedMultiplier !== undefined) {
        setControlsValue(['display-speed', 'moderation-display-speed'], data.speedMultiplier);
        updateSpeedLabel(data.speedMultiplier);
    }
    if (data.scaleMultiplier !== undefined) {
        setControlsValue(['display-scale', 'moderation-display-scale'], data.scaleMultiplier);
        updateScaleLabel(data.scaleMultiplier);
    }
    if (data.messageWallEntranceStyle !== undefined) {
        const el = document.getElementById('display-messagewall-animation');
        const normalized = data.messageWallEntranceStyle === 'soft' ? 'glide' : data.messageWallEntranceStyle;
        if (el) el.value = normalized;
    }
    if (data.maxVisible !== undefined) {
        setControlsValue(['display-maxvisible', 'moderation-display-maxvisible'], data.maxVisible);
        updateMaxVisibleLabel(data.maxVisible);
    }
    if (data.qrVisible !== undefined) {
        const qrToggle = document.getElementById('display-qr-visible');
        const qrToggleLabel = document.getElementById('display-qr-visible-label');
        const compactQrToggle = document.getElementById('moderation-display-qr-visible');
        const compactQrState = document.getElementById('moderation-qr-state');
        if (qrToggle) qrToggle.checked = !!data.qrVisible;
        if (qrToggleLabel) qrToggleLabel.textContent = data.qrVisible ? 'Açık' : 'Kapalı';
        if (compactQrToggle) compactQrToggle.checked = !!data.qrVisible;
        if (compactQrState) {
            compactQrState.textContent = data.qrVisible ? 'Açık' : 'Kapalı';
            compactQrState.className = 'mod-status-pill ' + (data.qrVisible ? 'on' : 'off');
        }
    }
    if (data.qrSize !== undefined) {
        setControlsValue(['display-qr-size', 'moderation-display-qr-size'], data.qrSize);
        updateQrSizeLabel(data.qrSize);
    }
    if (data.qrTop !== undefined) {
        setControlsValue(['display-qr-top', 'moderation-display-qr-top'], data.qrTop);
        updateQrTopLabel(data.qrTop);
    }
    if (data.qrRight !== undefined) {
        setControlsValue(['display-qr-right', 'moderation-display-qr-right'], data.qrRight);
        updateQrRightLabel(data.qrRight);
    }
    if (data.logoOffsetPx !== undefined) {
        const el = document.getElementById('display-logo-offset');
        if (el) el.value = data.logoOffsetPx;
        updateLogoOffsetLabel(data.logoOffsetPx);
    }
    if (data.logoScale !== undefined) {
        const el = document.getElementById('display-logo-scale');
        const scaleValue = Math.round(data.logoScale * 100);
        if (el) el.value = scaleValue;
        updateLogoScaleLabel(scaleValue);
    }
    if (data.headerOffsetPx !== undefined) {
        const el = document.getElementById('display-header-offset');
        if (el) el.value = data.headerOffsetPx;
        updateHeaderOffsetLabel(data.headerOffsetPx);
    }
    if (data.headerScale !== undefined) {
        const el = document.getElementById('display-header-scale');
        const scaleValue = Math.round(data.headerScale * 100);
        if (el) el.value = scaleValue;
        updateHeaderScaleLabel(scaleValue);
    }
    if (data.dayMode !== undefined) {
        const dayToggle = document.getElementById('display-daymode');
        const dayLabel = document.getElementById('display-daymode-label');
        if (dayToggle) dayToggle.checked = !!data.dayMode;
        if (dayLabel) dayLabel.textContent = data.dayMode ? 'Açık' : 'Kapalı';
    }
    if (data.bakanlikScale !== undefined) {
        const el = document.getElementById('display-bakanlik-scale');
        const v = Math.round(data.bakanlikScale * 100);
        if (el) el.value = v;
        const lbl = document.getElementById('bakanlik-scale-value');
        if (lbl) lbl.textContent = v + '%';
    }
    if (data.akmScale !== undefined) {
        const el = document.getElementById('display-akm-scale');
        const v = Math.round(data.akmScale * 100);
        if (el) el.value = v;
        const lbl = document.getElementById('akm-scale-value');
        if (lbl) lbl.textContent = v + '%';
    }
    if (data.logoTopX !== undefined) {
        const el = document.getElementById('display-logo-x');
        if (el) el.value = data.logoTopX;
        const lbl = document.getElementById('logo-x-value');
        if (lbl) lbl.textContent = data.logoTopX + 'px';
    }
    if (data.logoTopY !== undefined) {
        const el = document.getElementById('display-logo-y');
        if (el) el.value = data.logoTopY;
        const lbl = document.getElementById('logo-y-value');
        if (lbl) lbl.textContent = data.logoTopY + 'px';
    }
    if (data.headerX !== undefined) {
        const el = document.getElementById('display-header-x');
        if (el) el.value = data.headerX;
        const lbl = document.getElementById('header-x-value');
        if (lbl) lbl.textContent = data.headerX + 'px';
    }
    if (data.headerY !== undefined) {
        const el = document.getElementById('display-header-y');
        if (el) el.value = data.headerY;
        const lbl = document.getElementById('header-y-value');
        if (lbl) lbl.textContent = data.headerY + 'px';
    }
    if (data.bakanlikX !== undefined) {
        const el = document.getElementById('display-bakanlik-x');
        if (el) el.value = data.bakanlikX;
        const lbl = document.getElementById('bakanlik-x-value');
        if (lbl) lbl.textContent = data.bakanlikX + 'px';
    }
    if (data.bakanlikY !== undefined) {
        const el = document.getElementById('display-bakanlik-y');
        if (el) el.value = data.bakanlikY;
        const lbl = document.getElementById('bakanlik-y-value');
        if (lbl) lbl.textContent = data.bakanlikY + 'px';
    }
    if (data.akmX !== undefined) {
        const el = document.getElementById('display-akm-x');
        if (el) el.value = data.akmX;
        const lbl = document.getElementById('akm-x-value');
        if (lbl) lbl.textContent = data.akmX + 'px';
    }
    if (data.akmY !== undefined) {
        const el = document.getElementById('display-akm-y');
        if (el) el.value = data.akmY;
        const lbl = document.getElementById('akm-y-value');
        if (lbl) lbl.textContent = data.akmY + 'px';
    }
    if (data.screenMode) {
        document.querySelectorAll('.screen-mode-btn').forEach(btn => {
            const isActive = btn.dataset.mode === data.screenMode;
            btn.classList.toggle('active', isActive);
            btn.style.border = isActive ? '2px solid var(--accent)' : '2px solid var(--card-border)';
            btn.style.background = isActive ? 'var(--accent)' : 'var(--bg2)';
            btn.style.color = isActive ? 'white' : 'var(--text2)';
        });
    }
}

function updateSpeedLabel(val) {
    setLabelsText(['speed-value', 'moderation-speed-value'], parseFloat(val).toFixed(1) + 'x');
}

function updateScaleLabel(val) {
    setLabelsText(['scale-value', 'moderation-scale-value'], parseFloat(val).toFixed(2) + 'x');
}

function updateMaxVisibleLabel(val) {
    setLabelsText(['maxvisible-value', 'moderation-maxvisible-value'], String(parseInt(val)));
}

function updateQrSizeLabel(val) {
    setLabelsText(['qr-size-value', 'moderation-qr-size-value'], `${parseInt(val)}px`);
}

function updateQrTopLabel(val) {
    setLabelsText(['qr-top-value', 'moderation-qr-top-value'], `${parseInt(val)}px`);
}

function updateQrRightLabel(val) {
    setLabelsText(['qr-right-value', 'moderation-qr-right-value'], `${parseInt(val)}px`);
}

function updateLogoOffsetLabel(val) {
    const el = document.getElementById('logo-offset-value');
    if (el) el.textContent = `${parseInt(val)}px`;
}

function updateLogoScaleLabel(val) {
    const el = document.getElementById('logo-scale-value');
    if (el) el.textContent = `${parseInt(val)}%`;
}

function updateHeaderOffsetLabel(val) {
    const el = document.getElementById('header-offset-value');
    if (el) el.textContent = `${parseInt(val)}px`;
}

function updateHeaderScaleLabel(val) {
    const el = document.getElementById('header-scale-value');
    if (el) el.textContent = `${parseInt(val)}%`;
}

function setScreenMode(mode) {
    document.querySelectorAll('.screen-mode-btn').forEach(btn => {
        const isActive = btn.dataset.mode === mode;
        btn.classList.toggle('active', isActive);
        btn.style.border = isActive ? '2px solid var(--accent)' : '2px solid var(--card-border)';
        btn.style.background = isActive ? 'var(--accent)' : 'var(--bg2)';
        btn.style.color = isActive ? 'white' : 'var(--text2)';
    });
    saveDisplaySettings();
}

// ─── RAFFLE (ÇEKİLİŞ) ───
async function startRaffle() {
    const btnStart = document.getElementById('btn-raffle-start');
    btnStart.disabled = true;
    btnStart.innerHTML = '⏳ Çekiliyor...';

    try {
        const res = await fetch('/api/raffle/start', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ count: 1 })
        });

        const data = await res.json();

        if (data.success && data.winners) {
            showToast('🎁 Sıradaki katılımcı ekranda belirdi!');

            // Butonları güncelle
            btnStart.style.display = 'none';
            document.getElementById('btn-raffle-close').style.display = 'flex';

            // Admin logunu göster (Yığılmalı)
            const listEl = document.getElementById('raffle-results-list');
            const newWinner = `<li style="background:var(--card-hover); padding:10px 15px; border-radius:8px; border-left:4px solid var(--accent); display:flex; justify-content:space-between;">
                    <span style="font-weight:bold;">Sıradaki Katılımcı</span>
                    <span>${data.winners[0].childName}</span>
                 </li>`;
            listEl.innerHTML += newWinner;
            document.getElementById('raffle-results-container').style.display = 'block';
        } else {
            showToast('❌ Hata: ' + (data.error || 'Katılımcı seçimi yapılamadı'));
            btnStart.disabled = false;
            btnStart.innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Katılımcıyı Seç';
            if (typeof lucide !== 'undefined') lucide.createIcons();
        }
    } catch (e) {
        showToast('❌ Bağlantı hatası!');
        btnStart.disabled = false;
        btnStart.innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Katılımcıyı Seç';
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
}

async function closeRaffleDisplay() {
    try {
        await fetch('/api/raffle/close', { method: 'POST' });
        showToast('⏹️ Katılımcı seçimi ekranı kapatıldı.');

        // Formu sıfırla
        document.getElementById('btn-raffle-start').style.display = 'flex';
        document.getElementById('btn-raffle-start').disabled = false;
        document.getElementById('btn-raffle-start').innerHTML = '<i data-lucide="party-popper" style="width:20px;height:20px;"></i> Sıradaki Katılımcıyı Seç';
        if (typeof lucide !== 'undefined') lucide.createIcons();
        document.getElementById('btn-raffle-close').style.display = 'none';

        // Seçim varsa kapat
    } catch (e) {
        showToast('Hata oluştu');
    }
}

async function resetRaffleMemory() {
    if (!confirm('Seçim hafızasını sıfırlamak ve aynı katılımcıların yeniden seçilebilmesine izin vermek istediğinizden emin misiniz?')) return;
    try {
        const res = await fetch('/api/raffle/reset', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast('🔄 Seçim hafızası sıfırlandı.');
            document.getElementById('raffle-results-list').innerHTML = '';
            document.getElementById('raffle-results-container').style.display = 'none';
        }
    } catch (e) {
        showToast('Hata oluştu');
    }
}


// ─── STATS (İSTATİSTİKLER) ───


async function loadStats() {
    try {
        const res = await fetch('/api/stats');
        const data = await res.json();

        if (data.success) {
            const stats = data.stats;

            // Özet Kartları
            const sToday = document.getElementById('stat-today-2');
            const sMonth = document.getElementById('stat-month');
            const sTotal = document.getElementById('stat-total-2');
            if (sToday) sToday.textContent = stats.todayWishes;
            if (sMonth) sMonth.textContent = stats.thisMonthWishes;
            if (sTotal) sTotal.textContent = stats.totalWishes;

            // Tabloyu Doldur (Geçmiş Günler)
            const tbody = document.getElementById('stats-tbody');
            if (tbody) {
                if (stats.wishesByDate && stats.wishesByDate.length > 0) {
                    tbody.innerHTML = stats.wishesByDate.map(row =>
                        `<tr>
                            <td>${row.date}</td>
                            <td><span style="font-weight:600; color:var(--accent);">${row.count}</span> Mesaj</td>
                         </tr>`
                    ).join('');
                } else {
                    tbody.innerHTML = `<tr><td colspan="2" style="text-align:center;color:var(--text3)">Henüz Veri Yok</td></tr>`;
                }
            }

        }
    } catch (e) {
        console.error("Stats Error:", e);
        showToast("❌ İstatistikler çekilemedi!");
    }
}

// ─── TOAST ───
let toastTimer;
function showToast(msg) {
    const t = document.getElementById('toast');
    if (!t) return;
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2800);
}

// ─── QR CODE ───
(async function () {
    try {
        const url = PARTICIPATION_URL;

        const container = document.getElementById('qr-container');
        const urlEl = document.getElementById('qr-url');
        const hintEl = document.querySelector('#tab-qr .qr-hint');

        if (container) {
            container.innerHTML = '';
            const img = document.createElement('img');
            img.src = PARTICIPATION_QR_SRC;
            img.alt = 'Katılım QR kodu';
            img.style.cssText = 'width:180px;height:180px;display:block;';
            container.appendChild(img);
        }
        if (urlEl) urlEl.textContent = url;
        if (hintEl) {
            hintEl.innerHTML = 'ASELSAN HBTKON için mesajını paylaş; teknoloji ve güvenli geleceğe kendi izini bırak.';
        }
    } catch (err) {
        console.error("QR Code oluşturulamadı:", err);
    }
})();

// ─── PENDING WISHES ───
let pendingWishes = [];

async function loadPendingWishes() {
    try {
        const res = await fetch('/api/pending-wishes');
        pendingWishes = await res.json();
        renderPendingWishes();
        updatePendingBadge();
    } catch (e) {
        console.error('Bekleyen mesajlar yüklenemedi:', e);
    }
}

function renderPendingWishes() {
    const tbody = document.getElementById('pending-tbody');
    const empty = document.getElementById('pending-empty');
    const approveAllBtn = document.getElementById('btn-approve-all');

    if (!pendingWishes.length) {
        if (tbody) tbody.parentElement.parentElement.style.display = 'none';
        if (empty) empty.style.display = 'block';
        if (approveAllBtn) approveAllBtn.style.display = 'none';
        return;
    }

    if (tbody) {
        tbody.parentElement.parentElement.style.display = 'block';
        tbody.innerHTML = pendingWishes.map(w => `
        <tr>
            <td style="font-weight:600;">${w.childName}</td>
            <td><div class="ocr-text" title="${(w.wishText || '').replace(/"/g, '&quot;')}">${w.wishText || '<span style="color:var(--text3);font-style:italic">Metin yok</span>'}</div></td>
            <td style="color:var(--text2);font-size:13px">${formatTime(w.timestamp)}</td>
            <td>
                <div style="display:flex; gap:6px;">
                    <button class="btn btn-primary" onclick="approveWish('${w.id}')" style="padding:6px 12px; font-size:12px;"><i data-lucide="check" style="width:14px;height:14px;"></i> Onayla</button>
                    <button class="btn btn-danger" onclick="rejectWish('${w.id}')" style="padding:6px 12px; font-size:12px;"><i data-lucide="x" style="width:14px;height:14px;"></i> Reddet</button>
                </div>
            </td>
        </tr>
        `).join('');
        if (typeof lucide !== 'undefined') lucide.createIcons();
    }
    if (empty) empty.style.display = 'none';
    if (approveAllBtn) approveAllBtn.style.display = '';
}

function updatePendingBadge() {
    const badge = document.getElementById('pending-badge');
    if (badge) {
        if (pendingWishes.length > 0) {
            badge.textContent = pendingWishes.length;
            badge.style.display = 'inline';
        } else {
            badge.style.display = 'none';
        }
    }
}

async function approveWish(id) {
    try {
        const res = await fetch(`/api/wishes/${id}/approve`, { method: 'POST' });
        if (res.ok) {
            showToast('Mesaj onaylandı ✅');
            loadPendingWishes();
            loadWishes();
        } else {
            showToast('Onaylama hatası', 'error');
        }
    } catch (e) {
        showToast('Bağlantı hatası', 'error');
    }
}

async function rejectWish(id) {
    try {
        const res = await fetch(`/api/wishes/${id}/reject`, { method: 'POST' });
        if (res.ok) {
            showToast('Mesaj yayına alınmadı 🚫');
            loadPendingWishes();
        } else {
            showToast('Reddetme hatası', 'error');
        }
    } catch (e) {
        showToast('Bağlantı hatası', 'error');
    }
}

async function approveAllPending() {
    if (!pendingWishes.length) return;
    try {
        const res = await fetch('/api/pending-wishes/approve-all', { method: 'POST' });
        const data = await res.json();
        if (data.success) {
            showToast(`${data.count} mesaj toplu onaylandı ✅`);
            loadPendingWishes();
            loadWishes();
        }
    } catch (e) {
        showToast('Toplu onay hatası', 'error');
    }
}


// ─── INIT ───
loadWishes();
loadPendingWishes();
loadCurrentTheme();
loadModerationState();
loadDisplaySettings();
initQrPreviewControls();

async function setDisplayMode(mode) {
    await fetch('/api/display-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayMode: mode })
    });
    document.querySelectorAll('.display-mode-option').forEach((button) => {
        button.classList.toggle('active', button.dataset.mode === mode);
    });
    syncDisplaySettingsModeUI(mode);
    showToast('Gosterim modu degistirildi!');
}

async function loadCurrentDisplayMode() {
    try {
        const res = await fetch('/api/display-mode');
        const data = await res.json();
        document.querySelectorAll('.display-mode-option').forEach((button) => {
            button.classList.toggle('active', button.dataset.mode === data.displayMode);
        });
        syncDisplaySettingsModeUI(data.displayMode);
    } catch (e) { }
}

loadCurrentDisplayMode();
