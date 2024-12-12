import { Router } from 'express';
import { Pool } from 'pg';
import VODAnalyzer from '../services/vodAnalyzer';
import { logger } from '../utils/logger';

const router = Router();

export const setupVODAnalysisRoutes = (pool: Pool) => {
  const analyzer = VODAnalyzer.getInstance(pool);

  // Analyze a specific VOD
  router.post('/:vodId/analyze', async (req, res) => {
    const vodId = parseInt(req.params.vodId);

    try {
      await analyzer.analyzeVOD(vodId);
      res.json({ message: 'VOD analysis completed successfully' });
    } catch (error) {
      logger.error('Error analyzing VOD:', error);
      res.status(500).json({ error: 'Failed to analyze VOD' });
    }
  });

  // Get chapters for a VOD
  router.get('/:vodId/chapters', async (req, res) => {
    const vodId = parseInt(req.params.vodId);

    try {
      const chapters = await analyzer.getVODChapters(vodId);
      res.json(chapters);
    } catch (error) {
      logger.error('Error fetching VOD chapters:', error);
      res.status(500).json({ error: 'Failed to fetch VOD chapters' });
    }
  });

  // Reanalyze a VOD
  router.post('/:vodId/reanalyze', async (req, res) => {
    const vodId = parseInt(req.params.vodId);

    try {
      await analyzer.reanalyzeVOD(vodId);
      res.json({ message: 'VOD reanalysis completed successfully' });
    } catch (error) {
      logger.error('Error reanalyzing VOD:', error);
      res.status(500).json({ error: 'Failed to reanalyze VOD' });
    }
  });

  return router;
};
