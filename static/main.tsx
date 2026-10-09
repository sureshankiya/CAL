/**
 * Static single-page build of HouseCalc (no server): the calculation engine, editors and
 * sheets run in the browser. AI drawing extraction needs the server function and is
 * disabled in this build (static/aiExtractStub.ts).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { Route } from "@/routes/index";
import "@/styles.css";

const Index = Route.options.component!;
const queryClient = new QueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <Index />
    </QueryClientProvider>
  </StrictMode>,
);
