// Check task_monitoring table constraints
require('dotenv').config();
const { Pool } = require('pg');

async function checkConstraints() {
  const pool = new Pool({
    host: process.env.DB_HOST || 'localhost',
    port: parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME || 'twitchsync',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'password'
  });

  const client = await pool.connect();
  
  try {
    // Check table structure
    console.log('📋 task_monitoring table structure:');
    const columns = await client.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns 
      WHERE table_name = 'task_monitoring' AND table_schema = 'public'
      ORDER BY ordinal_position
    `);
    console.table(columns.rows);

    // Check constraints
    console.log('\n🔒 task_monitoring table constraints:');
    const constraints = await client.query(`
      SELECT 
        conname as constraint_name,
        contype as constraint_type,
        pg_get_constraintdef(oid) as constraint_definition
      FROM pg_constraint 
      WHERE conrelid = 'task_monitoring'::regclass
    `);
    console.table(constraints.rows);

    // Check indexes  
    console.log('\n📇 task_monitoring table indexes:');
    const indexes = await client.query(`
      SELECT 
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE tablename = 'task_monitoring'
    `);
    console.table(indexes.rows);

    // Check current task_monitoring data
    console.log('\n📊 Current task_monitoring data:');
    const monitoring = await client.query('SELECT * FROM task_monitoring ORDER BY task_id');
    console.table(monitoring.rows);

  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    client.release();
    pool.end();
  }
}

checkConstraints();