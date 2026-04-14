import { getUiHarnessConfig, uniqueName, uniqueSlug } from "./config";

export interface JourneyActor {
	storageKey: string;
	email: string;
	password: string;
	fullName: string;
}

export interface JourneyOrg {
	name: string;
	website: string;
	companySize: string;
}

export interface JourneyProject {
	name: string;
	description: string;
	teamName: string;
	webhookName: string;
	roleName: string;
}

export interface JourneyEnvironment {
	development: string;
	staging: string;
	production: string;
}

export interface ProductFixtureState {
	runId: string;
	founder: JourneyActor;
	member: JourneyActor;
	reviewer: JourneyActor;
	org: JourneyOrg;
	project: JourneyProject;
	environments: JourneyEnvironment;
	variableKey: string;
	variableValue: string;
	updatedVariableValue: string;
	secretKey: string;
	secretValue: string;
	updatedSecretValue: string;
	changeRequestTitle: string;
	changeRequestMessage: string;
	promotionTitle: string;
	promotionMessage: string;
}

function buildEmail(localPart: string) {
	const { testEmailDomain } = getUiHarnessConfig();
	return `${localPart}@${testEmailDomain}`;
}

export function createJourneyActor(prefix: string, label: string): JourneyActor {
	const slug = uniqueSlug(prefix);
	return {
		storageKey: slug,
		email: buildEmail(slug),
		password: getUiHarnessConfig().testPassword,
		fullName: label,
	};
}

export function createProductFixtureState(prefix = "e2e"): ProductFixtureState {
	const runId = uniqueSlug(prefix);

	return {
		runId,
		founder: createJourneyActor(`${prefix}-founder`, "EnvSync Founder"),
		member: createJourneyActor(`${prefix}-member`, "EnvSync Member"),
		reviewer: createJourneyActor(`${prefix}-reviewer`, "EnvSync Reviewer"),
		org: {
			name: uniqueName("UI_JOURNEY_ORG"),
			website: `https://${runId}.example.test`,
			companySize: "11-50 employees",
		},
		project: {
			name: uniqueName("UI_JOURNEY_PROJECT"),
			description: "Project created by the Playwright product journey.",
			teamName: uniqueName("UI_PLATFORM_TEAM"),
			webhookName: uniqueName("UI_WEBHOOK"),
			roleName: uniqueName("UI_ROLE"),
		},
		environments: {
			development: "Development",
			staging: "Staging",
			production: "Production",
		},
		variableKey: `UI_JOURNEY_VAR_${runId.replace(/-/g, "_").toUpperCase()}`,
		variableValue: `value-${runId}-dev`,
		updatedVariableValue: `value-${runId}-approved`,
		secretKey: `UI_JOURNEY_SECRET_${runId.replace(/-/g, "_").toUpperCase()}`,
		secretValue: `secret-${runId}-initial`,
		updatedSecretValue: `secret-${runId}-approved`,
		changeRequestTitle: uniqueName("Protected Change"),
		changeRequestMessage: "Requesting approval for protected production config update.",
		promotionTitle: uniqueName("Promotion"),
		promotionMessage: "Promote staging configuration into production.",
	};
}
