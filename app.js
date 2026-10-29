const path = require('path');
const fs = require('fs');
const multer = require('multer');
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const db = require('./config/database');

const app = express();
const PORT = 3000;

// ===================== KONFIGURASI UPLOAD DOKUMENTASI =====================
const uploadDir = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, uploadDir);
    },
    filename: function (req, file, cb) {
        const ext = path.extname(file.originalname).toLowerCase();
        const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
        const uniqueName = `doc-${Date.now()}-${cleanName.substring(0, 20)}${ext}`;
        cb(null, uniqueName);
    }
});

const upload = multer({
    storage: storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB
    fileFilter: function (req, file, cb) {
        const allowedMime = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
        if (allowedMime.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Hanya file gambar (JPG, PNG, WEBP, GIF) yang diperbolehkan!'));
        }
    }
});

// ===================== MIDDLEWARE =====================
app.use(express.static('public', { extensions: ['html'] }));
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

app.use(session({
    secret: 'itales-secret-key-2026',
    resave: false,
    saveUninitialized: false,
    cookie: { maxAge: 1000 * 60 * 60 * 8 } // 8 jam
}));

// ===================== AUTO-CREATE TABEL PENGUMUMAN =====================
db.query(`
    CREATE TABLE IF NOT EXISTS pengumuman (
        id_pengumuman INT AUTO_INCREMENT PRIMARY KEY,
        judul VARCHAR(255) NOT NULL,
        kategori ENUM('Penting', 'Agenda', 'Libur', 'Prestasi', 'Umum') DEFAULT 'Umum',
        isi TEXT NOT NULL,
        tanggal DATE NOT NULL,
        penulis VARCHAR(100) DEFAULT 'Admin TK Siber',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
`, (err) => {
    if (err) {
        console.error('Gagal membuat tabel pengumuman:', err.message);
    } else {
        console.log('Tabel pengumuman siap! ✅');
        // Seed contoh data jika tabel masih kosong
        db.query('SELECT COUNT(*) AS total FROM pengumuman', (cntErr, rows) => {
            if (!cntErr && rows && rows[0].total === 0) {
                const initialData = [
                    ['Penerimaan Peserta Didik Baru (PPDB) T.A 2026/2027 Dibuka', 'Penting', 'TK Siber UINSSC resmi membuka pendaftaran peserta didik baru untuk tahun ajaran 2026/2027. Kuota terbatas untuk kelompok belajar TK A dan TK B. Orang tua dapat mengambil formulir fisik di kantor administrasi atau menghubungi hotline sekolah.', '2026-10-22', 'Admin TK Siber'],
                    ['Agenda Senam Ceria & Pemeriksaan Gigi Bersama Puskesmas', 'Agenda', 'Dalam rangka menjaga kesehatan dan kebugaran anak, pada hari Jumat mendatang akan diadakan kegiatan senam bersama dilanjutkan pemeriksaan kesehatan gigi rutin. Mohon anak-anak mengenakan seragam olahraga.', '2026-10-27', 'Admin TK Siber'],
                    ['Selamat! Ananda Juara 1 Lomba Mewarnai Tingkat Gugus Paud', 'Prestasi', 'Alhamdulillah, selamat dan sukses kepada ananda perwakilan TK B yang berhasil meraih Juara 1 dalam Festival Kreativitas Anak Usia Dini tingkat gugus. Semoga menjadi motivasi bagi teman-teman lainnya!', '2026-10-18', 'Admin TK Siber'],
                    ['Pemberitahuan Kegiatan Libur Bersama Akhir Pekan Panjang', 'Libur', 'Diberitahukan kepada seluruh bapak/ibu wali murid bahwa kegiatan pembelajaran tatap muka akan diliburkan sesuai kalender pendidikan nasional dan aktif kembali seperti biasa pada hari Senin berikutnya.', '2026-10-14', 'Admin TK Siber']
                ];
                db.query(
                    'INSERT INTO pengumuman (judul, kategori, isi, tanggal, penulis) VALUES ?',
                    [initialData],
                    (insErr) => {
                        if (insErr) console.error('Gagal seed pengumuman:', insErr.message);
                        else console.log('Data awal pengumuman berhasil ditambahkan! 📢');
                    }
                );
            }
        });
    }
});

// ===================== AUTH GUARD =====================
function setNoCache(res) {
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
}

function requireLogin(req, res, next) {
    setNoCache(res);
    if (!req.session.user) return res.redirect('/login');
    next();
}

// Khusus untuk endpoint API: return 401 JSON, bukan redirect
// Ini penting agar fetch() di frontend bisa deteksi status 401 dengan benar
function requireAuth(req, res, next) {
    setNoCache(res);
    if (!req.session.user) return res.status(401).json({ error: 'Unauthorized' });
    next();
}

function requireRole(...roles) {
    return (req, res, next) => {
        setNoCache(res);
        if (!req.session.user) return res.redirect('/login');
        if (!roles.includes(req.session.user.role)) return res.redirect('/login');
        next();
    };
}

// ===================== HALAMAN =====================

// Redirect root ke login kalau belum login
app.get('/', (req, res, next) => {
    // serve index.html (tamu) via static, tapi kalau sudah login redirect ke dashboard
    if (req.session.user) {
        if (req.session.user.role === 'admin') return res.redirect('/dashboard-admin');
        if (req.session.user.role === 'guru') return res.redirect('/dashboard-guru');
        if (req.session.user.role === 'orang_tua') return res.redirect('/dashboard-ortu');
    }
    next(); // lanjutkan ke static (index.html)
});

// Proteksi halaman internal
app.get('/dashboard-guru', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-guru/index.html');
});

app.get('/kelola-jadwal', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-jadwal/index.html');
});

app.get('/kelola-anak', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-anak/index.html');
});

app.get('/kelola-logbook', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-logbook/index.html');
});

app.get('/detail-logbook', requireRole('admin', 'guru'), (req, res) => {
    res.sendFile(__dirname + '/public/detail-logbook/index.html');
});

app.get('/dashboard-ortu', requireRole('admin', 'orang_tua'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-ortu/index.html');
});

app.get('/dashboard-admin', requireRole('admin'), (req, res) => {
    res.sendFile(__dirname + '/public/dashboard-admin/index.html');
});

app.get('/kelola-akun', requireRole('admin'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-akun/index.html');
});

app.get('/kelola-pengumuman', requireRole('admin'), (req, res) => {
    res.sendFile(__dirname + '/public/kelola-pengumuman/index.html');
});

// ===================== AUTH ROUTES =====================

// ===================== ANTI BRUTE FORCE =====================
const loginAttempts = new Map(); // key: IP/username -> { count, lockedUntil }
const MAX_ATTEMPTS = 5;
const LOCKOUT_TIME_MS = 5 * 60 * 1000; // 5 menit

function checkBruteForce(identifier) {
    const record = loginAttempts.get(identifier);
    if (!record) return { blocked: false };

    if (record.lockedUntil && Date.now() < record.lockedUntil) {
        const remainingMinutes = Math.ceil((record.lockedUntil - Date.now()) / (60 * 1000));
        return { 
            blocked: true, 
            message: `Akun/Akses terkunci sementara (Anti Brute Force). Silakan coba lagi dalam ${remainingMinutes} menit.` 
        };
    }

    // Jika lockout sudah lewat, hapus record
    if (record.lockedUntil && Date.now() >= record.lockedUntil) {
        loginAttempts.delete(identifier);
        return { blocked: false };
    }

    return { blocked: false, attempts: record.count };
}

