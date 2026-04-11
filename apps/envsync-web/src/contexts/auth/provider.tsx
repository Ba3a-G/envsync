import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { AuthContext } from ".";
import { getRegisteredScopeIds, getWebScopeRuleMap } from "@/modules/load-modules";

export const AuthContextProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { isAuthenticated, isLoading, user, token, authError } = useAuth();
  const registeredScopes = getRegisteredScopeIds();
  const scopeRules = getWebScopeRuleMap();

  const contextValue = useMemo(() => {
    const allowedScopes = registeredScopes.filter((scope) => {
      if (!user) return false;

      return scopeRules[scope]?.(user) ?? true;
    });

    return {
      token,
      user,
      isLoading,
      isAuthenticated,
      allowedScopes,
      authError: authError ?? null,
    };
  }, [user, isLoading, isAuthenticated, token, authError, registeredScopes, scopeRules]);

  return (
    <AuthContext.Provider value={contextValue}>{children}</AuthContext.Provider>
  );
};
