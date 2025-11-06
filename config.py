# config.py - Application Configuration
import os
from datetime import timedelta
from dotenv import load_dotenv

load_dotenv()

class Config:
    """Base configuration"""
    SECRET_KEY = os.getenv('SECRET_KEY', 'dev-secret-key-change-in-production')
    SQLALCHEMY_DATABASE_URI = os.getenv('DATABASE_URL', 'postgresql://postgres:password@localhost:5432/expense_tracker')
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    SQLALCHEMY_RECORD_QUERIES = True
    
    # JWT Configuration
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'jwt-secret-change-in-production')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(seconds=int(os.getenv('JWT_ACCESS_TOKEN_EXPIRES', 2592000)))  # 30 days
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=30)
    
    # Redis Configuration
    REDIS_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/0')
    
    # ML Service Configuration
    ML_SERVICE_URL = os.getenv('ML_SERVICE_URL', 'http://localhost:4000')
    ML_MODEL_RETRAIN_THRESHOLD = int(os.getenv('ML_MODEL_RETRAIN_THRESHOLD', 50))
    ML_PREDICTION_CONFIDENCE_THRESHOLD = float(os.getenv('ML_PREDICTION_CONFIDENCE_THRESHOLD', 0.7))
    
    # File Upload Configuration
    MAX_CONTENT_LENGTH = int(os.getenv('MAX_CONTENT_LENGTH', 16777216))  # 16MB
    UPLOAD_FOLDER = os.getenv('UPLOAD_FOLDER', 'uploads')
    ALLOWED_EXTENSIONS = {'png', 'jpg', 'jpeg', 'gif', 'pdf', 'csv', 'xlsx'}
    
    # Email Configuration
    MAIL_SERVER = os.getenv('MAIL_SERVER', 'smtp.gmail.com')
    MAIL_PORT = int(os.getenv('MAIL_PORT', 587))
    MAIL_USE_TLS = os.getenv('MAIL_USE_TLS', 'true').lower() == 'true'
    MAIL_USERNAME = os.getenv('MAIL_USERNAME')
    MAIL_PASSWORD = os.getenv('MAIL_PASSWORD')
    MAIL_DEFAULT_SENDER = os.getenv('MAIL_DEFAULT_SENDER', os.getenv('MAIL_USERNAME'))
    
    # Security
    BCRYPT_LOG_ROUNDS = int(os.getenv('BCRYPT_LOG_ROUNDS', 12))
    
    # Pagination
    EXPENSES_PER_PAGE = 50
    MAX_PER_PAGE = 100
    
    # Logging
    LOG_LEVEL = os.getenv('LOG_LEVEL', 'INFO')
    LOG_FILE = os.getenv('LOG_FILE', 'logs/app.log')
    
    # CORS
    CORS_ORIGINS = os.getenv('CORS_ORIGINS', 'http://localhost:3000,http://localhost:80').split(',')

class DevelopmentConfig(Config):
    """Development configuration"""
    DEBUG = True
    FLASK_ENV = 'development'
    SQLALCHEMY_ECHO = True
    SQLALCHEMY_RECORD_QUERIES = True
    
    # Less strict in development
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(days=7)
    BCRYPT_LOG_ROUNDS = 4  # Faster for development

class TestingConfig(Config):
    """Testing configuration"""
    TESTING = True
    DEBUG = True
    SQLALCHEMY_DATABASE_URI = 'sqlite:///:memory:'
    WTF_CSRF_ENABLED = False
    
    # Faster for tests
    BCRYPT_LOG_ROUNDS = 4
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(minutes=15)

class ProductionConfig(Config):
    """Production configuration"""
    DEBUG = False
    FLASK_ENV = 'production'
    SQLALCHEMY_ECHO = False
    SQLALCHEMY_RECORD_QUERIES = False
    
    # More strict in production
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=1)
    BCRYPT_LOG_ROUNDS = 15
    
    # Security headers
    SECURITY_HEADERS = True
    
    # Rate limiting
    RATELIMIT_STORAGE_URL = os.getenv('REDIS_URL', 'redis://localhost:6379/1')

# Configuration mapping
config = {
    'development': DevelopmentConfig,
    'testing': TestingConfig,
    'production': ProductionConfig,
    'default': DevelopmentConfig
}

def get_config():
    """Get configuration based on environment"""
    env = os.getenv('FLASK_ENV', 'default')
    return config.get(env, config['default'])

