/**
 * User Merge Service
 * Handles merging user accounts and their associated data (eggs, transactions, etc.)
 */

import sql from './database/db.js';
import logger from '../utils/logger.js';

class UserMergeService {
    constructor() {
        this.sql = sql;
    }

    /**
     * Merge eggs from one user account to another
     * @param {string} fromUserId - Source user's Twitch ID or username
     * @param {string} toUserId - Target user's Twitch ID or username
     * @param {string} adminTwitchId - Admin performing the merge
     * @param {string} adminUsername - Admin's username
     * @param {string} reason - Reason for the merge
     * @param {boolean} deleteSource - Whether to delete the source account after merge
     */
    async mergeUserEggs(fromUserId, toUserId, adminTwitchId, adminUsername, reason = 'Account merge', deleteSource = false) {
        try {
            await this.sql`BEGIN`;

            // Get source user eggs
            const sourceUser = await this._getUserEggs(fromUserId);
            if (!sourceUser) {
                throw new Error(`Source user '${fromUserId}' not found`);
            }

            // Get or create target user eggs
            let targetUser = await this._getUserEggs(toUserId);
            if (!targetUser) {
                // Create target user if they don't exist
                await this._createEggUser(toUserId);
                targetUser = await this._getUserEggs(toUserId);
            }

            const eggsToTransfer = sourceUser.eggs_amount;
            const newTargetTotal = targetUser.eggs_amount + eggsToTransfer;

            // Update target user eggs
            await this.sql`
                UPDATE eggs 
                SET eggs_amount = ${newTargetTotal}
                WHERE id = ${targetUser.id}
            `;

            // Log the merge operation
            await this.sql`
                INSERT INTO user_merge_log (
                    source_user_id,
                    source_username,
                    target_user_id, 
                    target_username,
                    eggs_transferred,
                    admin_twitch_id,
                    admin_username,
                    reason,
                    merge_date
                )
                VALUES (
                    ${sourceUser.twitch_user_id || sourceUser.username_sanitised},
                    ${sourceUser.username},
                    ${targetUser.twitch_user_id || targetUser.username_sanitised},
                    ${targetUser.username},
                    ${eggsToTransfer},
                    ${adminTwitchId},
                    ${adminUsername},
                    ${reason},
                    CURRENT_TIMESTAMP
                )
            `;

            if (deleteSource) {
                // Delete source user's egg record
                await this.sql`DELETE FROM eggs WHERE id = ${sourceUser.id}`;
            } else {
                // Reset source user's eggs to 0
                await this.sql`
                    UPDATE eggs 
                    SET eggs_amount = 0
                    WHERE id = ${sourceUser.id}
                `;
            }

            // Update any pool transactions to point to the new user ID
            if (sourceUser.twitch_user_id && targetUser.twitch_user_id) {
                await this.sql`
                    UPDATE pool_transactions 
                    SET donor_twitch_id = ${targetUser.twitch_user_id},
                        donor_username = ${targetUser.username}
                    WHERE donor_twitch_id = ${sourceUser.twitch_user_id}
                `;
            }

            await this.sql`COMMIT`;

            const result = {
                success: true,
                sourceUser: {
                    id: sourceUser.twitch_user_id || sourceUser.username_sanitised,
                    username: sourceUser.username,
                    eggsTransferred: eggsToTransfer
                },
                targetUser: {
                    id: targetUser.twitch_user_id || targetUser.username_sanitised,
                    username: targetUser.username,
                    previousEggs: targetUser.eggs_amount,
                    newTotal: newTargetTotal
                },
                deleted: deleteSource
            };

            logger.info('User eggs merged successfully', {
                from: sourceUser.username,
                to: targetUser.username,
                eggsTransferred: eggsToTransfer,
                admin: adminUsername,
                deleted: deleteSource
            });

            return result;

        } catch (error) {
            await this.sql`ROLLBACK`;
            logger.error('Error merging user eggs:', error);
            throw error;
        }
    }

    /**
     * Get merge history for a user
     * @param {string} userId - User's Twitch ID or username
     * @param {number} limit - Number of records to return
     */
    async getMergeHistory(userId, limit = 10) {
        try {
            const history = await this.sql`
                SELECT *
                FROM user_merge_log
                WHERE source_user_id = ${userId} 
                   OR target_user_id = ${userId}
                   OR source_username = ${userId}
                   OR target_username = ${userId}
                ORDER BY merge_date DESC
                LIMIT ${limit}
            `;

            return history;
        } catch (error) {
            logger.error('Error getting merge history:', error);
            throw error;
        }
    }

    /**
     * Get all merge operations (admin only)
     * @param {number} limit - Number of records to return
     */
    async getAllMergeHistory(limit = 50) {
        try {
            const history = await this.sql`
                SELECT *
                FROM user_merge_log
                ORDER BY merge_date DESC
                LIMIT ${limit}
            `;

            return history;
        } catch (error) {
            logger.error('Error getting all merge history:', error);
            throw error;
        }
    }

    /**
     * Preview a merge operation (dry run)
     * @param {string} fromUserId - Source user ID
     * @param {string} toUserId - Target user ID
     */
    async previewMerge(fromUserId, toUserId) {
        try {
            const sourceUser = await this._getUserEggs(fromUserId);
            const targetUser = await this._getUserEggs(toUserId);

            if (!sourceUser) {
                throw new Error(`Source user '${fromUserId}' not found`);
            }

            const targetEggs = targetUser ? targetUser.eggs_amount : 0;
            const totalAfterMerge = targetEggs + sourceUser.eggs_amount;

            return {
                sourceUser: {
                    username: sourceUser.username,
                    currentEggs: sourceUser.eggs_amount,
                    exists: true
                },
                targetUser: {
                    username: targetUser ? targetUser.username : toUserId,
                    currentEggs: targetEggs,
                    exists: !!targetUser
                },
                preview: {
                    eggsToTransfer: sourceUser.eggs_amount,
                    targetEggsAfterMerge: totalAfterMerge
                }
            };
        } catch (error) {
            logger.error('Error previewing merge:', error);
            throw error;
        }
    }

    /**
     * Helper method to get user eggs by ID or username
     */
    async _getUserEggs(identifier) {
        try {
            // Try by Twitch user ID first
            let result = await this.sql`
                SELECT * FROM eggs 
                WHERE twitch_user_id = ${identifier}
            `;
            
            // If not found, try by username
            if (result.length === 0) {
                result = await this.sql`
                    SELECT * FROM eggs 
                    WHERE LOWER(username_sanitised) = LOWER(${identifier})
                `;
            }
            
            return result.length > 0 ? result[0] : null;
        } catch (error) {
            logger.error('Error getting user eggs:', error);
            throw error;
        }
    }

    /**
     * Helper method to create a basic egg user record
     */
    async _createEggUser(identifier) {
        try {
            // Assume identifier is a username if not numeric
            const isNumeric = /^\d+$/.test(identifier);
            
            if (isNumeric) {
                // It's a Twitch user ID
                await this.sql`
                    INSERT INTO eggs (twitch_user_id, username, username_sanitised, eggs_amount)
                    VALUES (${identifier}, ${identifier}, ${identifier.toLowerCase()}, 0)
                `;
            } else {
                // It's a username
                await this.sql`
                    INSERT INTO eggs (username, username_sanitised, eggs_amount)
                    VALUES (${identifier}, ${identifier.toLowerCase()}, 0)
                `;
            }
        } catch (error) {
            logger.error('Error creating egg user:', error);
            throw error;
        }
    }
}

export default UserMergeService;