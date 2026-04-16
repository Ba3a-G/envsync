import { beforeEach, describe, expect, test } from "bun:test";

import { FGAClient } from "@/libs/openfga";
import { AuthorizationService } from "@/services/authorization.service";
import { resetFGA } from "../helpers/fga";

describe("AuthorizationService structural tuples", () => {
	beforeEach(() => {
		resetFGA();
	});

	test("writeAppOrgRelation is idempotent", async () => {
		await AuthorizationService.writeAppOrgRelation("app-1", "org-1");
		await AuthorizationService.writeAppOrgRelation("app-1", "org-1");

		const fga = await FGAClient.getInstance();
		const tuples = await fga.readTuples({ object: "app:app-1" });

		expect(tuples).toEqual([
			{ user: "org:org-1", relation: "org", object: "app:app-1" },
		]);
	});

	test("writeEnvTypeRelations is idempotent", async () => {
		await AuthorizationService.writeEnvTypeRelations("env-1", "app-1", "org-1");
		await AuthorizationService.writeEnvTypeRelations("env-1", "app-1", "org-1");

		const fga = await FGAClient.getInstance();
		const tuples = await fga.readTuples({ object: "env_type:env-1" });

		expect(tuples).toEqual([
			{ user: "app:app-1", relation: "app", object: "env_type:env-1" },
			{ user: "org:org-1", relation: "org", object: "env_type:env-1" },
		]);
	});
});
