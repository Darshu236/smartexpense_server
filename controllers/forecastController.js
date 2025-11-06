// controllers/forecastController.js
import Transaction from '../models/Transaction.js';
import User from '../models/User.js';

// Helper function to get date ranges
const getDateRanges = () => {
  const now = new Date();
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
  const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);
  const startOfYear = new Date(now.getFullYear(), 0, 1);
  
  return {
    now,
    startOfMonth,
    endOfMonth,
    startOfLastMonth,
    endOfLastMonth,
    startOfYear
  };
};

// Calculate monthly spending patterns
const calculateMonthlyPatterns = async (userId) => {
  const { startOfYear } = getDateRanges();
  
  const monthlyData = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: 'expense',
        date: { $gte: startOfYear }
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$date' },
          month: { $month: '$date' },
          category: '$category'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $group: {
        _id: {
          year: '$_id.year',
          month: '$_id.month'
        },
        totalSpending: { $sum: '$totalAmount' },
        categories: {
          $push: {
            category: '$_id.category',
            amount: '$totalAmount',
            count: '$count'
          }
        }
      }
    },
    {
      $sort: { '_id.year': 1, '_id.month': 1 }
    }
  ]);

  return monthlyData;
};

// Calculate category-wise spending patterns
const calculateCategoryPatterns = async (userId) => {
  const { startOfYear } = getDateRanges();
  
  const categoryData = await Transaction.aggregate([
    {
      $match: {
        user: userId,
        type: 'expense',
        date: { $gte: startOfYear }
      }
    },
    {
      $group: {
        _id: '$category',
        totalAmount: { $sum: '$amount' },
        avgAmount: { $avg: '$amount' },
        count: { $sum: 1 },
        maxAmount: { $max: '$amount' },
        minAmount: { $min: '$amount' }
      }
    },
    {
      $sort: { totalAmount: -1 }
    }
  ]);

  return categoryData;
};

// Main forecast function
export const getSpendingForecast = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const userId = req.user.id;
    const { startOfMonth, endOfMonth, startOfLastMonth, endOfLastMonth } = getDateRanges();

    // Get current month spending so far
    const currentMonthSpending = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          type: 'expense',
          date: { $gte: startOfMonth, $lte: new Date() }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get last month's total spending
    const lastMonthSpending = await Transaction.aggregate([
      {
        $match: {
          user: userId,
          type: 'expense',
          date: { $gte: startOfLastMonth, $lte: endOfLastMonth }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' },
          count: { $sum: 1 }
        }
      }
    ]);

    // Get monthly patterns for trend analysis
    const monthlyPatterns = await calculateMonthlyPatterns(userId);
    const categoryPatterns = await calculateCategoryPatterns(userId);

    // Calculate current month progress
    const now = new Date();
    const daysInMonth = endOfMonth.getDate();
    const daysPassed = now.getDate();
    const progressPercentage = (daysPassed / daysInMonth) * 100;

    const currentSpent = currentMonthSpending[0]?.total || 0;
    const lastMonthTotal = lastMonthSpending[0]?.total || 0;

    // Simple forecast calculations
    const dailyAverage = currentSpent / daysPassed;
    const projectedMonthlySpending = dailyAverage * daysInMonth;
    
    // Trend-based forecast
    const avgMonthlySpending = monthlyPatterns.length > 0 
      ? monthlyPatterns.reduce((sum, month) => sum + month.totalSpending, 0) / monthlyPatterns.length
      : lastMonthTotal;

    const trendForecast = (projectedMonthlySpending + avgMonthlySpending) / 2;

    // Category-wise forecasts
    const categoryForecasts = categoryPatterns.map(cat => {
      const monthlyAvg = cat.totalAmount / monthlyPatterns.length || 1;
      return {
        category: cat._id,
        currentMonthSpent: 0, // This would need category-specific current month data
        forecastedAmount: monthlyAvg,
        avgTransactionAmount: cat.avgAmount,
        transactionCount: cat.count
      };
    });

    // Spending insights
    const insights = [];
    
    if (projectedMonthlySpending > lastMonthTotal * 1.1) {
      insights.push({
        type: 'warning',
        message: `You're on track to spend ${((projectedMonthlySpending / lastMonthTotal - 1) * 100).toFixed(1)}% more than last month`,
        impact: 'high'
      });
    } else if (projectedMonthlySpending < lastMonthTotal * 0.9) {
      insights.push({
        type: 'positive',
        message: `You're on track to spend ${((1 - projectedMonthlySpending / lastMonthTotal) * 100).toFixed(1)}% less than last month`,
        impact: 'positive'
      });
    }

    if (dailyAverage > avgMonthlySpending / 30) {
      insights.push({
        type: 'info',
        message: 'Your daily spending is above your historical average',
        impact: 'medium'
      });
    }

    // Budget recommendations
    const recommendedBudget = Math.max(
      avgMonthlySpending * 1.1, // 10% buffer over average
      trendForecast * 1.05 // 5% buffer over trend forecast
    );

    const forecast = {
      success: true,
      data: {
        currentMonth: {
          spent: currentSpent,
          projectedTotal: projectedMonthlySpending,
          progressPercentage: progressPercentage.toFixed(1),
          dailyAverage: dailyAverage.toFixed(2),
          remainingDays: daysInMonth - daysPassed
        },
        comparison: {
          lastMonth: lastMonthTotal,
          changeFromLastMonth: lastMonthTotal > 0 
            ? ((projectedMonthlySpending / lastMonthTotal - 1) * 100).toFixed(1)
            : 0,
          historicalAverage: avgMonthlySpending.toFixed(2)
        },
        forecast: {
          projectedMonthlySpending: projectedMonthlySpending.toFixed(2),
          trendBasedForecast: trendForecast.toFixed(2),
          recommendedBudget: recommendedBudget.toFixed(2),
          confidence: monthlyPatterns.length >= 3 ? 'high' : 'medium'
        },
        categoryForecasts,
        insights,
        monthlyTrends: monthlyPatterns.map(month => ({
          month: `${month._id.year}-${month._id.month.toString().padStart(2, '0')}`,
          spending: month.totalSpending,
          categories: month.categories
        }))
      }
    };

    res.json(forecast);

  } catch (error) {
    console.error("Error in getSpendingForecast:", error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate spending forecast',
      details: error.message 
    });
  }
};

