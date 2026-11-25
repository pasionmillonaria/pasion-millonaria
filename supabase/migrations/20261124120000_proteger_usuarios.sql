-- Fase 0: la clave publica ya no puede leer PIN ni modificar usuarios.
-- La app actual no consulta esta tabla; se conserva la lectura de datos no
-- sensibles. Las FK no dependen de estos permisos.
-- Rollback: GRANT ALL ON TABLE public.usuarios TO anon, authenticated;
REVOKE ALL ON TABLE public.usuarios FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, nombre, rol, activo) ON public.usuarios TO anon, authenticated;

DROP POLICY IF EXISTS "admin_usuarios" ON public.usuarios;
