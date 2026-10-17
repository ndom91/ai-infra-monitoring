import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/coverage")({
  component: () => <p className="muted">In progress.</p>,
});
