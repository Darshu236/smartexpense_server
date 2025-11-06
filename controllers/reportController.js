
import Transaction from '../models/Transaction.js';

export const getMonthlyReport = async (req, res) => {
  const transactions = await Transaction.find({ userId: req.user.id });
  const grouped = {};
  transactions.forEach(t => {
    const month = new Date(t.date).toLocaleString('default', { month: 'short', year: 'numeric' });
    grouped[month] = grouped[month] || { income: 0, expense: 0 };
    grouped[month][t.type] += t.amount;
  });
  res.json(grouped);
};
