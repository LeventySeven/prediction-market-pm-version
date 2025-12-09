import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  fullWidth?: boolean;
}

const Button: React.FC<ButtonProps> = ({ 
  children, 
  variant = 'primary', 
  size = 'md', 
  fullWidth = false,
  className = '',
  ...props 
}) => {
  const baseStyles = "inline-flex items-center justify-center rounded-lg font-medium transition-all focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed tracking-tight";
  
  const variants = {
    // Primary is now Active Gray on Black
    primary: "bg-neutral-800 text-white hover:bg-neutral-700 border border-neutral-700 hover:border-neutral-600",
    // Secondary is Darker
    secondary: "bg-black text-white border border-neutral-800 hover:border-neutral-600",
    // Outline matches the minimalist border look
    outline: "bg-transparent border border-neutral-800 text-neutral-400 hover:text-white hover:border-neutral-600",
    ghost: "text-neutral-500 hover:text-white hover:bg-neutral-900"
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2 text-sm",
    lg: "px-6 py-3 text-base"
  };

  const widthStyle = fullWidth ? "w-full" : "";

  return (
    <button 
      className={`${baseStyles} ${variants[variant]} ${sizes[size]} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;