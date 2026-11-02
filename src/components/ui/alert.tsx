import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const alertVariants = cva("relative w-full rounded-lg border-2 p-4 text-lg [&_svg]:size-6 [&_svg]:shrink-0", {
  variants: {
    variant: {
      default: "border-primary bg-secondary text-secondary-foreground",
      destructive: "border-destructive bg-[#fef3f2] text-destructive",
      success: "border-success bg-[#ecfdf3] text-success",
      warning: "border-accent-foreground bg-accent text-accent-foreground",
    },
  },
  defaultVariants: { variant: "default" },
});

export function Alert({ className, variant, ...props }: React.ComponentProps<"div"> & VariantProps<typeof alertVariants>) {
  return <div data-slot="alert" className={cn(alertVariants({ variant }), className)} {...props} />;
}

export function AlertTitle({ className, ...props }: React.ComponentProps<"p">) {
  return <p data-slot="alert-title" className={cn("font-bold", className)} {...props} />;
}

export function AlertDescription({ className, ...props }: React.ComponentProps<"div">) {
  return <div data-slot="alert-description" className={cn("text-foreground", className)} {...props} />;
}
