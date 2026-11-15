import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Every size keeps a 48px minimum tap target (WCAG 2.5.8 asks for 24px; we go further for older users).
const buttonVariants = cva(
  "inline-flex min-h-[46px] items-center justify-center gap-2 rounded-[10px] px-5 text-center text-base font-semibold max-w-full transition-[box-shadow,background-color,border-color,color] duration-200 motion-reduce:transition-none focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none disabled:opacity-60 [&_svg]:size-5 [&_svg]:shrink-0",
  {
    variants: {
      variant: {
        default: "border border-gold-edge bg-gold text-on-gold hover:shadow-[0_0_0_4px_rgb(200_162_74/0.22),0_10px_26px_-10px_rgb(200_162_74/0.7)]",
        navy: "bg-primary text-primary-foreground hover:bg-primary/90",
        secondary: "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        outline: "border border-control bg-transparent text-foreground hover:border-foreground hover:bg-secondary",
        destructive: "bg-destructive text-destructive-foreground hover:bg-destructive/90",
        ghost: "text-foreground hover:bg-muted",
        link: "min-h-0 px-0 text-primary underline hover:no-underline",
      },
      size: {
        default: "",
        lg: "min-h-[52px] px-6 text-lg",
        full: "w-full",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

export type ButtonProps = React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
  };

export function Button({ className, variant, size, asChild = false, ...props }: ButtonProps) {
  const Comp = asChild ? Slot : "button";
  return <Comp data-slot="button" className={cn(buttonVariants({ variant, size, className }))} {...props} />;
}

export { buttonVariants };
