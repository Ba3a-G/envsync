/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type RotateGpgKeyRequest = {
    name?: string;
    email?: string;
    algorithm?: RotateGpgKeyRequest.algorithm;
    key_size?: number;
    expires_in_days?: number;
    revoke_previous?: boolean;
    set_new_default?: boolean;
};
export namespace RotateGpgKeyRequest {
    export enum algorithm {
        RSA = 'rsa',
        ECC_CURVE25519 = 'ecc-curve25519',
        ECC_P256 = 'ecc-p256',
        ECC_P384 = 'ecc-p384',
    }
}

