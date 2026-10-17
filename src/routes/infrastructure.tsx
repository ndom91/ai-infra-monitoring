import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/infrastructure")({
  component: () => <p className="muted">In progress.</p>,
});
