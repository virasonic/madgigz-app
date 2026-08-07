import { ButtonHTMLAttributes, forwardRef } from "react";

type Variant = "primary" | "secondary" | "ghost";

const variantClasses: Record<Variant, string> = {
  primary:
    "bg-primary text-foreground hover:bg-primary-dark active:bg-primary-dark disabled:bg-surface-raised disabled:text-muted",
  secondary:
    "bg-accent-dark text-foreground hover:bg-accent active:bg-accent disabled:bg-surface-raised disabled:text-muted",
  ghost:
    "bg-transparent border border-muted/40 text-foreground hover:border-foreground disabled:border-muted/20 disabled:text-muted",
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ variant = "primary", className = "", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={`font-display w-full rounded-full px-6 py-4 text-base tracking-wide transition-colors duration-150 disabled:cursor-not-allowed ${variantClasses[variant]} ${className}`}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";

export default Button;
