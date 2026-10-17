import { Link } from "@tanstack/react-router";
import { WINDOWS, type WindowDays } from "~/lib/indicators";

export function WindowToolbar({ active }: { active: WindowDays }) {
	return (
		<div className="toolbar">
			{WINDOWS.map((w) => (
				<Link
					key={w.days}
					to="/"
					search={{ window: w.days }}
					aria-pressed={w.days === active}
					className="toolbar-btn"
				>
					{w.label}
				</Link>
			))}
		</div>
	);
}
