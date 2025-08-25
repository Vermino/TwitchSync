# TwitchSync Backend Development Setup

## Quick Start

1. **Install Dependencies**
   ```bash
   npm install
   ```

2. **Database Setup**
   
   **Option A: Local PostgreSQL**
   - Install PostgreSQL 14+
   - Run the database setup script:
   ```bash
   psql -U postgres -f local-db-setup.sql
   ```
   
   **Option B: Docker (Recommended)**
   ```bash
   # From project root
   docker-compose up -d db
   ```

3. **Environment Configuration**
   ```bash
   cp .env.example .env
   # Edit .env with your configuration
   ```

4. **Run Migrations**
   ```bash
   npm run migrate
   ```

5. **Start Development Server**
   ```bash
   npm run dev
   ```

## Environment Variables

### Required for Basic Functionality
- `DB_HOST`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` - Database connection
- `JWT_SECRET` - For session management

### Optional (Twitch Features)
- `TWITCH_CLIENT_ID`, `TWITCH_CLIENT_SECRET` - For Twitch API access
- `TWITCH_REDIRECT_URI` - OAuth callback URL

### Optional (File Storage)
- `STORAGE_PATH`, `TEMP_PATH` - File storage locations
- `MEDIA_SERVER_PATH` - Media server directory

## Troubleshooting

### Database Connection Issues
1. Ensure PostgreSQL is running
2. Check database credentials in .env
3. Verify database exists: `psql -U twitchsync_user -d twitchsync -c "\dt"`

### TypeScript Compilation Issues
```bash
npm run build
```

### Server Won't Start
1. Check logs for missing environment variables
2. Ensure database is accessible
3. Run migrations: `npm run migrate`

## Development Commands

- `npm run dev` - Start development server with hot reload
- `npm run build` - Compile TypeScript
- `npm run migrate` - Run database migrations
- `npm run lint` - Check code style
- `npm run test` - Run tests