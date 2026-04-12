import { motion } from "framer-motion";

type TerminalLine = {
  type: "command" | "output" | "comment";
  text: string;
};

const lines: TerminalLine[] = [
  { type: "comment", text: "# Link project and fetch staging state" },
  { type: "command", text: "envsync pull --env staging" },
  { type: "output", text: "[ok] wrote 12 vars to .env.staging" },
  { type: "comment", text: "" },
  { type: "comment", text: "# Promote reviewed config to production" },
  { type: "command", text: "envsync push --env production --strict" },
  { type: "output", text: "[review] waiting for approval gate" },
  { type: "comment", text: "" },
  { type: "comment", text: "# Inject in CI after approval" },
  { type: "command", text: "envsync action pull --env production" },
  { type: "output", text: "[ok] exported 12 values for workflow runtime" },
];

const evidence = [
  {
    title: "Versioned changes",
    value: "diff + rollback context",
  },
  {
    title: "Policy checks",
    value: "approval before prod",
  },
  {
    title: "CI-ready",
    value: "shared source of truth",
  },
];

const CLIShowcase = () => {
  return (
    <section className="container mx-auto border-x border-t border-border p-0">
      <div className="grid gap-0 lg:grid-cols-[0.78fr_1.22fr]">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="border border-border bg-[hsl(var(--surface-1))] p-6 md:p-8"
        >
          <div className="mb-4 inline-flex items-center gap-2 border border-border bg-[hsl(var(--surface-2))] px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            CLI proof
          </div>
          <h2 className="max-w-sm text-3xl font-bold leading-tight text-foreground md:text-4xl">
            Use the same control plane locally, in review, and inside CI.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            The terminal stays central while EnvSync handles promotion, policy, and runtime export.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="grid w-full grid-cols-1 gap-0 border border-border bg-[linear-gradient(180deg,hsl(var(--surface-1)),#091019)] lg:grid-cols-[1.6fr_0.9fr]"
        >
          <div className="overflow-hidden border border-border bg-[hsl(var(--surface-1))]">
            <div className="flex items-center justify-between border-b border-border bg-[hsl(var(--surface-2))] px-4 py-2.5">
              <div className="flex space-x-2">
                <div className="h-2.5 w-2.5 border border-red-400/60 bg-red-400/20" />
                <div className="h-2.5 w-2.5 border border-amber-400/60 bg-amber-400/20" />
                <div className="h-2.5 w-2.5 border border-green-400/60 bg-green-400/20" />
              </div>
              <span className="font-mono text-xs tracking-wider text-muted-foreground/90">zsh — envsync-session</span>
              <span className="font-mono text-[11px] text-muted-foreground/80">delivery</span>
            </div>

            <div className="relative bg-[#0b0f14] p-4 font-mono text-sm leading-relaxed md:p-6 md:text-[15px]">
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 opacity-10"
                style={{
                  backgroundImage:
                    "linear-gradient(hsl(var(--border) / 0.5) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.5) 1px, transparent 1px)",
                  backgroundSize: "24px 24px",
                }}
              />
              <div className="relative z-10 space-y-0.5">
                {lines.map((line, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ delay: 0.18 + i * 0.04 }}
                    className="min-h-[1.5em]"
                  >
                    {line.type === "command" && (
                      <>
                        <span className="text-primary">platform@workspace</span>
                        <span className="text-slate-500">:</span>
                        <span className="ml-1 text-slate-400">~/payments-api</span>
                        <span className="ml-2 text-primary">$</span>
                        <span className="ml-2 font-medium text-slate-100">{line.text}</span>
                      </>
                    )}
                    {line.type === "output" && (
                      <span className={line.text.startsWith("[review]") ? "text-amber-200/90" : "text-slate-300/90"}>
                        {line.text}
                      </span>
                    )}
                    {line.type === "comment" && <span className="text-slate-500/90">{line.text}</span>}
                  </motion.div>
                ))}
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-0">
            {evidence.map((item, index) => (
              <div key={item.title} className={`${index > 0 ? "-mt-px" : ""} border border-border bg-[hsl(var(--surface-1))] p-5`}>
                <p className="text-xs uppercase tracking-[0.16em] text-muted-foreground">{item.title}</p>
                <p className="mt-2 text-xl font-semibold text-foreground">{item.value}</p>
              </div>
            ))}

            <div className="-mt-px border border-border bg-[hsl(var(--surface-1))] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">GitHub Actions</p>
              <div className="border border-border bg-[#0b0f14] p-3 font-mono text-[11px] leading-relaxed text-slate-200">
                <div className="text-slate-500">- name: Pull ENV from EnvSync</div>
                <div className="text-primary">uses: envsync-cloud/action-cli@v1</div>
                <div className="pl-3 text-slate-300">app_id: payments</div>
                <div className="pl-3 text-slate-300">env_type: production</div>
              </div>
            </div>

            <div className="-mt-px border border-border bg-[hsl(var(--surface-1))] p-5">
              <p className="mb-2 text-xs uppercase tracking-[0.16em] text-muted-foreground">Runtime export</p>
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="rounded-full border border-border bg-[hsl(var(--surface-2))] px-3 py-2">12 env vars exported</div>
                <div className="rounded-full border border-border bg-[hsl(var(--surface-2))] px-3 py-2">managed secrets resolved</div>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CLIShowcase;
