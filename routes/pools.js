import express from 'express';
import PoolService from '../services/poolService.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkModeratorRole, checkAdminRole } from '../middleware/checkRole.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Initialize pool service
const poolService = new PoolService();

// Helper function to check specific roles
const checkRole = (roles) => {
  return (req, res, next) => {
    if (roles.includes('moderator') || roles.includes('broadcaster')) {
      return checkModeratorRole(req, res, next);
    } else if (roles.includes('superadmin')) {
      return checkAdminRole(req, res, next);
    } else {
      return next();
    }
  };
};

/**
 * @swagger
 * /api/pools:
 *   get:
 *     summary: Get all active pools
 *     tags: [Pools]
 *     responses:
 *       200:
 *         description: List of active pools
 */
router.get('/', async (req, res) => {
    try {
        const pools = await poolService.getAllPools();
        res.json(pools);
    } catch (error) {
        logger.error('Error fetching pools:', error);
        res.status(500).json({ error: 'Failed to fetch pools' });
    }
});

/**
 * @swagger
 * /api/pools/{poolName}:
 *   get:
 *     summary: Get specific pool information
 *     tags: [Pools]
 *     parameters:
 *       - in: path
 *         name: poolName
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Pool information
 *       404:
 *         description: Pool not found
 */
router.get('/:poolName', async (req, res) => {
    try {
        const pool = await poolService.getPool(req.params.poolName);
        if (!pool) {
            return res.status(404).json({ error: 'Pool not found' });
        }
        res.json(pool);
    } catch (error) {
        logger.error('Error fetching pool:', error);
        res.status(500).json({ error: 'Failed to fetch pool' });
    }
});

/**
 * @swagger
 * /api/pools/{poolName}/donations:
 *   get:
 *     summary: Get recent donations to a pool
 *     tags: [Pools]
 *     parameters:
 *       - in: path
 *         name: poolName
 *         required: true
 *         schema:
 *           type: string
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 10
 *     responses:
 *       200:
 *         description: List of recent donations
 */
router.get('/:poolName/donations', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 10;
        const donations = await poolService.getRecentDonations(req.params.poolName, limit);
        res.json(donations);
    } catch (error) {
        logger.error('Error fetching donations:', error);
        res.status(500).json({ error: 'Failed to fetch donations' });
    }
});

/**
 * @swagger
 * /api/pools:
 *   post:
 *     summary: Create a new pool (moderator only)
 *     tags: [Pools]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               poolName:
 *                 type: string
 *               description:
 *                 type: string
 *     responses:
 *       201:
 *         description: Pool created successfully
 */
router.post('/', authenticateToken, checkRole(['moderator', 'broadcaster']), async (req, res) => {
    try {
        const { poolName, description } = req.body;
        
        if (!poolName) {
            return res.status(400).json({ error: 'Pool name is required' });
        }

        const pool = await poolService.createPool(
            poolName,
            description || '',
            req.user.twitchUserId,
            req.user.username
        );

        res.status(201).json(pool);
    } catch (error) {
        logger.error('Error creating pool:', error);
        if (error.message === 'Pool name already exists') {
            res.status(409).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to create pool' });
        }
    }
});

/**
 * @swagger
 * /api/pools/{poolName}/donate:
 *   post:
 *     summary: Donate eggs to a pool
 *     tags: [Pools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: poolName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: integer
 *                 minimum: 1
 *     responses:
 *       200:
 *         description: Donation successful
 */
router.post('/:poolName/donate', authenticateToken, async (req, res) => {
    try {
        const { amount } = req.body;
        
        if (!amount || amount < 1) {
            return res.status(400).json({ error: 'Invalid donation amount' });
        }

        const result = await poolService.donateToPool(
            req.params.poolName,
            req.user.twitchUserId,
            req.user.username,
            amount
        );

        res.json(result);
    } catch (error) {
        logger.error('Error donating to pool:', error);
        if (error.message === 'Pool not found') {
            res.status(404).json({ error: error.message });
        } else if (error.message === 'Insufficient eggs') {
            res.status(400).json({ error: error.message });
        } else if (error.message === 'Pool is not active') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to process donation' });
        }
    }
});

/**
 * @swagger
 * /api/pools/{poolName}/admin:
 *   post:
 *     summary: Admin adjust pool balance (superadmin only)
 *     tags: [Pools]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: poolName
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               amount:
 *                 type: integer
 *               notes:
 *                 type: string
 *     responses:
 *       200:
 *         description: Adjustment successful
 */
router.post('/:poolName/admin', authenticateToken, checkRole(['superadmin']), async (req, res) => {
    try {
        const { amount, notes } = req.body;
        
        if (amount === undefined || amount === 0) {
            return res.status(400).json({ error: 'Invalid adjustment amount' });
        }

        const result = await poolService.adminAdjustPool(
            req.params.poolName,
            amount,
            req.user.twitchUserId,
            req.user.username,
            notes || ''
        );

        res.json(result);
    } catch (error) {
        logger.error('Error adjusting pool:', error);
        if (error.message === 'Pool not found') {
            res.status(404).json({ error: error.message });
        } else if (error.message === 'Cannot make pool balance negative') {
            res.status(400).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to adjust pool' });
        }
    }
});

export default router;