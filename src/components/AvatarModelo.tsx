// Avatar redondo de una modelo: su foto (bucket privado, se sirve por /api/modelos/<id>/foto?v=)
// o la inicial si aun no tiene.
export function AvatarModelo({
  id,
  nombre,
  foto,
  className = "h-6 w-6 text-[10px]",
}: {
  id: string | null | undefined;
  nombre: string;
  foto: number | null | undefined;
  className?: string;
}) {
  return (
    <span className={`inline-grid shrink-0 place-items-center overflow-hidden rounded-full border border-white/[0.12] bg-white/[0.06] font-semibold text-white/80 ${className}`}>
      {id && foto ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/modelos/${id}/foto?v=${foto}`} alt="" className="h-full w-full object-cover" />
      ) : (
        nombre.slice(0, 1).toUpperCase()
      )}
    </span>
  );
}