// Get budget recommendations
export const getBudgetRecommendations = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const userId = req.user.id;
    const categoryPatterns = await calculateCategoryPatterns(userId);
    const monthlyPatterns = await calculateMonthlyPatterns(userId);

    // Calculate recommended budgets per category
    const categoryBudgets = categoryPatterns.map(cat => {
      const avgMonthly = cat.totalAmount / Math.max(monthlyPatterns.length, 1);
      const recommendedBudget = avgMonthly * 1.1; // 10% buffer
      
      return {
        category: cat._id,
        currentAvgSpending: avgMonthly.toFixed(2),
        recommendedBudget: recommendedBudget.toFixed(2),
        priority: cat.totalAmount > avgMonthly * monthlyPatterns.length * 0.2 ? 'high' : 'medium',
        tips: getCategoryTips(cat._id, avgMonthly)
      };
    });

    // Overall budget recommendation
    const totalAvgSpending = categoryPatterns.reduce((sum, cat) => 
      sum + (cat.totalAmount / Math.max(monthlyPatterns.length, 1)), 0
    );
    
    const recommendedTotalBudget = totalAvgSpending * 1.15; // 15% buffer for total

    const recommendations = {
      success: true,
      data: {
        totalRecommendedBudget: recommendedTotalBudget.toFixed(2),
        categoryBudgets,
        savingsTarget: (recommendedTotalBudget * 0.2).toFixed(2), // 20% savings target
        emergencyFund: (recommendedTotalBudget * 3).toFixed(2), // 3 months emergency fund
        tips: [
          "Review and adjust budgets monthly based on spending patterns",
          "Set up automatic transfers to savings to reach your targets",
          "Track daily expenses to stay within budget",
          "Consider the 50/30/20 rule: 50% needs, 30% wants, 20% savings"
        ]
      }
    };

    res.json(recommendations);

  } catch (error) {
    console.error("Error in getBudgetRecommendations:", error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to generate budget recommendations' 
    });
  }
};