# Application constants
class Constants:
    """Application constants"""
    
    # Expense categories
    EXPENSE_CATEGORIES = [
        'Food & Dining',
        'Transportation',
        'Shopping',
        'Entertainment',
        'Bills & Utilities',
        'Healthcare',
        'Travel',
        'Education',
        'Personal Care',
        'Home & Garden',
        'Gifts & Donations',
        'Business',
        'Investment',
        'Insurance',
        'Other'
    ]
    
    # Payment modes
    PAYMENT_MODES = [
        'cash',
        'card',
        'wallet',
        'bank',
        'cheque',
        'online'
    ]
    
    # Budget periods
    BUDGET_PERIODS = [
        'daily',
        'weekly',
        'monthly',
        'yearly'
    ]
    
    # Currency codes (ISO 4217)
    SUPPORTED_CURRENCIES = [
        'USD', 'EUR', 'GBP', 'JPY', 'CAD', 'AUD', 'CHF', 'CNY',
        'SEK', 'NZD', 'MXN', 'SGD', 'HKD', 'NOK', 'TRY', 'RUB',
        'INR', 'BRL', 'ZAR', 'KRW'
    ]
    
    # ML model types
    ML_MODEL_TYPES = [
        'category_prediction',
        'anomaly_detection',
        'spending_forecast',
        'budget_optimization'
    ]
    
    # Anomaly severity levels
    ANOMALY_LEVELS = [
        'low',
        'medium',
        'high',
        'critical'
    ]
    
    # Recommendation types
    RECOMMENDATION_TYPES = [
        'budget_alert',
        'category_optimization',
        'spending_pattern',
        'savings_opportunity',
        'bill_reminder',
        'unusual_activity'
    ]
    
    # Time periods for analytics
    ANALYTICS_PERIODS = [
        '7d',    # Last 7 days
        '30d',   # Last 30 days
        '90d',   # Last 90 days
        '1y',    # Last year
        'ytd',   # Year to date
        'custom' # Custom date range
    ]

# Validation rules
class ValidationRules:
    """Validation rules for the application"""
    
    # User validation
    USERNAME_MIN_LENGTH = 3
    USERNAME_MAX_LENGTH = 50
    PASSWORD_MIN_LENGTH = 8
    EMAIL_MAX_LENGTH = 255
    
    # Expense validation
    EXPENSE_TITLE_MAX_LENGTH = 200
    EXPENSE_DESCRIPTION_MAX_LENGTH = 1000
    EXPENSE_AMOUNT_MIN = 0.01
    EXPENSE_AMOUNT_MAX = 1000000.00
    EXPENSE_LOCATION_MAX_LENGTH = 200
    EXPENSE_TAGS_MAX_COUNT = 10
    EXPENSE_TAG_MAX_LENGTH = 20
    
    # Budget validation
    BUDGET_AMOUNT_MIN = 0.00
    BUDGET_AMOUNT_MAX = 10000000.00
    
    # File upload validation
    MAX_FILE_SIZE = 16 * 1024 * 1024  # 16MB
    ALLOWED_IMAGE_TYPES = {'image/jpeg', 'image/png', 'image/gif'}
    ALLOWED_DOCUMENT_TYPES = {'application/pdf', 'text/csv', 'application/vnd.ms-excel'}

# Error messages
class ErrorMessages:
    """Standardized error messages"""
    
    # Authentication errors
    INVALID_CREDENTIALS = "Invalid email or password"
    TOKEN_EXPIRED = "Authentication token has expired"
    TOKEN_INVALID = "Invalid authentication token"
    ACCESS_DENIED = "Access denied"
    
    # Validation errors
    REQUIRED_FIELD = "This field is required"
    INVALID_EMAIL = "Invalid email format"
    PASSWORD_TOO_SHORT = f"Password must be at least {ValidationRules.PASSWORD_MIN_LENGTH} characters"
    USERNAME_TAKEN = "Username already exists"
    EMAIL_TAKEN = "Email already registered"
    
    # Expense errors
    EXPENSE_NOT_FOUND = "Expense not found"
    INVALID_CATEGORY = "Invalid expense category"
    INVALID_PAYMENT_MODE = "Invalid payment mode"
    AMOUNT_TOO_LARGE = f"Amount cannot exceed ${ValidationRules.EXPENSE_AMOUNT_MAX:,.2f}"
    
    # Budget errors
    BUDGET_NOT_FOUND = "Budget not found"
    BUDGET_EXISTS = "Budget already exists for this category and period"
    
    # ML service errors
    ML_SERVICE_UNAVAILABLE = "ML service temporarily unavailable"
    INSUFFICIENT_DATA = "Insufficient data for ML analysis"
    MODEL_TRAINING_FAILED = "Failed to train ML model"
    
    # General errors
    SERVER_ERROR = "Internal server error"
    NOT_FOUND = "Resource not found"
    BAD_REQUEST = "Invalid request data"