function recordFailedAttempt(identifier) {
    let record = loginAttempts.get(identifier) || { count: 0, lockedUntil: null };
    record.count += 1;
    if (record.count >= MAX_ATTEMPTS) {
        record.lockedUntil = Date.now() + LOCKOUT_TIME_MS;
    }
    loginAttempts.set(identifier, record);
    return record;
}

function resetLoginAttempts(identifier) {
    loginAttempts.delete(identifier);
}

// ===================== MATH CAPTCHA (PENJUMLAHAN SEDERHANA) =====================
// GET /api/captcha-math — generate soal matematika acak & simpan jawaban di session
app.get('/api/captcha-math', (req, res) => {
    const num1 = Math.floor(Math.random() * 9) + 1;
    const num2 = Math.floor(Math.random() * 9) + 1;
    req.session.captcha_math = num1 + num2;
    res.json({ question: `${num1} + ${num2} =` });
});

// POST /login (dengan Proteksi Anti Brute Force & Captcha Matematika)
app.post('/login', (req, res) => {
    const { username, password, captcha } = req.body;
    const clientIp = req.ip || req.connection.remoteAddress || 'client';
    const rateKey = `${clientIp}_${(username || '').toLowerCase()}`;

    // 1. Cek Anti Brute Force
    const bruteCheck = checkBruteForce(rateKey);
    if (bruteCheck.blocked) {
        return res.redirect(`/login?error=${encodeURIComponent(bruteCheck.message)}`);
    }

    if (!username || !password) {
        return res.redirect('/login?error=Username+dan+password+wajib+diisi');
    }

    // 2. Cek Captcha Penjumlahan (Server-Side)
    const sessionAnswer = req.session.captcha_math;
    if (sessionAnswer === undefined || parseInt(captcha) !== parseInt(sessionAnswer)) {
        const failRecord = recordFailedAttempt(rateKey);
        req.session.captcha_math = null; // Reset captcha

        if (failRecord.lockedUntil) {
            return res.redirect('/login?error=Terlalu+banyak+kesalahan+(Anti+Brute+Force).+Akses+dikunci+selama+5+menit.');
        }

        const sisa = MAX_ATTEMPTS - failRecord.count;
        return res.redirect(`/login?error=${encodeURIComponent(`Hasil captcha salah! (Sisa percobaan: ${sisa}x)`)}`);
    }

    // Reset captcha setelah verifikasi captcha lewat
    req.session.captcha_math = null;

    // 3. Cek Akun di Database
    const query = `SELECT * FROM users WHERE username = ? LIMIT 1`;

    db.query(query, [username], async (err, results) => {
        if (err) {
            console.error('Login error:', err);
            return res.redirect('/login?error=Terjadi+kesalahan+server');
        }

        if (results.length === 0) {
            const failRecord = recordFailedAttempt(rateKey);
            if (failRecord.lockedUntil) {
                return res.redirect('/login?error=Terlalu+banyak+kesalahan+(Anti+Brute+Force).+Akses+dikunci+selama+5+menit.');
            }
            const sisa = MAX_ATTEMPTS - failRecord.count;
            return res.redirect(`/login?error=${encodeURIComponent(`Username atau password salah! (Sisa percobaan: ${sisa}x)`)}`);
        }

        const user = results[0];

        // 4. Verifikasi Password
        const valid = await bcrypt.compare(password, user.password);
        if (!valid) {
            const failRecord = recordFailedAttempt(rateKey);
            if (failRecord.lockedUntil) {
                return res.redirect('/login?error=Terlalu+banyak+kesalahan+(Anti+Brute+Force).+Akses+dikunci+selama+5+menit.');
            }
            const sisa = MAX_ATTEMPTS - failRecord.count;
            return res.redirect(`/login?error=${encodeURIComponent(`Username atau password salah! (Sisa percobaan: ${sisa}x)`)}`);
        }

        // Login Sukses! Reset record percobaan gagal
        resetLoginAttempts(rateKey);

        // Set session
        req.session.user = {
            id: user.id_user,
            username: user.username,
            role: user.role,
            id_anak: user.id_anak
        };

        // Redirect sesuai role
        if (user.role === 'admin') return res.redirect('/dashboard-admin');
        if (user.role === 'guru') return res.redirect('/dashboard-guru');
        if (user.role === 'orang_tua') return res.redirect('/dashboard-ortu');

        return res.redirect('/');
    });
});

// GET & POST /logout — logout bersih dan hapus cookie
app.all('/logout', (req, res) => {
    setNoCache(res);
    req.session.destroy((err) => {
        res.clearCookie('connect.sid', { path: '/' });
        res.redirect('/login');
    });
});

// GET /api/me — info user yang login (untuk dipakai di frontend)
// Pakai requireAuth agar return 401 JSON (bukan redirect) saat tidak ada session
app.get('/api/me', requireAuth, (req, res) => {
    res.json(req.session.user);
});

// ===================== API JADWAL =====================

// GET /api/jadwal-hari-ini (untuk halaman tamu & dashboard)
app.get('/api/jadwal-hari-ini', (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

    const query = `
        SELECT
            jadwal.id_jadwal,
            jadwal.jam_mulai,
            jadwal.jam_selesai,
            jadwal.kegiatan,
            jadwal.keterangan,
            kelas.nama_kelas
        FROM jadwal
        JOIN kelas ON jadwal.id_kelas = kelas.id_kelas
        WHERE jadwal.hari = ?
        ORDER BY jadwal.jam_mulai
    `;

    db.query(query, [hariSekarang], (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil jadwal' });
        res.json({ hari: hariSekarang, jadwal: results });
    });
});

