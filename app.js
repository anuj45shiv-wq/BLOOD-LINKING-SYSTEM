require("dotenv").config();
const express = require("express");
const cors = require("cors");
const path = require("path");
const crypto = require("crypto");
const mysql = require("mysql2/promise");

const app = express();

const BLOOD_GROUPS = ["A+", "A-", "B+", "B-", "O+", "O-", "AB+", "AB-"];

// ---------- Database layer (MySQL) ----------

// SSL settings for cloud databases (Aiven, TiDB Cloud, ...). Off by default for local MySQL.
function sslConfig() {
    if (process.env.DB_SSL !== "true") return undefined;

    // Best: give the provider's CA certificate (pasted with \n for line breaks).
    if (process.env.DB_SSL_CA) {
        return { ca: process.env.DB_SSL_CA.replace(/\\n/g, "\n"), rejectUnauthorized: true };
    }

    // Simpler: still encrypted, but the server certificate is not verified.
    if (process.env.DB_SSL_VERIFY === "false") {
        return { rejectUnauthorized: false };
    }

    return { rejectUnauthorized: true };
}

let pool = null;
let tableReady = null;

function getPool() {
    if (!pool) {
        pool = mysql.createPool({
            host: process.env.DB_HOST || "localhost",
            port: Number(process.env.DB_PORT) || 3306,
            user: process.env.DB_USER || "root",
            password: process.env.DB_PASSWORD || "",
            database: process.env.DB_NAME || "bloodlink",
            waitForConnections: true,
            connectionLimit: 5,
            ssl: sslConfig()
        });
    }
    return pool;
}

// Creates the donor table if it does not exist yet (same as schema.sql).
function ensureTable() {
    if (!tableReady) {
        tableReady = getPool()
            .query(`
                CREATE TABLE IF NOT EXISTS donor (
                    id          CHAR(36)     PRIMARY KEY,
                    name        VARCHAR(100) NOT NULL,
                    blood_group ENUM('A+','A-','B+','B-','O+','O-','AB+','AB-') NOT NULL,
                    city        VARCHAR(80)  NOT NULL,
                    phone       VARCHAR(18)  NOT NULL UNIQUE,
                    available   BOOLEAN      NOT NULL DEFAULT TRUE,
                    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
                    INDEX idx_group_city (blood_group, city)
                )
            `)
            .catch(err => {
                tableReady = null; // retry on the next request
                throw err;
            });
    }
    return tableReady;
}

// Database column names (snake_case) -> the names the frontend uses.
function toDonor(row) {
    return {
        id: row.id,
        name: row.name,
        bloodGroup: row.blood_group,
        city: row.city,
        phone: row.phone,
        available: Boolean(row.available),
        createdAt: row.created_at
    };
}

function escapeLike(text) {
    return text.replace(/[\\%_]/g, "\\$&");
}

// ---------- Middleware ----------
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// Make sure the database is reachable before any API route runs.
app.use("/api", async (req, res, next) => {
    try {
        await ensureTable();
        next();
    } catch (err) {
        console.error("Database connection failed:", err.message);
        res.status(500).json({ message: "Database connection failed. Check your MySQL settings." });
    }
});

// ---------- Routes ----------

// GET /api/donors?bloodGroup=A+&city=Raipur
app.get("/api/donors", async (req, res, next) => {
    try {
        const conditions = [];
        const values = [];
        const { bloodGroup, city } = req.query;

        if (bloodGroup) {
            conditions.push("blood_group = ?");
            values.push(String(bloodGroup));
        }

        if (city && String(city).trim()) {
            conditions.push("city LIKE ?");
            values.push(`%${escapeLike(String(city).trim())}%`);
        }

        const where = conditions.length ? "WHERE " + conditions.join(" AND ") : "";
        const [rows] = await getPool().query(
            `SELECT * FROM donor ${where} ORDER BY created_at DESC`,
            values
        );

        res.json(rows.map(toDonor));
    } catch (err) {
        next(err);
    }
});

// GET /api/stats
app.get("/api/stats", async (req, res, next) => {
    try {
        const [rows] = await getPool().query(
            `SELECT blood_group, COUNT(*) AS total, SUM(available) AS available
             FROM donor GROUP BY blood_group`
        );

        const bloodGroups = {};
        let totalDonors = 0;
        let availableDonors = 0;

        rows.forEach(r => {
            bloodGroups[r.blood_group] = Number(r.total);
            totalDonors += Number(r.total);
            availableDonors += Number(r.available);
        });

        res.json({ totalDonors, availableDonors, bloodGroups });
    } catch (err) {
        next(err);
    }
});

// POST /api/donors
app.post("/api/donors", async (req, res, next) => {
    try {
        const name = String(req.body.name || "").trim();
        const bloodGroup = String(req.body.bloodGroup || "").trim();
        const city = String(req.body.city || "").trim();
        const phone = String(req.body.phone || "").trim();

        if (!name || !bloodGroup || !city || !phone) {
            return res.status(400).json({ message: "All fields are required." });
        }

        if (!BLOOD_GROUPS.includes(bloodGroup)) {
            return res.status(400).json({ message: "Invalid blood group." });
        }

        if (!/^[+\d][\d\s-]{6,17}$/.test(phone)) {
            return res.status(400).json({ message: "Please enter a valid phone number." });
        }

        const id = crypto.randomUUID();

        await getPool().query(
            "INSERT INTO donor (id, name, blood_group, city, phone) VALUES (?, ?, ?, ?, ?)",
            [id, name, bloodGroup, city, phone]
        );

        const [rows] = await getPool().query("SELECT * FROM donor WHERE id = ?", [id]);
        res.status(201).json(toDonor(rows[0]));
    } catch (err) {
        // MySQL error 1062 = duplicate value in the UNIQUE phone column
        if (err.code === "ER_DUP_ENTRY") {
            return res.status(409).json({ message: "A donor with this phone number already exists." });
        }
        next(err);
    }
});

// PATCH /api/donors/:id/availability   body: { available: true|false }
app.patch("/api/donors/:id/availability", async (req, res, next) => {
    try {
        if (typeof req.body.available !== "boolean") {
            return res.status(400).json({ message: "'available' must be true or false." });
        }

        const [result] = await getPool().query(
            "UPDATE donor SET available = ? WHERE id = ?",
            [req.body.available, req.params.id]
        );

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Donor not found." });
        }

        const [rows] = await getPool().query("SELECT * FROM donor WHERE id = ?", [req.params.id]);
        res.json(toDonor(rows[0]));
    } catch (err) {
        next(err);
    }
});

// DELETE /api/donors/:id
app.delete("/api/donors/:id", async (req, res, next) => {
    try {
        const [result] = await getPool().query("DELETE FROM donor WHERE id = ?", [req.params.id]);

        if (result.affectedRows === 0) {
            return res.status(404).json({ message: "Donor not found." });
        }

        res.json({ message: "Donor deleted." });
    } catch (err) {
        next(err);
    }
});

// Unknown API routes -> JSON 404
app.use("/api", (req, res) => {
    res.status(404).json({ message: "API route not found." });
});

// Unexpected errors
app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).json({ message: "Something went wrong on the server." });
});

module.exports = app;
