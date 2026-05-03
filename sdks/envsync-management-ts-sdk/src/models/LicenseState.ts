/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type LicenseState = {
    status: LicenseState.status;
    lease_expires_at?: string | null;
    last_verified_at?: string | null;
    last_error_code?: string | null;
    last_error_message?: string | null;
};
export namespace LicenseState {
    export enum status {
        UNKNOWN = 'unknown',
        ACTIVE = 'active',
        INACTIVE = 'inactive',
        EXPIRED = 'expired',
        ERROR = 'error',
        LOCKED = 'locked',
    }
}