// GET /api/jadwal-mingguan (publik untuk landing page tamu agar seminggu terlihat & hari ini di-highlight)
app.get('/api/jadwal-mingguan', (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

    const query = `
        SELECT
            jadwal.id_jadwal,
            jadwal.id_kelas,
            jadwal.hari,
            jadwal.jam_mulai,
            jadwal.jam_selesai,
            jadwal.kegiatan,
            jadwal.keterangan,
            kelas.nama_kelas
        FROM jadwal
        JOIN kelas ON jadwal.id_kelas = kelas.id_kelas
        ORDER BY FIELD(jadwal.hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'), jadwal.jam_mulai
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching jadwal mingguan:', err);
            return res.status(500).json({ error: 'Gagal mengambil jadwal mingguan' });
        }
        res.json({
            hari_ini: hariSekarang,
            jadwal: results || []
        });
    });
});

// ===================== API MENU MAKAN =====================

// GET /api/menu-makan (publik untuk landing page & dashboard)
app.get('/api/menu-makan', (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });
    const query = `
        SELECT id_menu, hari, menu, keterangan 
        FROM menu_makan 
        ORDER BY FIELD(hari, 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat')
    `;

    db.query(query, (err, results) => {
        if (err) {
            console.error('Error fetching menu makan:', err);
            return res.status(500).json({ error: 'Gagal mengambil menu makan' });
        }
        const menuHariIni = (results || []).find(m => m.hari.toLowerCase() === hariSekarang.toLowerCase()) || null;
        res.json({
            hari_ini: hariSekarang,
            menu_hari_ini: menuHariIni,
            menu_mingguan: results || []
        });
    });
});

// PUT /api/menu-makan/:id (khusus guru & admin update 1 item menu)
app.put('/api/menu-makan/:id', requireRole('admin', 'guru'), (req, res) => {
    const { menu, keterangan } = req.body;
    if (!menu) {
        return res.status(400).json({ error: 'Nama menu wajib diisi' });
    }

    const query = `UPDATE menu_makan SET menu = ?, keterangan = ? WHERE id_menu = ?`;
    db.query(query, [menu, keterangan || null, req.params.id], (err, result) => {
        if (err) {
            console.error('Error update menu makan:', err);
            return res.status(500).json({ error: 'Gagal memperbarui menu makan' });
        }
        res.json({ success: true, message: 'Menu makan berhasil diperbarui' });
    });
});

// POST /api/menu-makan/bulk (khusus guru & admin simpan / update semua menu mingguan)
app.post('/api/menu-makan/bulk', requireRole('admin', 'guru'), async (req, res) => {
    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
        return res.status(400).json({ error: 'Data items tidak valid' });
    }

    try {
        for (const item of items) {
            if (item.hari && item.menu) {
                await new Promise((resolve, reject) => {
                    const sql = `
                        INSERT INTO menu_makan (hari, menu, keterangan) 
                        VALUES (?, ?, ?) 
                        ON DUPLICATE KEY UPDATE menu = VALUES(menu), keterangan = VALUES(keterangan)
                    `;
                    db.query(sql, [item.hari, item.menu, item.keterangan || null], (err, r) => {
                        if (err) reject(err);
                        else resolve(r);
                    });
                });
            }
        }
        res.json({ success: true, message: 'Semua menu makan berhasil diperbarui' });
    } catch (err) {
        console.error('Error bulk update menu makan:', err);
        res.status(500).json({ error: 'Gagal memperbarui menu makan' });
    }
});

// ===================== API PENGUMUMAN & BERITA =====================

// GET /api/pengumuman (publik - untuk landing page & admin)
app.get('/api/pengumuman', (req, res) => {
    const { kategori, limit } = req.query;
    let sql = `
        SELECT id_pengumuman, judul, kategori, isi, 
               DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal, 
               penulis, created_at 
        FROM pengumuman
    `;
    const params = [];

    if (kategori && kategori !== 'Semua') {
        sql += ` WHERE kategori = ?`;
        params.push(kategori);
    }

    sql += ` ORDER BY tanggal DESC, id_pengumuman DESC`;

    const limitVal = parseInt(limit, 10);
    if (!isNaN(limitVal) && limitVal > 0) {
        sql += ` LIMIT ?`;
        params.push(limitVal);
    }

    db.query(sql, params, (err, rows) => {
        if (err) {
            console.error('Error ambil pengumuman:', err);
            return res.status(500).json({ error: 'Gagal mengambil data pengumuman' });
        }
        res.json(rows || []);
    });
});

// GET /api/pengumuman/:id
app.get('/api/pengumuman/:id', (req, res) => {
    const { id } = req.params;
    const sql = `
        SELECT id_pengumuman, judul, kategori, isi, 
               DATE_FORMAT(tanggal, '%Y-%m-%d') as tanggal, 
               penulis, created_at 
        FROM pengumuman 
        WHERE id_pengumuman = ?
    `;
    db.query(sql, [id], (err, rows) => {
        if (err || !rows || rows.length === 0) {
            return res.status(404).json({ error: 'Pengumuman tidak ditemukan' });
        }
        res.json(rows[0]);
    });
});

// POST /api/pengumuman (khusus admin)
app.post('/api/pengumuman', requireRole('admin'), (req, res) => {
    const { judul, kategori, isi, tanggal, penulis } = req.body;
    if (!judul || !isi || !tanggal) {
        return res.status(400).json({ error: 'Judul, isi, dan tanggal wajib diisi' });
    }

    const kategoriFix = kategori || 'Umum';
    const penulisFix = penulis || req.session.user.nama || 'Admin TK Siber';

    const sql = `INSERT INTO pengumuman (judul, kategori, isi, tanggal, penulis) VALUES (?, ?, ?, ?, ?)`;
    db.query(sql, [judul, kategoriFix, isi, tanggal, penulisFix], (err, result) => {
        if (err) {
            console.error('Error tambah pengumuman:', err);
            return res.status(500).json({ error: 'Gagal menambahkan pengumuman' });
        }
        res.json({ success: true, message: 'Pengumuman berhasil diterbitkan', id: result.insertId });
    });
});

// PUT /api/pengumuman/:id (khusus admin)
app.put('/api/pengumuman/:id', requireRole('admin'), (req, res) => {
    const { id } = req.params;
    const { judul, kategori, isi, tanggal, penulis } = req.body;
    if (!judul || !isi || !tanggal) {
        return res.status(400).json({ error: 'Judul, isi, dan tanggal wajib diisi' });
    }

    const kategoriFix = kategori || 'Umum';
    const penulisFix = penulis || req.session.user.nama || 'Admin TK Siber';

    const sql = `UPDATE pengumuman SET judul = ?, kategori = ?, isi = ?, tanggal = ?, penulis = ? WHERE id_pengumuman = ?`;
    db.query(sql, [judul, kategoriFix, isi, tanggal, penulisFix, id], (err, result) => {
        if (err) {
            console.error('Error update pengumuman:', err);
            return res.status(500).json({ error: 'Gagal memperbarui pengumuman' });
        }
        res.json({ success: true, message: 'Pengumuman berhasil diperbarui' });
    });
});

// DELETE /api/pengumuman/:id (khusus admin)
app.delete('/api/pengumuman/:id', requireRole('admin'), (req, res) => {
    const { id } = req.params;
    const sql = `DELETE FROM pengumuman WHERE id_pengumuman = ?`;
    db.query(sql, [id], (err, result) => {
        if (err) {
            console.error('Error hapus pengumuman:', err);
            return res.status(500).json({ error: 'Gagal menghapus pengumuman' });
        }
        res.json({ success: true, message: 'Pengumuman berhasil dihapus' });
    });
});

// GET /api/jadwal?hari=Senin&kelas=1
app.get('/api/jadwal', requireLogin, (req, res) => {
    const { hari, kelas } = req.query;
    let query = `
        SELECT jadwal.*, kelas.nama_kelas
        FROM jadwal
        JOIN kelas ON jadwal.id_kelas = kelas.id_kelas
        WHERE 1=1
    `;
    const params = [];

    if (hari) { query += ` AND jadwal.hari = ?`; params.push(hari); }
    if (kelas) { query += ` AND jadwal.id_kelas = ?`; params.push(kelas); }
    query += ` ORDER BY jadwal.jam_mulai`;

    db.query(query, params, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil jadwal' });
        res.json(results);
    });
});

// POST /api/jadwal
app.post('/api/jadwal', requireRole('admin', 'guru'), (req, res) => {
    const { id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan } = req.body;
    if (!id_kelas || !hari || !jam_mulai || !jam_selesai || !kegiatan) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    const query = `INSERT INTO jadwal (id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan) VALUES (?, ?, ?, ?, ?, ?)`;
    db.query(query, [id_kelas, hari, jam_mulai, jam_selesai, kegiatan, keterangan || null], (err, result) => {
        if (err) return res.status(500).json({ error: 'Gagal menambah jadwal' });
        res.json({ success: true, id: result.insertId });
    });
});

// PUT /api/jadwal/:id
app.put('/api/jadwal/:id', requireRole('admin', 'guru'), (req, res) => {
    const { id } = req.params;
    const { hari, jam_mulai, jam_selesai, kegiatan, keterangan } = req.body;

    const query = `UPDATE jadwal SET hari=?, jam_mulai=?, jam_selesai=?, kegiatan=?, keterangan=? WHERE id_jadwal=?`;
    db.query(query, [hari, jam_mulai, jam_selesai, kegiatan, keterangan || null, id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal update jadwal' });
        res.json({ success: true });
    });
});

// DELETE /api/jadwal/:id
app.delete('/api/jadwal/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`DELETE FROM jadwal WHERE id_jadwal = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus jadwal' });
        res.json({ success: true });
    });
});

