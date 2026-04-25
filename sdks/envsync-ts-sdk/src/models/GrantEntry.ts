/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type GrantEntry = {
    subject_id: string;
    subject_type: GrantEntry.subject_type;
    relation: GrantEntry.relation;
};
export namespace GrantEntry {
    export enum subject_type {
        USER = 'user',
        TEAM = 'team',
    }
    export enum relation {
        ADMIN = 'admin',
        EDITOR = 'editor',
        VIEWER = 'viewer',
    }
}

