
const fs = require('fs');
const mysql = require('mysql2/promise');

function obtenerSsl() {
  const caConfigurado = process.env.DB_SSL_CA;

  if (!caConfigurado) {
    return undefined;
  }

  const ca = fs.existsSync(caConfigurado)
    ? fs.readFileSync(caConfigurado, 'utf8')
    : caConfigurado.replace(/\\n/g, '\n');

  return {
    ca,
    rejectUnauthorized: true
  };
}

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || 'mi_finanzas',
  ssl: obtenerSsl(),
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

module.exports = pool;
