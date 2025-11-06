# models.py - Database Models
from datetime import datetime
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import generate_password_hash, check_password_hash
import json

db = SQLAlchemy()

class User(db.Model):
    __tablename__ = 'users'
    
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False, index=True)
    email = db.Column(db.String(255), unique=True, nullable=False, index=True)
    password_hash = db.Column(db.String(255), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # User settings
    monthly_budget = db.Column(db.Float, default=0.0)
    default_currency = db.Column(db.String(3), default='USD')
    timezone = db.Column(db.String(50), default='UTC')
    
    # Profile information
    first_name = db.Column(db.String(50))
    last_name = db.Column(db.String(50))
    
    # Account status
    is_active = db.Column(db.Boolean, default=True)
    email_verified = db.Column(db.Boolean, default=False)
    last_login = db.Column(db.DateTime)
    
    # Relationships
    expenses = db.relationship('Expense', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    budgets = db.relationship('Budget', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    ml_models = db.relationship('MLModel', backref='user', lazy='dynamic', cascade='all, delete-orphan')
    recommendations = db.relationship('Recommendation', backref='user', lazy='dynamic', cascade='all, delete-orphan')

    def set_password(self, password):
        """Set password hash"""
        self.password_hash = generate_password_hash(password)
    
    def check_password(self, password):
        """Check password"""
        return check_password_hash(self.password_hash, password)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'username': self.username,
            'email': self.email,
            'monthly_budget': self.monthly_budget,
            'default_currency': self.default_currency,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_active': self.is_active
        }
    
    def __repr__(self):
        return f'<User {self.username}>'

class Expense(db.Model):
    __tablename__ = 'expenses'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Basic expense information
    title = db.Column(db.String(200), nullable=False)
    amount = db.Column(db.Float, nullable=False)
    category = db.Column(db.String(50), nullable=False, index=True)
    subcategory = db.Column(db.String(50))
    
    # Date and payment information
    date = db.Column(db.DateTime, nullable=False, default=datetime.utcnow, index=True)
    payment_mode = db.Column(db.String(20), nullable=False)  # cash, card, wallet, bank, online
    
    # Additional details
    description = db.Column(db.Text)
    location = db.Column(db.String(200))
    merchant = db.Column(db.String(100))
    tags = db.Column(db.String(500))  # JSON string of tags
    receipt_url = db.Column(db.String(500))
    
    # Currency and exchange
    currency = db.Column(db.String(3), default='USD')
    exchange_rate = db.Column(db.Float, default=1.0)
    original_amount = db.Column(db.Float)  # If converted from another currency
    
    # ML and analytics fields
    is_predicted_category = db.Column(db.Boolean, default=False)
    category_confidence = db.Column(db.Float)
    is_anomaly = db.Column(db.Boolean, default=False)
    anomaly_score = db.Column(db.Float)
    anomaly_reason = db.Column(db.String(200))
    
    # Recurring transaction info
    is_recurring = db.Column(db.Boolean, default=False)
    recurring_pattern = db.Column(db.String(20))  # daily, weekly, monthly, yearly
    parent_transaction_id = db.Column(db.Integer, db.ForeignKey('expenses.id'))
    
    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Self-referential relationship for recurring transactions
    parent_transaction = db.relationship('Expense', remote_side=[id], backref='recurring_children')
    
    def get_tags(self):
        """Get tags as list"""
        if self.tags:
            try:
                return json.loads(self.tags)
            except (json.JSONDecodeError, TypeError):
                return self.tags.split(',') if isinstance(self.tags, str) else []
        return []
    
    def set_tags(self, tags_list):
        """Set tags from list"""
        if isinstance(tags_list, list):
            self.tags = json.dumps(tags_list)
        elif isinstance(tags_list, str):
            self.tags = tags_list
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'title': self.title,
            'amount': float(self.amount) if self.amount else 0,
            'category': self.category,
            'subcategory': self.subcategory,
            'date': self.date.isoformat() if self.date else None,
            'paymentMode': self.payment_mode,
            'description': self.description,
            'location': self.location,
            'merchant': self.merchant,
            'tags': self.get_tags(),
            'currency': self.currency,
            'is_predicted_category': self.is_predicted_category,
            'category_confidence': float(self.category_confidence) if self.category_confidence else None,
            'is_anomaly': self.is_anomaly,
            'anomaly_score': float(self.anomaly_score) if self.anomaly_score else None,
            'is_recurring': self.is_recurring,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Expense {self.title}: ${self.amount}>'

class Budget(db.Model):
    __tablename__ = 'budgets'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Budget details
    name = db.Column(db.String(100), nullable=False)
    category = db.Column(db.String(50), nullable=False, index=True)
    budget_amount = db.Column(db.Float, nullable=False)
    period = db.Column(db.String(10), default='monthly', nullable=False)  # daily, weekly, monthly, yearly
    
    # Time period
    month = db.Column(db.Integer)  # 1-12
    year = db.Column(db.Integer)
    start_date = db.Column(db.Date)
    end_date = db.Column(db.Date)
    
    # Budget status
    is_active = db.Column(db.Boolean, default=True)
    alert_threshold = db.Column(db.Float, default=0.8)  # Alert when 80% spent
    
    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Unique constraint
    __table_args__ = (
        db.UniqueConstraint('user_id', 'category', 'month', 'year', name='unique_user_category_period'),
    )
    
    def get_spent_amount(self):
        """Calculate spent amount for this budget period"""
        query = Expense.query.filter(
            Expense.user_id == self.user_id,
            Expense.category == self.category
        )
        
        if self.start_date and self.end_date:
            query = query.filter(
                Expense.date >= self.start_date,
                Expense.date <= self.end_date
            )
        elif self.month and self.year:
            query = query.filter(
                db.extract('month', Expense.date) == self.month,
                db.extract('year', Expense.date) == self.year
            )
        
        return query.with_entities(db.func.sum(Expense.amount)).scalar() or 0.0
    
    def get_remaining_amount(self):
        """Get remaining budget amount"""
        return max(0, self.budget_amount - self.get_spent_amount())
    
    def get_usage_percentage(self):
        """Get budget usage percentage"""
        spent = self.get_spent_amount()
        return (spent / self.budget_amount * 100) if self.budget_amount > 0 else 0
    
    def is_over_budget(self):
        """Check if over budget"""
        return self.get_spent_amount() > self.budget_amount
    
    def should_alert(self):
        """Check if should send alert"""
        return self.get_usage_percentage() >= (self.alert_threshold * 100)
    
    def to_dict(self):
        """Convert to dictionary"""
        spent_amount = self.get_spent_amount()
        return {
            'id': self.id,
            'name': self.name,
            'category': self.category,
            'budget_amount': float(self.budget_amount),
            'spent_amount': float(spent_amount),
            'remaining_amount': float(self.get_remaining_amount()),
            'usage_percentage': float(self.get_usage_percentage()),
            'period': self.period,
            'month': self.month,
            'year': self.year,
            'is_active': self.is_active,
            'is_over_budget': self.is_over_budget(),
            'should_alert': self.should_alert(),
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Budget {self.name}: ${self.budget_amount}>'

class MLModel(db.Model):
    __tablename__ = 'ml_models'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Model information
    model_type = db.Column(db.String(50), nullable=False, index=True)  # category_prediction, anomaly_detection, forecasting
    model_name = db.Column(db.String(100))
    model_version = db.Column(db.String(20), default='1.0')
    
    # Model data and metadata
    model_data = db.Column(db.LargeBinary)  # Serialized model
    model_params = db.Column(db.Text)  # JSON string of model parameters
    feature_names = db.Column(db.Text)  # JSON string of feature names
    
    # Training information
    training_accuracy = db.Column(db.Float)
    training_samples = db.Column(db.Integer)
    training_date = db.Column(db.DateTime, default=datetime.utcnow)
    training_duration = db.Column(db.Float)  # in seconds
    
    # Model status
    is_active = db.Column(db.Boolean, default=True)
    last_used = db.Column(db.DateTime)
    usage_count = db.Column(db.Integer, default=0)
    
    # Performance metrics
    precision_score = db.Column(db.Float)
    recall_score = db.Column(db.Float)
    f1_score = db.Column(db.Float)
    
    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def get_model_params(self):
        """Get model parameters as dict"""
        if self.model_params:
            try:
                return json.loads(self.model_params)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}
    
    def set_model_params(self, params_dict):
        """Set model parameters from dict"""
        if isinstance(params_dict, dict):
            self.model_params = json.dumps(params_dict)
    
    def get_feature_names(self):
        """Get feature names as list"""
        if self.feature_names:
            try:
                return json.loads(self.feature_names)
            except (json.JSONDecodeError, TypeError):
                return []
        return []
    
    def set_feature_names(self, features_list):
        """Set feature names from list"""
        if isinstance(features_list, list):
            self.feature_names = json.dumps(features_list)
    
    def increment_usage(self):
        """Increment usage count and update last used"""
        self.usage_count = (self.usage_count or 0) + 1
        self.last_used = datetime.utcnow()
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'model_type': self.model_type,
            'model_name': self.model_name,
            'model_version': self.model_version,
            'training_accuracy': float(self.training_accuracy) if self.training_accuracy else None,
            'training_samples': self.training_samples,
            'training_date': self.training_date.isoformat() if self.training_date else None,
            'is_active': self.is_active,
            'usage_count': self.usage_count,
            'precision_score': float(self.precision_score) if self.precision_score else None,
            'recall_score': float(self.recall_score) if self.recall_score else None,
            'f1_score': float(self.f1_score) if self.f1_score else None,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<MLModel {self.model_type} for User {self.user_id}>'

class Analytics(db.Model):
    __tablename__ = 'analytics'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Analysis information
    analysis_type = db.Column(db.String(50), nullable=False, index=True)  # spending_trends, category_analysis, forecasting
    analysis_name = db.Column(db.String(100))
    analysis_data = db.Column(db.Text)  # JSON string of analysis results
    
    # Time period
    period_start = db.Column(db.DateTime)
    period_end = db.Column(db.DateTime)
    month = db.Column(db.Integer)
    year = db.Column(db.Integer)
    
    # Analysis metadata
    data_points_count = db.Column(db.Integer)
    confidence_score = db.Column(db.Float)
    
    # Status
    is_current = db.Column(db.Boolean, default=True)
    
    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    updated_at = db.Column(db.DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def get_analysis_data(self):
        """Get analysis data as dict"""
        if self.analysis_data:
            try:
                return json.loads(self.analysis_data)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}
    
    def set_analysis_data(self, data_dict):
        """Set analysis data from dict"""
        if isinstance(data_dict, dict):
            self.analysis_data = json.dumps(data_dict)
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'analysis_type': self.analysis_type,
            'analysis_name': self.analysis_name,
            'analysis_data': self.get_analysis_data(),
            'period_start': self.period_start.isoformat() if self.period_start else None,
            'period_end': self.period_end.isoformat() if self.period_end else None,
            'month': self.month,
            'year': self.year,
            'data_points_count': self.data_points_count,
            'confidence_score': float(self.confidence_score) if self.confidence_score else None,
            'is_current': self.is_current,
            'created_at': self.created_at.isoformat() if self.created_at else None
        }
    
    def __repr__(self):
        return f'<Analytics {self.analysis_type} for User {self.user_id}>'

class Recommendation(db.Model):
    __tablename__ = 'recommendations'
    
    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.Integer, db.ForeignKey('users.id'), nullable=False, index=True)
    
    # Recommendation details
    recommendation_type = db.Column(db.String(50), nullable=False, index=True)
    title = db.Column(db.String(200), nullable=False)
    message = db.Column(db.Text, nullable=False)
    
    # Context information
    category = db.Column(db.String(50))
    amount = db.Column(db.Float)
    priority = db.Column(db.String(10), default='medium')  # low, medium, high, critical
    
    # Action information
    action_type = db.Column(db.String(50))  # alert, suggestion, warning
    action_data = db.Column(db.Text)  # JSON string of action-specific data
    
    # Status
    is_read = db.Column(db.Boolean, default=False)
    is_dismissed = db.Column(db.Boolean, default=False)
    is_acted_upon = db.Column(db.Boolean, default=False)
    
    # Expiry
    expires_at = db.Column(db.DateTime)
    
    # ML confidence
    confidence_score = db.Column(db.Float)
    
    # Audit fields
    created_at = db.Column(db.DateTime, default=datetime.utcnow, nullable=False)
    read_at = db.Column(db.DateTime)
    dismissed_at = db.Column(db.DateTime)
    
    def get_action_data(self):
        """Get action data as dict"""
        if self.action_data:
            try:
                return json.loads(self.action_data)
            except (json.JSONDecodeError, TypeError):
                return {}
        return {}
    
    def set_action_data(self, data_dict):
        """Set action data from dict"""
        if isinstance(data_dict, dict):
            self.action_data = json.dumps(data_dict)
    
    def mark_as_read(self):
        """Mark recommendation as read"""
        self.is_read = True
        self.read_at = datetime.utcnow()
    
    def dismiss(self):
        """Dismiss recommendation"""
        self.is_dismissed = True
        self.dismissed_at = datetime.utcnow()
    
    def is_expired(self):
        """Check if recommendation is expired"""
        if self.expires_at:
            return datetime.utcnow() > self.expires_at
        return False
    
    def to_dict(self):
        """Convert to dictionary"""
        return {
            'id': self.id,
            'recommendation_type': self.recommendation_type,
            'title': self.title,
            'message': self.message,
            'category': self.category,
            'amount': float(self.amount) if self.amount else None,
            'priority': self.priority,
            'action_type': self.action_type,
            'action_data': self.get_action_data(),
            'is_read': self.is_read,
            'is_dismissed': self.is_dismissed,
            'is_acted_upon': self.is_acted_upon,
            'confidence_score': float(self.confidence_score) if self.confidence_score else None,
            'expires_at': self.expires_at.isoformat() if self.expires_at else None,
            'created_at': self.created_at.isoformat() if self.created_at else None,
            'is_expired': self.is_expired()
        }
    
    def __repr__(self):
        return f'<Recommendation {self.title} for User {self.user_id}>'

