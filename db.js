const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const {
  DB_HOST = 'localhost',
  DB_PORT=3306,
  DB_USER = 'root',
  DB_PASSWORD = '',
  DB_NAME = 'ai_form_filler'
} = process.env;

let pool = null;

async function initializeDatabase() {
  try {
    // 1. Connect without database name to ensure database exists
    console.log(`Connecting to MySQL server at ${DB_HOST} as ${DB_USER}...`);
    const tempConnection = await mysql.createConnection({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      multipleStatements: true
    });

    console.log(`Ensuring database "${DB_NAME}" exists...`);
    await tempConnection.query(`CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;`);
    await tempConnection.end();

    // 2. Initialize connection pool with database selected
    pool = mysql.createPool({
      host: DB_HOST,
      port: DB_PORT,
      user: DB_USER,
      password: DB_PASSWORD,
      database: DB_NAME,
      waitForConnections: true,
      connectionLimit: 10,
      queueLimit: 0,
      multipleStatements: true
    });

    // 3. Run initialization SQL script to build tables and seed forms
    console.log('Running database setup schema script...');
    const sqlPath = path.join(__dirname, 'init_db.sql');
    if (fs.existsSync(sqlPath)) {
      const sqlContent = fs.readFileSync(sqlPath, 'utf8');
      
      // Execute the full script using multiple statements support
      const connection = await pool.getConnection();
      try {
        await connection.query(sqlContent);
        console.log('Database tables verified/created and seeded successfully.');
      } catch (err) {
        console.error('Error executing init_db.sql:', err.message);
        throw err;
      } finally {
        connection.release();
      }
    } else {
      console.warn('init_db.sql not found. Skipping table generation.');
    }

  } catch (error) {
    console.error('Database connection / initialization failed:', error.message);
    console.error('Please verify your MySQL service is running and credentials in .env are correct.');
    // Exit process on init failure to prevent running in invalid state
    process.exit(1);
  }
}

// Function to get connection pool, initializing it first if necessary
async function getPool() {
  if (!pool) {
    await initializeDatabase();
  }
  return pool;
}

// Helper to run query with auto-pool management
async function query(sql, params) {
  const activePool = await getPool();
  const [results] = await activePool.execute(sql, params);
  return results;
}

module.exports = {
  getPool,
  query,
  initializeDatabase
};
