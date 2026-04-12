/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GrantsListResponse = Array<{
    subject_id: string;
    subject_type: 'user' | 'team';
    relation: 'admin' | 'editor' | 'viewer';
}>;
