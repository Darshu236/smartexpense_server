# ml_service.py - Flask ML Service
from flask import Flask, request, jsonify
from flask_cors import CORS
import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import joblib
import warnings
warnings.filterwarnings('ignore')

# ML Libraries
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.naive_bayes import MultinomialNB
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from sklearn.ensemble import IsolationForest
import nltk
from nltk.corpus import stopwords
from nltk.tokenize import word_tokenize
import re

# Time Series
try:
    from prophet import Prophet
except ImportError:
    Prophet = None
    print("Prophet not installed. Time series forecasting will be limited.")

app = Flask(__name__)
CORS(app)

# Download NLTK data
try:
    nltk.download('punkt', quiet=True)
    nltk.download('stopwords', quiet=True)
except:
    pass

class ExpenseMLService:
    def __init__(self):
        self.category_model = None
        self.category_vectorizer = None
        self.anomaly_detector = None
        self.scaler = StandardScaler()
        self.cluster_model = None
        
    def preprocess_text(self, text):
        """Preprocess text for NLP"""
        if not text:
            return ""
        
        # Convert to lowercase and remove special characters
        text = re.sub(r'[^a-zA-Z\s]', '', text.lower())
        
        # Tokenize
        try:
            tokens = word_tokenize(text)
            # Remove stopwords
            stop_words = set(stopwords.words('english'))
            tokens = [token for token in tokens if token not in stop_words and len(token) > 2]
            return ' '.join(tokens)
        except:
            return text.lower()
    
    def train_category_model(self, transactions_data):
        """Train expense category prediction model"""
        df = pd.DataFrame(transactions_data)
        
        if df.empty or 'title' not in df.columns or 'category' not in df.columns:
            return False
            
        # Preprocess titles
        df['processed_title'] = df['title'].apply(self.preprocess_text)
        df = df[df['processed_title'].str.len() > 0]
        
        if len(df) < 5:  # Need minimum data
            return False
            
        # Train model
        self.category_vectorizer = TfidfVectorizer(max_features=100, ngram_range=(1, 2))
        X = self.category_vectorizer.fit_transform(df['processed_title'])
        y = df['category']
        
        self.category_model = MultinomialNB()
        self.category_model.fit(X, y)
        
        return True
    
    def predict_category(self, title):
        """Predict category for a transaction title"""
        if not self.category_model or not self.category_vectorizer:
            return None
            
        processed_title = self.preprocess_text(title)
        if not processed_title:
            return None
            
        X = self.category_vectorizer.transform([processed_title])
        prediction = self.category_model.predict(X)[0]
        probability = max(self.category_model.predict_proba(X)[0])
        
        return {
            'predicted_category': prediction,
            'confidence': float(probability)
        }
    
    def detect_anomalies(self, transactions_data):
        """Detect anomalous spending behavior"""
        df = pd.DataFrame(transactions_data)
        
        if df.empty or len(df) < 10:
            return []
            
        # Create features for anomaly detection
        df['date'] = pd.to_datetime(df['date'])
        df['day_of_week'] = df['date'].dt.dayofweek
        df['hour'] = df['date'].dt.hour
        df['month'] = df['date'].dt.month
        
        # Aggregate by day
        daily_spending = df.groupby(df['date'].dt.date).agg({
            'amount': ['sum', 'count', 'mean', 'std']
        }).fillna(0)
        daily_spending.columns = ['total_amount', 'transaction_count', 'avg_amount', 'std_amount']
        
        if len(daily_spending) < 7:
            return []
            
        # Fit anomaly detector
        self.anomaly_detector = IsolationForest(contamination=0.1, random_state=42)
        features = daily_spending[['total_amount', 'transaction_count', 'avg_amount']].values
        
        # Scale features
        features_scaled = self.scaler.fit_transform(features)
        anomalies = self.anomaly_detector.fit_predict(features_scaled)
        
        # Get anomalous days
        anomaly_dates = daily_spending.index[anomalies == -1].tolist()
        
        results = []
        for date in anomaly_dates:
            day_data = daily_spending.loc[date]
            results.append({
                'date': str(date),
                'total_spent': float(day_data['total_amount']),
                'transaction_count': int(day_data['transaction_count']),
                'avg_amount': float(day_data['avg_amount']),
                'anomaly_score': 'High' if day_data['total_amount'] > daily_spending['total_amount'].quantile(0.9) else 'Medium'
            })
        
        return results
    
    def cluster_spending_habits(self, transactions_data):
        """Cluster users based on spending patterns"""
        df = pd.DataFrame(transactions_data)
        
        if df.empty or len(df) < 20:
            return None
            
        df['date'] = pd.to_datetime(df['date'])
        
        # Create spending pattern features
        category_spending = df.groupby('category')['amount'].sum()
        payment_mode_usage = df['paymentMode'].value_counts(normalize=True)
        
        # Time-based patterns
        hourly_spending = df.groupby(df['date'].dt.hour)['amount'].mean()
        daily_spending = df.groupby(df['date'].dt.dayofweek)['amount'].mean()
        
        # Create feature vector
        features = []
        
        # Top categories spending ratios
        top_categories = category_spending.nlargest(5).index
        total_spending = df['amount'].sum()
        for cat in top_categories:
            ratio = category_spending.get(cat, 0) / total_spending
            features.append(ratio)
        
        # Payment mode preferences
        for mode in ['cash', 'card', 'wallet', 'bank']:
            features.append(payment_mode_usage.get(mode, 0))
        
        # Time patterns
        features.extend([
            df['amount'].mean(),  # Average transaction
            df['amount'].std(),   # Spending volatility
            len(df) / ((df['date'].max() - df['date'].min()).days + 1),  # Transaction frequency
        ])
        
        # Simple clustering (would normally use multiple users' data)
        return {
            'spending_profile': 'High Spender' if df['amount'].mean() > 1000 else 'Moderate Spender' if df['amount'].mean() > 500 else 'Conservative Spender',
            'primary_category': category_spending.idxmax(),
            'preferred_payment': payment_mode_usage.idxmax(),
            'spending_pattern': 'Consistent' if df['amount'].std() < df['amount'].mean() * 0.5 else 'Variable'
        }
    
    def forecast_expenses(self, transactions_data, days_ahead=30):
        """Forecast future expenses"""
        df = pd.DataFrame(transactions_data)
        
        if df.empty or len(df) < 30:
            return None
            
        df['date'] = pd.to_datetime(df['date'])
        
        # Aggregate daily spending
        daily_spending = df.groupby(df['date'].dt.date)['amount'].sum().reset_index()
        daily_spending.columns = ['ds', 'y']
        daily_spending['ds'] = pd.to_datetime(daily_spending['ds'])
        
        if len(daily_spending) < 14:
            # Simple linear trend for limited data
            recent_avg = daily_spending['y'].tail(7).mean()
            trend = (daily_spending['y'].tail(7).mean() - daily_spending['y'].head(7).mean()) / len(daily_spending)
            
            forecast_dates = []
            forecast_values = []
            
            last_date = daily_spending['ds'].max()
            for i in range(1, days_ahead + 1):
                forecast_date = last_date + timedelta(days=i)
                forecast_value = max(0, recent_avg + (trend * i))
                forecast_dates.append(forecast_date.strftime('%Y-%m-%d'))
                forecast_values.append(float(forecast_value))
            
            return {
                'forecast_dates': forecast_dates,
                'forecast_values': forecast_values,
                'total_forecast': sum(forecast_values),
                'method': 'linear_trend'
            }
        
        # Use Prophet if available
        if Prophet:
            try:
                model = Prophet(daily_seasonality=False, weekly_seasonality=True)
                model.fit(daily_spending)
                
                future = model.make_future_dataframe(periods=days_ahead)
                forecast = model.predict(future)
                
                # Get future predictions
                future_forecast = forecast.tail(days_ahead)
                
                return {
                    'forecast_dates': future_forecast['ds'].dt.strftime('%Y-%m-%d').tolist(),
                    'forecast_values': [max(0, float(x)) for x in future_forecast['yhat'].tolist()],
                    'total_forecast': float(future_forecast['yhat'].sum()),
                    'method': 'prophet'
                }
            except:
                pass
        
        # Fallback to simple moving average
        window = min(7, len(daily_spending))
        recent_avg = daily_spending['y'].tail(window).mean()
        
        forecast_dates = []
        forecast_values = []
        
        last_date = daily_spending['ds'].max()
        for i in range(1, days_ahead + 1):
            forecast_date = last_date + timedelta(days=i)
            forecast_dates.append(forecast_date.strftime('%Y-%m-%d'))
            forecast_values.append(float(recent_avg))
        
        return {
            'forecast_dates': forecast_dates,
            'forecast_values': forecast_values,
            'total_forecast': float(recent_avg * days_ahead),
            'method': 'moving_average'
        }
    
    def get_recommendations(self, transactions_data, budget_info=None):
        """Generate budget optimization recommendations"""
        df = pd.DataFrame(transactions_data)
        
        if df.empty:
            return []
            
        df['date'] = pd.to_datetime(df['date'])
        current_month = df['date'].dt.to_period('M').max()
        monthly_data = df[df['date'].dt.to_period('M') == current_month]
        
        recommendations = []
        
        # Category analysis
        category_spending = monthly_data.groupby('category')['amount'].sum().sort_values(ascending=False)
        total_spent = category_spending.sum()
        
        # High spending categories
        for category, amount in category_spending.head(3).items():
            percentage = (amount / total_spent) * 100
            if percentage > 30:
                recommendations.append({
                    'type': 'high_spending_alert',
                    'category': category,
                    'message': f"You've spent {percentage:.1f}% of your budget on {category}. Consider reducing expenses in this category.",
                    'amount': float(amount),
                    'priority': 'high'
                })
        
        # Frequent small transactions
        small_transactions = monthly_data[monthly_data['amount'] < 50]
        if len(small_transactions) > 20:
            total_small = small_transactions['amount'].sum()
            recommendations.append({
                'type': 'small_transactions',
                'message': f"You made {len(small_transactions)} small transactions totaling ${total_small:.2f}. Consider consolidating purchases.",
                'amount': float(total_small),
                'priority': 'medium'
            })
        
        # Weekend spending
        weekend_data = monthly_data[monthly_data['date'].dt.dayofweek >= 5]
        if not weekend_data.empty:
            weekend_avg = weekend_data['amount'].mean()
            weekday_avg = monthly_data[monthly_data['date'].dt.dayofweek < 5]['amount'].mean()
            
            if weekend_avg > weekday_avg * 1.5:
                recommendations.append({
                    'type': 'weekend_spending',
                    'message': f"Your weekend spending is {((weekend_avg/weekday_avg - 1) * 100):.0f}% higher than weekdays. Plan weekend activities within budget.",
                    'priority': 'medium'
                })
        
        # Budget recommendations
        if budget_info:
            budget = budget_info.get('monthly_budget', 0)
            if budget > 0 and total_spent > budget * 0.8:
                days_left = (current_month.end_time - datetime.now()).days
                daily_budget_left = (budget - total_spent) / max(days_left, 1)
                
                recommendations.append({
                    'type': 'budget_alert',
                    'message': f"You've used {(total_spent/budget*100):.0f}% of your budget. Limit daily spending to ${daily_budget_left:.2f}.",
                    'priority': 'high'
                })
        
        return recommendations

