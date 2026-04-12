import { Button } from "@/components/ui/button";
import { runtimeConfig } from "@/utils/runtime-config";
import { ArrowRight, Github, ShieldCheck, Terminal } from "lucide-react";
import { Link } from "react-router-dom";
import HeroWorkflowCanvas from "./HeroWorkflowCanvas";

const Hero = () => {
  return (
    <section className="container mx-auto border-x border-border p-0">
      <div className="grid grid-cols-1 gap-0 lg:min-h-[calc(100dvh-4rem)] lg:grid-cols-[0.88fr_1.12fr]">
        <div className="relative flex flex-col justify-center overflow-hidden border border-border bg-[hsl(var(--surface-1))] px-8 py-14 md:px-10 md:py-16 lg:py-20">
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 opacity-45"
            style={{
              backgroundImage:
                "linear-gradient(hsl(var(--border) / 0.7) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--border) / 0.7) 1px, transparent 1px)",
              backgroundSize: "36px 36px",
            }}
          />
          <div className="relative z-10">
            <span className="mb-5 inline-flex items-center gap-2 border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">
              <Terminal className="h-3.5 w-3.5" />
              Delivery-safe config flow
            </span>

            <h1 className="mb-5 text-4xl font-bold leading-[1.02] tracking-tight text-foreground sm:text-5xl md:text-6xl">
              Push config through
              <br className="hidden sm:block" />
              <span className="text-primary">review, promotion, and runtime sync.</span>
            </h1>

            <p className="mb-8 max-w-xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              CLI-first secrets and environment delivery for dev, staging, CI, and production without `.env` drift.
            </p>

            <div className="mb-8 flex w-full flex-col gap-3 sm:w-auto sm:flex-row">
              <Link to="/onboarding" className="w-full sm:w-auto">
                <Button size="lg" className="w-full px-8 text-base">
                  Get Started
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <a href="https://github.com/EnvSync-Cloud/envsync" className="w-full sm:w-auto">
                <Button size="lg" variant="outline" className="w-full px-8 text-base">
                  <Github className="h-4 w-4" />
                  View GitHub
                </Button>
              </a>
              <a href={runtimeConfig.apiDocsUrl} className="w-full sm:w-auto">
                <span className="inline-flex h-11 items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground">
                  API Reference
                </span>
              </a>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              {[
                { icon: Terminal, title: "pull and push" },
                { icon: ShieldCheck, title: "approve before prod" },
                { icon: Github, title: "inject in CI" },
              ].map((item) => (
                <div key={item.title} className="border border-border bg-[hsl(var(--surface-2))/0.8] px-4 py-3">
                  <div className="flex items-center gap-2 text-sm font-semibold text-foreground">
                    <item.icon className="h-4 w-4 text-primary" />
                    {item.title}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="border border-border bg-background p-4 pt-6 md:p-5 md:pt-7">
          <HeroWorkflowCanvas />
        </div>
      </div>
    </section>
  );
};

export default Hero;
