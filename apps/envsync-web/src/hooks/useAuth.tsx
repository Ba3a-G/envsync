import { useEffect, useState } from "react";
import { type WhoAmIResponse } from "@envsync-cloud/envsync-ts-sdk";
import { getSDK, isReloginError, redirectToLogin } from "@/api";
import { identifyUser } from "@/telemetry";

export const useAuth = () => {
  const [user, setUser] = useState<WhoAmIResponse | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const api = getSDK();

  useEffect(() => {
    setAuthError(null);
    const fetchUser = async () => {
      try {
        const userData = await api.authentication.whoami();
        setUser(userData);
        setIsAuthenticated(true);
        identifyUser(userData.user.id, {
          email: userData.user.email,
          name: userData.user.full_name,
          org: userData.org.name || "",
          orgId: userData.org.id,
          roleName: userData.role.name,
        });
      } catch (error) {
        console.error("Failed to fetch user:", error);
        setIsAuthenticated(false);
        setUser(undefined);
        if (isReloginError(error)) {
          setAuthError(null);
          await redirectToLogin();
          return;
        }
        setAuthError("Could not load your session. Check the API is running and try again.");
      } finally {
        setIsLoading(false);
      }
    };

    fetchUser();
  }, []);

  return {
    user: user ?? null,
    isLoading,
    isAuthenticated,
    api,
    token: null,
    authError,
  };
};
