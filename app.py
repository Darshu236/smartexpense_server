# app.py - Main Flask API Service
from flask import Flask, request, jsonify, session, Response
from flask_sqlalchemy import SQLAlchemy
from flask_cors import CORS
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager, create_access_token, jwt_required, get_jwt_identity
from datetime import datetime, timedelta
import requests
import os
from dotenv import load_dotenv
import logging
from functools import wraps
import traceback
import csv
from io import StringIO
import re

# Load environment variables
load_dotenv()

# Import models
from models import (
    db, User, Expense, Budget, Analytics, Recommendation, MLModel,
    EXPENSE_CATEGORIES, PAYMENT_MODES, BUDGET_PERIODS, RECOMMENDATION_TYPES,
    init_db
)

# Initialize Flask app
app = Flask(__name__)

# Configuration
app.config['SECRET_KEY'] = os.getenv('SECRET_KEY', 'dev-secret-key')
app.config['SQLALCHEMY_DATABASE_URI'] = os.getenv(
    'DATABASE_URL', 
    'postgresql://postgres:password@localhost:5432/expense_tracker'
)
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['JWT_SECRET_KEY'] = os.getenv('JWT_SECRET_KEY', 'jwt-secret-string')
app.config['JWT_ACCESS_TOKEN_EXPIRES'] = timedelta(days=30)

# Initialize extensions
db.init_app(app)
CORS(app, origins=['http://localhost:3000', 'http://localhost:80', 'http://localhost:5173'])
migrate = Migrate(app, db)
jwt = JWTManager(app)

# ML Service URL
ML_SERVICE_URL = os.getenv('ML_SERVICE_URL', 'http://localhost:4000')

# Logging setup
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Error handling decorator
def handle_errors(f):
    @wraps(f)
    def decorated_function(*args, **kwargs):
        try:
            return f(*args, **kwargs)
        except Exception as e:
            logger.error(f"Error in {f.__name__}: {str(e)}")
            logger.error(traceback.format_exc())
            db.session.rollback()
            return jsonify({'error': 'Internal server error', 'message': str(e)}), 500
    return decorated_function

def call_ml_service(endpoint, data):
    """Helper function to call ML service"""
    try:
        response = requests.post(f"{ML_SERVICE_URL}/{endpoint}", json=data, timeout=30)
        if response.status_code == 200:
            return response.json()
        else:
            logger.error(f"ML service error: {response.status_code} - {response.text}")
            return None
    except requests.exceptions.RequestException as e:
        logger.error(f"ML service connection error: {str(e)}")
        return None

# Routes
@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint"""
    return jsonify({
        'status': 'healthy',
        'service': 'expense-tracker-api',
        'timestamp': datetime.utcnow().isoformat(),
        'version': '1.0.0'
    })

# Authentication Routes
@app.route('/api/auth/register', methods=['POST'])
@handle_errors
def register():
    """User registration"""
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['username', 'email', 'password']
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing_fields': missing_fields
        }), 400
    
    # Validate email format
    email_pattern = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_pattern, data['email']):
        return jsonify({'error': 'Invalid email format'}), 400
    
    # Check if user already exists
    if User.query.filter_by(email=data['email']).first():
        return jsonify({'error': 'Email already registered'}), 400
    
    if User.query.filter_by(username=data['username']).first():
        return jsonify({'error': 'Username already taken'}), 400
    
    # Validate password
    if len(data['password']) < 8:
        return jsonify({'error': 'Password must be at least 8 characters long'}), 400
    
    # Create new user
    user = User(
        username=data['username'].strip(),
        email=data['email'].strip().lower(),
        monthly_budget=float(data.get('monthly_budget', 0.0)),
        first_name=data.get('first_name', '').strip(),
        last_name=data.get('last_name', '').strip()
    )
    user.set_password(data['password'])
    
    db.session.add(user)
    db.session.commit()
    
    # Create access token
    access_token = create_access_token(identity=user.id)
    
    return jsonify({
        'message': 'User registered successfully',
        'access_token': access_token,
        'user': user.to_dict()
    }), 201

@app.route('/api/auth/login', methods=['POST'])
@handle_errors
def login():
    """User login"""
    data = request.get_json()
    
    # Validate required fields
    if not data.get('email') or not data.get('password'):
        return jsonify({'error': 'Email and password required'}), 400
    
    # Find user
    user = User.query.filter_by(email=data['email'].strip().lower()).first()
    
    if not user or not user.check_password(data['password']):
        return jsonify({'error': 'Invalid credentials'}), 401
    
    if not user.is_active:
        return jsonify({'error': 'Account is deactivated'}), 401
    
    # Update last login
    user.last_login = datetime.utcnow()
    db.session.commit()
    
    # Create access token
    access_token = create_access_token(identity=user.id)
    
    return jsonify({
        'message': 'Login successful',
        'access_token': access_token,
        'user': user.to_dict()
    })

@app.route('/api/auth/profile', methods=['GET'])
@jwt_required()
@handle_errors
def get_profile():
    """Get user profile"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    return jsonify({'user': user.to_dict()})

