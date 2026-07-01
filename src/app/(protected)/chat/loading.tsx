export default function ChatLoading() {
  return (
    <div className="flex h-[calc(100vh-57px)]">
      <aside className="hidden md:flex w-64 flex-col border-r border-zinc-800/80 bg-zinc-950 p-3 gap-2">
        <div className="h-10 bg-zinc-900 rounded-xl animate-pulse" />
        <div className="h-3 w-12 bg-zinc-900 rounded mt-2 animate-pulse" />
        <div className="h-8 bg-zinc-900/70 rounded-xl animate-pulse" />
        <div className="h-3 w-12 bg-zinc-900 rounded mt-3 animate-pulse" />
        <div className="h-8 bg-zinc-900/70 rounded-xl animate-pulse" />
        <div className="h-8 bg-zinc-900/70 rounded-xl animate-pulse" />
      </aside>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-10 h-10 rounded-2xl bg-zinc-900 animate-pulse" />
      </div>
    </div>
  );
}
