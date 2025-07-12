import sql from './database/db.js';
import logger from '../utils/logger.js';

class PoolService {
    constructor() {
        this.sql = sql;
    }

    /**
     * Create a new pool
     * @param {string} poolName - Name of the pool (will be prefixed automatically)
     * @param {string} description - Description of the pool
     * @param {string} creatorTwitchId - Twitch ID of the creator
     * @param {string} creatorUsername - Username of the creator
     */
    async createPool(poolName, description, creatorTwitchId, creatorUsername) {
        try {
            // Ensure pool name has a valid prefix
            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let finalPoolName = sanitisedName;
            
            // Add prefix if not already present
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                finalPoolName = `pool_${sanitisedName}`;
            }

            // Check if pool already exists
            const existingPool = await this.sql`
                SELECT id, pool_name, is_active 
                FROM pools 
                WHERE pool_name = ${poolName}
            `;

            if (existingPool.length > 0) {
                const pool = existingPool[0];
                if (pool.is_active) {
                    throw new Error('Pool name already exists');
                } else {
                    // Reactivate the inactive pool
                    const result = await this.sql`
                        UPDATE pools 
                        SET is_active = true,
                            description = ${description},
                            created_by_twitch_id = ${creatorTwitchId},
                            created_by_username = ${creatorUsername}
                        WHERE id = ${pool.id}
                        RETURNING *
                    `;
                    logger.info(`Pool reactivated: ${finalPoolName} by ${creatorUsername}`);
                    return result[0];
                }
            }

            // Create new pool
            const result = await this.sql`
                INSERT INTO pools (
                    pool_name, 
                    pool_name_sanitised, 
                    description, 
                    created_by_twitch_id, 
                    created_by_username
                )
                VALUES (
                    ${poolName}, 
                    ${finalPoolName}, 
                    ${description}, 
                    ${creatorTwitchId}, 
                    ${creatorUsername}
                )
                RETURNING *
            `;

            logger.info(`Pool created: ${finalPoolName} by ${creatorUsername}`);
            return result[0];
        } catch (error) {
            if (error.code === '23505') { // Unique violation
                throw new Error('Pool name already exists');
            }
            logger.error('Error creating pool:', error);
            throw error;
        }
    }

    /**
     * Donate eggs to a pool
     * @param {string} poolName - Name of the pool (with or without prefix)
     * @param {string} donorTwitchId - Twitch ID of the donor
     * @param {string} donorUsername - Username of the donor
     * @param {number} amount - Amount of eggs to donate
     */
    async donateToPool(poolName, donorTwitchId, donorUsername, amount) {
        try {
            // Begin transaction
            await this.sql`BEGIN`;

            // Normalize pool name
            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let searchName = sanitisedName;
            
            // Try with prefix if not present
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                searchName = `pool_${sanitisedName}`;
            }

            // Get pool
            const poolResult = await this.sql`
                SELECT id, eggs_amount, is_active 
                FROM pools 
                WHERE pool_name_sanitised = ${searchName}
            `;

            if (poolResult.length === 0) {
                throw new Error('Pool not found');
            }

            const pool = poolResult[0];
            if (!pool.is_active) {
                throw new Error('Pool is not active');
            }

            // Check donor has enough eggs
            const donorResult = await this.sql`
                SELECT eggs_amount 
                FROM eggs 
                WHERE twitch_user_id = ${donorTwitchId} OR username_sanitised = ${donorUsername.toLowerCase()}
                ORDER BY twitch_user_id DESC NULLS LAST
                LIMIT 1
            `;

            if (donorResult.length === 0 || donorResult[0].eggs_amount < amount) {
                throw new Error('Insufficient eggs');
            }

            // Deduct eggs from donor
            await this.sql`
                UPDATE eggs 
                SET eggs_amount = eggs_amount - ${amount}
                WHERE twitch_user_id = ${donorTwitchId} OR username_sanitised = ${donorUsername.toLowerCase()}
            `;

            // Add eggs to pool
            await this.sql`
                UPDATE pools 
                SET eggs_amount = eggs_amount + ${amount}
                WHERE id = ${pool.id}
            `;

            // Record transaction
            await this.sql`
                INSERT INTO pool_transactions (
                    pool_id, 
                    donor_twitch_id, 
                    donor_username, 
                    eggs_amount, 
                    transaction_type
                )
                VALUES (${pool.id}, ${donorTwitchId}, ${donorUsername}, ${amount}, 'donation')
            `;

            await this.sql`COMMIT`;

            logger.info(`${donorUsername} donated ${amount} eggs to pool ${searchName}`);
            return {
                success: true,
                poolName: searchName,
                amount: amount,
                newPoolTotal: pool.eggs_amount + amount
            };

        } catch (error) {
            await this.sql`ROLLBACK`;
            logger.error('Error donating to pool:', error);
            throw error;
        }
    }

    /**
     * Get pool information
     * @param {string} poolName - Name of the pool
     */
    async getPool(poolName) {
        try {
            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let searchName = sanitisedName;
            
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                searchName = `pool_${sanitisedName}`;
            }

            const result = await this.sql`
                SELECT 
                    p.*,
                    COUNT(DISTINCT pt.donor_twitch_id) as unique_donors,
                    COUNT(pt.id) as total_donations
                FROM pools p
                LEFT JOIN pool_transactions pt ON p.id = pt.id AND pt.transaction_type = 'donation'
                WHERE p.pool_name_sanitised = ${searchName}
                GROUP BY p.id
            `;

            return result[0] || null;
        } catch (error) {
            logger.error('Error getting pool:', error);
            throw error;
        }
    }

    /**
     * Get all active pools
     */
    async getAllPools() {
        try {
            const result = await this.sql`
                SELECT 
                    p.*,
                    COUNT(DISTINCT pt.donor_twitch_id) as unique_donors,
                    COUNT(pt.id) as total_donations
                FROM pools p
                LEFT JOIN pool_transactions pt ON p.id = pt.id AND pt.transaction_type = 'donation'
                WHERE p.is_active = true
                GROUP BY p.id
                ORDER BY p.eggs_amount DESC
            `;

            return result;
        } catch (error) {
            logger.error('Error getting all pools:', error);
            throw error;
        }
    }

    /**
     * Get recent donations to a pool
     * @param {string} poolName - Name of the pool
     * @param {number} limit - Number of recent donations to return
     */
    async getRecentDonations(poolName, limit = 10) {
        try {
            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let searchName = sanitisedName;
            
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                searchName = `pool_${sanitisedName}`;
            }

            const result = await this.sql`
                SELECT pt.*
                FROM pool_transactions pt
                JOIN pools p ON pt.pool_id = p.id
                WHERE p.pool_name_sanitised = ${searchName}
                AND pt.transaction_type = 'donation'
                ORDER BY pt.created_at DESC
                LIMIT ${limit}
            `;

            return result;
        } catch (error) {
            logger.error('Error getting recent donations:', error);
            throw error;
        }
    }

    /**
     * Delete a pool (mark as inactive)
     * @param {string} poolName - Name of the pool to delete
     * @param {string} adminTwitchId - Admin's Twitch ID
     * @param {string} adminUsername - Admin's username
     */
    async deletePool(poolName, adminTwitchId, adminUsername) {
        try {
            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let searchName = sanitisedName;
            
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                searchName = `pool_${sanitisedName}`;
            }

            // Check if pool exists
            const poolResult = await this.sql`
                SELECT id, pool_name, eggs_amount, is_active 
                FROM pools 
                WHERE pool_name_sanitised = ${searchName}
            `;

            if (poolResult.length === 0) {
                throw new Error('Pool not found');
            }

            const pool = poolResult[0];
            
            if (!pool.is_active) {
                throw new Error('Pool is already deleted');
            }

            // Mark pool as inactive
            await this.sql`
                UPDATE pools 
                SET is_active = false
                WHERE id = ${pool.id}
            `;

            logger.info(`Pool deleted by ${adminUsername}`, { 
                poolName: searchName, 
                poolId: pool.id,
                eggsAmount: pool.eggs_amount 
            });
            
            return {
                success: true,
                poolName: pool.pool_name,
                poolNameSanitised: searchName,
                eggsAmount: pool.eggs_amount
            };

        } catch (error) {
            logger.error('Error deleting pool:', error);
            throw error;
        }
    }

    /**
     * Admin function to add/remove eggs from pool
     * @param {string} poolName - Name of the pool
     * @param {number} amount - Amount to add (positive) or remove (negative)
     * @param {string} adminTwitchId - Admin's Twitch ID
     * @param {string} adminUsername - Admin's username
     * @param {string} notes - Admin notes
     */
    async adminAdjustPool(poolName, amount, adminTwitchId, adminUsername, notes) {
        try {
            await this.sql`BEGIN`;

            const sanitisedName = poolName.toLowerCase().replace(/[^a-z0-9_]/g, '_');
            let searchName = sanitisedName;
            
            if (!sanitisedName.startsWith('pool_') && !sanitisedName.startsWith('community_')) {
                searchName = `pool_${sanitisedName}`;
            }

            // Get pool
            const poolResult = await this.sql`
                SELECT id, eggs_amount 
                FROM pools 
                WHERE pool_name_sanitised = ${searchName}
            `;

            if (poolResult.rows.length === 0) {
                throw new Error('Pool not found');
            }

            const pool = poolResult.rows[0];
            
            // Check if removal would make pool negative
            if (pool.eggs_amount + amount < 0) {
                throw new Error('Cannot make pool balance negative');
            }

            // Update pool
            await this.sql`
                UPDATE pools 
                SET eggs_amount = eggs_amount + ${amount}
                WHERE id = ${pool.id}
            `;

            // Record transaction
            const transactionType = amount > 0 ? 'admin_add' : 'admin_remove';
            await this.sql`
                INSERT INTO pool_transactions (
                    pool_id, 
                    donor_twitch_id, 
                    donor_username, 
                    eggs_amount, 
                    transaction_type,
                    notes
                )
                VALUES (${pool.id}, ${adminTwitchId}, ${adminUsername}, ${Math.abs(amount)}, ${transactionType}, ${notes})
            `;

            await this.sql`COMMIT`;

            logger.info(`Admin ${adminUsername} adjusted pool ${searchName} by ${amount} eggs`);
            return {
                success: true,
                poolName: searchName,
                adjustment: amount,
                newTotal: pool.eggs_amount + amount
            };

        } catch (error) {
            await this.sql`ROLLBACK`;
            logger.error('Error adjusting pool:', error);
            throw error;
        }
    }
}

export default PoolService;