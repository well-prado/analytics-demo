# Docker Setup Guide

This guide explains how to run the Dynamic Company Analytics system using Docker Compose.

## 🐳 Quick Start

### First Time Setup
```bash
# 1. Build and start all services
npm run docker:build

# 2. Seed the database with company data
npm run docker:seed

# 3. Test the system
npm run test:system

# 4. View logs (optional)
npm run docker:logs
```

**That's it!** Your analytics system is now running at `http://localhost:4000`

---

## 📋 Available Docker Commands

| Command | Description |
|---------|-------------|
| `npm run docker:up` | Start all services in background |
| `npm run docker:down` | Stop all services |
| `npm run docker:build` | Build and start services (first time) |
| `npm run docker:logs` | View real-time logs |
| `npm run docker:seed` | Seed database with company data |
| `npm run docker:reset` | Reset everything (removes data!) |

---

## 🏗️ Architecture

The Docker Compose setup includes:

### 📊 Analytics Database (`analytics-db`)
- **Image**: PostgreSQL 15
- **Port**: 5432
- **Database**: company_analytics
- **Credentials**: postgres/password123
- **Health Check**: Automatic readiness detection

### 🚀 Analytics API (`analytics-api`)
- **Port**: 4000 (API)
- **Port**: 9091 (Metrics)
- **Environment**: Automatically configured for Docker
- **Hot Reload**: File changes sync automatically

### 🔧 Database Admin (`adminer`)
- **Port**: 8080
- **URL**: http://localhost:8080
- **Pre-configured**: Auto-connects to analytics database

---

## 🔍 Accessing Services

### Analytics API
```bash
# Test the API
curl http://localhost:4000/company-analytics

# Natural language query
curl -X POST http://localhost:4000/company-analytics/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show me sales metrics"}'
```

### Database Admin (Adminer)
1. Open http://localhost:8080
2. Server: `analytics-db`
3. Username: `postgres`
4. Password: `password123`
5. Database: `company_analytics`

---

## 🛠️ Development Workflow

### Making Code Changes
```bash
# Code changes are automatically synced
# Just edit files and see changes reflected immediately

# If you need to rebuild after package.json changes:
npm run docker:build
```

### Database Operations
```bash
# Re-seed with fresh data
npm run docker:seed

# Reset entire database
npm run docker:reset
```

### Debugging
```bash
# View all logs
npm run docker:logs

# View specific service logs
docker-compose -f docker-compose.analytics.yml logs -f analytics-api
docker-compose -f docker-compose.analytics.yml logs -f analytics-db
```

---

## 🔧 Configuration

### Environment Variables
The Docker setup automatically configures:
- `DB_HOST=analytics-db` (container networking)
- `DB_PORT=5432`
- `DB_NAME=company_analytics`
- `DB_USER=postgres`
- `DB_PASSWORD=password123`

### Custom Configuration
To customize, edit `docker-compose.analytics.yml`:
```yaml
environment:
  DB_HOST: analytics-db
  DB_PASSWORD: your_password  # Change this
  DEBUG: true                 # Set to false for production
```

---

## 🚨 Troubleshooting

### Database Won't Start
```bash
# Check if port 5432 is already in use
lsof -i :5432

# Stop conflicting PostgreSQL
brew services stop postgresql  # macOS
sudo systemctl stop postgresql # Linux

# Reset and restart
npm run docker:reset
```

### API Won't Connect to Database
```bash
# Check database health
docker-compose -f docker-compose.analytics.yml ps

# Wait for health check to pass
docker-compose -f docker-compose.analytics.yml logs analytics-db
```

### Port Conflicts
```bash
# If port 4000 is in use, edit docker-compose.analytics.yml
ports:
  - "4001:4000"  # Change external port
```

---

## 🧹 Cleanup

### Stop Everything
```bash
npm run docker:down
```

### Remove All Data
```bash
# This will delete all company data!
npm run docker:reset
```

### Complete Cleanup
```bash
# Remove containers, networks, and volumes
docker-compose -f docker-compose.analytics.yml down -v
docker volume prune
docker network prune
```

---

## 🎯 Next Steps

After setup:
1. Test with `npm run test:system`
2. Try the tutorial examples in `TUTORIAL.md`
3. Configure Claude Desktop MCP integration
4. Start building your analytics queries!

The system is now ready for production use or tutorial recording! 🚀 