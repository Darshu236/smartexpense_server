#!/bin/bash

# setup.sh - Automated setup script for AI Expense Tracker

set -e  # Exit on any error

echo "🚀 Setting up AI Expense Tracker..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

print_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if Docker is installed
check_docker() {
    if ! command -v docker &> /dev/null; then
        print_error "Docker is not installed. Please install Docker first."
        exit 1
    fi
    
    if ! command -v docker-compose &> /dev/null; then
        print_error "Docker Compose is not installed. Please install Docker Compose first."
        exit 1
    fi
    
    print_status "Docker and Docker Compose are installed ✓"
}

# Create project structure
create_structure() {
    print_status "Creating project structure..."
    
    # Create directories
    mkdir -p {frontend,ssl,data,logs,scripts}
    mkdir -p frontend/{public,src}
    
    # Create environment files
    cat > .env << EOF
# Database Configuration
DATABASE_URL=postgresql://postgres:password@localhost:5432/expense_tracker
POSTGRES_DB=expense_tracker
POSTGRES_USER=postgres
POSTGRES_PASSWORD=password

# Flask Configuration
FLASK_ENV=development
SECRET_KEY=$(openssl rand -hex 32)
JWT_SECRET_KEY=$(openssl rand -hex 32)

# ML Service Configuration
ML_SERVICE_URL=http://localhost:4000

# Email Configuration (optional)
MAIL_SERVER=smtp.gmail.com
MAIL_PORT=587
MAIL_USE_TLS=true
MAIL_USERNAME=your-email@gmail.com
MAIL_PASSWORD=your-app-password
EOF

    print_status "Project structure created ✓"
}

