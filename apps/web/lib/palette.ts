import type { EventCategory } from "@dinkuan/db";

/** Poster colours per category (demo posters are generated until organisers upload real ones). */
export const CATEGORY_COLORS: Record<EventCategory, [string, string]> = {
  nightlife: ["#2b0f3a", "#c2185b"],
  concert: ["#0d2b45", "#e0873a"],
  festival: ["#843912", "#f1c792"],
  comedy: ["#1b3d2f", "#f4c430"],
  arts_culture: ["#3d1b0b", "#c9621b"],
  conference: ["#10233f", "#3b82f6"],
  sports: ["#0b3d2c", "#22c55e"],
  community: ["#3a2a12", "#eab308"],
  holiday: ["#5a0f0f", "#fbbf24"],
};
