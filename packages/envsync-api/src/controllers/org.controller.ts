import type { Context } from "hono";

import { OrgService } from "@/services/org.service";
import { AuditLogService } from "@/services/audit_log.service";

export class OrgController {
	public static readonly getOrg = async (c: Context) => {
		const org_id = c.get("org_id");

		const org = await OrgService.getOrg(org_id);
		return c.json(org);
	};

	public static readonly checkIfSlugExists = async (c: Context) => {
		const { slug } = c.req.query();

		if (!slug) {
			return c.json({ error: "Slug is required." }, 400);
		}

		const exists = await OrgService.checkIfSlugExists(slug);
		return c.json({ exists });
	};

	public static readonly updateOrg = async (c: Context) => {
		const org_id = c.get("org_id");

		const { logo_url, contact_email, website, name, slug } = await c.req.json();

		const org = await OrgService.getOrg(org_id);
		const metadata = typeof org.metadata === "object" && org.metadata !== null ? { ...org.metadata } : {};

		if (contact_email !== undefined) {
			metadata.contact_email = contact_email;
		}

		const updatedData = {
			logo_url: logo_url !== undefined ? logo_url : org.logo_url,
			website: website !== undefined ? website : org.website,
			name: name !== undefined ? name : org.name,
			slug: slug !== undefined ? slug : org.slug,
			metadata,
		};

		// check if the slug already exists
		if (slug) {
			const exists = await OrgService.checkIfSlugExists(slug);
			if (exists) {
				return c.json({ error: "Slug already exists." }, 400);
			}
		}

		await OrgService.updateOrg(org_id, updatedData);

		// Log the organization update
		await AuditLogService.notifyAuditSystem({
			action: "org_updated",
			org_id: org_id,
			user_id: c.get("user_id"),
			message: `Organization ${org.name} updated.`,
			details: {
				logo_url,
				contact_email,
				website,
				name,
				slug,
			},
		});

		return c.json({ message: "Organization updated successfully." });
	};

	public static readonly deleteOrg = async (c: Context) => {
		const org_id = c.get("org_id");
		const user_id = c.get("user_id");
		const { confirm_name } = await c.req.json();
		const org = await OrgService.getOrg(org_id);

		if (confirm_name !== org.name) {
			return c.json({ error: "Organization name confirmation does not match." }, 400);
		}

		await AuditLogService.notifyAuditSystem({
			action: "org_deleted",
			org_id,
			user_id,
			message: `Organization ${org.name} deleted.`,
			details: {
				org_name: org.name,
			},
		});

		await OrgService.deleteOrg(org_id);

		return c.json({ message: "Organization deleted successfully." });
	};
}
