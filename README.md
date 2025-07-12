# Boozie Bot - Twitch Chat Bot Backend

A feature-rich Twitch chat bot with points system (eggs), custom commands, quotes, and more.

## Features

- 🥚 **Egg System**: Points-based viewer engagement system
- 🎨 **Custom Colours**: User-submitted colour database with hex codes  
- 🤖 **Custom Commands**: Flexible command system with permissions and cooldowns
- 💬 **Quotes System**: Store and recall memorable chat quotes
- 🔐 **Authentication**: Supabase-based authentication with role management
- 🔔 **Real-time Alerts**: WebSocket support for stream alerts
- 📊 **API**: RESTful API for web interface integration

## Prerequisites

- Node.js 18+
- PostgreSQL 16+ (or use the provided k3s deployment)
- Twitch Developer Application
- Supabase Project (for authentication)
- k3s/Kubernetes (for production deployment)

## Quick Start - Local Development

### 1. Clone and Install

```bash
git clone <repository-url>
cd bot/bot_js
npm install
```

### 2. Configuration

Copy the example configuration files:

```bash
cp config-example.json config.json
cp secret-example.json secret.json
```

Edit `config.json`:
```json
{
  "channels": ["your_twitch_channel"],
  "username": "your_bot_username",
  "clientId": "your_twitch_client_id",
  "redirectUri": "https://your-domain.com/auth/callback",
  "port": 3000,
  "websocketPort": 3001
}
```

Edit `secret.json`:
```json
{
  "clientSecret": "your_twitch_client_secret",
  "supabaseUrl": "https://your-project.supabase.co",
  "supabaseKey": "your_supabase_anon_key"
}
```

### 3. Database Setup

```bash
# Using local PostgreSQL
export DATABASE_URL="postgresql://user:password@localhost:5432/boozie_bot"

# Initialize database
node setup/setupDatabase.js
```

### 4. Authenticate Bot

```bash
node auth/reauth-bot.js
# Follow the browser prompts to authenticate
```

### 5. Run Locally

```bash
# Development mode with auto-reload
npm run dev

# Production mode
npm start
```

## 🚀 Production Deployment with k3s

### Complete k3s Setup from Scratch

#### 1. Install k3s (if not already installed)

```bash
# Install k3s
curl -sfL https://get.k3s.io | sh -

# Check k3s is running
sudo k3s kubectl get nodes

# Make kubectl accessible without sudo
sudo chmod 644 /etc/rancher/k3s/k3s.yaml
export KUBECONFIG=/etc/rancher/k3s/k3s.yaml
echo 'export KUBECONFIG=/etc/rancher/k3s/k3s.yaml' >> ~/.bashrc
```

#### 2. Prepare Configuration

```bash
# Navigate to project root
cd /path/to/bot

# Create configuration
cp k8s/configs/example.env k8s/configs/local.env
```

Edit `k8s/configs/local.env`:
```env
# Database Configuration
POSTGRES_USER=boozie_bot
POSTGRES_PASSWORD=your_secure_password_here
POSTGRES_DB=boozie_bot_database

# JWT Secret for Supabase (generate with: openssl rand -base64 64)
SUPABASE_JWT_SECRET=your_jwt_secret_here

# Your domain
DOMAIN=your-domain.com
```

#### 3. Build and Deploy

```bash
# Build Docker image
docker build -t maddeth/booziebot:latest bot_js/

# Import to k3s
sudo docker save maddeth/booziebot | sudo k3s ctr images import -

# Deploy everything
./k8s/deploy.sh

# Or manually:
kubectl apply -f k8s/postgres-deployment.yaml
kubectl apply -f k8s/nodejs-deployment-local-db.yaml
```

#### 4. Setup Ingress (for HTTPS)

```bash
# Install cert-manager for Let's Encrypt
kubectl apply -f https://github.com/cert-manager/cert-manager/releases/download/v1.12.0/cert-manager.yaml

# Apply ingress configuration
kubectl apply -f k8s/cert-manager.yaml
```

#### 5. Initialize Database

