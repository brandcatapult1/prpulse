/** A contact's tags as chips: own tags solid-bordered, label/campaign tags lighter with a source badge. */
export default function ContactTagChips({ tags }) {
  return (
    <>
      {(tags ?? []).map((t) => {
        const tag = typeof t === 'string' ? { name: t, type: 'influencer' } : t;
        const reason = tag.type === 'system' ? 'From Label' : tag.type === 'campaign' ? 'From campaign' : null;
        return reason ? (
          <span
            key={tag.id ?? tag.name}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-2xs font-medium ${
              tag.name === 'Frequent' ? 'border-[#036da3]/30 bg-[#c8e6f3] text-[#036da3]' : 'border-brand/30 bg-brand-soft/60 text-brand'
            }`}
            title={`System-managed · ${reason}`}
          >
            <span>{tag.name}</span>
            <span className="rounded bg-amber-50 px-1 py-0.5 text-[10px] font-medium text-amber-700">{reason}</span>
          </span>
        ) : (
          <span
            key={tag.id ?? tag.name}
            className="inline-flex items-center rounded-lg border border-brand bg-brand-soft px-3 py-1.5 text-2xs font-medium text-brand"
          >
            {tag.name}
          </span>
        );
      })}
    </>
  );
}
