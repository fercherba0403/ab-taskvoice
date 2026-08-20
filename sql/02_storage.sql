-- ============================================================
-- TASKVOICE
-- 02_storage.sql
--
-- Configuración definitiva de Supabase Storage
--
-- Requiere:
--   01_database.sql ejecutado previamente
--
-- Buckets privados:
--   audios
--   fotos
--   avatars
--
-- IMPORTANTE:
--   El proyecto NO utiliza GPS ni geolocalización.
-- ============================================================


-- ============================================================
-- 1. AJUSTE DE LA BASE DE DATOS
--
-- Como los archivos son privados, almacenaremos el PATH
-- del audio y NO una URL firmada/temporal.
-- ============================================================

alter table public.task_executions
rename column audio_url to audio_path;


-- ============================================================
-- 2. CREAR / CONFIGURAR BUCKET: AUDIOS
--
-- Tamaño máximo: 50 MB
-- Bucket privado
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'audios',
    'audios',
    false,
    52428800,
    array[
        'audio/webm',
        'audio/ogg',
        'audio/mpeg',
        'audio/mp4',
        'audio/wav',
        'audio/x-wav'
    ]
)
on conflict (id)
do update set

    name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 3. CREAR / CONFIGURAR BUCKET: FOTOS
--
-- Tamaño máximo: 10 MB
-- Bucket privado
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'fotos',
    'fotos',
    false,
    10485760,
    array[
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
on conflict (id)
do update set

    name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 4. CREAR / CONFIGURAR BUCKET: AVATARS
--
-- Tamaño máximo: 5 MB
-- Bucket privado
-- ============================================================

insert into storage.buckets (
    id,
    name,
    public,
    file_size_limit,
    allowed_mime_types
)
values (
    'avatars',
    'avatars',
    false,
    5242880,
    array[
        'image/jpeg',
        'image/png',
        'image/webp'
    ]
)
on conflict (id)
do update set

    name = excluded.name,
    public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;


-- ============================================================
-- 5. ESTRUCTURA DE CARPETAS
-- ============================================================
--
-- AUDIOS:
--
-- organization_id/
--      task_id/
--          execution_id/
--              audio.webm
--
--
-- FOTOS:
--
-- organization_id/
--      task_id/
--          execution_id/
--              foto-01.jpg
--              foto-02.jpg
--
--
-- AVATARS:
--
-- organization_id/
--      user_id/
--          avatar.jpg
--
-- ============================================================



-- ============================================================
-- 6. ELIMINAR POLICIES ANTERIORES SI EXISTIERAN
--
-- Esto permite volver a ejecutar 02_storage.sql sin que
-- falle porque las policies ya existen.
-- ============================================================


-- AUDIOS

drop policy if exists
"taskvoice_audios_select"
on storage.objects;

drop policy if exists
"taskvoice_audios_insert"
on storage.objects;

drop policy if exists
"taskvoice_audios_update"
on storage.objects;

drop policy if exists
"taskvoice_audios_delete"
on storage.objects;


-- FOTOS

drop policy if exists
"taskvoice_fotos_select"
on storage.objects;

drop policy if exists
"taskvoice_fotos_insert"
on storage.objects;

drop policy if exists
"taskvoice_fotos_update"
on storage.objects;

drop policy if exists
"taskvoice_fotos_delete"
on storage.objects;


-- AVATARS

drop policy if exists
"taskvoice_avatars_select"
on storage.objects;

drop policy if exists
"taskvoice_avatars_insert"
on storage.objects;

drop policy if exists
"taskvoice_avatars_update"
on storage.objects;

drop policy if exists
"taskvoice_avatars_delete"
on storage.objects;



-- ============================================================
-- 7. AUDIOS - SELECT
--
-- Puede escuchar:
--
-- trabajador:
--   solamente audios de sus ejecuciones
--
-- supervisor/admin:
--   audios de toda su empresa
-- ============================================================

create policy "taskvoice_audios_select"

on storage.objects

for select

to authenticated

using (

    bucket_id = 'audios'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            -- Carpeta 1 = organización
            and t.organization_id::text =
                (storage.foldername(name))[1]

            -- Carpeta 2 = tarea
            and t.id::text =
                (storage.foldername(name))[2]

            -- Carpeta 3 = ejecución
            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 8. AUDIOS - INSERT
--
-- Trabajador:
--   puede subir audio a su propia ejecución
--
-- Supervisor/admin:
--   puede subir audio dentro de su empresa
-- ============================================================

create policy "taskvoice_audios_insert"

on storage.objects

for insert

to authenticated

with check (

    bucket_id = 'audios'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 9. AUDIOS - UPDATE
--
-- Necesario si posteriormente utilizamos upsert.
-- ============================================================

create policy "taskvoice_audios_update"

on storage.objects

for update

to authenticated

using (

    bucket_id = 'audios'

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

)

with check (

    bucket_id = 'audios'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 10. AUDIOS - DELETE
-- ============================================================

create policy "taskvoice_audios_delete"

on storage.objects

for delete

to authenticated

using (

    bucket_id = 'audios'

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 11. FOTOS - SELECT
-- ============================================================

create policy "taskvoice_fotos_select"

on storage.objects

for select

to authenticated

using (

    bucket_id = 'fotos'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 12. FOTOS - INSERT
-- ============================================================

create policy "taskvoice_fotos_insert"

on storage.objects

for insert

to authenticated

with check (

    bucket_id = 'fotos'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 13. FOTOS - UPDATE
-- ============================================================

create policy "taskvoice_fotos_update"

on storage.objects

for update

to authenticated

using (

    bucket_id = 'fotos'

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

)

with check (

    bucket_id = 'fotos'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 3

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 14. FOTOS - DELETE
-- ============================================================

create policy "taskvoice_fotos_delete"

on storage.objects

for delete

to authenticated

using (

    bucket_id = 'fotos'

    and exists (

        select 1

        from public.task_executions e

        join public.tasks t
            on t.id = e.task_id

        where

            t.organization_id =
                public.get_my_organization_id()

            and t.organization_id::text =
                (storage.foldername(name))[1]

            and t.id::text =
                (storage.foldername(name))[2]

            and e.id::text =
                (storage.foldername(name))[3]

            and (

                e.user_id = auth.uid()

                or public.is_supervisor()

            )

    )

);



-- ============================================================
-- 15. AVATARS - SELECT
--
-- Todos los usuarios autenticados pueden ver los avatares
-- pertenecientes a SU propia organización.
-- ============================================================

create policy "taskvoice_avatars_select"

on storage.objects

for select

to authenticated

using (

    bucket_id = 'avatars'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 2

    and (storage.foldername(name))[1]
        = public.get_my_organization_id()::text

);



-- ============================================================
-- 16. AVATARS - INSERT
--
-- Cada usuario carga solamente su propio avatar.
-- ============================================================

create policy "taskvoice_avatars_insert"

on storage.objects

for insert

to authenticated

with check (

    bucket_id = 'avatars'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 2

    and (storage.foldername(name))[1]
        = public.get_my_organization_id()::text

    and (storage.foldername(name))[2]
        = auth.uid()::text

);



-- ============================================================
-- 17. AVATARS - UPDATE
-- ============================================================

create policy "taskvoice_avatars_update"

on storage.objects

for update

to authenticated

using (

    bucket_id = 'avatars'

    and (storage.foldername(name))[1]
        = public.get_my_organization_id()::text

    and (storage.foldername(name))[2]
        = auth.uid()::text

)

with check (

    bucket_id = 'avatars'

    and coalesce(
        array_length(storage.foldername(name), 1),
        0
    ) = 2

    and (storage.foldername(name))[1]
        = public.get_my_organization_id()::text

    and (storage.foldername(name))[2]
        = auth.uid()::text

);



-- ============================================================
-- 18. AVATARS - DELETE
-- ============================================================

create policy "taskvoice_avatars_delete"

on storage.objects

for delete

to authenticated

using (

    bucket_id = 'avatars'

    and (storage.foldername(name))[1]
        = public.get_my_organization_id()::text

    and (storage.foldername(name))[2]
        = auth.uid()::text

);


-- ============================================================
-- FIN DE 02_storage.sql
-- ============================================================