# Create Dockerfiles
create_dockerfiles() {
    print_status "Creating Dockerfiles..."
    
    # Dockerfile for ML Service
    cat > Dockerfile.ml << EOF
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    g++ \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download NLTK data
RUN python -c "import nltk; nltk.download('punkt', quiet=True); nltk.download('stopwords', quiet=True)"

# Copy ML service code
COPY ml_service.py .

# Create models directory
RUN mkdir -p models

EXPOSE 4000

CMD ["python", "ml_service.py"]
EOF

    # Dockerfile for API Service
    cat > Dockerfile.api << EOF
FROM python:3.9-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y \\
    gcc \\
    libpq-dev \\
    && rm -rf /var/lib/apt/lists/*

# Copy requirements and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code
COPY app.py models.py ./

# Create uploads directory
RUN mkdir -p uploads

EXPOSE 5000

CMD ["gunicorn", "--bind", "0.0.0.0:5000", "--workers", "4", "app:app"]
EOF

    # Frontend Dockerfile
    mkdir -p frontend
    cat > frontend/Dockerfile << EOF
FROM node:16-alpine as builder

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --only=production

# Copy source code
COPY . .

# Build the app
RUN npm run build

# Production stage
FROM nginx:alpine

# Copy built app
COPY --from=builder /app/build /usr/share/nginx/html

# Copy nginx config
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
EOF

    print_status "Dockerfiles created ✓"
}

# Create React package.json
create_frontend_config() {
    print_status "Creating frontend configuration..."
    
    cat > frontend/package.json << EOF
{
  "name": "expense-tracker-frontend",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "react-router-dom": "^6.8.0",
    "axios": "^1.3.0",
    "recharts": "^2.5.0",
    "lucide-react": "^0.263.1",
    "@headlessui/react": "^1.7.0",
    "@heroicons/react": "^2.0.0"
  },
  "scripts": {
    "start": "react-scripts start",
    "build": "react-scripts build",
    "test": "react-scripts test",
    "eject": "react-scripts eject"
  },
  "devDependencies": {
    "react-scripts": "^5.0.1",
    "tailwindcss": "^3.2.0",
    "autoprefixer": "^10.4.0",
    "postcss": "^8.4.0"
  },
  "browserslist": {
    "production": [
      ">0.2%",
      "not dead",
      "not op_mini all"
    ],
    "development": [
      "last 1 chrome version",
      "last 1 firefox version",
      "last 1 safari version"
    ]
  },
  "proxy": "http://localhost:5000"
}
EOF

    # Create basic HTML template
    mkdir -p frontend/public
    cat > frontend/public/index.html << EOF
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta name="description" content="AI-powered expense tracking application" />
    <title>AI Expense Tracker</title>
</head>
<body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
</body>
</html>
EOF

    print_status "Frontend configuration created ✓"
}

# Create nginx configuration
create_nginx_config() {
    print_status "Creating Nginx configuration..."
    
    cat > nginx.conf << EOF
events {
    worker_connections 1024;
}

http {
    include       /etc/nginx/mime.types;
    default_type  application/octet-stream;

    # Upstream servers
    upstream api {
        server api:5000;
    }

    upstream frontend {
        server frontend:80;
    }

    # Main server block
    server {
        listen 80;
        server_name localhost;

        # Frontend routes
        location / {
            proxy_pass http://frontend;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
        }

        # API routes
        location /api/ {
            proxy_pass http://api;
            proxy_set_header Host \$host;
            proxy_set_header X-Real-IP \$remote_addr;
            proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto \$scheme;
            
            # Handle preflight requests
            if (\$request_method = 'OPTIONS') {
                add_header 'Access-Control-Allow-Origin' '*';
                add_header 'Access-Control-Allow-Methods' 'GET, POST, OPTIONS, PUT, DELETE';
                add_header 'Access-Control-Allow-Headers' 'DNT,User-Agent,X-Requested-With,If-Modified-Since,Cache-Control,Content-Type,Range,Authorization';
                add_header 'Access-Control-Max-Age' 1728000;
                add_header 'Content-Type' 'text/plain; charset=utf-8';
                add_header 'Content-Length' 0;
                return 204;
            }
        }

        # Health check
        location /health {
            access_log off;
            return 200 "healthy\\n";
            add_header Content-Type text/plain;
        }
    }
}
EOF

    print_status "Nginx configuration created ✓"
}

# Create database initialization script
create_db_init() {
    print_status "Creating database initialization script..."
    
    cat > scripts/init_db.py << EOF
#!/usr/bin/env python3

import sys
import os
from datetime import datetime, timedelta
import random

# Add the parent directory to the path to import our modules
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app
from models import db, User, Expense, Budget, EXPENSE_CATEGORIES
from werkzeug.security import generate_password_hash

def create_sample_data():
    """Create sample data for demonstration"""
    
    # Create sample user
    sample_user = User(
        username='demo_user',
        email='demo@example.com',
        password=generate_password_hash('demo_password'),
        monthly_budget=3000.0
    )
    db.session.add(sample_user)
    db.session.commit()
    
    # Create sample expenses
    sample_expenses = [
        {'title': 'Grocery Shopping', 'amount': 85.50, 'category': 'Food & Dining'},
        {'title': 'Gas Station', 'amount': 45.00, 'category': 'Transportation'},
        {'title': 'Netflix Subscription', 'amount': 15.99, 'category': 'Entertainment'},
        {'title': 'Coffee Shop', 'amount': 4.50, 'category': 'Food & Dining'},
        {'title': 'Uber Ride', 'amount': 12.50, 'category': 'Transportation'},
        {'title': 'Phone Bill', 'amount': 50.00, 'category': 'Bills & Utilities'},
        {'title': 'Book Purchase', 'amount': 25.99, 'category': 'Education'},
        {'title': 'Gym Membership', 'amount': 30.00, 'category': 'Personal Care'},
        {'title': 'Movie Tickets', 'amount': 24.00, 'category': 'Entertainment'},
        {'title': 'Lunch', 'amount': 12.75, 'category': 'Food & Dining'},
    ]
    
    payment_modes = ['cash', 'card', 'wallet', 'bank']
    
    # Create expenses over the last 30 days
    for i, expense_data in enumerate(sample_expenses * 3):  # 30 expenses
        expense = Expense(
            user_id=sample_user.id,
            title=expense_data['title'],
            amount=expense_data['amount'] + random.uniform(-5, 10),  # Add some variation
            category=expense_data['category'],
            date=datetime.utcnow() - timedelta(days=random.randint(1, 30)),
            payment_mode=random.choice(payment_modes),
            description=f"Sample expense: {expense_data['title']}"
        )
        db.session.add(expense)
    
    # Create sample budgets
    for category in EXPENSE_CATEGORIES[:5]:  # Top 5 categories
        budget = Budget(
            user_id=sample_user.id,
            category=category,
            budget_amount=random.randint(200, 800),
            month=datetime.now().month,
            year=datetime.now().year
        )
        db.session.add(budget)
    
    db.session.commit()
    print(f"✓ Created sample data for user: {sample_user.username}")

def main():
    with app.app_context():
        print("Initializing database...")
        
        # Create all tables
        db.create_all()
        print("✓ Database tables created")
        
        # Check if we already have users
        if User.query.count() == 0:
            print("Creating sample data...")
            create_sample_data()
        else:
            print("✓ Database already has data")
        
        print("Database initialization complete!")

if __name__ == '__main__':
    main()
EOF

    chmod +x scripts/init_db.py
    print_status "Database initialization script created ✓"
}

# Create development startup script
create_dev_script() {
    print_status "Creating development startup script..."
    
    cat > start_dev.sh << EOF
#!/bin/bash

# Development startup script for AI Expense Tracker

set -e

echo "🚀 Starting AI Expense Tracker in development mode..."

# Load environment variables
if [ -f .env ]; then
    export \$(cat .env | grep -v '^#' | xargs)
fi

# Start services
echo "Starting services with Docker Compose..."
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build -d

# Wait for database to be ready
echo "Waiting for database to be ready..."
sleep 10

# Initialize database
echo "Initializing database..."
docker-compose exec api python scripts/init_db.py

# Show status
echo ""
echo "✅ Services started successfully!"
echo ""
echo "🌐 Application URLs:"
echo "   Frontend: http://localhost:3000"
echo "   API: http://localhost:5000"
echo "   ML Service: http://localhost:4000"
echo ""
echo "📊 Database:"
echo "   PostgreSQL: localhost:5432"
echo "   Username: postgres"
echo "   Password: password"
echo ""
echo "🔧 Useful commands:"
echo "   View logs: docker-compose logs -f"
echo "   Stop services: docker-compose down"
echo "   Restart services: docker-compose restart"
echo ""
EOF

    chmod +x start_dev.sh
    print_status "Development startup script created ✓"
}

# Create production deployment script
create_production_script() {
    print_status "Creating production deployment script..."
    
    cat > deploy_production.sh << EOF
#!/bin/bash

# Production deployment script for AI Expense Tracker

set -e

echo "🚀 Deploying AI Expense Tracker to production..."

# Check if running as root
if [ "\$EUID" -eq 0 ]; then
    echo "⚠️  Running as root. Consider using a non-root user for security."
fi

# Load environment variables
if [ -f .env.production ]; then
    export \$(cat .env.production | grep -v '^#' | xargs)
else
    echo "❌ .env.production file not found. Please create it first."
    exit 1
fi

# Pull latest images
echo "Pulling latest Docker images..."
docker-compose pull

# Build and start services
echo "Building and starting services..."
docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build -d

# Wait for database
echo "Waiting for database to be ready..."
sleep 15

# Run database migrations
echo "Running database migrations..."
docker-compose exec -T api flask db upgrade || true

# Initialize database if needed
docker-compose exec -T api python scripts/init_db.py

# Check service health
echo "Checking service health..."
sleep 10

# Test API endpoint
if curl -f http://localhost:5000/health > /dev/null 2>&1; then
    echo "✅ API service is healthy"
else
    echo "❌ API service health check failed"
    exit 1
fi

# Test ML service endpoint
if curl -f http://localhost:4000/health > /dev/null 2>&1; then
    echo "✅ ML service is healthy"
else
    echo "❌ ML service health check failed"
    exit 1
fi

echo ""
echo "🎉 Production deployment completed successfully!"
echo ""
echo "🌐 Application URLs:"
echo "   Application: http://your-domain.com"
echo "   API Health: http://your-domain.com/api/health"
echo ""
echo "📊 Monitoring:"
echo "   View logs: docker-compose logs -f"
echo "   Service status: docker-compose ps"
echo ""
EOF

    chmod +x deploy_production.sh
    print_status "Production deployment script created ✓"
}

# Create development Docker Compose override
create_dev_compose() {
    print_status "Creating development Docker Compose override..."
    
    cat > docker-compose.dev.yml << EOF
version: '3.8'

services:
  postgres:
    ports:
      - "5432:5432"
    environment:
      - POSTGRES_DB=expense_tracker_dev

  ml-service:
    environment:
      - FLASK_ENV=development
      - FLASK_DEBUG=1
    volumes:
      - ./ml_service.py:/app/ml_service.py
      - ./models:/app/models
    command: python ml_service.py

  api:
    environment:
      - FLASK_ENV=development
      - FLASK_DEBUG=1
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/expense_tracker_dev
    volumes:
      - ./:/app
    command: flask run --host=0.0.0.0 --port=5000 --debug
    ports:
      - "5000:5000"

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile.dev
    volumes:
      - ./frontend:/app
      - /app/node_modules
    command: npm start
    environment:
      - CHOKIDAR_USEPOLLING=true
    stdin_open: true
    tty: true
EOF

    # Create development frontend Dockerfile
    cat > frontend/Dockerfile.dev << EOF
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy source code
COPY . .

EXPOSE 3000

CMD ["npm", "start"]
EOF

    print_status "Development Docker Compose override created ✓"
}

# Create production Docker Compose override
create_prod_compose() {
    print_status "Creating production Docker Compose override..."
    
    cat > docker-compose.prod.yml << EOF
version: '3.8'

services:
  postgres:
    restart: always
    volumes:
      - postgres_prod_data:/var/lib/postgresql/data
    environment:
      - POSTGRES_DB=expense_tracker_prod

  redis:
    restart: always
    volumes:
      - redis_prod_data:/data

  ml-service:
    restart: always
    environment:
      - FLASK_ENV=production
    deploy:
      resources:
        limits:
          cpus: '1.0'
          memory: 1G

  api:
    restart: always
    environment:
      - FLASK_ENV=production
      - DATABASE_URL=postgresql://postgres:password@postgres:5432/expense_tracker_prod
    deploy:
      replicas: 2
      resources:
        limits:
          cpus: '1.0'
          memory: 512M
    depends_on:
      - postgres
      - ml-service

  frontend:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M

  nginx:
    restart: always
    deploy:
      resources:
        limits:
          cpus: '0.5'
          memory: 128M

volumes:
  postgres_prod_data:
  redis_prod_data:
EOF

    print_status "Production Docker Compose override created ✓"
}

# Create monitoring script
create_monitoring_script() {
    print_status "Creating monitoring script..."
    
    cat > scripts/monitor.sh << EOF
#!/bin/bash

# Monitoring script for AI Expense Tracker

echo "🔍 AI Expense Tracker System Monitor"
echo "=================================="
echo ""

# Service status
echo "📊 Service Status:"
docker-compose ps

echo ""
echo "💾 Resource Usage:"

# Docker stats
docker stats --no-stream --format "table {{.Container}}\t{{.CPUPerc}}\t{{.MemUsage}}\t{{.NetIO}}"

echo ""
echo "🗄️  Database Status:"

# Database connection test
if docker-compose exec -T postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo "✅ PostgreSQL is running"
    
    # Database size
    DB_SIZE=\$(docker-compose exec -T postgres psql -U postgres -d expense_tracker -t -c "SELECT pg_size_pretty(pg_database_size('expense_tracker'));" 2>/dev/null | xargs)
    echo "📈 Database size: \$DB_SIZE"
    
    # User count
    USER_COUNT=\$(docker-compose exec -T postgres psql -U postgres -d expense_tracker -t -c "SELECT COUNT(*) FROM users;" 2>/dev/null | xargs)
    echo "👥 Total users: \$USER_COUNT"
    
    # Expense count
    EXPENSE_COUNT=\$(docker-compose exec -T postgres psql -U postgres -d expense_tracker -t -c "SELECT COUNT(*) FROM expenses;" 2>/dev/null | xargs)
    echo "💰 Total expenses: \$EXPENSE_COUNT"
else
    echo "❌ PostgreSQL connection failed"
fi

echo ""
echo "🔗 Service Health Checks:"

# API health check
if curl -f -s http://localhost:5000/health > /dev/null; then
    echo "✅ API service is healthy"
else
    echo "❌ API service is unhealthy"
fi

# ML service health check
if curl -f -s http://localhost:4000/health > /dev/null; then
    echo "✅ ML service is healthy"
else
    echo "❌ ML service is unhealthy"
fi

# Frontend check
if curl -f -s http://localhost:3000 > /dev/null; then
    echo "✅ Frontend is accessible"
else
    echo "❌ Frontend is not accessible"
fi

echo ""
echo "📝 Recent Logs (last 10 lines):"
echo "API Logs:"
docker-compose logs --tail=5 api

echo ""
echo "ML Service Logs:"
docker-compose logs --tail=5 ml-service
EOF

    chmod +x scripts/monitor.sh
    print_status "Monitoring script created ✓"
}

# Create backup script
create_backup_script() {
    print_status "Creating backup script..."
    
    cat > scripts/backup.sh << EOF
#!/bin/bash

# Backup script for AI Expense Tracker

BACKUP_DIR="./backups"
TIMESTAMP=\$(date +"%Y%m%d_%H%M%S")
BACKUP_FILE="expense_tracker_backup_\$TIMESTAMP"

echo "📦 Creating backup: \$BACKUP_FILE"

# Create backup directory
mkdir -p \$BACKUP_DIR

# Database backup
echo "🗄️  Backing up database..."
docker-compose exec -T postgres pg_dump -U postgres expense_tracker > "\$BACKUP_DIR/\$BACKUP_FILE.sql"

# ML models backup
echo "🤖 Backing up ML models..."
if [ -d "./data/ml_models" ]; then
    tar -czf "\$BACKUP_DIR/\$BACKUP_FILE\_models.tar.gz" -C "./data" ml_models
fi

# Configuration backup
echo "⚙️  Backing up configuration..."
tar -czf "\$BACKUP_DIR/\$BACKUP_FILE\_config.tar.gz" .env docker-compose.yml nginx.conf

# Create restore script
cat > "\$BACKUP_DIR/restore_\$BACKUP_FILE.sh" << RESTORE_EOF
#!/bin/bash
# Restore script for backup \$BACKUP_FILE

echo "🔄 Restoring from backup \$BACKUP_FILE..."

# Stop services
docker-compose down

# Restore database
docker-compose up -d postgres
sleep 10
docker-compose exec -T postgres psql -U postgres -c "DROP DATABASE IF EXISTS expense_tracker;"
docker-compose exec -T postgres psql -U postgres -c "CREATE DATABASE expense_tracker;"
docker-compose exec -T postgres psql -U postgres expense_tracker < "\$BACKUP_FILE.sql"

# Restore ML models
if [ -f "\$BACKUP_FILE\_models.tar.gz" ]; then
    tar -xzf "\$BACKUP_FILE\_models.tar.gz" -C "./data/"
fi

# Restore configuration
tar -xzf "\$BACKUP_FILE\_config.tar.gz"

echo "✅ Restore completed!"
RESTORE_EOF

chmod +x "\$BACKUP_DIR/restore_\$BACKUP_FILE.sh"

echo "✅ Backup completed: \$BACKUP_DIR/\$BACKUP_FILE.*"
echo "📄 Restore script: \$BACKUP_DIR/restore_\$BACKUP_FILE.sh"

# Clean old backups (keep last 5)
cd \$BACKUP_DIR
ls -t expense_tracker_backup_*.sql | tail -n +6 | xargs -r rm
ls -t expense_tracker_backup_*_models.tar.gz | tail -n +6 | xargs -r rm
ls -t expense_tracker_backup_*_config.tar.gz | tail -n +6 | xargs -r rm
ls -t restore_expense_tracker_backup_*.sh | tail -n +6 | xargs -r rm

echo "🧹 Cleaned old backups"
EOF

    chmod +x scripts/backup.sh
    print_status "Backup script created ✓"
}

# Main setup function
setup_project() {
    print_status "Starting project setup..."
    
    check_docker
    create_structure
    create_dockerfiles
    create_frontend_config
    create_nginx_config
    create_db_init
    create_dev_script
    create_production_script
    create_dev_compose
    create_prod_compose
    create_monitoring_script
    create_backup_script
    
    print_status "Project setup completed! 🎉"
    print_status ""
    print_status "Next steps:"
    print_status "1. Review and update .env file with your settings"
    print_status "2. For development: ./start_dev.sh"
    print_status "3. For production: ./deploy_production.sh"
    print_status "4. Monitor system: ./scripts/monitor.sh"
    print_status "5. Create backups: ./scripts/backup.sh"
    print_status ""
    print_status "Documentation:"
    print_status "- Frontend: http://localhost:3000"
    print_status "- API Docs: http://localhost:5000/api"
    print_status "- ML Service: http://localhost:4000"
}

# Help function
show_help() {
    echo "AI Expense Tracker Setup Script"
    echo ""
    echo "Usage: $0 [OPTION]"
    echo ""
    echo "Options:"
    echo "  setup     Complete project setup (default)"
    echo "  dev       Start development environment"
    echo "  prod      Deploy to production"
    echo "  monitor   Show system status"
    echo "  backup    Create system backup"
    echo "  help      Show this help message"
    echo ""
}

# Main script logic
case "${1:-setup}" in
    setup)
        setup_project
        ;;
    dev)
        if [ -f "./start_dev.sh" ]; then
            ./start_dev.sh
        else
            print_error "Development script not found. Run 'setup' first."
        fi
        ;;
    prod)
        if [ -f "./deploy_production.sh" ]; then
            ./deploy_production.sh
        else
            print_error "Production script not found. Run 'setup' first."
        fi
        ;;
    monitor)
        if [ -f "./scripts/monitor.sh" ]; then
            ./scripts/monitor.sh
        else
            print_error "Monitor script not found. Run 'setup' first."
        fi
        ;;
    backup)
        if [ -f "./scripts/backup.sh" ]; then
            ./scripts/backup.sh
        else
            print_error "Backup script not found. Run 'setup' first."
        fi
        ;;
    help)
        show_help
        ;;
    *)
        print_error "Unknown option: $1"
        show_help
        exit 1
        ;;
esac