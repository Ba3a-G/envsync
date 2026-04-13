export interface CertificateRoleLike {
	is_master?: boolean | null;
	is_admin?: boolean | null;
}

export class CertificateRoleMapper {
	public static toPkiRole(role: CertificateRoleLike): "master" | "member" {
		return role.is_master || role.is_admin ? "master" : "member";
	}
}
