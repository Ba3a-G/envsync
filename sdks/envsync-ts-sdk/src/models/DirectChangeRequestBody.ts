/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DirectChangeRequestBody = {
    app_id: string;
    target_env_type_id: string;
    title: string;
    message: string;
    envs?: Array<{
        key: string;
        operation: 'CREATE' | 'UPDATE' | 'DELETE';
        proposed_value?: string | null;
    }>;
    secrets?: Array<{
        key: string;
        operation: 'CREATE' | 'UPDATE' | 'DELETE';
        proposed_value?: string | null;
    }>;
};

