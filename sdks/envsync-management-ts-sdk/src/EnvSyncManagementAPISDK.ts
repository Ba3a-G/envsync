/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { BaseHttpRequest } from './core/BaseHttpRequest';
import type { OpenAPIConfig } from './core/OpenAPI';
import { FetchHttpRequest } from './core/FetchHttpRequest';
import { EnterpriseService } from './services/EnterpriseService';
import { LicenseService } from './services/LicenseService';
import { OnboardingService } from './services/OnboardingService';
import { SystemService } from './services/SystemService';
type HttpRequestConstructor = new (config: OpenAPIConfig) => BaseHttpRequest;
export class EnvSyncManagementAPISDK {
    public readonly enterprise: EnterpriseService;
    public readonly license: LicenseService;
    public readonly onboarding: OnboardingService;
    public readonly system: SystemService;
    public readonly request: BaseHttpRequest;
    constructor(config?: Partial<OpenAPIConfig>, HttpRequest: HttpRequestConstructor = FetchHttpRequest) {
        this.request = new HttpRequest({
            BASE: config?.BASE ?? 'http://localhost:4001',
            VERSION: config?.VERSION ?? '0.8.1',
            WITH_CREDENTIALS: config?.WITH_CREDENTIALS ?? false,
            CREDENTIALS: config?.CREDENTIALS ?? 'include',
            TOKEN: config?.TOKEN,
            USERNAME: config?.USERNAME,
            PASSWORD: config?.PASSWORD,
            HEADERS: config?.HEADERS,
            ENCODE_PATH: config?.ENCODE_PATH,
        });
        this.enterprise = new EnterpriseService(this.request);
        this.license = new LicenseService(this.request);
        this.onboarding = new OnboardingService(this.request);
        this.system = new SystemService(this.request);
    }
}

