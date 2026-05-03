import type { WhoAmIResponse } from "@envsync-cloud/envsync-ts-sdk";

export interface AuthMembershipSummary {
  user_id: string;
  org_id: string;
  org_name: string;
  org_slug: string;
  role_id: string;
  role_name: string;
  is_admin: boolean;
  is_master: boolean;
  is_active: boolean;
}

export type AuthSession = WhoAmIResponse & {
  memberships: AuthMembershipSummary[];
  active_membership_user_id: string;
};

export function normalizeAuthSession(session: WhoAmIResponse | AuthSession): AuthSession {
  const authSession = session as Partial<AuthSession> & WhoAmIResponse;
  const memberships = Array.isArray(authSession.memberships) && authSession.memberships.length > 0
    ? authSession.memberships
    : [{
        user_id: authSession.user.id,
        org_id: authSession.org.id,
        org_name: authSession.org.name,
        org_slug: authSession.org.slug,
        role_id: authSession.role.id,
        role_name: authSession.role.name,
        is_admin: authSession.role.is_admin,
        is_master: authSession.role.is_master,
        is_active: true,
      }];

  return {
    ...authSession,
    memberships,
    active_membership_user_id: authSession.active_membership_user_id ?? authSession.user.id,
  };
}
