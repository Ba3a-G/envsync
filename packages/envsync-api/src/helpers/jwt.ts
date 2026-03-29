import { createLocalJWKSet, jwtVerify, type JWKSet } from "jose";

import { getZitadelIssuer, getZitadelJwksUrl, getZitadelRequestHeaders } from "@/helpers/zitadel";

let cachedJwksResolver: ReturnType<typeof createLocalJWKSet> | null = null;
let cachedJwksUrl = "";

async function getJwksResolver() {
	const jwksUrl = getZitadelJwksUrl();
	if (!cachedJwksResolver || cachedJwksUrl !== jwksUrl) {
		const response = await fetch(jwksUrl, {
			headers: getZitadelRequestHeaders(),
			signal: AbortSignal.timeout(10_000),
		});
		if (!response.ok) {
			throw new Error(`Failed to fetch Zitadel JWKS: ${response.status} ${await response.text()}`);
		}
		const jwks = (await response.json()) as JWKSet;
		cachedJwksResolver = createLocalJWKSet(jwks);
		cachedJwksUrl = jwksUrl;
	}
	return cachedJwksResolver;
}

export async function verifyJWTToken(token: string) {
	const issuer = getZitadelIssuer();
	const jwks = await getJwksResolver();
	const { payload } = await jwtVerify(token, jwks, {
		issuer,
		algorithms: ["RS256"],
	});
	return payload;
}
