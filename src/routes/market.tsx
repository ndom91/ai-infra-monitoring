import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/market")({
  component: () => <p className="muted">In progress.</p>,
});
