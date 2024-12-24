import React from 'react';
import { AlertCircle, Info, CheckCircle, XCircle } from 'lucide-react';

const variants = {
  default: {
    container: 'bg-gray-100 border-gray-200 text-gray-800',
    icon: Info,
    iconColor: 'text-gray-800'
  },
  error: {
    container: 'bg-red-50 border-red-200 text-red-800',
    icon: AlertCircle,
    iconColor: 'text-red-800'
  },
  success: {
    container: 'bg-green-50 border-green-200 text-green-800',
    icon: CheckCircle,
    iconColor: 'text-green-800'
  },
  warning: {
    container: 'bg-yellow-50 border-yellow-200 text-yellow-800',
    icon: AlertCircle,
    iconColor: 'text-yellow-800'
  }
};

const Alert = ({ 
  children, 
  variant = 'default', 
  className = '',
  onClose,
  ...props 
}) => {
  const styles = variants[variant] || variants.default;
  const IconComponent = styles.icon;

  return (
    <div
      role="alert"
      className={`flex items-center gap-3 px-4 py-3 border rounded-lg ${styles.container} ${className}`}
      {...props}
    >
      <IconComponent className={`h-5 w-5 flex-shrink-0 ${styles.iconColor}`} />
      <div className="flex-1">{children}</div>
      {onClose && (
        <button
          onClick={onClose}
          className={`flex-shrink-0 ${styles.iconColor} hover:opacity-75 transition-opacity`}
        >
          <XCircle className="h-5 w-5" />
        </button>
      )}
    </div>
  );
};

export default Alert;