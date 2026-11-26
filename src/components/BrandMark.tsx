// The site mark, drawn inline so it takes the theme's colours. Keep the
// shapes in step with public/favicon.svg.
export function BrandMark() {
  return (
    <svg className="brand-mark" viewBox="0 0 64 64" aria-hidden="true" focusable="false">
      <rect width="64" height="64" rx="12" />
      <path d="M17 46V18h8v21h22v7H17Zm13-12V18h8v16h-8Z" />
    </svg>
  );
}
