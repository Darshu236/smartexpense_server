
import axios from 'axios';

export const predictCategory = async (req, res) => {
  try {
    const { title } = req.body;
    const { data } = await axios.post('http://localhost:8000/predict-category', { expense_name: title });
    res.json({ category: data.category });
  } catch (err) {
    res.status(500).json({ error: 'ML service failed' });
  }
};
