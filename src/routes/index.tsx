import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/")({ component: Index });

function Index() {
  return (
    <div className="min-h-screen bg-background p-8 text-foreground">
      <h1 className="text-lg font-semibold tracking-tight">HouseCalc</h1>
      <p className="text-xs text-muted-foreground">Scaffold check</p>
    </div>
  );
}