# Predefined categories and constants
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

PAYMENT_MODES = [
    'cash',
    'card',
    'wallet',
    'bank',
    'online',
    'cheque'
]

BUDGET_PERIODS = [
    'daily',
    'weekly',
    'monthly',
    'yearly'
]

RECOMMENDATION_TYPES = [
    'budget_alert',
    'high_spending_alert',
    'category_optimization',
    'spending_pattern',
    'savings_opportunity',
    'bill_reminder',
    'unusual_activity',
    'budget_suggestion'
]

ML_MODEL_TYPES = [
    'category_prediction',
    'anomaly_detection',
    'spending_forecast',
    'budget_optimization'
]

PRIORITY_LEVELS = [
    'low',
    'medium',
    'high',
    'critical'
]

# Database helper functions
def create_tables(app):
    """Create all database tables"""
    with app.app_context():
        db.create_all()

def drop_tables(app):
    """Drop all database tables"""
    with app.app_context():
        db.drop_all()

def init_db(app):
    """Initialize database with sample data"""
    with app.app_context():
        db.create_all()
        
        # Check if we already have users
        if User.query.count() == 0:
            # Create sample user
            sample_user = User(
                username='demo_user',
                email='demo@example.com',
                monthly_budget=3000.0
            )
            sample_user.set_password('demo_password')
            db.session.add(sample_user)
            db.session.commit()
            
            print(f"Created sample user: {sample_user.username}")
            return sample_user
        
        return None