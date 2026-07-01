export default function DashboardLoading() {
  return (
    <div className="max-w-6xl mx-auto px-4 py-10">
      <div className="mb-8">
        <div className="h-8 w-56 bg-zinc-900 rounded-lg animate-pulse" />
        <div className="h-4 w-72 bg-zinc-900/70 rounded mt-3 animate-pulse" />
      </div>
      <div className="h-11 bg-zinc-900/70 rounded-xl animate-pulse mb-6" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="h-32 bg-zinc-900/60 border border-zinc-800 rounded-2xl animate-pulse" />
        ))}
      </div>
    </div>
  );
}
