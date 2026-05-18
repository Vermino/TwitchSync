// Filepath: backend/src/database/migrations/034_vod_lifecycle_management.ts

/**
 * VOD Lifecycle Management Migration
 * 
 * This migration addresses critical database concurrency issues and implements
 * comprehensive VOD lifecycle management:
 * 
 * CONCURRENCY ISSUES FIXED:
 * 1. Duplicate key constraint violations on `unique_twitch_id_task`
 * 2. Parameter type mismatches (VARCHAR vs BIGINT for Twitch IDs)  
 * 3. Foreign key constraint violations during task deletion
 * 4. Race conditions in VOD queueing/processing
 * 
 * NEW FEATURES ADDED:
 * 1. File State Tracking - Separate file existence from download completion
 * 2. Advisory Locks - Prevent concurrent processing of same VOD
 * 3. Retention Management - User-defined cleanup policies
 * 4. Task Recreation Prevention - Avoid duplicate downloads
 * 5. File Verification System - Track file integrity over time
 * 6. Storage Analytics - Monitor disk usage and cleanup opportunities
 * 
 * CONCURRENCY SAFETY:
 * - Advisory locks with timeout for processing coordination
 * - Upsert patterns with proper conflict resolution
 * - Type-safe BIGINT handling for Twitch IDs
 * - Orphaned record cleanup for foreign key violations
 * - Retry logic with exponential backoff support
 */

import { Pool } from 'pg';
import { logger } from '../../utils/logger';

