/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CertificateListResponse = Array<{
    id: string;
    org_id: string;
    serial_hex: string;
    cert_type: string;
    subject_cn: string;
    subject_email: string | null;
    status: string;
    not_before: string | null;
    not_after: string | null;
    description: string | null;
    metadata?: any | null;
    revoked_at: string | null;
    supersedes_certificate_id?: string | null;
    created_at: string;
    updated_at: string;
}>;
