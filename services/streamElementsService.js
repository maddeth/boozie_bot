import axios from 'axios';

class StreamElementsService {
    constructor(channelId, bearerToken) {
        this.channelId = channelId;
        this.bearerToken = bearerToken;
        this.baseUrl = 'https://api.streamelements.com/kappa/v2';
    }

    async getTopPoints(limit = 1000) {
        try {
            const response = await axios.get(`${this.baseUrl}/points/${this.channelId}/top`, {
                params: { limit },
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.bearerToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching top points from StreamElements:', error.message);
            throw error;
        }
    }

    async getUserPoints(username) {
        try {
            const response = await axios.get(`${this.baseUrl}/points/${this.channelId}/${username}`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.bearerToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error fetching points for user ${username}:`, error.message);
            throw error;
        }
    }

    async getAllUsers(limit = 1000, offset = 0) {
        try {
            const response = await axios.get(`${this.baseUrl}/points/${this.channelId}/alltime`, {
                params: { limit, offset },
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.bearerToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error('Error fetching all users from StreamElements:', error.message);
            throw error;
        }
    }

    async updateUserPoints(username, points) {
        try {
            const response = await axios.put(`${this.baseUrl}/points/${this.channelId}/${username}`, 
                { points },
                {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${this.bearerToken}`,
                        'Content-Type': 'application/json'
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Error updating points for user ${username}:`, error.message);
            throw error;
        }
    }

    async addPoints(username, amount) {
        try {
            const response = await axios.put(`${this.baseUrl}/points/${this.channelId}/${username}/${amount}`, 
                {},
                {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${this.bearerToken}`
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Error adding points to user ${username}:`, error.message);
            throw error;
        }
    }

    async subtractPoints(username, amount) {
        try {
            const response = await axios.put(`${this.baseUrl}/points/${this.channelId}/${username}/-${amount}`, 
                {},
                {
                    headers: {
                        'Accept': 'application/json',
                        'Authorization': `Bearer ${this.bearerToken}`
                    }
                }
            );
            return response.data;
        } catch (error) {
            console.error(`Error subtracting points from user ${username}:`, error.message);
            throw error;
        }
    }

    async resetPoints(username) {
        try {
            const response = await axios.delete(`${this.baseUrl}/points/${this.channelId}/${username}`, {
                headers: {
                    'Accept': 'application/json',
                    'Authorization': `Bearer ${this.bearerToken}`
                }
            });
            return response.data;
        } catch (error) {
            console.error(`Error resetting points for user ${username}:`, error.message);
            throw error;
        }
    }
}

export default StreamElementsService;