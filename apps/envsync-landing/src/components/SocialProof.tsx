import { Github, ServerCog, ShieldCheck, TerminalSquare } from "lucide-react";
import { motion } from "framer-motion";

const items = [
  {
    icon: TerminalSquare,
    title: "CLI-first workflow",
    description: "pull, push, diff, approve",
  },
  {
    icon: Github,
    title: "GitHub Actions ready",
    description: "inject values into deployment jobs",
  },
  {
    icon: ShieldCheck,
    title: "Audit-ready changes",
    description: "review rollback-ready state changes",
  },
  {
    icon: ServerCog,
    title: "Self-host or managed",
    description: "run hosted or inside your boundary",
  },
];

const SocialProof = () => {
  return (
    <section className="container mx-auto border-x border-t border-border p-0">
      <div className="relative container mx-auto z-10 px-0">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="grid w-full grid-cols-1 gap-0 md:grid-cols-4"
        >
          {items.map((item) => (
            <div
              key={item.title}
              className="border border-border bg-[hsl(var(--surface-1))] p-5 transition-colors hover:border-primary/40"
            >
              <div className="mb-3 flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center border border-border bg-[hsl(var(--surface-2))]">
                  <item.icon className="h-4 w-4 text-primary" />
                </div>
                <div className="text-base font-semibold text-foreground">{item.title}</div>
              </div>
              <div className="font-mono text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.description}</div>
            </div>
          ))}
        </motion.div>
      </div>
    </section>
  );
};

export default SocialProof;
