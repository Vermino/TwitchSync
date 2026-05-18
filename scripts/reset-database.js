// scripts/reset-database.js
// Drops and recreates the local development database with the current schema.

const { exec } = require('child_process');
const { promisify } = require('util');
const fs = require('fs');
const path = require('path');
const execAsync = promisify(exec);

async function resetDatabase() {
  console.log('Resetting database...\n');

  const DB_PORT = process.env.DB_PORT || '5434';
  const DB_USER = process.env.DB_USER || 'postgres';
  const DB_PASS = process.env.DB_PASSWORD || '';
  const DB_NAME = process.env.DB_NAME || 'twitchsync';
  const PG_BIN = process.env.PG_BIN || 'C:\\Program Files\\PostgreSQL\\17\\bin';

  const env = { ...process.env, PGPASSWORD: DB_PASS };
  const pgOpts = `-U ${DB_USER} -p ${DB_PORT} -h localhost`;

  try {
    console.log('1. Dropping existing database...');
    try {
      await execAsync(
        `"${path.join(PG_BIN, 'dropdb.exe')}" ${pgOpts} --if-exists ${DB_NAME}`,
        { env }
      );
      console.log('   Database dropped');
    } catch (e) {
      console.log('   Database did not exist');
    }

    console.log('2. Creating fresh database...');
    await execAsync(
      `"${path.join(PG_BIN, 'createdb.exe')}" ${pgOpts} ${DB_NAME}`,
      { env }
    );
    console.log('   Database created');

    const schemaPath = path.join(__dirname, '..', 'backend', 'schema.sql');
    if (fs.existsSync(schemaPath)) {
      console.log('3. Applying schema...');
      await execAsync(
        `"${path.join(PG_BIN, 'psql.exe')}" ${pgOpts} -d ${DB_NAME} -f "${schemaPath}"`,
        { env }
      );
      console.log('   Schema applied');
    } else {
      console.log('3. No schema.sql found - database is empty');
      console.log('   Run migrations or export schema first');
    }

    console.log('\nDatabase reset complete.\n');
  } catch (error) {
    console.error('\nFailed to reset database:', error.message);
    process.exit(1);
  }
}

resetDatabase();
