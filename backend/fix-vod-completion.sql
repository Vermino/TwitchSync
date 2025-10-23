-- Fix VOD completion check function with fallback logic
-- This addresses the "column vfs.twitch_vod_id does not exist" error

-- Check if vod_file_states table exists
DO $$
DECLARE
    table_exists boolean;
    has_twitch_vod_id boolean;
    has_twitch_id boolean;
BEGIN
    -- Check if vod_file_states table exists
    SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'vod_file_states'
    ) INTO table_exists;

    IF table_exists THEN
        RAISE NOTICE 'vod_file_states table exists, checking columns...';
        
        -- Check if twitch_vod_id column exists
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'vod_file_states' AND column_name = 'twitch_vod_id'
        ) INTO has_twitch_vod_id;
        
        -- Check if twitch_id column exists
        SELECT EXISTS (
            SELECT FROM information_schema.columns 
            WHERE table_name = 'vod_file_states' AND column_name = 'twitch_id'
        ) INTO has_twitch_id;

        RAISE NOTICE 'Has twitch_vod_id: %, Has twitch_id: %', has_twitch_vod_id, has_twitch_id;

        IF has_twitch_vod_id THEN
            RAISE NOTICE 'Using twitch_vod_id column (correct schema)';
            -- Create function with correct column name
            DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);
            CREATE OR REPLACE FUNCTION is_vod_completed_safe(
                p_twitch_vod_id BIGINT,
                p_task_id INTEGER
            )
            RETURNS BOOLEAN AS $func$
            BEGIN
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
            $func$ LANGUAGE plpgsql;
            
        ELSIF has_twitch_id THEN
            RAISE NOTICE 'Using twitch_id column (schema mismatch - fixing)';
            -- Create function with corrected column name
            DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);
            CREATE OR REPLACE FUNCTION is_vod_completed_safe(
                p_twitch_vod_id BIGINT,
                p_task_id INTEGER
            )
            RETURNS BOOLEAN AS $func$
            BEGIN
                RETURN EXISTS (
                    SELECT 1 FROM completed_vods cv 
                    WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
                ) OR EXISTS (
                    SELECT 1 FROM vod_file_states vfs 
                    WHERE vfs.twitch_id = p_twitch_vod_id 
                      AND vfs.task_id = p_task_id 
                      AND vfs.operation_status = 'completed'
                );
            END;
            $func$ LANGUAGE plpgsql;
            
        ELSE
            RAISE NOTICE 'No suitable twitch id column found - creating fallback';
            -- Create fallback function that only checks completed_vods
            DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);
            CREATE OR REPLACE FUNCTION is_vod_completed_safe(
                p_twitch_vod_id BIGINT,
                p_task_id INTEGER
            )
            RETURNS BOOLEAN AS $func$
            BEGIN
                -- Fallback: only check completed_vods table
                RETURN EXISTS (
                    SELECT 1 FROM completed_vods cv 
                    WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
                );
            END;
            $func$ LANGUAGE plpgsql;
        END IF;
        
    ELSE
        RAISE NOTICE 'vod_file_states table does not exist - creating simplified function';
        -- Create fallback function that only checks completed_vods
        DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);
        CREATE OR REPLACE FUNCTION is_vod_completed_safe(
            p_twitch_vod_id BIGINT,
            p_task_id INTEGER
        )
        RETURNS BOOLEAN AS $func$
        BEGIN
            -- Fallback: only check completed_vods table since vod_file_states doesn't exist
            RETURN EXISTS (
                SELECT 1 FROM completed_vods cv 
                WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
            );
        END;
        $func$ LANGUAGE plpgsql;
    END IF;

    RAISE NOTICE '✅ VOD completion check function fixed successfully!';
END $$;