// ===================== API ANAK =====================

// GET /api/anak
app.get('/api/anak', requireLogin, (req, res) => {
    const query = `
        SELECT anak.*, kelas.nama_kelas
        FROM anak
        JOIN kelas ON anak.id_kelas = kelas.id_kelas
        ORDER BY kelas.nama_kelas, anak.nama_lengkap
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data anak' });
        res.json(results);
    });
});

// POST /api/anak
app.post('/api/anak', requireRole('admin', 'guru'), (req, res) => {
    const { nama_lengkap, nama_panggilan, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    const panggilanFix = (nama_panggilan || nama_lengkap.split(' ')[0] || 'anak').trim();

    db.query(
        `INSERT INTO anak (nama_lengkap, nama_panggilan, nisn, jenis_kelamin, id_kelas) VALUES (?, ?, ?, ?, ?)`,
        [nama_lengkap, panggilanFix, nisn, jenis_kelamin, id_kelas],
        async (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal tambah anak' });
            }

            const idAnakBaru = result.insertId;

            // Otomatis buatkan akun orang tua dengan username & password awal = nama panggilan
            try {
                let baseUsername = panggilanFix.toLowerCase().replace(/[^a-z0-9]/g, '');
                if (!baseUsername) baseUsername = `ortu${idAnakBaru}`;

                db.query(`SELECT id_user FROM users WHERE username = ?`, [baseUsername], async (uErr, uRows) => {
                    let finalUsername = baseUsername;
                    if (!uErr && uRows && uRows.length > 0) {
                        finalUsername = `${baseUsername}${idAnakBaru}`;
                    }

                    const defaultHash = await bcrypt.hash(panggilanFix.toLowerCase(), 10);
                    db.query(
                        `INSERT INTO users (username, password, role, id_anak) VALUES (?, ?, 'orang_tua', ?)`,
                        [finalUsername, defaultHash, idAnakBaru],
                        (insUErr) => {
                            if (insUErr) console.error('Gagal auto-create akun ortu:', insUErr.message);
                            else console.log(`Akun ortu otomatis dibuat: ${finalUsername} / ${panggilanFix.toLowerCase()}`);
                        }
                    );
                });
            } catch (e) {}

            res.json({ success: true, id: idAnakBaru, username_ortu: panggilanFix.toLowerCase() });
        }
    );
});

// PUT /api/anak/:id
app.put('/api/anak/:id', requireRole('admin', 'guru'), (req, res) => {
    const { nama_lengkap, nama_panggilan, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    const panggilanFix = (nama_panggilan || nama_lengkap.split(' ')[0] || '').trim();

    db.query(
        `UPDATE anak SET nama_lengkap=?, nama_panggilan=?, nisn=?, jenis_kelamin=?, id_kelas=? WHERE id_anak=?`,
        [nama_lengkap, panggilanFix, nisn, jenis_kelamin, id_kelas, req.params.id],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal update data anak' });
            }
            res.json({ success: true });
        }
    );
});

// PUT /api/user/ganti-password — ganti password sendiri (khususnya untuk Orang Tua)
app.put('/api/user/ganti-password', requireLogin, async (req, res) => {
    const { password_baru, konfirmasi_password } = req.body;
    if (!password_baru || !konfirmasi_password) {
        return res.status(400).json({ error: 'Password baru dan konfirmasi wajib diisi' });
    }
    if (password_baru.length < 4) {
        return res.status(400).json({ error: 'Password minimal 4 karakter' });
    }
    if (password_baru !== konfirmasi_password) {
        return res.status(400).json({ error: 'Konfirmasi password tidak cocok' });
    }

    try {
        const hashed = await bcrypt.hash(password_baru, 10);
        const userId = req.session.user.id;
        db.query(`UPDATE users SET password = ? WHERE id_user = ?`, [hashed, userId], (err) => {
            if (err) {
                console.error('Error ganti password:', err);
                return res.status(500).json({ error: 'Gagal mengubah password' });
            }
            res.json({ success: true, message: 'Password Anda berhasil diperbarui!' });
        });
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/anak/:id
app.delete('/api/anak/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`DELETE FROM anak WHERE id_anak = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus anak' });
        res.json({ success: true });
    });
});

// ===================== API KELAS =====================

app.get('/api/kelas', requireLogin, (req, res) => {
    db.query(`SELECT * FROM kelas ORDER BY nama_kelas`, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data kelas' });
        res.json(results);
    });
});

// ===================== API LOGBOOK =====================

// GET /api/logbook?tanggal=...&kelas=...
app.get('/api/logbook', requireLogin, (req, res) => {
    const { tanggal, kelas } = req.query;
    let query = `
        SELECT 
            l.id_logbook,
            l.id_kelas,
            DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal,
            l.created_by,
            l.created_at,
            k.nama_kelas,
            (SELECT COUNT(*) FROM kegiatan_logbook kl WHERE kl.id_logbook = l.id_logbook) AS jumlah_kegiatan,
            (SELECT COUNT(*) FROM catatan_anak ca WHERE ca.id_logbook = l.id_logbook) AS jumlah_catatan,
            (SELECT COUNT(*) FROM dokumentasi d WHERE d.id_logbook = l.id_logbook) AS jumlah_dokumentasi,
            (SELECT kl2.judul FROM kegiatan_logbook kl2 WHERE kl2.id_logbook = l.id_logbook ORDER BY kl2.urutan ASC, kl2.id_kegiatan ASC LIMIT 1) AS kegiatan_pertama
        FROM logbook l
        JOIN kelas k ON l.id_kelas = k.id_kelas
        WHERE 1=1
    `;
    const params = [];

    if (tanggal) {
        query += ` AND DATE(l.tanggal) = ?`;
        params.push(tanggal);
    }
    if (kelas) {
        query += ` AND l.id_kelas = ?`;
        params.push(kelas);
    }

    query += ` ORDER BY l.tanggal DESC, l.id_logbook DESC`;

    db.query(query, params, (err, results) => {
        if (err) {
            console.error('Error get logbook:', err);
            return res.status(500).json({ error: 'Gagal mengambil data logbook' });
        }
        res.json(results);
    });
});

