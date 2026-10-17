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
    const { nama_lengkap, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    db.query(
        `INSERT INTO anak (nama_lengkap, nisn, jenis_kelamin, id_kelas) VALUES (?, ?, ?, ?)`,
        [nama_lengkap, nisn, jenis_kelamin, id_kelas],
        (err, result) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal tambah anak' });
            }
            res.json({ success: true, id: result.insertId });
        }
    );
});

// PUT /api/anak/:id
app.put('/api/anak/:id', requireRole('admin', 'guru'), (req, res) => {
    const { nama_lengkap, nisn, jenis_kelamin, id_kelas } = req.body;
    if (!nama_lengkap || !nisn || !jenis_kelamin || !id_kelas) {
        return res.status(400).json({ error: 'Data tidak lengkap' });
    }

    db.query(
        `UPDATE anak SET nama_lengkap=?, nisn=?, jenis_kelamin=?, id_kelas=? WHERE id_anak=?`,
        [nama_lengkap, nisn, jenis_kelamin, id_kelas, req.params.id],
        (err) => {
            if (err) {
                if (err.code === 'ER_DUP_ENTRY') return res.status(400).json({ error: 'NISN sudah terdaftar' });
                return res.status(500).json({ error: 'Gagal update data anak' });
            }
            res.json({ success: true });
        }
    );
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
            SELECT * FROM dokumentasi 
            WHERE id_logbook = ?
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
        const query = `INSERT INTO dokumentasi (id_logbook, id_anak, file_foto, keterangan) VALUES (?, ?, ?, ?)`;
        db.query(query, [id_logbook, id_anak || null, fileName, keterangan || null], (dbErr, result) => {
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

    const query = `INSERT INTO dokumentasi (id_logbook, id_anak, file_foto, keterangan) VALUES (?, ?, ?, ?)`;
    db.query(query, [id_logbook, id_anak || null, file_foto, keterangan || null], (err, result) => {
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