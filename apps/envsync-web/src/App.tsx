import { NuqsAdapter } from "nuqs/adapters/react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MutationCache, QueryCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AuthContextProvider } from "@/contexts/auth";
import { isReloginError, redirectToLogin } from "@/api";

import Routes from "@/pages";

const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: (error) => {
      if (isReloginError(error)) {
        void redirectToLogin();
      }
    },
  }),
  mutationCache: new MutationCache({
    onError: (error) => {
      if (isReloginError(error)) {
        void redirectToLogin();
      }
    },
  }),
});

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthContextProvider>
      <TooltipProvider>
        <NuqsAdapter>
          <div className="h-screen overflow-hidden">
            <Toaster />
            <Sonner />
            <Routes />
          </div>
        </NuqsAdapter>
      </TooltipProvider>
    </AuthContextProvider>
  </QueryClientProvider>
);

export default App;