// GET /api/logbook/:id
app.get('/api/logbook/:id', requireLogin, (req, res) => {
    const id = req.params.id;
    const queryLogbook = `
        SELECT l.id_logbook, l.id_kelas, DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal,
               l.created_by, l.created_at, k.nama_kelas, u.username AS created_by_name
        FROM logbook l
        JOIN kelas k ON l.id_kelas = k.id_kelas
        LEFT JOIN users u ON l.created_by = u.id_user
        WHERE l.id_logbook = ?
    `;

    db.query(queryLogbook, [id], (err, lbResults) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil logbook' });
        if (lbResults.length === 0) return res.status(404).json({ error: 'Logbook tidak ditemukan' });

        const logbook = lbResults[0];

        const queryKegiatan = `
            SELECT * FROM kegiatan_logbook 
            WHERE id_logbook = ? 
            ORDER BY urutan ASC, id_kegiatan ASC
        `;

        const queryCatatan = `
            SELECT ca.*, a.nama_lengkap AS nama_anak
            FROM catatan_anak ca
            JOIN anak a ON ca.id_anak = a.id_anak
            WHERE ca.id_logbook = ?
            ORDER BY a.nama_lengkap ASC
        `;

        const queryDokumentasi = `
            SELECT d.*, a.nama_lengkap AS nama_anak 
            FROM dokumentasi d
            LEFT JOIN anak a ON d.id_anak = a.id_anak
            WHERE d.id_logbook = ?
            ORDER BY d.id_dokumentasi DESC
        `;

        db.query(queryKegiatan, [id], (errK, kegiatans) => {
            if (errK) return res.status(500).json({ error: 'Gagal mengambil kegiatan' });

            db.query(queryCatatan, [id], (errC, catatans) => {
                if (errC) return res.status(500).json({ error: 'Gagal mengambil catatan anak' });

                db.query(queryDokumentasi, [id], (errD, docs) => {
                    if (errD) return res.status(500).json({ error: 'Gagal mengambil dokumentasi' });

                    res.json({
                        logbook,
                        kegiatan: kegiatans || [],
                        catatan: catatans || [],
                        dokumentasi: docs || []
                    });
                });
            });
        });
    });
});

// POST /api/logbook
app.post('/api/logbook', requireRole('admin', 'guru'), (req, res) => {
    const { id_kelas, tanggal, kegiatan } = req.body;
    const created_by = req.session.user ? req.session.user.id : 1;

    if (!id_kelas || !tanggal) {
        return res.status(400).json({ error: 'Kelas dan Tanggal wajib diisi' });
    }

    const query = `INSERT INTO logbook (id_kelas, tanggal, created_by) VALUES (?, ?, ?)`;
    db.query(query, [id_kelas, tanggal, created_by], (err, result) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Logbook untuk kelas dan tanggal tersebut sudah ada' });
            }
            console.error('Error insert logbook:', err);
            return res.status(500).json({ error: 'Gagal menambahkan logbook' });
        }

        const id_logbook = result.insertId;

        if (Array.isArray(kegiatan) && kegiatan.length > 0) {
            const values = kegiatan.map((k, idx) => [
                id_logbook,
                k.kategori || 'Umum',
                k.judul || '-',
                k.deskripsi || '',
                k.urutan !== undefined ? k.urutan : idx
            ]);

            const queryKegiatan = `
                INSERT INTO kegiatan_logbook (id_logbook, kategori, judul, deskripsi, urutan)
                VALUES ?
            `;
            db.query(queryKegiatan, [values], (errK) => {
                if (errK) console.error('Error insert kegiatan_logbook:', errK);
                res.json({ success: true, id_logbook });
            });
        } else {
            res.json({ success: true, id_logbook });
        }
    });
});

// PUT /api/logbook/:id
app.put('/api/logbook/:id', requireRole('admin', 'guru'), (req, res) => {
    const { id } = req.params;
    const { id_kelas, tanggal, kegiatan } = req.body;

    if (!id_kelas || !tanggal) {
        return res.status(400).json({ error: 'Kelas dan Tanggal wajib diisi' });
    }

    const queryUpdate = `UPDATE logbook SET id_kelas = ?, tanggal = ? WHERE id_logbook = ?`;
    db.query(queryUpdate, [id_kelas, tanggal, id], (err) => {
        if (err) {
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Logbook untuk kelas dan tanggal tersebut sudah ada' });
            }
            console.error('Error update logbook:', err);
            return res.status(500).json({ error: 'Gagal memperbarui logbook' });
        }

        if (Array.isArray(kegiatan)) {
            db.query(`DELETE FROM kegiatan_logbook WHERE id_logbook = ?`, [id], (errDel) => {
                if (errDel) console.error('Error delete old kegiatan:', errDel);

                if (kegiatan.length > 0) {
                    const values = kegiatan.map((k, idx) => [
                        id,
                        k.kategori || 'Umum',
                        k.judul || '-',
                        k.deskripsi || '',
                        k.urutan !== undefined ? k.urutan : idx
                    ]);

                    const queryKegiatan = `
                        INSERT INTO kegiatan_logbook (id_logbook, kategori, judul, deskripsi, urutan)
                        VALUES ?
                    `;
                    db.query(queryKegiatan, [values], (errK) => {
                        if (errK) console.error('Error re-insert kegiatan:', errK);
                        res.json({ success: true });
                    });
                } else {
                    res.json({ success: true });
                }
            });
        } else {
            res.json({ success: true });
        }
    });
});

// DELETE /api/logbook/:id
app.delete('/api/logbook/:id', requireRole('admin', 'guru'), (req, res) => {
    const { id } = req.params;
    db.query(`DELETE FROM logbook WHERE id_logbook = ?`, [id], (err) => {
        if (err) {
            console.error('Error delete logbook:', err);
            return res.status(500).json({ error: 'Gagal menghapus logbook' });
        }
        res.json({ success: true });
    });
});

// ===================== API CATATAN ANAK =====================

// POST /api/catatan-anak
app.post('/api/catatan-anak', requireRole('admin', 'guru'), (req, res) => {
    const { id_logbook, id_anak, catatan } = req.body;
    if (!id_logbook || !id_anak || !catatan) {
        return res.status(400).json({ error: 'Logbook, Anak, dan Catatan wajib diisi' });
    }

    const query = `
        INSERT INTO catatan_anak (id_logbook, id_anak, catatan) 
        VALUES (?, ?, ?)
        ON DUPLICATE KEY UPDATE catatan = VALUES(catatan)
    `;
    db.query(query, [id_logbook, id_anak, catatan], (err, result) => {
        if (err) {
            console.error('Error insert catatan_anak:', err);
            return res.status(500).json({ error: 'Gagal menambahkan catatan anak' });
        }
        res.json({ success: true, id_catatan: result.insertId });
    });
});

// PUT /api/catatan-anak/:id
app.put('/api/catatan-anak/:id', requireRole('admin', 'guru'), (req, res) => {
    const { catatan } = req.body;
    if (!catatan) {
        return res.status(400).json({ error: 'Catatan wajib diisi' });
    }

    db.query(`UPDATE catatan_anak SET catatan = ? WHERE id_catatan = ?`, [catatan, req.params.id], (err) => {
        if (err) {
            console.error('Error update catatan_anak:', err);
            return res.status(500).json({ error: 'Gagal memperbarui catatan anak' });
        }
        res.json({ success: true });
    });
});

// DELETE /api/catatan-anak/:id
app.delete('/api/catatan-anak/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`DELETE FROM catatan_anak WHERE id_catatan = ?`, [req.params.id], (err) => {
        if (err) {
            console.error('Error delete catatan_anak:', err);
            return res.status(500).json({ error: 'Gagal menghapus catatan anak' });
        }
        res.json({ success: true });
    });
});

// ===================== API DOKUMENTASI =====================