# Global ML service instance
ml_service = ExpenseMLService()

@app.route('/health', methods=['GET'])
def health_check():
    return jsonify({'status': 'healthy', 'service': 'expense-ml'})

@app.route('/train_category_model', methods=['POST'])
def train_category_model():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        
        success = ml_service.train_category_model(transactions)
        
        return jsonify({
            'success': success,
            'message': 'Model trained successfully' if success else 'Insufficient data for training'
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/predict_category', methods=['POST'])
def predict_category():
    try:
        data = request.json
        title = data.get('title', '')
        
        prediction = ml_service.predict_category(title)
        
        if prediction:
            return jsonify(prediction)
        else:
            return jsonify({'error': 'Model not trained or invalid input'}), 400
            
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/detect_anomalies', methods=['POST'])
def detect_anomalies():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        
        anomalies = ml_service.detect_anomalies(transactions)
        
        return jsonify({
            'anomalies': anomalies,
            'count': len(anomalies)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/analyze_spending_habits', methods=['POST'])
def analyze_spending_habits():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        
        analysis = ml_service.cluster_spending_habits(transactions)
        
        return jsonify(analysis or {'error': 'Insufficient data for analysis'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/forecast_expenses', methods=['POST'])
def forecast_expenses():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        days_ahead = data.get('days_ahead', 30)
        
        forecast = ml_service.forecast_expenses(transactions, days_ahead)
        
        return jsonify(forecast or {'error': 'Insufficient data for forecasting'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/get_recommendations', methods=['POST'])
def get_recommendations():
    try:
        data = request.json
        transactions = data.get('transactions', [])
        budget_info = data.get('budget_info', {})
        
        recommendations = ml_service.get_recommendations(transactions, budget_info)
        
        return jsonify({
            'recommendations': recommendations,
            'count': len(recommendations)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    print("Starting Expense ML Service...")
    print("Endpoints available:")
    print("- POST /train_category_model")
    print("- POST /predict_category")
    print("- POST /detect_anomalies")
    print("- POST /analyze_spending_habits")
    print("- POST /forecast_expenses")
    print("- POST /get_recommendations")
    app.run(debug=True, host='0.0.0.0', port=4000)