// Helper function for category-specific tips
const getCategoryTips = (category, avgAmount) => {
  const tips = {
    'Food': [
      'Plan meals in advance to reduce food waste',
      'Cook at home more often',
      'Use grocery lists to avoid impulse purchases'
    ],
    'Transport': [
      'Consider carpooling or public transport',
      'Combine errands into single trips',
      'Walk or bike for short distances'
    ],
    'Shopping': [
      'Wait 24 hours before making non-essential purchases',
      'Compare prices across different stores',
      'Use cashback and rewards programs'
    ],
    'Entertainment': [
      'Look for free or low-cost entertainment options',
      'Set a monthly entertainment budget',
      'Take advantage of student or group discounts'
    ],
    'Healthcare': [
      'Use preventive care to avoid costly treatments',
      'Compare prices for medications and procedures',
      'Consider generic medications when appropriate'
    ],
    'Bills': [
      'Review and negotiate recurring subscriptions',
      'Switch to energy-efficient appliances',
      'Consider bundling services for discounts'
    ],
    'Education': [
      'Look for scholarships and financial aid',
      'Buy used textbooks or rent them',
      'Take advantage of free online courses'
    ],
    'Travel': [
      'Book flights and hotels in advance',
      'Travel during off-peak seasons',
      'Use travel rewards and loyalty programs'
    ],
    'Investment': [
      'Diversify your investment portfolio',
      'Consider low-cost index funds',
      'Automate investments to build consistency'
    ],
    'Other': [
      'Categorize expenses properly for better tracking',
      'Review this category monthly',
      'Set specific budgets for miscellaneous expenses'
    ]
  };

  return tips[category] || tips['Other'];
};

// Get spending anomalies (unusual spending patterns)
export const getSpendingAnomalies = async (req, res) => {
  try {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ 
        success: false, 
        error: 'Unauthorized: No user found' 
      });
    }

    const userId = req.user.id;
    const { startOfMonth } = getDateRanges();

    // Get recent transactions (last 30 days)
    const recentTransactions = await Transaction.find({
      user: userId,
      type: 'expense',
      date: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }
    }).sort({ date: -1 });

    // Calculate category averages
    const categoryPatterns = await calculateCategoryPatterns(userId);
    const categoryAverages = {};
    categoryPatterns.forEach(cat => {
      categoryAverages[cat._id] = cat.avgAmount;
    });

    // Find anomalies
    const anomalies = [];
    
    recentTransactions.forEach(transaction => {
      const avgForCategory = categoryAverages[transaction.category] || 0;
      
      // Transaction is anomalous if it's significantly higher than average
      if (transaction.amount > avgForCategory * 2 && transaction.amount > 100) {
        anomalies.push({
          transaction: {
            id: transaction._id,
            amount: transaction.amount,
            description: transaction.description,
            category: transaction.category,
            date: transaction.date
          },
          anomalyType: 'high_amount',
          deviation: ((transaction.amount / avgForCategory - 1) * 100).toFixed(1),
          message: `This ${transaction.category} expense is ${((transaction.amount / avgForCategory - 1) * 100).toFixed(1)}% higher than your average`
        });
      }
    });

    // Check for unusual spending frequency
    const dailySpending = {};
    recentTransactions.forEach(transaction => {
      const dateKey = transaction.date.toISOString().split('T')[0];
      dailySpending[dateKey] = (dailySpending[dateKey] || 0) + transaction.amount;
    });

    const spendingAmounts = Object.values(dailySpending);
    const avgDailySpending = spendingAmounts.reduce((a, b) => a + b, 0) / spendingAmounts.length;

    Object.entries(dailySpending).forEach(([date, amount]) => {
      if (amount > avgDailySpending * 3) {
        anomalies.push({
          date,
          amount,
          anomalyType: 'high_daily_spending',
          deviation: ((amount / avgDailySpending - 1) * 100).toFixed(1),
          message: `Unusually high spending day: ₹${amount.toFixed(2)} (${((amount / avgDailySpending - 1) * 100).toFixed(1)}% above average)`
        });
      }
    });

    res.json({
      success: true,
      anomalies: anomalies.slice(0, 10), // Limit to top 10 anomalies
      summary: {
        totalAnomalies: anomalies.length,
        avgDailySpending: avgDailySpending.toFixed(2),
        analyzedTransactions: recentTransactions.length
      }
    });

  } catch (error) {
    console.error("Error in getSpendingAnomalies:", error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to analyze spending anomalies' 
    });
  }
};