// POST /api/dokumentasi/upload (Upload foto fisik via multipart/form-data)
app.post('/api/dokumentasi/upload', requireRole('admin', 'guru'), (req, res) => {
    upload.single('foto')(req, res, (err) => {
        if (err) {
            return res.status(400).json({ error: err.message || 'Gagal memproses upload file' });
        }

        if (!req.file) {
            return res.status(400).json({ error: 'File foto wajib dipilih' });
        }

        const { id_logbook, id_anak, keterangan } = req.body;
        if (!id_logbook) {
            try { fs.unlinkSync(req.file.path); } catch(e) {}
            return res.status(400).json({ error: 'ID Logbook wajib diisi' });
        }

        const fileName = req.file.filename;
        const anakVal = (id_anak && id_anak !== '' && id_anak !== 'null') ? parseInt(id_anak, 10) : null;
        const query = `INSERT INTO dokumentasi (id_logbook, id_anak, file_foto, keterangan) VALUES (?, ?, ?, ?)`;
        db.query(query, [id_logbook, anakVal, fileName, keterangan || null], (dbErr, result) => {
            if (dbErr) {
                console.error('Error insert dokumentasi:', dbErr);
                try { fs.unlinkSync(req.file.path); } catch(e) {}
                return res.status(500).json({ error: 'Gagal menyimpan dokumentasi ke database' });
            }

            res.json({
                success: true,
                message: 'Foto dokumentasi berhasil diunggah',
                id_dokumentasi: result.insertId,
                file_foto: fileName,
                id_anak: anakVal,
                keterangan: keterangan || ''
            });
        });
    });
});

// POST /api/dokumentasi (Fallback json text)
app.post('/api/dokumentasi', requireRole('admin', 'guru'), (req, res) => {
    const { id_logbook, id_anak, file_foto, keterangan } = req.body;
    if (!id_logbook || !file_foto) {
        return res.status(400).json({ error: 'Logbook dan File Foto wajib diisi' });
    }

    const anakVal = (id_anak && id_anak !== '' && id_anak !== 'null') ? parseInt(id_anak, 10) : null;
    const query = `INSERT INTO dokumentasi (id_logbook, id_anak, file_foto, keterangan) VALUES (?, ?, ?, ?)`;
    db.query(query, [id_logbook, anakVal, file_foto, keterangan || null], (err, result) => {
        if (err) {
            console.error('Error insert dokumentasi:', err);
            return res.status(500).json({ error: 'Gagal menambahkan dokumentasi' });
        }
        res.json({ success: true, id_dokumentasi: result.insertId });
    });
});

// DELETE /api/dokumentasi/:id
app.delete('/api/dokumentasi/:id', requireRole('admin', 'guru'), (req, res) => {
    db.query(`SELECT file_foto FROM dokumentasi WHERE id_dokumentasi = ?`, [req.params.id], (err, rows) => {
        if (!err && rows.length > 0) {
            const fileName = rows[0].file_foto;
            const filePath = path.join(uploadDir, fileName);
            if (fs.existsSync(filePath)) {
                try { fs.unlinkSync(filePath); } catch(e) {}
            }
        }

        db.query(`DELETE FROM dokumentasi WHERE id_dokumentasi = ?`, [req.params.id], (errD) => {
            if (errD) {
                console.error('Error delete dokumentasi:', errD);
                return res.status(500).json({ error: 'Gagal menghapus dokumentasi' });
            }
            res.json({ success: true, message: 'Dokumentasi berhasil dihapus' });
        });
    });
});

// GET /api/dokumentasi-hari-ini (Untuk Dashboard Guru & Ortu)
app.get('/api/dokumentasi-hari-ini', (req, res) => {
    const queryHariIni = `
        SELECT d.id_dokumentasi, d.id_logbook, d.file_foto, d.keterangan, l.tanggal, k.nama_kelas 
        FROM dokumentasi d
        JOIN logbook l ON d.id_logbook = l.id_logbook
        JOIN kelas k ON l.id_kelas = k.id_kelas
        WHERE l.tanggal = CURRENT_DATE()
        ORDER BY d.id_dokumentasi DESC
        LIMIT 6
    `;

    db.query(queryHariIni, (err, results) => {
        if (err) {
            console.error('Error get dokumentasi hari ini:', err);
            return res.status(500).json({ error: 'Gagal mengambil dokumentasi' });
        }

        if (results && results.length > 0) {
            return res.json({ tipe: 'hari_ini', dokumentasi: results });
        }

        // Jika hari ini belum ada, tampilkan 6 foto dokumentasi terbaru
        const queryTerbaru = `
            SELECT d.id_dokumentasi, d.id_logbook, d.file_foto, d.keterangan, l.tanggal, k.nama_kelas 
            FROM dokumentasi d
            JOIN logbook l ON d.id_logbook = l.id_logbook
            JOIN kelas k ON l.id_kelas = k.id_kelas
            ORDER BY l.tanggal DESC, d.id_dokumentasi DESC
            LIMIT 6
        `;
        db.query(queryTerbaru, (err2, results2) => {
            if (err2) return res.status(500).json({ error: 'Gagal mengambil dokumentasi terbaru' });
            res.json({ tipe: 'terbaru', dokumentasi: results2 || [] });
        });
    });
});

// ===================== API USERS (ADMIN) =====================

// GET /api/users
app.get('/api/users', requireRole('admin'), (req, res) => {
    const query = `
        SELECT u.id_user, u.username, u.role, u.created_at,
               a.nama_lengkap AS nama_anak, k.nama_kelas
        FROM users u
        LEFT JOIN anak a ON u.id_anak = a.id_anak
        LEFT JOIN kelas k ON a.id_kelas = k.id_kelas
        ORDER BY u.role, u.username
    `;
    db.query(query, (err, results) => {
        if (err) return res.status(500).json({ error: 'Gagal mengambil data users' });
        res.json(results);
    });
});

// POST /api/users — buat akun baru (admin only)
app.post('/api/users', requireRole('admin'), async (req, res) => {
    const { username, password, role, id_anak } = req.body;
    if (!username || !password || !role) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    try {
        const hashed = await bcrypt.hash(password, 10);
        db.query(
            `INSERT INTO users (username, password, role, id_anak) VALUES (?, ?, ?, ?)`,
            [username, hashed, role, id_anak || null],
            (err, result) => {
                if (err) {
                    if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'Username sudah dipakai' });
                    return res.status(500).json({ error: 'Gagal buat akun' });
                }
                res.json({ success: true, id: result.insertId });
            }
        );
    } catch (e) {
        res.status(500).json({ error: 'Server error' });
    }
});

// DELETE /api/users/:id
app.delete('/api/users/:id', requireRole('admin'), (req, res) => {
    db.query(`DELETE FROM users WHERE id_user = ?`, [req.params.id], (err) => {
        if (err) return res.status(500).json({ error: 'Gagal hapus akun' });
        res.json({ success: true });
    });
});

// ===================== API ORANG TUA (READ-ONLY) =====================