```bash
# Wait for PostgreSQL to be ready
kubectl wait --for=condition=ready pod -l app=postgres --timeout=300s

# Run database setup
kubectl exec -it deployment/postgres -- psql -U boozie_bot -d boozie_bot_database -f /docker-entrypoint-initdb.d/init.sql

# Or copy and run setup script
kubectl cp setup/setupDatabase.js deployment/boozie-bot:/tmp/
kubectl exec deployment/boozie-bot -- node /tmp/setupDatabase.js
```

#### 6. Configure Bot Authentication

```bash
# Port forward to access locally
kubectl port-forward deployment/boozie-bot 3000:3000

# Run authentication
node auth/reauth-bot.js

# Copy generated tokens to the pod
kubectl cp tokens.json deployment/boozie-bot:/app/tokens.json
```

### Monitoring and Management

```bash
# View logs
kubectl logs -f deployment/boozie-bot

# Restart bot
kubectl rollout restart deployment/boozie-bot

# Scale (Note: Only 1 replica recommended for IRC connection)
kubectl scale deployment/boozie-bot --replicas=1

# Access database
kubectl exec -it deployment/postgres -- psql -U boozie_bot -d boozie_bot_database

# Check pod status
kubectl get pods
kubectl describe pod <pod-name>
```

### Updating the Bot

```bash
# Quick rebuild and deploy
./rebuild.sh

# Or step by step:
docker build -t maddeth/booziebot:latest bot_js/
sudo docker save maddeth/booziebot | sudo k3s ctr images import -
kubectl rollout restart deployment/boozie-bot
```

### Backup and Restore

```bash
# Backup database
kubectl exec deployment/postgres -- pg_dump -U boozie_bot boozie_bot_database > backup-$(date +%Y%m%d).sql

# Restore database
kubectl exec -i deployment/postgres -- psql -U boozie_bot -d boozie_bot_database < backup.sql

# Backup configuration
cp -r k8s/configs k8s/configs.backup
```

## 📁 Project Structure

```
bot_js/
├── server.js              # Main application entry
├── config.json           # Bot configuration
├── secret.json           # Sensitive configuration
├── tokens.json           # Twitch OAuth tokens
├── routes/               # API endpoints
│   ├── api.js           # Main API router
│   ├── eggs.js          # Egg system endpoints
│   ├── commands.js      # Custom commands
│   └── userRoles.js     # User management
├── services/             # Business logic
│   ├── twitchService.js # Twitch bot integration
│   ├── eggService.js    # Egg system logic
│   └── database/        # Database connections
├── middleware/           # Express middleware
├── setup/               # Database setup scripts
└── auth/                # Authentication scripts
```

## 🛠️ Development

### Database Migrations

```bash
# Create tables
node setup/setupDatabase.js

# Run specific migration
node setup/setup-quotes-database.js
```

### Testing

```bash
# Run tests
npm test

# Test database connection
node test-db-connection.js

# Test API endpoints
curl http://localhost:3000/api/eggs/stats
```

### Environment Variables

```bash
# Required
DATABASE_URL=postgresql://user:pass@host:5432/db
SUPABASE_JWT_SECRET=your-jwt-secret

# Optional
NODE_ENV=production
LOG_LEVEL=info
PORT=3000
WEBSOCKET_PORT=3001
```

## 🔧 Troubleshooting

### Bot not connecting to Twitch
- Check `tokens.json` exists and is valid
- Verify Twitch app credentials in `config.json`
- Check network connectivity to Twitch IRC

### Database connection errors
```bash
# Test connection
kubectl exec deployment/postgres -- pg_isready

# Check logs
kubectl logs deployment/postgres

# Verify credentials
kubectl get secret postgres-secret -o yaml
```

### k3s specific issues
```bash
# Reset k3s
sudo systemctl restart k3s

# Check k3s logs
sudo journalctl -u k3s -f

# Verify image import
sudo k3s ctr images ls | grep booziebot
```

## 📚 API Documentation

When running, API documentation is available at:
- Development: http://localhost:3000/doc
- Production: https://your-domain.com/doc

## 🤝 Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## 📝 License

This project is licensed under the MIT License.