@app.route('/api/auth/profile', methods=['PUT'])
@jwt_required()
@handle_errors
def update_profile():
    """Update user profile"""
    user_id = get_jwt_identity()
    user = User.query.get(user_id)
    
    if not user:
        return jsonify({'error': 'User not found'}), 404
    
    data = request.get_json()
    
    # Update allowed fields
    if 'monthly_budget' in data:
        user.monthly_budget = float(data['monthly_budget'])
    if 'first_name' in data:
        user.first_name = data['first_name'].strip()
    if 'last_name' in data:
        user.last_name = data['last_name'].strip()
    if 'default_currency' in data:
        user.default_currency = data['default_currency']
    
    user.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Profile updated successfully',
        'user': user.to_dict()
    })

# Expense Routes
@app.route('/api/expenses', methods=['GET'])
@jwt_required()
@handle_errors
def get_expenses():
    """Get user expenses with filtering and pagination"""
    user_id = get_jwt_identity()
    page = request.args.get('page', 1, type=int)
    per_page = min(request.args.get('per_page', 50, type=int), 100)  # Max 100 per page
    
    # Build query
    query = Expense.query.filter_by(user_id=user_id)
    
    # Apply filters
    category = request.args.get('category')
    if category:
        query = query.filter_by(category=category)
    
    payment_mode = request.args.get('payment_mode')
    if payment_mode:
        query = query.filter_by(payment_mode=payment_mode)
    
    start_date = request.args.get('start_date')
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(Expense.date >= start_dt)
        except ValueError:
            return jsonify({'error': 'Invalid start_date format'}), 400
    
    end_date = request.args.get('end_date')
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(Expense.date <= end_dt)
        except ValueError:
            return jsonify({'error': 'Invalid end_date format'}), 400
    
    search = request.args.get('search')
    if search:
        query = query.filter(Expense.title.ilike(f'%{search}%'))
    
    # Order by date desc
    query = query.order_by(Expense.date.desc())
    
    # Paginate
    try:
        expenses_paginated = query.paginate(
            page=page, per_page=per_page, error_out=False
        )
    except Exception as e:
        logger.error(f"Pagination error: {str(e)}")
        return jsonify({'error': 'Invalid pagination parameters'}), 400
    
    return jsonify({
        'expenses': [expense.to_dict() for expense in expenses_paginated.items],
        'pagination': {
            'page': expenses_paginated.page,
            'per_page': expenses_paginated.per_page,
            'total': expenses_paginated.total,
            'pages': expenses_paginated.pages,
            'has_next': expenses_paginated.has_next,
            'has_prev': expenses_paginated.has_prev
        }
    })

