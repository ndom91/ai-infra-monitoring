import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/alerts")({
  component: () => <p className="muted">In progress.</p>,
});
