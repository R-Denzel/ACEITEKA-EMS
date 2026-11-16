export default function PageHeader({ title, description, children }) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-2xl text-sm text-slate">{description}</p>}
      </div>
      {children}
    </div>
  );
}
