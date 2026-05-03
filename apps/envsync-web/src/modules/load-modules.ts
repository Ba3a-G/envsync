import { coreWebModules } from "./core-modules";
import { enterpriseWebModules } from "@enterprise-modules";
import { externalWebModules } from "./external-modules";
import type { ScopeRule, SettingsSection, WebModule, WebNavGroup, WebNavItem, WebRouteDefinition } from "./types";
import { isEnterpriseDashboard } from "@/utils/runtime-config";

const webModules = [
  ...coreWebModules,
  ...(isEnterpriseDashboard ? enterpriseWebModules : []),
  ...externalWebModules,
];

function dedupeByKey<T>(items: T[], getKey: (item: T) => string) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getKey(item);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

export function loadWebModules(): WebModule[] {
  return [...webModules];
}

export function getWebRoutes(modules: WebModule[] = loadWebModules()): WebRouteDefinition[] {
  return modules.flatMap((module) => module.routes);
}

export function getWebNavGroups(modules: WebModule[] = loadWebModules()): WebNavGroup[] {
  return modules.flatMap((module) => module.navGroups);
}

export function getWebNavItems(modules: WebModule[] = loadWebModules()): WebNavItem[] {
  return dedupeByKey(
    getWebNavGroups(modules).flatMap((group) => group.items),
    (item) => `${item.id}:${item.href}`
  );
}

export function getWebScopeRuleMap(modules: WebModule[] = loadWebModules()): Record<string, ScopeRule> {
  return modules.reduce<Record<string, ScopeRule>>((rules, module) => {
    Object.assign(rules, module.scopeRules ?? {});
    return rules;
  }, {});
}

export function getRegisteredScopeIds(modules: WebModule[] = loadWebModules()): string[] {
  const scopeIds = [
    ...Object.keys(getWebScopeRuleMap(modules)),
    ...getWebNavItems(modules).map((item) => item.id),
  ];

  return [...new Set(scopeIds)];
}

export function getSettingsSections(modules: WebModule[] = loadWebModules()): SettingsSection[] {
  return dedupeByKey(
    modules.flatMap((module) => module.settingsSections ?? []),
    (section) => section.id
  );
}
