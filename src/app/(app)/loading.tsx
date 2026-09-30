export default function Loading() {
  return (
    <div aria-busy="true" aria-label="Carregando" className="animate-pulse">
      <div className="mb-2 h-7 w-64 rounded-md bg-gray-200" />
      <div className="mb-6 h-4 w-96 max-w-full rounded bg-gray-200/70" />
      <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card h-28" />
        ))}
      </div>
      <div className="card h-96" />
    </div>
  );
}