@app.route('/api/expenses', methods=['POST'])
@jwt_required()
@handle_errors
def add_expense():
    """Add new expense"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['title', 'amount', 'category', 'payment_mode']
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing_fields': missing_fields
        }), 400
    
    # Validate amount
    try:
        amount = float(data['amount'])
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than 0'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid amount format'}), 400
    
    # Validate category
    if data['category'] not in EXPENSE_CATEGORIES:
        return jsonify({
            'error': 'Invalid category',
            'valid_categories': EXPENSE_CATEGORIES
        }), 400
    
    # Validate payment mode
    if data['payment_mode'] not in PAYMENT_MODES:
        return jsonify({
            'error': 'Invalid payment mode',
            'valid_payment_modes': PAYMENT_MODES
        }), 400
    
    # Parse date
    expense_date = datetime.utcnow()
    if data.get('date'):
        try:
            expense_date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
    
    # Auto-categorize if requested
    predicted_category = None
    category_confidence = None
    
    if data.get('auto_categorize', False) and data['category'] == 'Other':
        # Get user's expenses for training
        user_expenses = Expense.query.filter_by(user_id=user_id).all()
        if len(user_expenses) >= 10:  # Need minimum data for training
            transactions_data = [{'title': exp.title, 'category': exp.category} for exp in user_expenses]
            
            # Call ML service for prediction
            ml_response = call_ml_service('predict_category', {
                'title': data['title'],
                'training_data': transactions_data
            })
            if ml_response and ml_response.get('success') and ml_response.get('confidence', 0) > 0.7:
                predicted_category = ml_response.get('predicted_category')
                category_confidence = ml_response.get('confidence')
                data['category'] = predicted_category
    
    # Create expense
    expense = Expense(
        user_id=user_id,
        title=data['title'].strip(),
        amount=amount,
        category=data['category'],
        subcategory=data.get('subcategory', '').strip() or None,
        date=expense_date,
        payment_mode=data['payment_mode'],
        description=data.get('description', '').strip() or None,
        location=data.get('location', '').strip() or None,
        merchant=data.get('merchant', '').strip() or None,
        currency=data.get('currency', 'USD'),
        is_predicted=predicted_category is not None,
        prediction_confidence=category_confidence,
        tags=data.get('tags', [])
    )
    
    db.session.add(expense)
    db.session.commit()
    
    response_data = {
        'message': 'Expense added successfully',
        'expense': expense.to_dict()
    }
    
    if predicted_category:
        response_data['prediction'] = {
            'predicted_category': predicted_category,
            'confidence': category_confidence
        }
    
    return jsonify(response_data), 201

@app.route('/api/expenses/<int:expense_id>', methods=['GET'])
@jwt_required()
@handle_errors
def get_expense(expense_id):
    """Get specific expense"""
    user_id = get_jwt_identity()
    expense = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    return jsonify({'expense': expense.to_dict()})

@app.route('/api/expenses/<int:expense_id>', methods=['PUT'])
@jwt_required()
@handle_errors
def update_expense(expense_id):
    """Update specific expense"""
    user_id = get_jwt_identity()
    expense = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    data = request.get_json()
    
    # Update fields
    if 'title' in data:
        expense.title = data['title'].strip()
    if 'amount' in data:
        try:
            amount = float(data['amount'])
            if amount <= 0:
                return jsonify({'error': 'Amount must be greater than 0'}), 400
            expense.amount = amount
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid amount format'}), 400
    if 'category' in data:
        if data['category'] not in EXPENSE_CATEGORIES:
            return jsonify({
                'error': 'Invalid category',
                'valid_categories': EXPENSE_CATEGORIES
            }), 400
        expense.category = data['category']
    if 'subcategory' in data:
        expense.subcategory = data['subcategory'].strip() or None
    if 'payment_mode' in data:
        if data['payment_mode'] not in PAYMENT_MODES:
            return jsonify({
                'error': 'Invalid payment mode',
                'valid_payment_modes': PAYMENT_MODES
            }), 400
        expense.payment_mode = data['payment_mode']
    if 'description' in data:
        expense.description = data['description'].strip() or None
    if 'location' in data:
        expense.location = data['location'].strip() or None
    if 'merchant' in data:
        expense.merchant = data['merchant'].strip() or None
    if 'date' in data:
        try:
            expense.date = datetime.fromisoformat(data['date'].replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
    if 'tags' in data:
        expense.tags = data['tags']
    
    expense.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Expense updated successfully',
        'expense': expense.to_dict()
    })

@app.route('/api/expenses/<int:expense_id>', methods=['DELETE'])
@jwt_required()
@handle_errors
def delete_expense(expense_id):
    """Delete specific expense"""
    user_id = get_jwt_identity()
    expense = Expense.query.filter_by(id=expense_id, user_id=user_id).first()
    
    if not expense:
        return jsonify({'error': 'Expense not found'}), 404
    
    db.session.delete(expense)
    db.session.commit()
    
    return jsonify({'message': 'Expense deleted successfully'})

@app.route('/api/expenses/bulk', methods=['POST'])
@jwt_required()
@handle_errors
def bulk_add_expenses():
    """Add multiple expenses at once"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data.get('expenses') or not isinstance(data['expenses'], list):
        return jsonify({'error': 'expenses array is required'}), 400
    
    if len(data['expenses']) > 100:  # Limit bulk operations
        return jsonify({'error': 'Maximum 100 expenses allowed per bulk operation'}), 400
    
    created_expenses = []
    errors = []
    
    for i, expense_data in enumerate(data['expenses']):
        try:
            # Validate required fields
            required_fields = ['title', 'amount', 'category', 'payment_mode']
            missing_fields = [field for field in required_fields if not expense_data.get(field)]
            if missing_fields:
                errors.append({
                    'index': i,
                    'error': f'Missing required fields: {missing_fields}'
                })
                continue
            
            # Validate amount
            amount = float(expense_data['amount'])
            if amount <= 0:
                errors.append({
                    'index': i,
                    'error': 'Amount must be greater than 0'
                })
                continue
            
            # Validate category and payment mode
            if expense_data['category'] not in EXPENSE_CATEGORIES:
                errors.append({
                    'index': i,
                    'error': f'Invalid category: {expense_data["category"]}'
                })
                continue
            
            if expense_data['payment_mode'] not in PAYMENT_MODES:
                errors.append({
                    'index': i,
                    'error': f'Invalid payment mode: {expense_data["payment_mode"]}'
                })
                continue
            
            # Parse date
            expense_date = datetime.utcnow()
            if expense_data.get('date'):
                expense_date = datetime.fromisoformat(expense_data['date'].replace('Z', '+00:00'))
            
            # Create expense
            expense = Expense(
                user_id=user_id,
                title=expense_data['title'].strip(),
                amount=amount,
                category=expense_data['category'],
                subcategory=expense_data.get('subcategory', '').strip() or None,
                date=expense_date,
                payment_mode=expense_data['payment_mode'],
                description=expense_data.get('description', '').strip() or None,
                location=expense_data.get('location', '').strip() or None,
                merchant=expense_data.get('merchant', '').strip() or None,
                currency=expense_data.get('currency', 'USD'),
                tags=expense_data.get('tags', [])
            )
            
            db.session.add(expense)
            created_expenses.append(expense)
            
        except (ValueError, TypeError) as e:
            errors.append({
                'index': i,
                'error': str(e)
            })
        except Exception as e:
            errors.append({
                'index': i,
                'error': f'Unexpected error: {str(e)}'
            })
    
    if created_expenses:
        db.session.commit()
    
    return jsonify({
        'message': f'{len(created_expenses)} expenses created successfully',
        'created_count': len(created_expenses),
        'error_count': len(errors),
        'expenses': [exp.to_dict() for exp in created_expenses],
        'errors': errors
    }), 201 if created_expenses else 400

