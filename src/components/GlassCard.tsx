import { cn } from "@/lib/utils";

export function GlassCard({
  children,
  className,
  onClick,
}: {
  children: React.ReactNode;
  className?: string;
  onClick?: () => void;
}) {
  return (
    <section className={cn("glass-card", className)} onClick={onClick}>
      {children}
    </section>
  );
}
