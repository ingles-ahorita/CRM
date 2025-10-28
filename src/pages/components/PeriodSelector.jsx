import React from 'react';

const PeriodSelector = ({ value, onChange, disabled = false }) => {
  const options = [
    { value: 'none', label: 'Current View' },
    { value: 'weekly', label: 'Weekly Comparison' },
    { value: 'monthly', label: 'Monthly Comparison' },
    { value: 'daily', label: 'Daily Comparison' }
  ];

  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      disabled={disabled}
      className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent bg-white text-gray-700 font-medium"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
};

export default PeriodSelector;
