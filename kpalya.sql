CREATE DATABASE IF NOT EXISTS logbook_tk;
USE logbook_tk;

-- =========================================
-- TABEL KELAS
-- =========================================
CREATE TABLE kelas (
    id_kelas INT AUTO_INCREMENT PRIMARY KEY,
    nama_kelas VARCHAR(50) NOT NULL,
    tahun_ajaran VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =========================================
-- TABEL ANAK
-- =========================================
CREATE TABLE anak (
    id_anak INT AUTO_INCREMENT PRIMARY KEY,
    nama_lengkap VARCHAR(100) NOT NULL,
    nisn VARCHAR(20) NOT NULL UNIQUE,
    jenis_kelamin ENUM('L', 'P') NOT NULL,
    id_kelas INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE RESTRICT
);

-- =========================================
-- TABEL USERS / AKUN
-- =========================================
CREATE TABLE users (
    id_user INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password VARCHAR(255) NOT NULL,
    role ENUM('admin', 'guru', 'orang_tua') NOT NULL,
    id_anak INT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE SET NULL
);

-- =========================================
-- TABEL JADWAL
-- =========================================
CREATE TABLE jadwal (
    id_jadwal INT AUTO_INCREMENT PRIMARY KEY,
    id_kelas INT NOT NULL,
    hari ENUM(
        'Senin',
        'Selasa',
        'Rabu',
        'Kamis',
        'Jumat',
        'Sabtu'
    ) NOT NULL,
    jam_mulai TIME NOT NULL,
    jam_selesai TIME NOT NULL,
    kegiatan VARCHAR(150) NOT NULL,
    keterangan TEXT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- TABEL LOGBOOK
-- =========================================
CREATE TABLE logbook (
    id_logbook INT AUTO_INCREMENT PRIMARY KEY,
    id_kelas INT NOT NULL,
    tanggal DATE NOT NULL,
    created_by INT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_kelas)
        REFERENCES kelas(id_kelas)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    FOREIGN KEY (created_by)
        REFERENCES users(id_user)
        ON UPDATE CASCADE
        ON DELETE RESTRICT,

    UNIQUE KEY unique_logbook_harian (id_kelas, tanggal)
);

-- =========================================
-- TABEL KEGIATAN LOGBOOK
-- =========================================
CREATE TABLE kegiatan_logbook (
    id_kegiatan INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    kategori VARCHAR(100) NOT NULL,
    judul VARCHAR(150) NOT NULL,
    deskripsi TEXT NOT NULL,
    urutan INT DEFAULT 0,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- TABEL CATATAN ANAK
-- =========================================
CREATE TABLE catatan_anak (
    id_catatan INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    id_anak INT NOT NULL,
    catatan TEXT NOT NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        ON UPDATE CURRENT_TIMESTAMP,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    UNIQUE KEY unique_catatan_anak_harian (id_logbook, id_anak)
);

-- =========================================
-- TABEL DOKUMENTASI
-- =========================================
CREATE TABLE dokumentasi (
    id_dokumentasi INT AUTO_INCREMENT PRIMARY KEY,
    id_logbook INT NOT NULL,
    id_anak INT NULL,
    file_foto VARCHAR(255) NOT NULL,
    keterangan VARCHAR(255) NULL,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (id_logbook)
        REFERENCES logbook(id_logbook)
        ON UPDATE CASCADE
        ON DELETE CASCADE,

    FOREIGN KEY (id_anak)
        REFERENCES anak(id_anak)
        ON UPDATE CASCADE
        ON DELETE CASCADE
);

-- =========================================
-- DATA KELAS AWAL
-- =========================================
INSERT INTO kelas (nama_kelas, tahun_ajaran)
VALUES
('TK A', '2026/2027'),
('TK B', '2026/2027');

-- =========================================
-- DATA USER AWAL (Password: password123)
-- =========================================
INSERT INTO users (username, password, role)
VALUES
('admin', '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu', 'admin'),
('guru', '$2b$10$VyTtYTzkFLKUFUjN5GvUXOJDDmwPPwOF9BZk15P6eU4yF45TH9Xpu', 'guru');