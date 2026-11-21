import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
const styles = cva("button", {
  variants: { tone: { primary: "primary", subtle: "subtle", quiet: "quiet" } },
  defaultVariants: { tone: "subtle" },
});
export function Button({
  asChild = false,
  tone,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof styles> & { asChild?: boolean }) {
  const Tag = asChild ? Slot : "button";
  return <Tag className={styles({ tone, className })} {...props} />;
}
