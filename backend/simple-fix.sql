-- Simple fix for the vod completion check issue
-- Replace the problematic function with a working version

DROP FUNCTION IF EXISTS is_vod_completed_safe(BIGINT, INTEGER);

CREATE OR REPLACE FUNCTION is_vod_completed_safe(
    p_twitch_vod_id BIGINT,
    p_task_id INTEGER
)
RETURNS BOOLEAN AS $$
BEGIN
    -- Only check completed_vods table to avoid schema issues
    RETURN EXISTS (
        SELECT 1 FROM completed_vods cv 
        WHERE cv.twitch_id = p_twitch_vod_id AND cv.task_id = p_task_id
    );
END;
$$ LANGUAGE plpgsql;