/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EffectiveAccessResponse = Array<{
    user_id: string;
    email: string;
    relation: 'admin' | 'editor' | 'viewer';
    source: 'direct' | 'team' | 'both';
    teams: Array<string>;
}>;
