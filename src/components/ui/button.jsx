import React from 'react';

export const Button = ({ 
  children, 
  onClick, 
  disabled, 
  variant = 'primary', 
  className = '',
  type = 'button'
}) => {
  const baseStyles = "px-4 py-2 rounded-md font-medium transition-colors focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed";
  
  const variants = {
    primary: "bg-gradient-to-r from-[#2c3e95]/90 to-[#3fa88e]/80 text-white hover:bg-blue-700 focus:ring-blue-500",
    // outline: "border border-gray-300 bg-white text-gray-700 hover:bg-gray-50 focus:ring-blue-500",
    secondary: "bg-gray-100 text-gray-900 hover:bg-gray-200 focus:ring-gray-500"
  };

  return (
    <button
      type={type}
      className={`${baseStyles} ${variants[variant]} ${className}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
};