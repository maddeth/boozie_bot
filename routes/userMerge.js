import express from 'express';
import UserMergeService from '../services/userMergeService.js';
import { authenticateToken } from '../middleware/auth.js';
import { checkAdminRole } from '../middleware/checkRole.js';
import logger from '../utils/logger.js';

const router = express.Router();

// Initialize merge service
const userMergeService = new UserMergeService();

/**
 * @swagger
 * /api/user-merge/preview:
 *   post:
 *     summary: Preview a user merge operation (admin only)
 *     tags: [User Merge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromUserId:
 *                 type: string
 *               toUserId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Merge preview data
 */
router.post('/preview', authenticateToken, checkAdminRole, async (req, res) => {
    try {
        const { fromUserId, toUserId } = req.body;
        
        if (!fromUserId || !toUserId) {
            return res.status(400).json({ error: 'Both fromUserId and toUserId are required' });
        }

        if (fromUserId === toUserId) {
            return res.status(400).json({ error: 'Cannot merge user with themselves' });
        }

        const preview = await userMergeService.previewMerge(fromUserId, toUserId);
        res.json(preview);
    } catch (error) {
        logger.error('Error previewing user merge:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to preview merge' });
        }
    }
});

/**
 * @swagger
 * /api/user-merge/execute:
 *   post:
 *     summary: Execute a user merge operation (admin only)
 *     tags: [User Merge]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               fromUserId:
 *                 type: string
 *               toUserId:
 *                 type: string
 *               reason:
 *                 type: string
 *               deleteSource:
 *                 type: boolean
 *                 default: false
 *     responses:
 *       200:
 *         description: Merge executed successfully
 */
router.post('/execute', authenticateToken, checkAdminRole, async (req, res) => {
    try {
        const { fromUserId, toUserId, reason, deleteSource = false } = req.body;
        
        if (!fromUserId || !toUserId) {
            return res.status(400).json({ error: 'Both fromUserId and toUserId are required' });
        }

        if (fromUserId === toUserId) {
            return res.status(400).json({ error: 'Cannot merge user with themselves' });
        }

        const result = await userMergeService.mergeUserEggs(
            fromUserId,
            toUserId,
            req.userRole.twitch_user_id,
            req.userRole.username,
            reason || 'Account merge requested',
            deleteSource
        );

        res.json(result);
    } catch (error) {
        logger.error('Error executing user merge:', error);
        if (error.message.includes('not found')) {
            res.status(404).json({ error: error.message });
        } else {
            res.status(500).json({ error: 'Failed to execute merge' });
        }
    }
});

/**
 * @swagger
 * /api/user-merge/history:
 *   get:
 *     summary: Get merge history for all users (admin only)
 *     tags: [User Merge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *     responses:
 *       200:
 *         description: List of merge operations
 */
router.get('/history', authenticateToken, checkAdminRole, async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 50;
        const history = await userMergeService.getAllMergeHistory(limit);
        res.json(history);
    } catch (error) {
        logger.error('Error fetching merge history:', error);
        res.status(500).json({ error: 'Failed to fetch merge history' });
    }
});

/**
 * @swagger
 * /api/user-merge/history/{userId}:
 *   get:
 *     summary: Get merge history for a specific user (admin only)
 *     tags: [User Merge]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
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
 *         description: User's merge history
 */
router.get('/history/:userId', authenticateToken, checkAdminRole, async (req, res) => {
    try {
        const { userId } = req.params;
        const limit = parseInt(req.query.limit) || 10;
        
        const history = await userMergeService.getMergeHistory(userId, limit);
        res.json(history);
    } catch (error) {
        logger.error('Error fetching user merge history:', error);
        res.status(500).json({ error: 'Failed to fetch user merge history' });
    }
});

export default router;