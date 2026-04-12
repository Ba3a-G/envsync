import { useEffect, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";

type TerminalLineType = "command" | "output" | "comment";

type TerminalLine = {
  type: TerminalLineType;
  text: string;
};

type ScenarioId = "local-sync" | "protected-promotion" | "ci-export";

type Scenario = {
  id: ScenarioId;
  label: string;
  contextLabel: string;
  summary: string;
  lines: TerminalLine[];
};

const scenarios: Scenario[] = [
  {
    id: "local-sync",
    label: "Local Sync",
    contextLabel: "local-sync",
    summary: "pull and push from project config",
    lines: [
      { type: "command", text: "envsync auth login" },
      { type: "output", text: "[ok] session linked to your workspace" },
      { type: "command", text: "envsync pull" },
      { type: "output", text: "[ok] synced 12 variables from remote" },
      { type: "command", text: "envsync push" },
      { type: "output", text: "[ok] synced 2 updates to remote" },
    ],
  },
  {
    id: "protected-promotion",
    label: "Protected Promotion",
    contextLabel: "promotion",
    summary: "approval flow for protected environments",
    lines: [
      {
        type: "command",
        text:
          'envsync request create-promotion --app-id app_123 --source-env-type-id env_staging --target-env-type-id env_prod --title "Promote staging to prod" --message "Validated in staging"',
      },
      { type: "output", text: "[ok] promotion request created: cr_42" },
      { type: "command", text: "envsync request get --id cr_42" },
      { type: "output", text: "[review] pending approval for protected environment" },
      { type: "command", text: "envsync request approve --id cr_42" },
      { type: "output", text: "[ok] change request approved and applied" },
    ],
  },
  {
    id: "ci-export",
    label: "CI Export",
    contextLabel: "ci-export",
    summary: "runtime export for CI and workflows",
    lines: [
      { type: "command", text: "envsync export --app-id app_123 --env-type production --format json" },
      { type: "output", text: "[ok] exported 12 values for workflow runtime" },
      { type: "command", text: "envsync export --app-id app_123 --env-type production --enable-secrets auto --format json" },
      { type: "output", text: "[ok] managed secrets resolved" },
      {
        type: "command",
        text: "envsync export --app-id app_123 --env-type production --private-key-file ./envsync.pem --format json",
      },
      { type: "output", text: "[ok] self-managed secrets decrypted" },
    ],
  },
];

const commandSpeedMs = 22;
const outputSpeedMs = 10;
const commentSpeedMs = 3;
const pauseAfterCommandMs = 220;
const pauseAfterOutputMs = 150;
const pauseAfterCommentMs = 80;
const pauseBeforeNextScenarioMs = 1800;

const CLIShowcase = () => {
  const prefersReducedMotion = useReducedMotion();
  const [activeScenarioIndex, setActiveScenarioIndex] = useState(0);
  const [renderedLines, setRenderedLines] = useState<string[]>(() => scenarios[0].lines.map(() => ""));
  const [currentLineIndex, setCurrentLineIndex] = useState<number>(0);
  const [showCursor, setShowCursor] = useState(false);

  const activeScenario = scenarios[activeScenarioIndex] ?? scenarios[0];

  useEffect(() => {
    if (prefersReducedMotion) {
      setRenderedLines(activeScenario.lines.map((line) => line.text));
      setCurrentLineIndex(-1);
      setShowCursor(false);
      return;
    }

    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    setRenderedLines(activeScenario.lines.map(() => ""));
    setCurrentLineIndex(0);
    setShowCursor(false);

    const schedule = (callback: () => void, delay: number) => {
      timeoutId = setTimeout(() => {
        if (!cancelled) {
          callback();
        }
      }, delay);
    };

    const typeLine = (lineIndex: number) => {
      if (cancelled) return;

      if (lineIndex >= activeScenario.lines.length) {
        setCurrentLineIndex(-1);
        setShowCursor(false);
        schedule(() => {
          setActiveScenarioIndex((previous) => (previous + 1) % scenarios.length);
        }, pauseBeforeNextScenarioMs);
        return;
      }

      const line = activeScenario.lines[lineIndex];
      const speed =
        line.type === "command" ? commandSpeedMs : line.type === "output" ? outputSpeedMs : commentSpeedMs;
      const pauseAfterLine =
        line.type === "command" ? pauseAfterCommandMs : line.type === "output" ? pauseAfterOutputMs : pauseAfterCommentMs;

      let charIndex = 0;
      setCurrentLineIndex(lineIndex);
      setShowCursor(true);

      const typeNextCharacter = () => {
        if (cancelled) return;

        charIndex += 1;
        setRenderedLines((previous) => {
          const next = [...previous];
          next[lineIndex] = line.text.slice(0, charIndex);
          return next;
        });

        if (charIndex < line.text.length) {
          schedule(typeNextCharacter, speed);
          return;
        }

        schedule(() => typeLine(lineIndex + 1), pauseAfterLine);
      };

      if (line.text.length === 0) {
        schedule(() => typeLine(lineIndex + 1), pauseAfterLine);
        return;
      }

      schedule(typeNextCharacter, line.type === "comment" ? 20 : 60);
    };

    typeLine(0);

    return () => {
      cancelled = true;
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    };
  }, [activeScenario, prefersReducedMotion]);

  return (
    <section className="container mx-auto border-x border-t border-border p-0">
      <div className="grid gap-0 lg:grid-cols-[minmax(340px,0.74fr)_minmax(0,1.26fr)]">
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
            Use the same control plane locally, for approvals, and inside CI.
          </h2>
          <p className="mt-4 max-w-sm text-base leading-relaxed text-muted-foreground">
            Sync from project config, promote protected changes through review, and export runtime state for workflows.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, scale: 0.96 }}
          whileInView={{ opacity: 1, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35, delay: 0.1 }}
          className="min-w-0 w-full border border-border bg-[linear-gradient(180deg,hsl(var(--surface-1)),#091019)]"
        >
          <div className="min-w-0 overflow-hidden border border-border bg-[hsl(var(--surface-1))]">
            <div className="border-b border-border bg-[hsl(var(--surface-2))] px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <div className="flex space-x-2">
                  <div className="h-2.5 w-2.5 border border-red-400/60 bg-red-400/20" />
                  <div className="h-2.5 w-2.5 border border-amber-400/60 bg-amber-400/20" />
                  <div className="h-2.5 w-2.5 border border-green-400/60 bg-green-400/20" />
                </div>
                <span className="font-mono text-xs tracking-wider text-muted-foreground/90">zsh — envsync-session</span>
                <span className="font-mono text-[11px] text-muted-foreground/80">{activeScenario.contextLabel}</span>
              </div>

              <div className="mt-3 flex items-center justify-between gap-3 text-[11px] uppercase tracking-[0.18em]">
                <span className="border border-primary/30 bg-primary/10 px-2.5 py-1 text-primary">{activeScenario.label}</span>
                <span className="text-muted-foreground">auto-refreshes on finish</span>
              </div>
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
              <div className="relative z-10 min-w-0 space-y-2">
                <div className="mb-3 text-xs uppercase tracking-[0.18em] text-slate-500/90">{activeScenario.summary}</div>
                {activeScenario.lines.map((line, index) => {
                  const text = renderedLines[index] ?? "";
                  const isTypingLine = index === currentLineIndex && showCursor && !prefersReducedMotion;
                  const hasStarted = prefersReducedMotion || text.length > 0 || index <= currentLineIndex;
                  const shouldRenderContent = hasStarted && (text.length > 0 || isTypingLine);

                  return (
                    <div
                      key={`${activeScenario.id}-${index}`}
                      className="min-h-[2.4em] min-w-0 whitespace-pre-wrap break-words"
                    >
                      {!shouldRenderContent ? null : (
                        <>
                      {line.type === "command" && (
                        <>
                          <span className="text-primary">$</span>
                          <span className="ml-2 font-medium text-slate-100">{text}</span>
                          {isTypingLine && <span className="ml-0.5 inline-block h-[1.1em] w-[0.55ch] animate-pulse bg-primary/80 align-[-0.2em]" />}
                        </>
                      )}

                      {line.type === "output" && (
                        <span className={text.startsWith("[review]") ? "text-amber-200/90" : "text-slate-300/90"}>
                          {text}
                          {isTypingLine && <span className="ml-0.5 inline-block h-[1.1em] w-[0.55ch] animate-pulse bg-slate-300/80 align-[-0.2em]" />}
                        </span>
                      )}

                      {line.type === "comment" && (
                        <span className="text-slate-500/90">
                          {text}
                          {isTypingLine && text.length > 0 && (
                            <span className="ml-0.5 inline-block h-[1.1em] w-[0.55ch] animate-pulse bg-slate-500/80 align-[-0.2em]" />
                          )}
                        </span>
                      )}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  );
};

export default CLIShowcase;
