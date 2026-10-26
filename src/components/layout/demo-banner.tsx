/** Site-wide notice that this deployment is a demo with fictional data. */
export function DemoBanner() {
  return (
    <div
      role="note"
      className="w-full border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm font-medium text-amber-900"
    >
      Demo site. All data is fictional.
    </div>
  );
}
