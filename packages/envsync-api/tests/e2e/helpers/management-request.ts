/**
 * Legacy wrapper for management-surface in-process requests.
 *
 * The shared request helper now supports `surface: "management"`, so this
 * delegates there to keep older tests working without duplicating logic.
 */

import { type TestRequestOptions, type TestResponse, testRequest } from "../../helpers/request";

export type ManagementTestRequestOptions = Omit<TestRequestOptions, "surface">;
export type ManagementTestResponse = TestResponse;

export async function managementTestRequest(
	path: string,
	options: ManagementTestRequestOptions = {},
): Promise<ManagementTestResponse> {
	return testRequest(path, {
		...options,
		surface: "management",
	});
}