export const up = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting VOD lifecycle management migration (with concurrency fixes)');

    // Create advisory lock function for safe concurrent operations
    await client.query(`
      CREATE OR REPLACE FUNCTION acquire_vod_lock(vod_twitch_id BIGINT, task_id_val INTEGER)
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_key BIGINT;
      BEGIN
        -- Create deterministic lock key from twitch_id and task_id
        lock_key := (vod_twitch_id % 2147483647) * 1000000 + (task_id_val % 1000000);
        RETURN pg_try_advisory_lock(lock_key);
      END;
      $$ LANGUAGE plpgsql;

      CREATE OR REPLACE FUNCTION release_vod_lock(vod_twitch_id BIGINT, task_id_val INTEGER)
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_key BIGINT;
      BEGIN
        lock_key := (vod_twitch_id % 2147483647) * 1000000 + (task_id_val % 1000000);
        RETURN pg_advisory_unlock(lock_key);
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create new enums for lifecycle management
    await client.query(`
      DO $$ BEGIN
        -- File state enum separate from download state
        CREATE TYPE file_state AS ENUM (
          'not_downloaded',      -- Never downloaded
          'present',            -- File exists on disk
          'missing',            -- File should exist but doesn't
          'corrupted',          -- File exists but checksum mismatch
          'partial',            -- Incomplete file
          'archived',           -- Moved to archive location
          'scheduled_deletion', -- Marked for deletion
          'deleted'             -- File deleted from disk
        );

        -- Retention policy status
        CREATE TYPE retention_status AS ENUM (
          'active',             -- Within retention period
          'eligible_deletion',  -- Past retention, can be deleted
          'protected',          -- User protected from deletion
          'scheduled',          -- Scheduled for deletion
          'expired'             -- Past deletion grace period
        );

        -- File verification status
        CREATE TYPE verification_status AS ENUM (
          'pending',            -- Not yet verified
          'verified',           -- File exists and valid
          'failed',             -- Verification failed
          'skipped'             -- Verification skipped
        );

        -- Concurrency operation status
        CREATE TYPE operation_status AS ENUM (
          'pending',
          'in_progress', 
          'completed',
          'failed',
          'cancelled'
        );

      EXCEPTION
        WHEN duplicate_object THEN null;
      END $$;
    `);

    // Enhanced file state tracking table with concurrency safety
    await client.query(`
      CREATE TABLE vod_file_states (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER NOT NULL REFERENCES vods(id) ON DELETE CASCADE,
        task_id INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        twitch_vod_id BIGINT NOT NULL,
        
        -- File information
        file_path TEXT,
        file_name TEXT,
        file_size_bytes BIGINT DEFAULT 0,
        expected_size_bytes BIGINT,
        checksum_md5 TEXT,
        checksum_sha256 TEXT,
        
        -- State tracking
        file_state file_state DEFAULT 'not_downloaded',
        download_state vod_status DEFAULT 'pending',  -- References existing enum
        verification_status verification_status DEFAULT 'pending',
        operation_status operation_status DEFAULT 'pending',
        
        -- Concurrency control
        processing_started_at TIMESTAMP WITH TIME ZONE,
        processing_locked_by TEXT,
        lock_timeout_at TIMESTAMP WITH TIME ZONE,
        retry_count INTEGER DEFAULT 0,
        max_retries INTEGER DEFAULT 3,
        
        -- Metadata
        mime_type TEXT,
        file_format TEXT,
        video_metadata JSONB DEFAULT '{}'::jsonb,
        error_details JSONB DEFAULT '{}'::jsonb,
        
        -- Timestamps
        first_downloaded_at TIMESTAMP WITH TIME ZONE,
        last_verified_at TIMESTAMP WITH TIME ZONE,
        last_modified_at TIMESTAMP WITH TIME ZONE,
        file_created_at TIMESTAMP WITH TIME ZONE,
        
        -- Flags
        is_user_protected BOOLEAN DEFAULT false,
        verification_enabled BOOLEAN DEFAULT true,
        force_redownload BOOLEAN DEFAULT false,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Unique constraints to prevent duplicate processing
        UNIQUE(vod_id),
        UNIQUE(twitch_vod_id, task_id)
      );

      COMMENT ON TABLE vod_file_states IS 'Tracks file existence and integrity separate from download completion with concurrency safety';
      COMMENT ON COLUMN vod_file_states.twitch_vod_id IS 'Twitch VOD ID as BIGINT to prevent type mismatches';
      COMMENT ON COLUMN vod_file_states.processing_locked_by IS 'Worker/instance ID that has locked this VOD for processing';
      COMMENT ON COLUMN vod_file_states.lock_timeout_at IS 'When the processing lock expires (prevents stuck locks)';
      COMMENT ON COLUMN vod_file_states.operation_status IS 'Current operation status for concurrency tracking';
    `);

    // Retention policies table
    await client.query(`
      CREATE TABLE vod_retention_policies (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        task_id INTEGER REFERENCES tasks(id) ON DELETE CASCADE,
        channel_id INTEGER REFERENCES channels(id) ON DELETE CASCADE,
        
        -- Policy configuration
        retention_days INTEGER NOT NULL DEFAULT 30,
        auto_delete_enabled BOOLEAN DEFAULT false,
        grace_period_days INTEGER DEFAULT 7,
        
        -- Size-based retention
        max_storage_gb DECIMAL(10,2),
        delete_oldest_when_full BOOLEAN DEFAULT false,
        
        -- Content filters
        min_duration_minutes INTEGER,
        min_view_count INTEGER,
        exclude_highlights BOOLEAN DEFAULT false,
        exclude_premieres BOOLEAN DEFAULT false,
        
        -- Advanced rules
        keep_last_n_vods INTEGER,
        keep_vods_newer_than_days INTEGER,
        custom_rules JSONB DEFAULT '{}'::jsonb,
        
        -- Priority and ordering
        priority INTEGER DEFAULT 1,
        is_active BOOLEAN DEFAULT true,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        -- Ensure logical hierarchy (user > task > channel)
        CHECK (
          (user_id IS NOT NULL AND task_id IS NULL AND channel_id IS NULL) OR
          (user_id IS NOT NULL AND task_id IS NOT NULL AND channel_id IS NULL) OR
          (user_id IS NOT NULL AND task_id IS NOT NULL AND channel_id IS NOT NULL)
        )
      );

      COMMENT ON TABLE vod_retention_policies IS 'Hierarchical retention policies for VOD cleanup';
    `);

    // Retention tracking table
    await client.query(`
      CREATE TABLE vod_retention_tracking (
        id SERIAL PRIMARY KEY,
        vod_id INTEGER NOT NULL REFERENCES vods(id) ON DELETE CASCADE,
        file_state_id INTEGER NOT NULL REFERENCES vod_file_states(id) ON DELETE CASCADE,
        retention_policy_id INTEGER REFERENCES vod_retention_policies(id) ON DELETE SET NULL,
        
        -- Current status
        retention_status retention_status DEFAULT 'active',
        
        -- Calculated dates based on policy
        eligible_for_deletion_at TIMESTAMP WITH TIME ZONE,
        scheduled_deletion_at TIMESTAMP WITH TIME ZONE,
        grace_period_expires_at TIMESTAMP WITH TIME ZONE,
        
        -- User overrides
        user_protected_until TIMESTAMP WITH TIME ZONE,
        user_marked_for_deletion BOOLEAN DEFAULT false,
        deletion_reason TEXT,
        
        -- Storage impact
        storage_savings_bytes BIGINT DEFAULT 0,
        
        -- Last policy evaluation
        last_evaluated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        policy_version INTEGER DEFAULT 1,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(vod_id)
      );

      COMMENT ON TABLE vod_retention_tracking IS 'Tracks retention status and deletion scheduling per VOD';
    `);

    // File verification history
    await client.query(`
      CREATE TABLE file_verification_history (
        id SERIAL PRIMARY KEY,
        file_state_id INTEGER NOT NULL REFERENCES vod_file_states(id) ON DELETE CASCADE,
        
        -- Verification details
        verification_type VARCHAR(50) NOT NULL, -- 'existence', 'size', 'checksum', 'full'
        verification_status verification_status NOT NULL,
        
        -- Results
        file_exists BOOLEAN,
        size_matches BOOLEAN,
        checksum_matches BOOLEAN,
        expected_checksum TEXT,
        actual_checksum TEXT,
        
        -- Performance metrics
        verification_duration_ms INTEGER,
        file_size_checked BIGINT,
        
        -- Error details
        error_message TEXT,
        error_code VARCHAR(50),
        
        -- Context
        triggered_by VARCHAR(50), -- 'scheduled', 'user_request', 'download_complete', 'startup'
        verification_depth VARCHAR(20) DEFAULT 'basic', -- 'basic', 'standard', 'full'
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
      );

      COMMENT ON TABLE file_verification_history IS 'History of file verification attempts and results';
    `);

    // Storage analytics table
    await client.query(`
      CREATE TABLE storage_analytics (
        id SERIAL PRIMARY KEY,
        user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
        
        -- Snapshot data
        total_files INTEGER DEFAULT 0,
        total_size_bytes BIGINT DEFAULT 0,
        total_size_gb DECIMAL(10,2) GENERATED ALWAYS AS (total_size_bytes / 1073741824.0) STORED,
        
        -- Breakdown by status
        files_downloaded INTEGER DEFAULT 0,
        files_missing INTEGER DEFAULT 0,
        files_corrupted INTEGER DEFAULT 0,
        files_archived INTEGER DEFAULT 0,
        
        -- Size breakdown
        downloaded_size_bytes BIGINT DEFAULT 0,
        missing_size_bytes BIGINT DEFAULT 0,
        corrupted_size_bytes BIGINT DEFAULT 0,
        archived_size_bytes BIGINT DEFAULT 0,
        
        -- Cleanup potential
        eligible_for_deletion_count INTEGER DEFAULT 0,
        eligible_for_deletion_bytes BIGINT DEFAULT 0,
        eligible_for_deletion_gb DECIMAL(10,2) GENERATED ALWAYS AS (eligible_for_deletion_bytes / 1073741824.0) STORED,
        
        -- Top consumers
        largest_files_data JSONB DEFAULT '[]'::jsonb,
        channels_by_size JSONB DEFAULT '[]'::jsonb,
        games_by_size JSONB DEFAULT '[]'::jsonb,
        
        -- Metrics period
        snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
        calculation_duration_ms INTEGER,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(user_id, snapshot_date)
      );

      COMMENT ON TABLE storage_analytics IS 'Daily storage analytics snapshots for dashboard and cleanup planning';
    `);

    // Task recreation prevention table
    await client.query(`
      CREATE TABLE task_recreation_tracking (
        id SERIAL PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        
        -- Task fingerprint (normalized criteria hash)
        criteria_hash VARCHAR(64) NOT NULL,
        
        -- Original task information
        original_task_id INTEGER, -- May be null if task deleted
        task_name TEXT NOT NULL,
        channel_ids INTEGER[],
        game_ids INTEGER[],
        
        -- Completion tracking
        total_vods_discovered INTEGER DEFAULT 0,
        total_vods_downloaded INTEGER DEFAULT 0,
        completed_vods_list JSONB DEFAULT '[]'::jsonb,
        
        -- Status
        is_active BOOLEAN DEFAULT true,
        last_execution_at TIMESTAMP WITH TIME ZONE,
        
        -- Policy settings
        prevent_redownload BOOLEAN DEFAULT true,
        allow_new_vods_only BOOLEAN DEFAULT true,
        redownload_missing_files BOOLEAN DEFAULT false,
        
        created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
        
        UNIQUE(user_id, criteria_hash)
      );

      COMMENT ON TABLE task_recreation_tracking IS 'Prevents duplicate downloads when users recreate similar tasks';
    `);

    // Fix existing completed_vods constraint issue by adding upsert support
    await client.query(`
      -- Create safe upsert function for completed_vods to handle concurrency
      CREATE OR REPLACE FUNCTION upsert_completed_vod(
        p_vod_id INTEGER,
        p_task_id INTEGER, 
        p_twitch_id BIGINT,
        p_file_path TEXT,
        p_file_name TEXT,
        p_file_size_bytes BIGINT,
        p_download_duration_seconds INTEGER DEFAULT NULL,
        p_download_speed_mbps DECIMAL(10,2) DEFAULT NULL,
        p_checksum_md5 TEXT DEFAULT NULL,
        p_metadata JSONB DEFAULT '{}'::jsonb
      )
      RETURNS INTEGER AS $$
      DECLARE
        completed_vod_id INTEGER;
      BEGIN
        -- Try to insert, ignore if already exists due to unique constraint
        INSERT INTO completed_vods (
          vod_id, task_id, twitch_id, file_path, file_name, file_size_bytes,
          download_duration_seconds, download_speed_mbps, checksum_md5, metadata
        ) VALUES (
          p_vod_id, p_task_id, p_twitch_id, p_file_path, p_file_name, p_file_size_bytes,
          p_download_duration_seconds, p_download_speed_mbps, p_checksum_md5, p_metadata
        ) 
        ON CONFLICT (twitch_id, task_id) DO UPDATE SET
          file_path = EXCLUDED.file_path,
          file_name = EXCLUDED.file_name, 
          file_size_bytes = EXCLUDED.file_size_bytes,
          download_duration_seconds = COALESCE(EXCLUDED.download_duration_seconds, completed_vods.download_duration_seconds),
          download_speed_mbps = COALESCE(EXCLUDED.download_speed_mbps, completed_vods.download_speed_mbps),
          checksum_md5 = COALESCE(EXCLUDED.checksum_md5, completed_vods.checksum_md5),
          metadata = EXCLUDED.metadata,
          completed_at = NOW()
        RETURNING id INTO completed_vod_id;
        
        RETURN completed_vod_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create indexes for performance
    await client.query(`
      -- File states indexes (enhanced for concurrency)
      CREATE INDEX idx_vod_file_states_vod_id ON vod_file_states(vod_id);
      CREATE INDEX idx_vod_file_states_task_id ON vod_file_states(task_id);
      CREATE INDEX idx_vod_file_states_twitch_id ON vod_file_states(twitch_vod_id);
      CREATE INDEX idx_vod_file_states_file_state ON vod_file_states(file_state);
      CREATE INDEX idx_vod_file_states_operation_status ON vod_file_states(operation_status);
      CREATE INDEX idx_vod_file_states_verification ON vod_file_states(verification_status, last_verified_at);
      CREATE INDEX idx_vod_file_states_size ON vod_file_states(file_size_bytes) WHERE file_size_bytes > 0;
      CREATE INDEX idx_vod_file_states_processing_lock ON vod_file_states(processing_locked_by, lock_timeout_at) 
        WHERE processing_locked_by IS NOT NULL;
      CREATE INDEX idx_vod_file_states_retry ON vod_file_states(retry_count, max_retries) 
        WHERE retry_count < max_retries;
      
      -- Retention policies indexes
      CREATE INDEX idx_retention_policies_user ON vod_retention_policies(user_id);
      CREATE INDEX idx_retention_policies_task ON vod_retention_policies(task_id);
      CREATE INDEX idx_retention_policies_channel ON vod_retention_policies(channel_id);
      CREATE INDEX idx_retention_policies_active ON vod_retention_policies(is_active, priority);
      
      -- Retention tracking indexes
      CREATE INDEX idx_retention_tracking_vod ON vod_retention_tracking(vod_id);
      CREATE INDEX idx_retention_tracking_status ON vod_retention_tracking(retention_status);
      CREATE INDEX idx_retention_tracking_eligible ON vod_retention_tracking(eligible_for_deletion_at) 
        WHERE retention_status = 'eligible_deletion';
      CREATE INDEX idx_retention_tracking_scheduled ON vod_retention_tracking(scheduled_deletion_at) 
        WHERE scheduled_deletion_at IS NOT NULL;
      
      -- Verification history indexes
      CREATE INDEX idx_verification_history_file_state ON file_verification_history(file_state_id);
      CREATE INDEX idx_verification_history_status ON file_verification_history(verification_status, created_at);
      CREATE INDEX idx_verification_history_type ON file_verification_history(verification_type, created_at);
      
      -- Storage analytics indexes
      CREATE INDEX idx_storage_analytics_user ON storage_analytics(user_id);
      CREATE INDEX idx_storage_analytics_date ON storage_analytics(snapshot_date DESC);
      
      -- Task recreation indexes
      CREATE INDEX idx_task_recreation_user ON task_recreation_tracking(user_id);
      CREATE INDEX idx_task_recreation_hash ON task_recreation_tracking(criteria_hash);
      CREATE INDEX idx_task_recreation_active ON task_recreation_tracking(is_active);
    `);

    // Create concurrency-safe VOD processing functions
    await client.query(`
      -- Function to safely queue a VOD for processing with proper type handling
      CREATE OR REPLACE FUNCTION safe_queue_vod_for_processing(
        p_vod_id INTEGER,
        p_task_id INTEGER,
        p_twitch_vod_id BIGINT,
        p_worker_id TEXT,
        p_expected_size_bytes BIGINT DEFAULT NULL,
        p_timeout_minutes INTEGER DEFAULT 30
      )
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_acquired BOOLEAN;
        existing_lock TEXT;
        lock_expired BOOLEAN;
      BEGIN
        -- Check if there's an existing lock that hasn't expired
        SELECT 
          processing_locked_by,
          (lock_timeout_at < NOW()) as expired
        INTO existing_lock, lock_expired
        FROM vod_file_states 
        WHERE twitch_vod_id = p_twitch_vod_id AND task_id = p_task_id;
        
        -- If lock exists and hasn't expired, operation fails
        IF existing_lock IS NOT NULL AND NOT lock_expired THEN
          RETURN FALSE;
        END IF;
        
        -- Try to acquire advisory lock
        SELECT acquire_vod_lock(p_twitch_vod_id, p_task_id) INTO lock_acquired;
        
        IF NOT lock_acquired THEN
          RETURN FALSE;
        END IF;
        
        -- Upsert the VOD file state with lock
        INSERT INTO vod_file_states (
          vod_id, task_id, twitch_vod_id, expected_size_bytes,
          operation_status, processing_locked_by, lock_timeout_at,
          processing_started_at
        ) VALUES (
          p_vod_id, p_task_id, p_twitch_vod_id, p_expected_size_bytes,
          'in_progress', p_worker_id, 
          NOW() + (p_timeout_minutes || ' minutes')::interval,
          NOW()
        )
        ON CONFLICT (twitch_vod_id, task_id) DO UPDATE SET
          operation_status = 'in_progress',
          processing_locked_by = p_worker_id,
          lock_timeout_at = NOW() + (p_timeout_minutes || ' minutes')::interval,
          processing_started_at = NOW(),
          retry_count = CASE 
            WHEN vod_file_states.operation_status = 'failed' 
            THEN vod_file_states.retry_count + 1 
            ELSE vod_file_states.retry_count 
          END,
          updated_at = NOW();
        
        RETURN TRUE;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to safely release VOD processing lock
      CREATE OR REPLACE FUNCTION safe_release_vod_lock(
        p_twitch_vod_id BIGINT,
        p_task_id INTEGER,
        p_worker_id TEXT,
        p_new_status operation_status DEFAULT 'completed',
        p_file_state file_state DEFAULT NULL,
        p_file_path TEXT DEFAULT NULL,
        p_file_size_bytes BIGINT DEFAULT NULL,
        p_error_details JSONB DEFAULT NULL
      )
      RETURNS BOOLEAN AS $$
      DECLARE
        lock_released BOOLEAN;
      BEGIN
        -- Verify the worker still owns the lock
        IF NOT EXISTS (
          SELECT 1 FROM vod_file_states 
          WHERE twitch_vod_id = p_twitch_vod_id 
            AND task_id = p_task_id 
            AND processing_locked_by = p_worker_id
        ) THEN
          RETURN FALSE;
        END IF;
        
        -- Update the file state
        UPDATE vod_file_states SET
          operation_status = p_new_status,
          file_state = COALESCE(p_file_state, file_state),
          file_path = COALESCE(p_file_path, file_path),
          file_size_bytes = COALESCE(p_file_size_bytes, file_size_bytes),
          error_details = COALESCE(p_error_details, error_details),
          processing_locked_by = NULL,
          lock_timeout_at = NULL,
          last_verified_at = CASE WHEN p_new_status = 'completed' THEN NOW() ELSE last_verified_at END,
          first_downloaded_at = CASE WHEN p_new_status = 'completed' AND first_downloaded_at IS NULL THEN NOW() ELSE first_downloaded_at END,
          updated_at = NOW()
        WHERE twitch_vod_id = p_twitch_vod_id 
          AND task_id = p_task_id 
          AND processing_locked_by = p_worker_id;
        
        -- Release advisory lock
        SELECT release_vod_lock(p_twitch_vod_id, p_task_id) INTO lock_released;
        
        RETURN TRUE;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to clean up expired locks
      CREATE OR REPLACE FUNCTION cleanup_expired_vod_locks()
      RETURNS INTEGER AS $$
      DECLARE
        cleaned_count INTEGER;
      BEGIN
        UPDATE vod_file_states SET
          operation_status = 'failed',
          processing_locked_by = NULL,
          lock_timeout_at = NULL,
          error_details = jsonb_build_object(
            'error', 'Lock timeout - worker may have crashed',
            'expired_at', NOW()
          ),
          retry_count = retry_count + 1,
          updated_at = NOW()
        WHERE lock_timeout_at < NOW() 
          AND processing_locked_by IS NOT NULL;
        
        GET DIAGNOSTICS cleaned_count = ROW_COUNT;
        RETURN cleaned_count;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to get processing queue with proper ordering
      CREATE OR REPLACE FUNCTION get_vod_processing_queue(p_limit INTEGER DEFAULT 100)
      RETURNS TABLE (
        vod_id INTEGER,
        task_id INTEGER,
        twitch_vod_id BIGINT,
        operation_status operation_status,
        retry_count INTEGER,
        max_retries INTEGER,
        created_at TIMESTAMP WITH TIME ZONE
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          vfs.vod_id, vfs.task_id, vfs.twitch_vod_id, vfs.operation_status,
          vfs.retry_count, vfs.max_retries, vfs.created_at
        FROM vod_file_states vfs
        WHERE vfs.operation_status IN ('pending', 'failed')
          AND vfs.retry_count < vfs.max_retries
          AND vfs.processing_locked_by IS NULL
        ORDER BY 
          vfs.operation_status DESC, -- pending first, then failed
          vfs.retry_count ASC,       -- fewer retries first  
          vfs.created_at ASC         -- older tasks first
        LIMIT p_limit;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to handle foreign key violations gracefully (orphaned VODs)
      CREATE OR REPLACE FUNCTION safe_cleanup_orphaned_vods()
      RETURNS TABLE (
        cleaned_vod_states INTEGER,
        cleaned_completed_vods INTEGER,
        cleaned_retention_tracking INTEGER
      ) AS $$
      DECLARE
        vod_states_count INTEGER;
        completed_vods_count INTEGER;
        retention_count INTEGER;
      BEGIN
        -- Clean up vod_file_states where referenced vod or task no longer exists
        DELETE FROM vod_file_states vfs
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = vfs.vod_id)
           OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = vfs.task_id);
        GET DIAGNOSTICS vod_states_count = ROW_COUNT;

        -- Clean up completed_vods where referenced vod or task no longer exists  
        DELETE FROM completed_vods cv
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = cv.vod_id)
           OR NOT EXISTS (SELECT 1 FROM tasks t WHERE t.id = cv.task_id);
        GET DIAGNOSTICS completed_vods_count = ROW_COUNT;

        -- Clean up retention tracking for non-existent VODs
        DELETE FROM vod_retention_tracking vrt
        WHERE NOT EXISTS (SELECT 1 FROM vods v WHERE v.id = vrt.vod_id);
        GET DIAGNOSTICS retention_count = ROW_COUNT;

        -- Return cleanup stats
        cleaned_vod_states := vod_states_count;
        cleaned_completed_vods := completed_vods_count;
        cleaned_retention_tracking := retention_count;
        
        RETURN NEXT;
      END;
      $$ LANGUAGE plpgsql;

      -- Function to check VOD completion status with proper type safety
      CREATE OR REPLACE FUNCTION is_vod_completed_safe(
        p_twitch_vod_id BIGINT,  -- Use BIGINT for type safety
        p_task_id INTEGER
      )
      RETURNS BOOLEAN AS $$
      BEGIN
        -- Check both completed_vods and vod_file_states for completion
        RETURN EXISTS (
          SELECT 1 FROM completed_vods cv 
          WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
        ) OR EXISTS (
          SELECT 1 FROM vod_file_states vfs 
          WHERE vfs.twitch_vod_id = p_twitch_vod_id 
            AND vfs.task_id = p_task_id 
            AND vfs.operation_status = 'completed'
        );
      END;
      $$ LANGUAGE plpgsql;

      -- Function to get comprehensive VOD status
      CREATE OR REPLACE FUNCTION get_vod_comprehensive_status(
        p_twitch_vod_id BIGINT,
        p_task_id INTEGER
      )
      RETURNS TABLE (
        file_exists BOOLEAN,
        operation_status operation_status,
        file_state file_state,
        file_size_bytes BIGINT,
        completed_at TIMESTAMP WITH TIME ZONE,
        retry_count INTEGER,
        error_details JSONB
      ) AS $$
      BEGIN
        RETURN QUERY
        SELECT 
          (vfs.file_state = 'present') as file_exists,
          vfs.operation_status,
          vfs.file_state,
          vfs.file_size_bytes,
          cv.completed_at,
          vfs.retry_count,
          vfs.error_details
        FROM vod_file_states vfs
        LEFT JOIN completed_vods cv ON (cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id)
        WHERE vfs.twitch_vod_id = p_twitch_vod_id AND vfs.task_id = p_task_id;
      END;
      $$ LANGUAGE plpgsql;
    `);

    // Create triggers for updated_at timestamps
    await client.query(`
      CREATE TRIGGER update_vod_file_states_updated_at
        BEFORE UPDATE ON vod_file_states
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_vod_retention_policies_updated_at
        BEFORE UPDATE ON vod_retention_policies
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_vod_retention_tracking_updated_at
        BEFORE UPDATE ON vod_retention_tracking
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();

      CREATE TRIGGER update_task_recreation_tracking_updated_at
        BEFORE UPDATE ON task_recreation_tracking
        FOR EACH ROW
        EXECUTE FUNCTION update_updated_at_column();
      
      -- Trigger to automatically clean up expired locks periodically
      CREATE OR REPLACE FUNCTION trigger_cleanup_expired_locks()
      RETURNS TRIGGER AS $$
      BEGIN
        PERFORM cleanup_expired_vod_locks();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      -- Trigger on vod_file_states updates to clean up expired locks
      CREATE TRIGGER cleanup_expired_locks_trigger
        AFTER UPDATE ON vod_file_states
        FOR EACH STATEMENT
        WHEN (pg_trigger_depth() = 0)
        EXECUTE FUNCTION trigger_cleanup_expired_locks();
    `);

    await client.query('COMMIT');
    logger.info('VOD lifecycle management migration completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in VOD lifecycle management migration:', error);
    throw error;
  } finally {
    client.release();
  }
};

