export const appDetailPath = (appId: string) => `/applications/${appId}`;
export const appSecretsPath = (appId: string) => `/applications/${appId}/secrets`;
export const appManageEnvironmentsPath = (appId: string) =>
  `/applications/${appId}/manage-environments`;
export const appAccessPath = (appId: string) => `/applications/${appId}/access`;
export const appPointInTimePath = (appId: string) => `/applications/pit/${appId}`;
