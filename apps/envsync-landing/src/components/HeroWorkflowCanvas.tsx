import {
  ArrowRight,
  CheckCircle2,
  FileDiff,
  Github,
  LockKeyhole,
  ShieldCheck,
  TerminalSquare,
} from "lucide-react";

const terminalLines = [
  "$ envsync pull --env staging",
  "[ok] synced 12 values from staging",
  "$ envsync push --env production --strict",
  "[review] approval required before prod sync",
];

const promotionNodes = [
  { label: "dev", state: "merged", tone: "border-sky-400/25 bg-sky-400/10 text-sky-100" },
  { label: "staging", state: "validated", tone: "border-primary/30 bg-primary/12 text-primary" },
  { label: "prod", state: "approval", tone: "border-amber-400/30 bg-amber-400/10 text-amber-200" },
];

const HeroWorkflowCanvas = () => {
  return (
    <div className="relative overflow-hidden border border-border bg-[linear-gradient(180deg,#0a0f15_0%,#0f1721_100%)] p-4 md:p-5">
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "linear-gradient(hsl(var(--border) / 0.45) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.45) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(56,189,248,0.12),transparent_28%),radial-gradient(circle_at_bottom_left,rgba(41,203,136,0.12),transparent_32%)]"
      />

      <div className="relative z-10 flex items-center justify-between border border-border bg-[hsl(var(--surface-2))/0.9] px-4 py-3">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
          <TerminalSquare className="h-3.5 w-3.5 text-primary" />
          Workflow canvas
        </div>
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">
          staging to prod
        </div>
      </div>

      <div className="relative z-10 mt-4 rounded-[1.25rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4 md:p-5">
        <div className="mb-4 flex items-center justify-between">
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Promotion path
          </p>
          <span className="inline-flex items-center gap-2 border border-primary/30 bg-primary/12 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
            strict review
          </span>
        </div>

        <div className="relative flex flex-wrap items-center gap-2 md:flex-nowrap">
          {promotionNodes.map((node, index) => (
            <div key={node.label} className="flex flex-1 items-center gap-2 min-w-[5.5rem]">
              <div className={`flex-1 rounded-full border px-3 py-2 ${node.tone}`}>
                <div className="text-[10px] font-semibold uppercase tracking-[0.18em]">{node.label}</div>
                <div className="mt-1 text-xs">{node.state}</div>
              </div>
              {index < promotionNodes.length - 1 ? (
                <div className="relative hidden h-px w-16 bg-border md:block">
                  <span
                    className="hero-workflow-dot absolute -top-1.5 h-3 w-3 rounded-full bg-primary shadow-[0_0_18px_rgba(41,203,136,0.55)]"
                    style={{ animationDelay: `${index * 0.25}s` }}
                  />
                </div>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <div className="relative z-10 mt-4 grid gap-4 xl:grid-cols-[1.08fr_0.92fr]">
        <div className="rounded-[1.25rem] border border-border bg-[#091019] p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <div className="flex gap-1.5">
                <div className="h-2.5 w-2.5 rounded-full border border-red-400/60 bg-red-400/20" />
                <div className="h-2.5 w-2.5 rounded-full border border-amber-400/60 bg-amber-400/20" />
                <div className="h-2.5 w-2.5 rounded-full border border-green-400/60 bg-green-400/20" />
              </div>
              Terminal
            </div>
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              payments-api
            </span>
          </div>
          <div className="space-y-2 font-mono text-[12px] leading-relaxed text-slate-200 md:text-[13px]">
            {terminalLines.map((line) => (
              <div key={line} className="min-h-[1.35rem]">
                <span className={line.startsWith("$") ? "text-slate-100" : line.startsWith("[review]") ? "text-amber-200/90" : "text-slate-300/90"}>
                  {line.startsWith("$") ? (
                    <>
                      <span className="text-primary">dev@workspace</span>
                      <span className="text-slate-500">:</span>
                      <span className="ml-1 text-slate-400">~/payments-api</span>
                      <span className="ml-2 text-primary">$</span>
                      <span className="ml-2">{line.slice(2)}</span>
                    </>
                  ) : (
                    line
                  )}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="grid gap-4">
          <div className="rounded-[1.25rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                <Github className="h-3.5 w-3.5 text-primary" />
                GitHub Actions
              </div>
              <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">action-cli</span>
            </div>
            <div className="rounded-2xl border border-border bg-[#091019] p-3 font-mono text-[11px] leading-relaxed text-slate-200">
              <div className="text-slate-500">- name: Pull ENV from EnvSync</div>
              <div className="text-primary">uses: envsync-cloud/action-cli@v1</div>
              <div className="text-slate-300">with:</div>
              <div className="pl-3 text-slate-300">app_id: payments</div>
              <div className="pl-3 text-slate-300">env_type: production</div>
            </div>
          </div>

          <div className="rounded-[1.25rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4">
            <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-primary" />
              Approval gate
            </div>
            <div className="space-y-2">
              {[
                "staging checks passed",
                "prod approval pending",
                "runtime export after approval",
              ].map((item, index) => (
                <div key={item} className="flex items-center justify-between rounded-full border border-border bg-background/40 px-3 py-2">
                  <span className="text-sm text-foreground">{item}</span>
                  {index === 1 ? (
                    <span className="border border-amber-400/30 bg-amber-400/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-amber-200">
                      wait
                    </span>
                  ) : (
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-4 grid gap-4 md:grid-cols-[0.86fr_1.14fr]">
        <div className="rounded-[1.25rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4">
          <div className="mb-3 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            <LockKeyhole className="h-3.5 w-3.5 text-primary" />
            Runtime export
          </div>
          <div className="grid gap-2 text-sm">
            {[
              "12 vars exported to workflow runtime",
              "managed secrets resolved",
              "rollback point recorded",
            ].map((item) => (
              <div key={item} className="rounded-full border border-border bg-background/40 px-3 py-2 text-muted-foreground">
                {item}
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-[1.25rem] border border-border bg-[hsl(var(--surface-1))/0.95] p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
              <FileDiff className="h-3.5 w-3.5 text-primary" />
              Audit diff
            </div>
            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-primary">
              synced
              <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </div>
          <div className="rounded-2xl border border-border bg-[#091019] p-3 font-mono text-[11px] leading-relaxed">
            <div className="flex items-center gap-2 text-red-200/90">
              <span className="text-red-300">-</span>
              <span>API_HOST=old.internal</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-primary/95">
              <span className="text-primary">+</span>
              <span>API_HOST=api.envsync.cloud</span>
            </div>
            <div className="mt-2 flex items-center gap-2 text-sky-100/90">
              <span>~</span>
              <span>SYNC_WINDOW=15s</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default HeroWorkflowCanvas;
