-- ============================================================
-- TASKVOICE
-- 15_worker_self_task.sql
--
-- AUTOCREACIÓN DE TAREA POR TÉCNICO
--
-- Reglas:
--
-- - solamente trabajador activo
-- - crea la tarea para sí mismo
-- - no recibe ningún user_id por parámetro
-- - organización obtenida desde profiles
-- - creado_por = auth.uid()
-- - asignado_a = auth.uid()
-- - único task_assignee = auth.uid()
-- - queda aceptada automáticamente
-- - después continúa con el flujo normal:
--       iniciar -> trabajar -> completar
-- ============================================================

begin;


create or replace function
public.create_my_task(

    p_titulo text,

    p_descripcion text default null,

    p_prioridad text default 'normal',

    p_fecha_limite date default null,

    p_hora_limite time without time zone default null,

    p_template_id bigint default null,

    p_location_id bigint default null,

    p_shift_id bigint default null,

    p_ticket_number text default null,

    p_maintenance_type_id bigint default null

)
returns bigint

language plpgsql

security definer

set search_path = ''

as $$

declare

    v_user_id uuid;

    v_organization_id uuid;

    v_role text;

    v_active boolean;

    v_task_id bigint;

begin


    -- ========================================================
    -- USUARIO AUTENTICADO
    -- ========================================================

    v_user_id :=
        auth.uid();


    if v_user_id is null then

        raise exception
        'TASKVOICE: usuario no autenticado.';

    end if;



    -- ========================================================
    -- PERFIL
    -- ========================================================

    select

        organization_id,

        rol,

        activo

    into

        v_organization_id,

        v_role,

        v_active

    from public.profiles

    where id =
        v_user_id;



    if not found
       or v_active is not true then

        raise exception
        'TASKVOICE: usuario inexistente o inactivo.';

    end if;



    -- ========================================================
    -- SOLO TÉCNICO / TRABAJADOR
    -- ========================================================

    if v_role <> 'trabajador' then

        raise exception
        'TASKVOICE: esta función está disponible solamente para técnicos.';

    end if;



    -- ========================================================
    -- ORGANIZACIÓN OBLIGATORIA
    -- ========================================================

    if v_organization_id is null then

        raise exception
        'TASKVOICE: el técnico no tiene una empresa asignada.';

    end if;



    -- ========================================================
    -- TÍTULO
    -- ========================================================

    if p_titulo is null
       or btrim(
            p_titulo
       ) = '' then

        raise exception
        'TASKVOICE: debe ingresar un título.';

    end if;



    -- ========================================================
    -- PRIORIDAD
    -- ========================================================

    if p_prioridad not in (

        'baja',

        'normal',

        'alta',

        'urgente'

    ) then

        raise exception
        'TASKVOICE: prioridad inválida.';

    end if;



    -- ========================================================
    -- PLANTILLA
    -- ========================================================

    if p_template_id is not null

       and not exists (

            select 1

            from public.task_templates tt

            where tt.id =
                p_template_id

            and tt.organization_id =
                v_organization_id

            and tt.activa =
                true

       ) then

        raise exception
        'TASKVOICE: plantilla inválida.';

    end if;



    -- ========================================================
    -- CATÁLOGOS
    --
    -- Reutilizamos exactamente la validación utilizada
    -- actualmente por create_task_multi().
    -- ========================================================

    perform
    public.validate_task_catalogs(

        v_organization_id,

        p_location_id,

        p_shift_id,

        p_maintenance_type_id

    );



    -- ========================================================
    -- CREAR TAREA
    --
    -- Inicialmente pendiente.
    --
    -- Luego utilizaremos accept_task() para convertirla
    -- correctamente a aceptada y reutilizar toda la lógica
    -- de estados que ya tenemos funcionando.
    -- ========================================================

    insert into public.tasks (

        organization_id,

        template_id,

        titulo,

        descripcion,

        creado_por,

        -- Compatibilidad con campo anterior.
        asignado_a,

        prioridad,

        estado,

        fecha_asignacion,

        fecha_limite,

        hora_limite,

        location_id,

        shift_id,

        ticket_number,

        maintenance_type_id

    )

    values (

        v_organization_id,

        p_template_id,

        btrim(
            p_titulo
        ),

        nullif(
            btrim(
                p_descripcion
            ),
            ''
        ),

        v_user_id,

        v_user_id,

        p_prioridad,

        'pendiente',

        now(),

        p_fecha_limite,

        p_hora_limite,

        p_location_id,

        p_shift_id,

        nullif(
            btrim(
                p_ticket_number
            ),
            ''
        ),

        p_maintenance_type_id

    )

    returning id

    into v_task_id;



    -- ========================================================
    -- AUTOASIGNACIÓN
    --
    -- No existe ningún parámetro de usuario.
    -- El técnico autenticado es obligatoriamente el único
    -- integrante de esta tarea.
    -- ========================================================

    insert into public.task_assignees (

        task_id,

        user_id

    )

    values (

        v_task_id,

        v_user_id

    );



    -- ========================================================
    -- AUTOACEPTAR
    --
    -- Reutilizamos accept_task() del flujo grupal ya validado.
    --
    -- Esto garantiza:
    -- - accepted_at
    -- - estado individual
    -- - estado global
    -- - sync_task_state()
    -- - triggers existentes
    -- ========================================================

    perform
    public.accept_task(
        v_task_id
    );



    -- ========================================================
    -- DEVOLVER ID
    -- ========================================================

    return
        v_task_id;


end;

$$;



-- ============================================================
-- SEGURIDAD
--
-- No exponemos la función a anon ni public.
-- El control de rol también está dentro de la función.
-- ============================================================

revoke all
on function
public.create_my_task(
    text,
    text,
    text,
    date,
    time without time zone,
    bigint,
    bigint,
    bigint,
    text,
    bigint
)
from public, anon;


grant execute
on function
public.create_my_task(
    text,
    text,
    text,
    date,
    time without time zone,
    bigint,
    bigint,
    bigint,
    text,
    bigint
)
to authenticated;


commit;