// scripts/export-schema.js
// Exports the current database schema to schema.sql

const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

async function exportSchema() {
  console.log('Exporting database schema...');

  try {
    const {stdout, stderr} = await execAsync(
      `"C:\\Program Files\\PostgreSQL\\17\\bin\\pg_dump.exe" -U postgres -d twitchsync --schema-only --no-owner --no-privileges`
    );

    if (stderr && !stderr.includes('SET')) {
      console.error('Error:', stderr);
      process.exit(1);
    }

    const fs = require('fs');
    fs.writeFileSync('./backend/schema.sql', stdout);
    console.log('✅ Schema exported to backend/schema.sql');

  } catch (error) {
    console.error('Failed to export schema:', error);
    process.exit(1);
  }
}

exportSchema();
