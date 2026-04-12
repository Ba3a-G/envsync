import { motion } from "framer-motion";
import { BookText, FileDiff, Github, PlugZap, TerminalSquare } from "lucide-react";
import { runtimeConfig } from "@/utils/runtime-config";

const stages = [
  {
    icon: TerminalSquare,
    title: "CLI",
    body: "pull, push, diff, approve",
    accent: "text-primary border-primary/25 bg-primary/10",
  },
  {
    icon: Github,
    title: "GitHub Actions",
    body: "inject env in deployment jobs",
    accent: "text-sky-100 border-sky-400/25 bg-sky-400/10",
  },
  {
    icon: PlugZap,
    title: "Runtime",
    body: "sync apps, workers, services",
    accent: "text-emerald-100 border-emerald-400/25 bg-emerald-400/10",
  },
  {
    icon: FileDiff,
    title: "Audit",
    body: "review rollback-ready changes",
    accent: "text-amber-200 border-amber-400/25 bg-amber-400/10",
  },
];

const IntegrationWorkflowStrip = () => {
  return (
    <section className="container mx-auto border-x border-t border-border px-0 py-0">
      <div className="grid gap-0 lg:grid-cols-[0.82fr_1.18fr]">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="border border-border bg-[hsl(var(--surface-1))] p-6 md:p-8"
        >
          <div className="mb-3 inline-flex items-center gap-2 border border-border bg-[hsl(var(--surface-2))] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            <PlugZap className="h-3.5 w-3.5 text-primary" />
            Fits your stack
          </div>
          <h2 className="max-w-md text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Plug the same config flow into local dev, CI, and runtime.
          </h2>
          <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
            EnvSync stays useful because it attaches to the tools engineers already run.
          </p>

          <div className="mt-6 flex flex-wrap gap-2">
            <a
              href={runtimeConfig.apiDocsUrl}
              className="border border-border bg-[hsl(var(--surface-2))] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:border-primary/40"
            >
              API Reference
            </a>
            <a
              href="https://github.com/EnvSync-Cloud/envsync"
              className="border border-border bg-[hsl(var(--surface-2))] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:border-primary/40"
            >
              GitHub
            </a>
            <a
              href="/integrations"
              className="border border-border bg-[hsl(var(--surface-2))] px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-foreground transition-colors hover:border-primary/40"
            >
              Integrations
            </a>
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 16 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.06 }}
          className="relative overflow-hidden border border-border bg-[linear-gradient(180deg,hsl(var(--surface-1)),#0a0f15)] p-5 md:p-6"
        >
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-35"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.45) 1px, transparent 1px)",
              backgroundSize: "24px 24px",
            }}
          />

          <div className="relative z-10">
            <div className="mb-5 flex items-center justify-between">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                Workflow handoff
              </p>
              <div className="inline-flex items-center gap-2 border border-border bg-[hsl(var(--surface-2))/0.9] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <BookText className="h-3.5 w-3.5 text-primary" />
                docs + sdk
              </div>
            </div>

            <div className="relative grid gap-4 md:grid-cols-4">
              <div className="pointer-events-none absolute left-8 right-8 top-7 hidden h-px bg-border md:block" />

              {stages.map((stage, index) => (
                <div key={stage.title} className="relative">
                  <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full border border-border bg-[hsl(var(--surface-2))]">
                    <stage.icon className="h-5 w-5 text-primary" />
                  </div>
                  <div className="rounded-[1.1rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <div className="text-sm font-semibold text-foreground">{stage.title}</div>
                      <span className={`border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] ${stage.accent}`}>
                        {index + 1}
                      </span>
                    </div>
                    <div className="font-mono text-xs leading-relaxed text-muted-foreground">{stage.body}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default IntegrationWorkflowStrip;