function requireApiOrtu(req, res, next) {
    setNoCache(res);
    if (!req.session || !req.session.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    if (!['admin', 'orang_tua'].includes(req.session.user.role)) {
        return res.status(403).json({ error: 'Forbidden' });
    }
    next();
}

function resolveIdAnak(req, callback) {
    if (!req.session || !req.session.user) return callback(null);
    if (req.session.user.id_anak) return callback(req.session.user.id_anak);

    // Ambil fresh dari database jika id_anak di session belum tersimpan
    db.query('SELECT id_anak FROM users WHERE id_user = ?', [req.session.user.id], (err, rows) => {
        if (!err && rows && rows.length > 0 && rows[0].id_anak) {
            req.session.user.id_anak = rows[0].id_anak; // sync session
            return callback(rows[0].id_anak);
        }
        return callback(null);
    });
}

// GET /api/ortu/profil-anak — info anak yang terhubung ke akun orang tua
app.get('/api/ortu/profil-anak', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun Anda belum ditautkan ke data anak' });

        const query = `
            SELECT a.id_anak, a.nama_lengkap, a.nisn, a.jenis_kelamin, 
                   k.id_kelas, k.nama_kelas, k.tahun_ajaran
            FROM anak a
            JOIN kelas k ON a.id_kelas = k.id_kelas
            WHERE a.id_anak = ?
        `;
        db.query(query, [id_anak], (err, results) => {
            if (err) return res.status(500).json({ error: 'Gagal mengambil data anak' });
            if (results.length === 0) return res.status(404).json({ error: 'Data anak tidak ditemukan' });
            res.json(results[0]);
        });
    });
});

// GET /api/ortu/jadwal — jadwal hari ini untuk kelas anak
app.get('/api/ortu/jadwal', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun belum ditautkan ke data anak' });

        const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

        const query = `
            SELECT j.id_jadwal, j.jam_mulai, j.jam_selesai, j.kegiatan, j.keterangan, k.nama_kelas
            FROM jadwal j
            JOIN kelas k ON j.id_kelas = k.id_kelas
            JOIN anak a ON a.id_kelas = k.id_kelas
            WHERE a.id_anak = ? AND j.hari = ?
            ORDER BY j.jam_mulai
        `;
        db.query(query, [id_anak, hariSekarang], (err, results) => {
            if (err) return res.status(500).json({ error: 'Gagal mengambil jadwal' });
            res.json({ hari: hariSekarang, jadwal: results });
        });
    });
});

// GET /api/ortu/logbook — logbook kelas anak (terbaru, max 10)
app.get('/api/ortu/logbook', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun belum ditautkan ke data anak' });

        const query = `
            SELECT 
                l.id_logbook,
                DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal,
                k.nama_kelas,
                (SELECT COUNT(*) FROM kegiatan_logbook kl WHERE kl.id_logbook = l.id_logbook) AS jumlah_kegiatan,
                (SELECT kl2.judul FROM kegiatan_logbook kl2 WHERE kl2.id_logbook = l.id_logbook ORDER BY kl2.urutan ASC LIMIT 1) AS kegiatan_pertama
            FROM logbook l
            JOIN kelas k ON l.id_kelas = k.id_kelas
            JOIN anak a ON a.id_kelas = k.id_kelas
            WHERE a.id_anak = ?
            ORDER BY l.tanggal DESC
            LIMIT 10
        `;
        db.query(query, [id_anak], (err, results) => {
            if (err) return res.status(500).json({ error: 'Gagal mengambil logbook' });
            res.json(results);
        });
    });
});

// GET /api/ortu/catatan — catatan khusus untuk anak mereka
app.get('/api/ortu/catatan', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun belum ditautkan ke data anak' });

        const query = `
            SELECT ca.id_catatan, ca.catatan, ca.created_at,
                   DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal_logbook,
                   k.nama_kelas
            FROM catatan_anak ca
            JOIN logbook l ON ca.id_logbook = l.id_logbook
            JOIN kelas k ON l.id_kelas = k.id_kelas
            WHERE ca.id_anak = ?
            ORDER BY l.tanggal DESC
            LIMIT 15
        `;
        db.query(query, [id_anak], (err, results) => {
            if (err) return res.status(500).json({ error: 'Gagal mengambil catatan anak' });
            res.json(results);
        });
    });
});

// GET /api/ortu/dokumentasi — dokumentasi dari kelas anak (khusus untuk anak mereka & umum kelas)
app.get('/api/ortu/dokumentasi', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun belum ditautkan ke data anak' });

        const query = `
            SELECT d.id_dokumentasi, d.file_foto, d.keterangan, d.id_anak,
                   DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal, k.nama_kelas,
                   a.nama_lengkap AS nama_anak
            FROM dokumentasi d
            JOIN logbook l ON d.id_logbook = l.id_logbook
            JOIN kelas k ON l.id_kelas = k.id_kelas
            JOIN anak target_anak ON target_anak.id_kelas = k.id_kelas AND target_anak.id_anak = ?
            LEFT JOIN anak a ON d.id_anak = a.id_anak
            WHERE (d.id_anak = ? OR d.id_anak IS NULL)
            ORDER BY (d.id_anak = ?) DESC, l.tanggal DESC, d.id_dokumentasi DESC
            LIMIT 12
        `;
        db.query(query, [id_anak, id_anak, id_anak], (err, results) => {
            if (err) return res.status(500).json({ error: 'Gagal mengambil dokumentasi' });
            res.json(results);
        });
    });
});

// GET /api/ortu/logbook/:id — detail logbook (read-only, filtered to anak's class)
app.get('/api/ortu/logbook/:id', requireApiOrtu, (req, res) => {
    resolveIdAnak(req, (id_anak) => {
        if (!id_anak) return res.status(400).json({ error: 'Akun belum ditautkan ke data anak' });

        const id = req.params.id;

        // Verify this logbook belongs to the child's class
        const verifyQuery = `
            SELECT l.id_logbook FROM logbook l
            JOIN anak a ON a.id_kelas = l.id_kelas
            WHERE l.id_logbook = ? AND a.id_anak = ?
        `;
        db.query(verifyQuery, [id, id_anak], (errV, vRows) => {
            if (errV) return res.status(500).json({ error: 'Gagal verifikasi akses' });
            if (vRows.length === 0) return res.status(403).json({ error: 'Anda tidak memiliki akses ke logbook ini' });

            // Fetch full detail
            const queryLogbook = `
                SELECT l.id_logbook, l.id_kelas, DATE_FORMAT(l.tanggal, '%Y-%m-%d') AS tanggal,
                       k.nama_kelas
                FROM logbook l
                JOIN kelas k ON l.id_kelas = k.id_kelas
                WHERE l.id_logbook = ?
            `;
            db.query(queryLogbook, [id], (err, lbResults) => {
                if (err) return res.status(500).json({ error: 'Gagal mengambil logbook' });
                if (lbResults.length === 0) return res.status(404).json({ error: 'Logbook tidak ditemukan' });

                const logbook = lbResults[0];

                db.query(`SELECT * FROM kegiatan_logbook WHERE id_logbook = ? ORDER BY urutan ASC`, [id], (errK, kegiatans) => {
                    // Only show catatan for their own child
                    db.query(
                        `SELECT ca.*, a.nama_lengkap AS nama_anak FROM catatan_anak ca JOIN anak a ON ca.id_anak = a.id_anak WHERE ca.id_logbook = ? AND ca.id_anak = ?`,
                        [id, id_anak],
                        (errC, catatans) => {
                            const queryDocsOrtu = `
                                SELECT d.*, a.nama_lengkap AS nama_anak 
                                FROM dokumentasi d
                                LEFT JOIN anak a ON d.id_anak = a.id_anak
                                WHERE d.id_logbook = ? AND (d.id_anak = ? OR d.id_anak IS NULL)
                                ORDER BY (d.id_anak = ?) DESC, d.id_dokumentasi DESC
                            `;
                            db.query(queryDocsOrtu, [id, id_anak, id_anak], (errD, docs) => {
                                res.json({
                                    logbook,
                                    kegiatan: kegiatans || [],
                                    catatan: catatans || [],
                                    dokumentasi: docs || []
                                });
                            });
                        }
                    );
                });
            });
        });
    });
});

