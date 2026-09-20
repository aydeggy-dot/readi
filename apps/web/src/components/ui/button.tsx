import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type * as React from "react";
import { cn } from "@/lib/utils";

/**
 * The mentor's pen (ADR-0013): a filled button is #C2410C with a white label in light mode and
 * #FB923C with a near-black one in dark. Focus is the global 2px --ring outline from globals.css,
 * so nothing here turns it off.
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-bold transition-colors disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground hover:bg-primary-hover",
        outline: "border border-input bg-background text-heading hover:bg-accent",
        // Outlined rather than filled: white text on the dark theme's lighter red fails contrast.
        destructive:
          "border border-destructive bg-background text-destructive hover:bg-destructive/10",
        ghost: "text-heading hover:bg-accent",
        // For the structural grey bar, where the page's own text colours would disappear.
        nav: "text-nav-foreground hover:bg-white/10",
        // Always underlined: a link must not be signalled by colour alone.
        link: "text-primary underline underline-offset-4 hover:text-primary-hover",
      },
      size: {
        // 48px: hero and primary page actions.
        lg: "h-12 px-6 text-lg",
        default: "h-11 px-5 text-[1.0625rem]",
        sm: "h-9 px-3.5 text-base",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  },
);

function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: React.ComponentProps<"button"> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "button";
  return (
    <Comp
      data-slot="button"
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  );
}

export { Button, buttonVariants };
