export const appDetailPath = (appId: string) => `/applications/${appId}`;
export const appSecretsPath = (appId: string) => `/applications/${appId}/secrets`;
export const appManageEnvironmentsPath = (appId: string) =>
  `/applications/${appId}/manage-environments`;
export const appAccessPath = (appId: string) => `/applications/${appId}/access`;
export const appPointInTimePath = (appId: string) => `/applications/pit/${appId}`;
export const appIntegrationsPath = (appId: string) => `/applications/${appId}/integrations`;
export const appIntegrationProviderPath = (appId: string, provider: string) =>
  `${appIntegrationsPath(appId)}/${provider}`;
export const orgIntegrationsPath = () => "/organisation/integrations";
