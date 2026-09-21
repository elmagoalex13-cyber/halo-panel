import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  onClick,
  ...props
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
} & React.HTMLAttributes<HTMLElement>) {
  return (
    <section className={cn("glass-card", className)} onClick={onClick} {...props}>
      {children}
    </section>
  );
}