export const down = async (pool: Pool): Promise<void> => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    logger.info('Starting VOD lifecycle management rollback');

    // Drop triggers first
    await client.query(`
      DROP TRIGGER IF EXISTS cleanup_expired_locks_trigger ON vod_file_states;
      DROP TRIGGER IF EXISTS update_task_recreation_tracking_updated_at ON task_recreation_tracking;
      DROP TRIGGER IF EXISTS update_vod_retention_tracking_updated_at ON vod_retention_tracking;
      DROP TRIGGER IF EXISTS update_vod_retention_policies_updated_at ON vod_retention_policies;
      DROP TRIGGER IF EXISTS update_vod_file_states_updated_at ON vod_file_states;
    `);

    // Drop functions (in reverse order of dependency)
    await client.query(`
      DROP FUNCTION IF EXISTS trigger_cleanup_expired_locks();
      DROP FUNCTION IF EXISTS get_vod_comprehensive_status(BIGINT, INTEGER);
      DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);
      DROP FUNCTION IF EXISTS safe_cleanup_orphaned_vods();
      DROP FUNCTION IF EXISTS get_vod_processing_queue(INTEGER);
      DROP FUNCTION IF EXISTS cleanup_expired_vod_locks();
      DROP FUNCTION IF EXISTS safe_release_vod_lock(BIGINT, INTEGER, TEXT, operation_status, file_state, TEXT, BIGINT, JSONB);
      DROP FUNCTION IF EXISTS safe_queue_vod_for_processing(INTEGER, INTEGER, BIGINT, TEXT, BIGINT, INTEGER);
      DROP FUNCTION IF EXISTS upsert_completed_vod(INTEGER, INTEGER, BIGINT, TEXT, TEXT, BIGINT, INTEGER, DECIMAL, TEXT, JSONB);
      DROP FUNCTION IF EXISTS release_vod_lock(BIGINT, INTEGER);
      DROP FUNCTION IF EXISTS acquire_vod_lock(BIGINT, INTEGER);
    `);

    // Drop tables in dependency order
    await client.query(`
      DROP TABLE IF EXISTS storage_analytics CASCADE;
      DROP TABLE IF EXISTS file_verification_history CASCADE;
      DROP TABLE IF EXISTS vod_retention_tracking CASCADE;
      DROP TABLE IF EXISTS vod_retention_policies CASCADE;
      DROP TABLE IF EXISTS task_recreation_tracking CASCADE;
      DROP TABLE IF EXISTS vod_file_states CASCADE;
    `);

    // Drop enums
    await client.query(`
      DROP TYPE IF EXISTS operation_status CASCADE;
      DROP TYPE IF EXISTS verification_status CASCADE;
      DROP TYPE IF EXISTS retention_status CASCADE;
      DROP TYPE IF EXISTS file_state CASCADE;
    `);

    await client.query('COMMIT');
    logger.info('VOD lifecycle management rollback completed successfully');
  } catch (error) {
    await client.query('ROLLBACK');
    logger.error('Error in VOD lifecycle management rollback:', error);
    throw error;
  } finally {
    client.release();
  }
};