// Marca de la plataforma: reemplaza el glyph "✦" (emoji, se ve distinto e
// inconsistente según SO/fuente) por un vector nítido a cualquier tamaño.
export default function Sparkle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" fill="currentColor" className={className} aria-hidden="true">
      <path d="M50,0 L64.14,35.86 L100,50 L64.14,64.14 L50,100 L35.86,64.14 L0,50 L35.86,35.86 Z" />
    </svg>
  );
}