# Budget Routes
@app.route('/api/budgets', methods=['GET'])
@jwt_required()
@handle_errors
def get_budgets():
    """Get user budgets"""
    user_id = get_jwt_identity()
    budgets = Budget.query.filter_by(user_id=user_id).order_by(Budget.created_at.desc()).all()
    
    return jsonify({
        'budgets': [budget.to_dict() for budget in budgets]
    })

@app.route('/api/budgets', methods=['POST'])
@jwt_required()
@handle_errors
def create_budget():
    """Create new budget"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    # Validate required fields
    required_fields = ['category', 'amount', 'period']
    missing_fields = [field for field in required_fields if not data.get(field)]
    if missing_fields:
        return jsonify({
            'error': 'Missing required fields',
            'missing_fields': missing_fields
        }), 400
    
    # Validate amount
    try:
        amount = float(data['amount'])
        if amount <= 0:
            return jsonify({'error': 'Amount must be greater than 0'}), 400
    except (ValueError, TypeError):
        return jsonify({'error': 'Invalid amount format'}), 400
    
    # Validate period
    if data['period'] not in BUDGET_PERIODS:
        return jsonify({
            'error': 'Invalid period',
            'valid_periods': BUDGET_PERIODS
        }), 400
    
    # Check for duplicate budget (same category and period)
    existing_budget = Budget.query.filter_by(
        user_id=user_id,
        category=data['category'],
        period=data['period'],
        is_active=True
    ).first()
    
    if existing_budget:
        return jsonify({
            'error': f'Active budget already exists for {data["category"]} ({data["period"]})'
        }), 400
    
    # Create budget
    budget = Budget(
        user_id=user_id,
        category=data['category'],
        amount=amount,
        period=data['period'],
        start_date=datetime.utcnow(),
        description=data.get('description', '').strip() or None
    )
    
    db.session.add(budget)
    db.session.commit()
    
    return jsonify({
        'message': 'Budget created successfully',
        'budget': budget.to_dict()
    }), 201

@app.route('/api/budgets/<int:budget_id>', methods=['PUT'])
@jwt_required()
@handle_errors
def update_budget(budget_id):
    """Update budget"""
    user_id = get_jwt_identity()
    budget = Budget.query.filter_by(id=budget_id, user_id=user_id).first()
    
    if not budget:
        return jsonify({'error': 'Budget not found'}), 404
    
    data = request.get_json()
    
    # Update fields
    if 'amount' in data:
        try:
            amount = float(data['amount'])
            if amount <= 0:
                return jsonify({'error': 'Amount must be greater than 0'}), 400
            budget.amount = amount
        except (ValueError, TypeError):
            return jsonify({'error': 'Invalid amount format'}), 400
    
    if 'description' in data:
        budget.description = data['description'].strip() or None
    
    if 'is_active' in data:
        budget.is_active = bool(data['is_active'])
    
    budget.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({
        'message': 'Budget updated successfully',
        'budget': budget.to_dict()
    })

@app.route('/api/budgets/<int:budget_id>', methods=['DELETE'])
@jwt_required()
@handle_errors
def delete_budget(budget_id):
    """Delete budget"""
    user_id = get_jwt_identity()
    budget = Budget.query.filter_by(id=budget_id, user_id=user_id).first()
    
    if not budget:
        return jsonify({'error': 'Budget not found'}), 404
    
    db.session.delete(budget)
    db.session.commit()
    
    return jsonify({'message': 'Budget deleted successfully'})

# Analytics Routes
@app.route('/api/analytics/summary', methods=['GET'])
@jwt_required()
@handle_errors
def get_analytics_summary():
    """Get expense analytics summary"""
    user_id = get_jwt_identity()
    
    # Get date range
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    if not start_date or not end_date:
        # Default to current month
        now = datetime.utcnow()
        start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
        end_date = now
    else:
        try:
            start_date = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            end_date = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
        except ValueError:
            return jsonify({'error': 'Invalid date format'}), 400
    
    # Get expenses in date range
    expenses = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.date >= start_date,
        Expense.date <= end_date
    ).all()
    
    # Calculate summary
    total_expenses = sum(exp.amount for exp in expenses)
    total_transactions = len(expenses)
    
    # Category breakdown
    category_breakdown = {}
    payment_mode_breakdown = {}
    
    for expense in expenses:
        # Category breakdown
        if expense.category not in category_breakdown:
            category_breakdown[expense.category] = {'amount': 0, 'count': 0}
        category_breakdown[expense.category]['amount'] += expense.amount
        category_breakdown[expense.category]['count'] += 1
        
        # Payment mode breakdown
        if expense.payment_mode not in payment_mode_breakdown:
            payment_mode_breakdown[expense.payment_mode] = {'amount': 0, 'count': 0}
        payment_mode_breakdown[expense.payment_mode]['amount'] += expense.amount
        payment_mode_breakdown[expense.payment_mode]['count'] += 1
    
    # Daily breakdown
    daily_breakdown = {}
    for expense in expenses:
        date_key = expense.date.strftime('%Y-%m-%d')
        if date_key not in daily_breakdown:
            daily_breakdown[date_key] = {'amount': 0, 'count': 0}
        daily_breakdown[date_key]['amount'] += expense.amount
        daily_breakdown[date_key]['count'] += 1
    
    return jsonify({
        'summary': {
            'total_expenses': total_expenses,
            'total_transactions': total_transactions,
            'average_transaction': total_expenses / total_transactions if total_transactions > 0 else 0,
            'date_range': {
                'start_date': start_date.isoformat(),
                'end_date': end_date.isoformat()
            }
        },
        'category_breakdown': category_breakdown,
        'payment_mode_breakdown': payment_mode_breakdown,
        'daily_breakdown': daily_breakdown
    })

@app.route('/api/analytics/trends', methods=['GET'])
@jwt_required()
@handle_errors
def get_expense_trends():
    """Get expense trends over time"""
    user_id = get_jwt_identity()
    period = request.args.get('period', 'monthly')  # monthly, weekly, daily
    months = int(request.args.get('months', 6))  # Number of months to analyze
    
    if period not in ['daily', 'weekly', 'monthly']:
        return jsonify({'error': 'Invalid period. Use daily, weekly, or monthly'}), 400
    
    # Calculate date range
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=months * 30)  # Approximate
    
    # Get expenses
    expenses = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.date >= start_date,
        Expense.date <= end_date
    ).order_by(Expense.date.asc()).all()
    
    # Group expenses by period
    trends = {}
    
    for expense in expenses:
        if period == 'daily':
            key = expense.date.strftime('%Y-%m-%d')
        elif period == 'weekly':
            # Start of week (Monday)
            week_start = expense.date - timedelta(days=expense.date.weekday())
            key = week_start.strftime('%Y-%m-%d')
        else:  # monthly
            key = expense.date.strftime('%Y-%m')
        
        if key not in trends:
            trends[key] = {'amount': 0, 'count': 0, 'categories': {}}
        
        trends[key]['amount'] += expense.amount
        trends[key]['count'] += 1
        
        if expense.category not in trends[key]['categories']:
            trends[key]['categories'][expense.category] = 0
        trends[key]['categories'][expense.category] += expense.amount
    
    return jsonify({
        'trends': trends,
        'period': period,
        'date_range': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        }
    })

@app.route('/api/analytics/budget-comparison', methods=['GET'])
@jwt_required()
@handle_errors
def get_budget_comparison():
    """Compare actual expenses with budgets"""
    user_id = get_jwt_identity()
    
    # Get current month by default
    now = datetime.utcnow()
    start_date = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    end_date = now
    
    # Get active budgets
    budgets = Budget.query.filter_by(user_id=user_id, is_active=True).all()
    
    # Get expenses for current period
    expenses = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.date >= start_date,
        Expense.date <= end_date
    ).all()
    
    # Calculate spending by category
    category_spending = {}
    for expense in expenses:
        if expense.category not in category_spending:
            category_spending[expense.category] = 0
        category_spending[expense.category] += expense.amount
    
    # Compare with budgets
    budget_comparison = []
    total_budget = 0
    total_spent = 0
    
    for budget in budgets:
        spent = category_spending.get(budget.category, 0)
        remaining = budget.amount - spent
        percentage_used = (spent / budget.amount * 100) if budget.amount > 0 else 0
        
        budget_comparison.append({
            'category': budget.category,
            'budgeted': budget.amount,
            'spent': spent,
            'remaining': remaining,
            'percentage_used': percentage_used,
            'status': 'over' if spent > budget.amount else 'under',
            'period': budget.period
        })
        
        total_budget += budget.amount
        total_spent += spent
    
    return jsonify({
        'budget_comparison': budget_comparison,
        'summary': {
            'total_budget': total_budget,
            'total_spent': total_spent,
            'total_remaining': total_budget - total_spent,
            'overall_percentage': (total_spent / total_budget * 100) if total_budget > 0 else 0
        },
        'period': {
            'start_date': start_date.isoformat(),
            'end_date': end_date.isoformat()
        }
    })

# Recommendation Routes
@app.route('/api/recommendations', methods=['GET'])
@jwt_required()
@handle_errors
def get_recommendations():
    """Get personalized spending recommendations"""
    user_id = get_jwt_identity()
    
    # Get user's expense data for analysis
    user_expenses = Expense.query.filter_by(user_id=user_id).all()
    user_budgets = Budget.query.filter_by(user_id=user_id, is_active=True).all()
    
    if len(user_expenses) < 10:
        return jsonify({
            'recommendations': [],
            'message': 'Not enough data for recommendations. Add more expenses to get personalized insights.'
        })
    
    # Prepare data for ML service
    expense_data = []
    for expense in user_expenses:
        expense_data.append({
            'amount': expense.amount,
            'category': expense.category,
            'date': expense.date.isoformat(),
            'payment_mode': expense.payment_mode
        })
    
    budget_data = []
    for budget in user_budgets:
        budget_data.append({
            'category': budget.category,
            'amount': budget.amount,
            'period': budget.period
        })
    
    # Call ML service for recommendations
    ml_response = call_ml_service('generate_recommendations', {
        'expenses': expense_data,
        'budgets': budget_data
    })
    
    recommendations = []
    if ml_response and ml_response.get('success'):
        recommendations = ml_response.get('recommendations', [])
    else:
        # Fallback to rule-based recommendations
        recommendations = generate_rule_based_recommendations(user_expenses, user_budgets)
    
    # Store recommendations in database
    for rec_data in recommendations[:5]:  # Store top 5 recommendations
        recommendation = Recommendation(
            user_id=user_id,
            type=rec_data.get('type', 'spending'),
            title=rec_data.get('title', ''),
            description=rec_data.get('description', ''),
            category=rec_data.get('category'),
            priority=rec_data.get('priority', 'medium'),
            potential_savings=rec_data.get('potential_savings', 0.0)
        )
        db.session.add(recommendation)
    
    db.session.commit()
    
    return jsonify({
        'recommendations': recommendations,
        'generated_at': datetime.utcnow().isoformat()
    })

def generate_rule_based_recommendations(expenses, budgets):
    """Generate simple rule-based recommendations"""
    recommendations = []
    
    # Calculate monthly spending by category
    now = datetime.utcnow()
    current_month_start = now.replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    
    current_month_expenses = [
        exp for exp in expenses 
        if exp.date >= current_month_start
    ]
    
    category_spending = {}
    for expense in current_month_expenses:
        if expense.category not in category_spending:
            category_spending[expense.category] = []
        category_spending[expense.category].append(expense.amount)
    
    # Check for overspending
    budget_dict = {b.category: b.amount for b in budgets}
    
    for category, amounts in category_spending.items():
        total_spent = sum(amounts)
        avg_transaction = total_spent / len(amounts) if amounts else 0
        
        if category in budget_dict:
            budget_amount = budget_dict[category]
            if total_spent > budget_amount:
                overspend = total_spent - budget_amount
                recommendations.append({
                    'type': 'budget_alert',
                    'title': f'Over Budget in {category}',
                    'description': f'You have exceeded your {category} budget by ${overspend:.2f} this month.',
                    'category': category,
                    'priority': 'high',
                    'potential_savings': overspend
                })
        
        # High transaction frequency
        if len(amounts) > 15:  # More than 15 transactions in category
            recommendations.append({
                'type': 'frequency_alert',
                'title': f'High Transaction Frequency in {category}',
                'description': f'You made {len(amounts)} transactions in {category} this month. Consider consolidating purchases.',
                'category': category,
                'priority': 'medium',
                'potential_savings': avg_transaction * 0.2  # Estimate 20% savings
            })
        
        # High average transaction
        if avg_transaction > 100:
            recommendations.append({
                'type': 'spending_tip',
                'title': f'High Average Spending in {category}',
                'description': f'Your average {category} transaction is ${avg_transaction:.2f}. Look for bulk discounts or alternatives.',
                'category': category,
                'priority': 'medium',
                'potential_savings': avg_transaction * 0.15
            })
    
    return recommendations[:10]  # Return top 10 recommendations

@app.route('/api/recommendations/<int:rec_id>/dismiss', methods=['POST'])
@jwt_required()
@handle_errors
def dismiss_recommendation(rec_id):
    """Dismiss a recommendation"""
    user_id = get_jwt_identity()
    recommendation = Recommendation.query.filter_by(id=rec_id, user_id=user_id).first()
    
    if not recommendation:
        return jsonify({'error': 'Recommendation not found'}), 404
    
    recommendation.is_dismissed = True
    recommendation.updated_at = datetime.utcnow()
    db.session.commit()
    
    return jsonify({'message': 'Recommendation dismissed'})

# ML Model Routes
@app.route('/api/ml/predict-category', methods=['POST'])
@jwt_required()
@handle_errors
def predict_expense_category():
    """Predict expense category based on title"""
    user_id = get_jwt_identity()
    data = request.get_json()
    
    if not data.get('title'):
        return jsonify({'error': 'Title is required'}), 400
    
    # Get user's expense data for training
    user_expenses = Expense.query.filter_by(user_id=user_id).all()
    
    if len(user_expenses) < 20:
        return jsonify({
            'error': 'Not enough transaction history for accurate predictions',
            'message': 'Add more expenses to improve prediction accuracy'
        }), 400
    
    # Prepare training data
    training_data = [
        {'title': exp.title, 'category': exp.category} 
        for exp in user_expenses
    ]
    
    # Call ML service
    ml_response = call_ml_service('predict_category', {
        'title': data['title'],
        'training_data': training_data
    })
    
    if not ml_response or not ml_response.get('success'):
        return jsonify({'error': 'Prediction service unavailable'}), 503
    
    return jsonify({
        'predicted_category': ml_response.get('predicted_category'),
        'confidence': ml_response.get('confidence', 0),
        'alternatives': ml_response.get('alternatives', [])
    })

@app.route('/api/ml/spending-forecast', methods=['GET'])
@jwt_required()
@handle_errors
def get_spending_forecast():
    """Get spending forecast for next month"""
    user_id = get_jwt_identity()
    
    # Get historical expenses (last 6 months)
    end_date = datetime.utcnow()
    start_date = end_date - timedelta(days=180)
    
    expenses = Expense.query.filter(
        Expense.user_id == user_id,
        Expense.date >= start_date,
        Expense.date <= end_date
    ).all()
    
    if len(expenses) < 30:
        return jsonify({
            'error': 'Not enough historical data for forecast',
            'message': 'Add more expense history to get spending forecasts'
        }), 400
    
    # Prepare data for ML service
    expense_data = []
    for expense in expenses:
        expense_data.append({
            'amount': expense.amount,
            'category': expense.category,
            'date': expense.date.isoformat(),
            'payment_mode': expense.payment_mode
        })
    
    # Call ML service
    ml_response = call_ml_service('forecast_spending', {
        'historical_expenses': expense_data,
        'forecast_months': 1
    })
    
    if not ml_response or not ml_response.get('success'):
        # Fallback to simple average-based forecast
        monthly_avg = sum(exp.amount for exp in expenses) / 6  # 6 months avg
        category_forecast = {}
        
        for expense in expenses:
            if expense.category not in category_forecast:
                category_forecast[expense.category] = []
            category_forecast[expense.category].append(expense.amount)
        
        # Calculate averages per category
        for category in category_forecast:
            amounts = category_forecast[category]
            category_forecast[category] = sum(amounts) / len(amounts) * 30  # Monthly estimate
        
        return jsonify({
            'forecast': {
                'total_predicted': monthly_avg,
                'category_breakdown': category_forecast,
                'confidence': 0.6,
                'method': 'historical_average'
            },
            'period': 'next_month'
        })
    
    return jsonify({
        'forecast': ml_response.get('forecast'),
        'period': 'next_month',
        'generated_at': datetime.utcnow().isoformat()
    })

# Utility Routes
@app.route('/api/categories', methods=['GET'])
def get_categories():
    """Get available expense categories"""
    return jsonify({
        'categories': EXPENSE_CATEGORIES,
        'payment_modes': PAYMENT_MODES,
        'budget_periods': BUDGET_PERIODS
    })

@app.route('/api/export', methods=['GET'])
@jwt_required()
@handle_errors
def export_expenses():
    """Export expenses to CSV"""
    user_id = get_jwt_identity()
    format_type = request.args.get('format', 'csv').lower()
    
    if format_type not in ['csv', 'json']:
        return jsonify({'error': 'Invalid format. Use csv or json'}), 400
    
    # Get date range
    start_date = request.args.get('start_date')
    end_date = request.args.get('end_date')
    
    query = Expense.query.filter_by(user_id=user_id)
    
    if start_date:
        try:
            start_dt = datetime.fromisoformat(start_date.replace('Z', '+00:00'))
            query = query.filter(Expense.date >= start_dt)
        except ValueError:
            return jsonify({'error': 'Invalid start_date format'}), 400
    
    if end_date:
        try:
            end_dt = datetime.fromisoformat(end_date.replace('Z', '+00:00'))
            query = query.filter(Expense.date <= end_dt)
        except ValueError:
            return jsonify({'error': 'Invalid end_date format'}), 400
    
    expenses = query.order_by(Expense.date.desc()).all()
    
    if format_type == 'csv':
        output = StringIO()
        writer = csv.writer(output)
        
        # Write header
        writer.writerow([
            'ID', 'Title', 'Amount', 'Category', 'Subcategory', 
            'Date', 'Payment Mode', 'Description', 'Location', 
            'Merchant', 'Currency', 'Tags'
        ])
        
        # Write data
        for expense in expenses:
            writer.writerow([
                expense.id,
                expense.title,
                expense.amount,
                expense.category,
                expense.subcategory or '',
                expense.date.strftime('%Y-%m-%d %H:%M:%S'),
                expense.payment_mode,
                expense.description or '',
                expense.location or '',
                expense.merchant or '',
                expense.currency,
                ','.join(expense.tags) if expense.tags else ''
            ])
        
        return Response(
            output.getvalue(),
            mimetype='text/csv',
            headers={
                'Content-Disposition': f'attachment; filename=expenses_{datetime.utcnow().strftime("%Y%m%d")}.csv'
            }
        )
    
    else:  # JSON format
        expenses_data = [expense.to_dict() for expense in expenses]
        return jsonify({
            'expenses': expenses_data,
            'exported_at': datetime.utcnow().isoformat(),
            'total_count': len(expenses_data)
        })

# Error handlers
@app.errorhandler(404)
def not_found(error):
    return jsonify({'error': 'Endpoint not found'}), 404

@app.errorhandler(405)
def method_not_allowed(error):
    return jsonify({'error': 'Method not allowed'}), 405

@app.errorhandler(500)
def internal_error(error):
    db.session.rollback()
    return jsonify({'error': 'Internal server error'}), 500

@jwt.expired_token_loader
def expired_token_callback(jwt_header, jwt_payload):
    return jsonify({'error': 'Token has expired'}), 401

@jwt.invalid_token_loader
def invalid_token_callback(error):
    return jsonify({'error': 'Invalid token'}), 401

@jwt.unauthorized_loader
def missing_token_callback(error):
    return jsonify({'error': 'Authorization token is required'}), 401

# Database initialization
@app.before_first_request
def create_tables():
    """Create database tables if they don't exist"""
    try:
        db.create_all()
        logger.info("Database tables created successfully")
    except Exception as e:
        logger.error(f"Error creating database tables: {str(e)}")

# Development server
if __name__ == '__main__':
    # Initialize database
    with app.app_context():
        try:
            db.create_all()
            logger.info("Database initialized successfully")
        except Exception as e:
            logger.error(f"Database initialization failed: {str(e)}")
    
    # Run development server
    port = int(os.getenv('PORT', 5000))
    debug = os.getenv('FLASK_ENV') == 'development'
    
    logger.info(f"Starting Flask application on port {port}")
    logger.info(f"Debug mode: {debug}")
    logger.info(f"Database URL: {app.config['SQLALCHEMY_DATABASE_URI']}")
    
    app.run(
        host='0.0.0.0',
        port=port,
        debug=debug,
        threaded=True
    )