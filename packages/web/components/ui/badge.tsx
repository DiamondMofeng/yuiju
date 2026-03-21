import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-2 rounded-full border text-xs font-medium",
  {
    variants: {
      variant: {
        default: "border-[rgba(217,230,245,0.9)] bg-[rgba(247,251,255,0.9)] text-[#6b7480]",
        pill: "border-[rgba(217,230,245,0.9)] bg-[rgba(247,251,255,0.9)] text-[#6b7480]",
        chip: "border-[rgba(217,230,245,0.85)] bg-white/90 text-[#2b2f36]",
        soft: "border-[rgba(217,230,245,0.9)] bg-[rgba(247,251,255,0.92)] text-[#6b7480]",
      },
      size: {
        default: "px-2.5 py-2 text-xs",
        sm: "px-2.5 py-1.5 text-xs",
        xs: "px-2 py-1 text-[11px]",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  },
);

type BadgeProps = React.HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>;

function Badge({ className, variant, size, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant, size }), className)} {...props} />;
}

export { Badge, badgeVariants };
