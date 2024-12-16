// backend/src/database/migrations/002_auth_tables.ts

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export async function up(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Create auth-related enums
    await client.query(`
      DO $$ BEGIN
        CREATE TYPE auth_provider AS ENUM (
          'twitch', 'discord', 'local'
        );

        CREATE TYPE user_role AS ENUM (
          'admin', 'moderator', 'user', 'guest'
        );

        CREATE TYPE user_status AS ENUM (
          'active', 'suspended', 'banned', 'pending'
        );
      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Users table
    await client.query(`
      CREATE TABLE users (
        id SERIAL PRIMARY KEY,
        email VARCHAR(255),
        username VARCHAR(100) NOT NULL,
        password_hash TEXT,
        twitch_id VARCHAR(50) UNIQUE,
        discord_id VARCHAR(50) UNIQUE,
        auth_provider auth_provider DEFAULT 'local',
        role user_role DEFAULT 'user',
        status user_status DEFAULT 'active',
        access_token TEXT,
        refresh_token TEXT,
        token_expires_at TIMESTAMP,
        profile_image_url TEXT,
        display_name VARCHAR(100),
        broadcaster_type VARCHAR(50),
        description TEXT,
        country_code VARCHAR(2),
        preferred_language VARCHAR(10),
        timezone VARCHAR(50),
        is_email_verified BOOLEAN DEFAULT false,
        email_verification_token TEXT,
        password_reset_token TEXT,
        password_reset_expires TIMESTAMP,
        mfa_enabled BOOLEAN DEFAULT false,
        mfa_secret TEXT,
        backup_codes TEXT[],
        last_login TIMESTAMP,
        last_ip VARCHAR(45),
        last_user_agent TEXT,
        login_attempts INTEGER DEFAULT 0,
        lockout_until TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        settings JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        deleted_at TIMESTAMP
      );

      CREATE INDEX idx_users_email ON users(email) WHERE email IS NOT NULL;
      CREATE INDEX idx_users_username ON users(username);
      CREATE INDEX idx_users_twitch_id ON users(twitch_id) WHERE twitch_id IS NOT NULL;
      CREATE INDEX idx_users_discord_id ON users(discord_id) WHERE discord_id IS NOT NULL;
      CREATE INDEX idx_users_status ON users(status);
      CREATE INDEX idx_users_role ON users(role);
    `);

    // Sessions table
    await client.query(`
      CREATE TABLE sessions (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        refresh_token TEXT UNIQUE,
        device_id VARCHAR(100),
        device_name VARCHAR(200),
        ip_address VARCHAR(45),
        user_agent TEXT,
        expires_at TIMESTAMP NOT NULL,
        last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        is_revoked BOOLEAN DEFAULT false,
        revoked_reason TEXT,
        revoked_at TIMESTAMP,
        metadata JSONB DEFAULT '{}',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_sessions_token ON sessions(token);
      CREATE INDEX idx_sessions_refresh ON sessions(refresh_token) WHERE refresh_token IS NOT NULL;
      CREATE INDEX idx_sessions_user_id ON sessions(user_id);
      CREATE INDEX idx_sessions_expires ON sessions(expires_at);
      CREATE INDEX idx_sessions_device ON sessions(device_id);
    `);

    // Authentication logs
    await client.query(`
      CREATE TABLE auth_logs (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
        event_type VARCHAR(50) NOT NULL,
        status VARCHAR(20) NOT NULL,
        ip_address VARCHAR(45),
        user_agent TEXT,
        device_id VARCHAR(100),
        location JSONB,
        details JSONB,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_auth_logs_user ON auth_logs(user_id);
      CREATE INDEX idx_auth_logs_event ON auth_logs(event_type);
      CREATE INDEX idx_auth_logs_created ON auth_logs(created_at);
      CREATE INDEX idx_auth_logs_ip ON auth_logs(ip_address);
    `);

    // User permissions
    await client.query(`
      CREATE TABLE permissions (
        id SERIAL PRIMARY KEY,
        name VARCHAR(100) NOT NULL UNIQUE,
        description TEXT,
        category VARCHAR(50),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE TABLE role_permissions (
        role user_role NOT NULL,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (role, permission_id)
      );

      CREATE TABLE user_permissions (
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        permission_id INTEGER REFERENCES permissions(id) ON DELETE CASCADE,
        granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
        valid_until TIMESTAMP,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (user_id, permission_id)
      );
    `);

    // API keys
    await client.query(`
      CREATE TABLE api_keys (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        key_hash TEXT NOT NULL UNIQUE,
        name VARCHAR(100) NOT NULL,
        description TEXT,
        permissions TEXT[],
        expires_at TIMESTAMP,
        last_used TIMESTAMP,
        use_count INTEGER DEFAULT 0,
        is_active BOOLEAN DEFAULT true,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX idx_api_keys_user ON api_keys(user_id);
      CREATE INDEX idx_api_keys_active ON api_keys(is_active) WHERE is_active = true;
    `);

    // Create updated_at triggers
    await client.query(`
      CREATE TRIGGER update_users_updated_at
        BEFORE UPDATE ON users
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_api_keys_updated_at
        BEFORE UPDATE ON api_keys
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
    `);

    // Insert default permissions
    await client.query(`
      INSERT INTO permissions (name, description, category) VALUES
        ('user.read', 'Read user profile information', 'user'),
        ('user.write', 'Update user profile information', 'user'),
        ('channel.read', 'View channel information', 'channel'),
        ('channel.write', 'Manage channel settings', 'channel'),
        ('vod.read', 'View VOD information', 'vod'),
        ('vod.write', 'Manage VOD settings and downloads', 'vod'),
        ('admin.access', 'Access admin features', 'admin'),
        ('system.manage', 'Manage system settings', 'system');

      -- Set up default role permissions
      INSERT INTO role_permissions (role, permission_id) 
      SELECT 'admin', id FROM permissions;

      INSERT INTO role_permissions (role, permission_id)
      SELECT 'moderator', id FROM permissions 
      WHERE name NOT IN ('admin.access', 'system.manage');

      INSERT INTO role_permissions (role, permission_id)
      SELECT 'user', id FROM permissions 
      WHERE category IN ('user', 'channel', 'vod') AND name LIKE '%.read';
    `);

    await client.query('COMMIT');
    logger.info('Auth tables migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auth tables migration failed:', error);
    throw error;
  } finally {
    client.release();
  }
}

export async function down(pool: Pool): Promise<void> {
  const client = await pool.connect();

  try {
    await client.query('BEGIN');

    // Drop all auth-related tables
    await client.query(`
      DROP TRIGGER IF EXISTS update_api_keys_updated_at ON api_keys;
      DROP TRIGGER IF EXISTS update_users_updated_at ON users;
      
      DROP TABLE IF EXISTS user_permissions;
      DROP TABLE IF EXISTS role_permissions;
      DROP TABLE IF EXISTS permissions;
      DROP TABLE IF EXISTS api_keys;
      DROP TABLE IF EXISTS auth_logs;
      DROP TABLE IF EXISTS sessions;
      DROP TABLE IF EXISTS users;
      
      DROP TYPE IF EXISTS user_status;
      DROP TYPE IF EXISTS user_role;
      DROP TYPE IF EXISTS auth_provider;
    `);

    await client.query('COMMIT');
    logger.info('Auth tables rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Auth tables rollback failed:', error);
    throw error;
  } finally {
    client.release();
  }
}
