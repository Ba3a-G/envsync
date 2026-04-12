/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { EffectiveAccessResponse } from '../models/EffectiveAccessResponse';
import type { EffectivePermissionsResponse } from '../models/EffectivePermissionsResponse';
import type { GrantAccessRequest } from '../models/GrantAccessRequest';
import type { GrantsListResponse } from '../models/GrantsListResponse';
import type { PermissionMessageResponse } from '../models/PermissionMessageResponse';
import type { RevokeAccessRequest } from '../models/RevokeAccessRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import type { BaseHttpRequest } from '../core/BaseHttpRequest';
export class PermissionsService {
    constructor(public readonly httpRequest: BaseHttpRequest) {}
    /**
     * Get My Permissions
     * Get the current user's effective permissions in the organization
     * @returns EffectivePermissionsResponse Permissions retrieved successfully
     * @throws ApiError
     */
    public getMyPermissions(): CancelablePromise<EffectivePermissionsResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/permission/me',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * Grant App Access
     * Grant a user or team access to an app
     * @param appId
     * @param requestBody
     * @returns PermissionMessageResponse Access granted successfully
     * @throws ApiError
     */
    public grantAppAccess(
        appId: string,
        requestBody?: GrantAccessRequest,
    ): CancelablePromise<PermissionMessageResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/permission/app/{app_id}/grant',
            path: {
                'app_id': appId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * Revoke App Access
     * Revoke a user or team's access to an app
     * @param appId
     * @param requestBody
     * @returns PermissionMessageResponse Access revoked successfully
     * @throws ApiError
     */
    public revokeAppAccess(
        appId: string,
        requestBody?: RevokeAccessRequest,
    ): CancelablePromise<PermissionMessageResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/permission/app/{app_id}/revoke',
            path: {
                'app_id': appId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * List App Grants
     * List direct user and team grants on an app
     * @param appId
     * @returns GrantsListResponse App grants listed successfully
     * @throws ApiError
     */
    public listAppGrants(
        appId: string,
    ): CancelablePromise<GrantsListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/permission/app/{app_id}/grants',
            path: {
                'app_id': appId,
            },
        });
    }
    /**
     * Get App Effective Access
     * List user effective access for an app including team inheritance
     * @param appId
     * @returns EffectiveAccessResponse Effective app access returned successfully
     * @throws ApiError
     */
    public getAppEffectiveAccess(
        appId: string,
    ): CancelablePromise<EffectiveAccessResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/permission/app/{app_id}/effective-access',
            path: {
                'app_id': appId,
            },
        });
    }
    /**
     * Grant Env Type Access
     * Grant a user or team access to an environment type
     * @param id
     * @param requestBody
     * @returns PermissionMessageResponse Access granted successfully
     * @throws ApiError
     */
    public grantEnvTypeAccess(
        id: string,
        requestBody?: GrantAccessRequest,
    ): CancelablePromise<PermissionMessageResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/permission/env_type/{id}/grant',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * Revoke Env Type Access
     * Revoke a user or team's access to an environment type
     * @param id
     * @param requestBody
     * @returns PermissionMessageResponse Access revoked successfully
     * @throws ApiError
     */
    public revokeEnvTypeAccess(
        id: string,
        requestBody?: RevokeAccessRequest,
    ): CancelablePromise<PermissionMessageResponse> {
        return this.httpRequest.request({
            method: 'POST',
            url: '/api/permission/env_type/{id}/revoke',
            path: {
                'id': id,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                500: `Internal server error`,
            },
        });
    }
    /**
     * List Env Type Grants
     * List direct user and team grants on an environment type
     * @param id
     * @returns GrantsListResponse Env type grants listed successfully
     * @throws ApiError
     */
    public listEnvTypeGrants(
        id: string,
    ): CancelablePromise<GrantsListResponse> {
        return this.httpRequest.request({
            method: 'GET',
            url: '/api/permission/env_type/{id}/grants',
            path: {
                'id': id,
            },
        });
    }
}
