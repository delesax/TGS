import { getSwitches, SWITCH_WORDING } from "@/lib/switches";

/** A plain banner under the header while posting or sign-ups are paused. */
export async function SiteNotice() {
  const s = await getSwitches();
  const lines = [s.posting_paused ? SWITCH_WORDING.banner.posting : null, s.signups_paused ? SWITCH_WORDING.banner.signups : null].filter(Boolean);
  if (!lines.length) return null;
  return (
    <div role="status" className="border-b-2 border-primary bg-secondary">
      <div className="mx-auto flex max-w-4xl flex-col gap-1 px-4 py-3 text-lg lg:max-w-6xl">
        {lines.map((l) => (
          <p key={l}>{l}</p>
        ))}
      </div>
    </div>
  );
}
