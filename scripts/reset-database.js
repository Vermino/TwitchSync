// scripts/reset-database.js
// Drops and recreates the database with the current schema

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

async function resetDatabase() {
  console.log('🔄 Resetting database...\n');

  const DB_PORT = '5434';  // Your PostgreSQL port
  const DB_USER = 'postgres';
  const DB_PASS = 'James2004';  // From your .env
  const DB_NAME = 'twitchsync';

  const env = { ...process.env, PGPASSWORD: DB_PASS };
  const pgOpts = `-U ${DB_USER} -p ${DB_PORT} -h localhost`;

  try {
    // Step 1: Drop existing database
    console.log('1. Dropping existing database...');
    try {
      await execAsync(
        `"C:\\Program Files\\PostgreSQL\\17\\bin\\dropdb.exe" ${pgOpts} --if-exists ${DB_NAME}`,
        { env }
      );
      console.log('   ✅ Database dropped');
    } catch (e) {
      console.log('   ⚠️  Database did not exist');
    }

    // Step 2: Create fresh database
    console.log('2. Creating fresh database...');
    await execAsync(
      `"C:\\Program Files\\PostgreSQL\\17\\bin\\createdb.exe" ${pgOpts} ${DB_NAME}`,
      { env }
    );
    console.log('   ✅ Database created');

    // Step 3: Apply schema if it exists
    const schemaPath = path.join(__dirname, '..', 'backend', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('3. Applying schema...');
      await execAsync(
        `"C:\\Program Files\\PostgreSQL\\17\\bin\\psql.exe" ${pgOpts} -d ${DB_NAME} -f "${schemaPath}"`,
        { env }
      );
      console.log('   ✅ Schema applied');
    } else {
      console.log('3. ⚠️  No schema.sql found - database is empty');
      console.log('   Run migrations or export schema first');
    }

    console.log('\n✅ Database reset complete!\n');
  } catch (error) {
    console.error('\n❌ Failed to reset database:', error.message);
    process.exit(1);
  }
}

resetDatabase();
