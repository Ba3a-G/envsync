import { BusinessRuleError } from "@/libs/errors";
import { CertificateService } from "@/services/certificate.service";
import { CertificateRoleMapper } from "@/services/certificate-role.mapper";
import { OrgService } from "@/services/org.service";
import { RoleService } from "@/services/role.service";
import { UserService } from "@/services/user.service";

export class SystemCertificateProvisioningService {
	public static async ensureProvisionedForAuthenticatedUser(
		userId: string,
		orgId: string,
		roleId: string,
	) {
		const existingCert = await CertificateService.getLatestActiveSystemMemberCert(orgId, userId);
		if (existingCert) {
			return existingCert;
		}

		const [user, role, orgCA] = await Promise.all([
			UserService.getUser(userId),
			RoleService.getRole(roleId),
			CertificateService.getOrgCA(orgId),
		]);

		if (!orgCA) {
			if (!(role.is_master || role.is_admin)) {
				throw new BusinessRuleError(
					"Organization CA not initialized for this organization.",
					409,
					"ORG_CA_REQUIRED_FOR_SYSTEM_CERT",
				);
			}

			const org = await OrgService.getOrg(orgId);
			await CertificateService.initOrgCA(
				orgId,
				org.name,
				userId,
				"System-generated organization CA",
				{ issued_source: "auth_repair" },
			);
		}

		return CertificateService.issueMemberCert({
			org_id: orgId,
			target_user_id: user.id,
			target_email: user.email,
			issued_by_user_id: userId,
			envsync_pki_role: CertificateRoleMapper.toPkiRole(role),
			is_system_generated: true,
			persist_private_key: true,
			description: "System-generated member certificate",
			metadata: {
				role_id: role.id,
				role_name: role.name,
				issued_source: "auth_repair",
			},
		});
	}
}
