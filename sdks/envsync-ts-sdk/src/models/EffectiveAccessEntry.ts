/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EffectiveAccessEntry = {
    user_id: string;
    email: string;
    relation: EffectiveAccessEntry.relation;
    org_relation: EffectiveAccessEntry.org_relation;
    direct_relation: EffectiveAccessEntry.direct_relation;
    team_relation: EffectiveAccessEntry.team_relation;
    sources: Array<'org' | 'direct' | 'team'>;
    teams: Array<string>;
};
export namespace EffectiveAccessEntry {
    export enum relation {
        ADMIN = 'admin',
        EDITOR = 'editor',
        VIEWER = 'viewer',
    }
    export enum org_relation {
        ADMIN = 'admin',
        EDITOR = 'editor',
        VIEWER = 'viewer',
    }
    export enum direct_relation {
        ADMIN = 'admin',
        EDITOR = 'editor',
        VIEWER = 'viewer',
    }
    export enum team_relation {
        ADMIN = 'admin',
        EDITOR = 'editor',
        VIEWER = 'viewer',
    }
}

