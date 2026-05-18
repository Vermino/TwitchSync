-- Local Development Database Setup
-- Run these commands to set up the local PostgreSQL database

-- Create database and user (run as postgres superuser)
CREATE DATABASE twitchsync;
CREATE USER twitchsync_user WITH PASSWORD 'twitchsync_password';

-- Grant permissions
GRANT ALL PRIVILEGES ON DATABASE twitchsync TO twitchsync_user;
ALTER USER twitchsync_user CREATEDB;

-- Connect to the database and grant schema permissions
\c twitchsync;
GRANT ALL ON SCHEMA public TO twitchsync_user;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO twitchsync_user;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO twitchsync_user;

-- Set default privileges for future tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO twitchsync_user;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO twitchsync_user;