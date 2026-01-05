import React from 'react';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'destructive';
  size?: 'sm' | 'md' | 'lg' | 'icon';
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
  // shadcn/ui inspired base styles
  const baseStyles =
    "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-medium ring-offset-black transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#E50C00] focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50";
  
  const variants = {
    // Dark UI with brand accent for readability
    primary: "bg-black border border-[#E50C00] text-[#E50C00] hover:bg-[rgba(229,12,0,0.10)]",
    secondary: "bg-zinc-800 text-zinc-50 hover:bg-zinc-800/80",
    outline: "border border-zinc-800 bg-black hover:bg-zinc-800 hover:text-zinc-50",
    ghost: "hover:bg-zinc-800 hover:text-zinc-50",
    destructive: "bg-[#E50C00] border border-[#E50C00] text-white hover:bg-[rgba(229,12,0,0.85)]",
  };

  const sizes = {
    sm: "h-9 rounded-md px-3",
    md: "h-10 px-4 py-2",
    lg: "h-11 rounded-md px-8",
    icon: "h-10 w-10",
  };

  const widthStyle = fullWidth ? "w-full" : "";

  // Override mapping for legacy props to new look
  const variantClass = variants[variant];
  const sizeClass = sizes[size];

  return (
    <button 
      className={`${baseStyles} ${variantClass} ${sizeClass} ${widthStyle} ${className}`}
      {...props}
    >
      {children}
    </button>
  );
};

export default Button;