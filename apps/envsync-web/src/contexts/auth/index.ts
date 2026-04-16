import { createContext, useContext } from "react";
import type { WhoAmIResponse } from "@envsync-cloud/envsync-ts-sdk";

export interface IAuthContext {
  user: WhoAmIResponse | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  token: string | null;
  allowedScopes: string[];
  authError: string | null;
}

const FALLBACK_AUTH_CONTEXT: IAuthContext = {
  user: null,
  isLoading: false,
  isAuthenticated: false,
  token: null,
  allowedScopes: [],
  authError: "Auth context unavailable",
};

let hasWarnedMissingProvider = false;

export const AuthContext = createContext<IAuthContext>(FALLBACK_AUTH_CONTEXT);
export const useAuthContext = () => {
  const context = useContext(AuthContext);

  if (context === FALLBACK_AUTH_CONTEXT && !hasWarnedMissingProvider) {
    hasWarnedMissingProvider = true;
    console.warn("useAuthContext was called without an AuthContextProvider");
  }

  return context;
};

export * from "./provider";
