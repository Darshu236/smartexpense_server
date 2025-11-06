// controllers/insightController.js
import Transaction from '../models/Transaction.js';

export const getBudgetSuggestions = async (req, res) => {
  try {
    const userId = req.user.id;

    const last30Days = new Date();
    last30Days.setDate(last30Days.getDate() - 30);

    const transactions = await Transaction.find({
      userId,
      date: { $gte: last30Days }
    });

    // Calculate total per category
    const categoryTotals = {};
    transactions.forEach(tx => {
      categoryTotals[tx.category] = (categoryTotals[tx.category] || 0) + tx.amount;
    });

    // Generate suggestion: suggest 90% of last month's spend as new budget
    const suggestions = Object.entries(categoryTotals).map(([category, total]) => ({
      category,
      lastMonthSpend: total,
      suggestedBudget: Math.round(total * 0.9)
    }));

    res.json({ suggestions });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Failed to generate suggestions' });
  }
};