// ===================== API DASHBOARD STATS =====================

app.get('/api/dashboard-stats', requireLogin, (req, res) => {
    const hariSekarang = new Date().toLocaleDateString('id-ID', { weekday: 'long' });

    const queries = {
        kegiatan: `SELECT COUNT(*) AS total FROM jadwal WHERE hari = ?`,
        anak: `SELECT COUNT(*) AS total FROM anak`,
        kelas: `SELECT COUNT(*) AS total FROM kelas`
    };

    const results = {};
    let done = 0;
    const total = Object.keys(queries).length;

    db.query(queries.kegiatan, [hariSekarang], (err, rows) => {
        results.kegiatan_hari_ini = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });

    db.query(queries.anak, (err, rows) => {
        results.total_anak = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });

    db.query(queries.kelas, (err, rows) => {
        results.total_kelas = err ? 0 : rows[0].total;
        if (++done === total) res.json(results);
    });
});

// ===================== AUTO SEED DEFAULT ACCOUNTS & LOGBOOK =====================
async function autoSeedUsers() {
    db.query(`SELECT COUNT(*) as count FROM users`, async (err, rows) => {
        if (!err && rows && rows[0].count === 0) {
            const hash = '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu'; // password: password123
            const query = `
                INSERT INTO users (username, password, role) VALUES
                ('admin', ?, 'admin'),
                ('guru', ?, 'guru')
            `;
            db.query(query, [hash, hash], (insertErr) => {
                if (!insertErr) {
                    console.log('✅ Akun default berhasil dibuat otomatis:');
                    console.log('   - Guru : username "guru"  | password "password123"');
                    console.log('   - Admin: username "admin" | password "password123"');
                }
            });
        }
    });
}

function autoSeedLogbook() {
    db.query(`SELECT COUNT(*) as count FROM logbook`, (err, rows) => {
        if (!err && rows && rows[0].count === 0) {
            // Cek apakah ada kelas dan guru
            db.query(`SELECT id_kelas FROM kelas LIMIT 1`, (errK, kelasRows) => {
                if (errK || !kelasRows || kelasRows.length === 0) return;
                const id_kelas = kelasRows[0].id_kelas;

                db.query(`SELECT id_user FROM users WHERE role IN ('guru', 'admin') LIMIT 1`, (errU, userRows) => {
                    const id_user = (!errU && userRows && userRows.length > 0) ? userRows[0].id_user : 1;

                    const samples = [
                        {
                            tanggal: '2026-10-09',
                            kegiatans: [
                                { kategori: 'Seni & Kreativitas', judul: 'Warna & bentuk melalui kolase daun', deskripsi: 'Mengenal tekstur dan menyusun kolase daun kering menjadi aneka bentuk hewan.' },
                                { kategori: 'Motorik Halus', judul: 'Menggunting pola daun', deskripsi: 'Melatih kekuatan jari tangan dengan menggunting daun sesuai garis tepi.' },
                                { kategori: 'Bahasa', judul: 'Bercerita tentang daun kering', deskripsi: 'Menceritakan hasil karya dan warna-warni daun di depan teman kelas.' },
                                { kategori: 'Nilai Agama & Moral', judul: 'Mensyukuri ciptaan Tuhan', deskripsi: 'Mengagumi keanekaragaman tanaman dan daun di lingkungan sekolah.' }
                            ],
                            foto_count: 2,
                            catatan_count: 2
                        },
                        {
                            tanggal: '2026-10-08',
                            kegiatans: [
                                { kategori: 'Kognitif', judul: 'Menghitung benda di sekitar kelas', deskripsi: 'Belajar menghitung jumlah meja, kursi, dan pensil warna dari angka 1 sampai 10.' },
                                { kategori: 'Sosial Emosional', judul: 'Bekerjasama menyusun balok', deskripsi: 'Bergantian dan saling membantu dalam merapikan mainan balok kayu.' },
                                { kategori: 'Motorik Kasar', judul: 'Permainan estafet balok', deskripsi: 'Berlari kecil memindahkan balok ke keranjang yang sesuai warnanya.' },
                                { kategori: 'Bahasa', judul: 'Menyebutkan angka dan warna', deskripsi: 'Mengeja nama angka dalam bahasa Indonesia dan bahasa Inggris.' }
                            ],
                            foto_count: 1,
                            catatan_count: 1
                        },
                        {
                            tanggal: '2026-10-07',
                            kegiatans: [
                                { kategori: 'Bahasa', judul: 'Mengenal bunyi dan huruf awal', deskripsi: 'Menebak huruf awalan nama hewan dan benda yang ada di gambar peraga.' },
                                { kategori: 'Nilai Agama & Moral', judul: 'Berdoa sebelum belajar', deskripsi: 'Membaca doa pembuka dengan sikap yang tertib dan khidmat.' },
                                { kategori: 'Kognitif', judul: 'Mencocokkan kartu huruf', deskripsi: 'Mencocokkan kartu huruf besar dan kecil secara berkelompok.' },
                                { kategori: 'Seni', judul: 'Mewarnai huruf alfabet', deskripsi: 'Mewarnai cetakan huruf menggunakan krayon warna-warni.' }
                            ],
                            foto_count: 2,
                            catatan_count: 2
                        }
                    ];

                    samples.forEach(s => {
                        db.query(
                            `INSERT INTO logbook (id_kelas, tanggal, created_by) VALUES (?, ?, ?)`,
                            [id_kelas, s.tanggal, id_user],
                            (errLb, resLb) => {
                                if (!errLb && resLb) {
                                    const lbId = resLb.insertId;
                                    const values = s.kegiatans.map((kg, i) => [lbId, kg.kategori, kg.judul, kg.deskripsi, i]);
                                    db.query(
                                        `INSERT INTO kegiatan_logbook (id_logbook, kategori, judul, deskripsi, urutan) VALUES ?`,
                                        [values]
                                    );

                                    // Cek anak untuk sample catatan
                                    db.query(`SELECT id_anak FROM anak WHERE id_kelas = ? LIMIT 2`, [id_kelas], (errAnak, anakRows) => {
                                        if (!errAnak && anakRows && anakRows.length > 0) {
                                            for (let i = 0; i < Math.min(s.catatan_count, anakRows.length); i++) {
                                                db.query(
                                                    `INSERT INTO catatan_anak (id_logbook, id_anak, catatan) VALUES (?, ?, ?)`,
                                                    [lbId, anakRows[i].id_anak, 'Anak sangat antusias mengikuti kegiatan dan aktif bertanya.']
                                                );
                                            }
                                        }
                                    });

                                    // Sample dokumentasi
                                    for (let f = 0; f < s.foto_count; f++) {
                                        db.query(
                                            `INSERT INTO dokumentasi (id_logbook, file_foto, keterangan) VALUES (?, ?, ?)`,
                                            [lbId, 'sample_foto.jpg', 'Dokumentasi kegiatan pembelajaran']
                                        );
                                    }
                                }
                            }
                        );
                    });
                });
            });
        }
    });
}

// ===================== START =====================
app.listen(PORT, () => {
    autoSeedUsers();
    autoSeedLogbook();
    console.log(`Server iTales berjalan di http://localhost:${PORT} 🚀`);
});