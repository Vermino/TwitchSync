// backend/src/routes/discovery/validation.ts

import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';

const discoveryPreferencesSchema = Joi.object({
  min_viewers: Joi.number().min(0).max(1000000).required(),
  max_viewers: Joi.number().min(0).max(1000000).required(),
  preferred_languages: Joi.array().items(Joi.string().length(2)).min(1).required(),
  content_rating: Joi.string().valid('all', 'family', 'mature').required(),
  notify_only: Joi.boolean().required(),
  schedule_match: Joi.boolean().required(),
  confidence_threshold: Joi.number().min(0).max(1).required()
}).custom((value, helpers) => {
  if (value.min_viewers >= value.max_viewers) {
    return helpers.error('custom.viewerRange', {
      message: 'min_viewers must be less than max_viewers'
    });
  }
  return value;
});

export const validateDiscoveryPreferences = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await discoveryPreferencesSchema.validateAsync(req.body);
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Invalid discovery preferences',
      details: error.details.map((detail: Joi.ValidationErrorItem) => ({
        message: detail.message,
        path: detail.path
      }))
    });
  }
};

const premiereTrackingSchema = Joi.object({
  quality: Joi.string().valid('best', 'source', '1080p', '720p', '480p').required(),
  retention: Joi.number().min(1).max(365).required(),
  notify: Joi.boolean().default(true)
});

export const validatePremiereTracking = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await premiereTrackingSchema.validateAsync(req.body);
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Invalid premiere tracking configuration',
      details: error.details.map((detail: Joi.ValidationErrorItem) => ({
        message: detail.message,
        path: detail.path
      }))
    });
  }
};

// Validation helper for checking if a premiere event exists
export const validatePremiereExists = async (
  pool: any,
  premiereId: string
): Promise<boolean> => {
  const result = await pool.query(
    'SELECT id FROM premiere_events WHERE id = $1',
    [premiereId]
  );
  return result.rows.length > 0;
};

// Validation helper for checking if a user has permission to track a premiere
export const validateUserCanTrackPremiere = async (
  pool: any,
  userId: string,
  premiereId: string
): Promise<boolean> => {
  const result = await pool.query(`
    SELECT pe.id
    FROM premiere_events pe
    WHERE pe.id = $1
    AND (
      pe.channel_id IN (SELECT channel_id FROM user_channel_preferences WHERE user_id = $2)
      OR pe.game_id IN (SELECT game_id FROM user_game_preferences WHERE user_id = $2)
    )
  `, [premiereId, userId]);

  return result.rows.length > 0;
};

// Types for discovery preferences validation
export interface DiscoveryPreferences {
  min_viewers: number;
  max_viewers: number;
  preferred_languages: string[];
  content_rating: 'all' | 'family' | 'mature';
  notify_only: boolean;
  schedule_match: boolean;
  confidence_threshold: number;
}

// Types for premiere tracking validation
export interface PremiereTrackingConfig {
  quality: 'best' | 'source' | '1080p' | '720p' | '480p';
  retention: number;
  notify: boolean;
}
