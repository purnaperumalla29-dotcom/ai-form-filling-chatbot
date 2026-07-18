const db = require('./db');

async function verifyDatabaseSetup() {
  console.log('====================================================');
  console.log('   DATABASE SYSTEM VERIFICATION   ');
  console.log('====================================================');
  
  try {
    // Attempt database initialization
    await db.initializeDatabase();
    console.log('✔ Database connection pool initialized.');

    // Query active Forms templates
    const forms = await db.query('SELECT id, form_name, form_url FROM Forms');
    console.log(`✔ Query successful. Found ${forms.length} seeded form templates:`);
    forms.forEach(f => {
      console.log(`  - [ID: ${f.id}] Name: "${f.form_name}" (Target URL: ${f.form_url})`);
    });

    console.log('====================================================');
    console.log('✔ VERIFICATION SUCCESSFUL: MySQL connection is active');
    console.log('====================================================');
    process.exit(0);

  } catch (error) {
    console.error('====================================================');
    console.error('✖ VERIFICATION FAILED: Could not connect to MySQL.');
    console.error('Reason:', error.message);
    console.error('====================================================');
    console.error('Please ensure:');
    console.error('1. Your MySQL server is running.');
    console.error('2. Credentials in your .env file match your local server.');
    console.error('   Default credentials used: user="root", host="localhost", password=""');
    console.error('====================================================');
    process.exit(1);
  }
}

verifyDatabaseSetup();
