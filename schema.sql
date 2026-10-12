-- BloodLink database schema (MySQL)
-- Run this once:  mysql -u root -p < schema.sql

CREATE DATABASE IF NOT EXISTS bloodlink;
USE bloodlink;

CREATE TABLE IF NOT EXISTS donor (
    id          CHAR(36)     PRIMARY KEY,
    name        VARCHAR(100) NOT NULL,
    blood_group ENUM('A+','A-','B+','B-','O+','O-','AB+','AB-') NOT NULL,
    city        VARCHAR(80)  NOT NULL,
    phone       VARCHAR(18)  NOT NULL UNIQUE,
    available   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_group_city (blood_group, city)
);

-- Optional sample queries used by the application:
-- SELECT * FROM donor WHERE blood_group = 'O-' AND city LIKE '%Raipur%' ORDER BY created_at DESC;
-- UPDATE donor SET available = FALSE WHERE id = '...';
-- SELECT blood_group, COUNT(*) AS total, SUM(available) AS available FROM donor GROUP BY blood_group;
-- DELETE FROM donor WHERE id = '...';
