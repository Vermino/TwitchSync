const { Pool } = require('pg');
require('dotenv').config();

async function resetMigration() {
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL
  });

  try {
    // Remove the migration record so it can run again
    const result = await pool.query(`
      DELETE FROM migrations 
      WHERE name = '028_add_resume_functionality.ts'
    `);
    
    console.log('Migration record removed:', result.rowCount > 0 ? 'SUCCESS' : 'NOT FOUND');
  } catch (error) {
    console.error('Error resetting migration:', error);
  } finally {
    await pool.end();
  }
}

resetMigration();