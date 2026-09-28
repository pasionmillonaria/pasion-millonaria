-- Añade el origen a la descripción de registros históricos de abonos.
UPDATE public.registros_caja rc
SET descripcion = COALESCE(rc.descripcion, 'Abono apartado') || ' — ' ||
  CASE WHEN a.origen = 'tienda' THEN 'Tienda' ELSE 'WhatsApp' END
FROM public.abonos ab
JOIN public.apartados a ON a.id = ab.apartado_id
WHERE rc.abono_id = ab.id
  AND COALESCE(rc.descripcion, '') NOT ILIKE '% — Tienda'
  AND COALESCE(rc.descripcion, '') NOT ILIKE '% — WhatsApp';
