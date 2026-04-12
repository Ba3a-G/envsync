import { Shield, Zap, Globe, GitBranch, Users, Lock } from "lucide-react";
import { BentoGrid, BentoGridItem } from "./ui/bento-grid";
import { motion } from "framer-motion";
import {
  AccessVisual,
  EncryptionVisual,
  EnvironmentControlVisual,
  LifecycleVisual,
  SyncVisual,
  WorkflowVisual,
} from "./FeatureVisuals";

const features = [
  {
    title: "End-to-end encryption",
    description: "AES-256 with a zero-knowledge model keeps plaintext out of places it should never be.",
    header: <EncryptionVisual />,
    icon: <Shield className="h-4 w-4 text-primary" />,
    className: "md:col-span-2",
  },
  {
    title: "Fast sync",
    description: "Ship config updates across environments in seconds, not deployment windows.",
    header: <SyncVisual />,
    icon: <Zap className="h-4 w-4 text-primary" />,
    className: "md:col-span-1",
  },
  {
    title: "Multi-environment control",
    description: "Operate dev, staging, and production with the same policy and approval surface.",
    header: <EnvironmentControlVisual />,
    icon: <Globe className="h-4 w-4 text-primary" />,
    className: "md:col-span-1",
  },
  {
    title: "Versioned workflows",
    description: "Track every config change with history, diff visibility, and rollback support.",
    header: <WorkflowVisual />,
    icon: <GitBranch className="h-4 w-4 text-primary" />,
    className: "md:col-span-2",
  },
  {
    title: "Team-level access",
    description: "Control secret visibility with scoped permissions mapped to your org structure.",
    header: <AccessVisual />,
    icon: <Users className="h-4 w-4 text-primary" />,
    className: "md:col-span-2",
  },
  {
    title: "Key lifecycle",
    description: "Manage certificates and signing keys in one operational workflow.",
    header: <LifecycleVisual />,
    icon: <Lock className="h-4 w-4 text-primary" />,
    className: "md:col-span-1",
  },
];

const Features = () => {
  return (
    <section id="features" className="container mx-auto border-x border-t border-border py-0 px-0">
      <div className="relative container mx-auto px-0 z-10">

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.35 }}
          className="relative overflow-hidden border border-border bg-[hsl(var(--surface-1))] p-6 text-left md:p-8 md:py-12"
        >
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
            <h2 className="mb-4 text-4xl font-bold text-foreground md:text-5xl">
              Everything you need to secure your secrets
            </h2>
            <p className="max-w-3xl text-lg text-muted-foreground md:text-xl">
              Built for teams shipping across multiple stages with strict security and fast release cycles.
            </p>
          </div>
        </motion.div>

        <BentoGrid>
          {features.map((feature, i) => (
            <BentoGridItem
              key={i}
              title={feature.title}
              description={feature.description}
              header={feature.header}
              icon={feature.icon}
              className={feature.className}
            />
          ))}
        </BentoGrid>

      </div>
    </section>
  );
};

export default Features;
