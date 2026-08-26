// ============================================================
// TASKVOICE
// transcribe-execution
//
// Transcribe el audio privado de una ejecución utilizando
// OpenAI.
//
// Seguridad:
// - requiere usuario autenticado
// - trabajador: solo su propia ejecución
// - admin/supervisor: misma organización
// - GROQ_API_KEY solo existe en servidor
// ============================================================

import { createClient } from "npm:@supabase/supabase-js@2";

// ============================================================
// CORS
// ============================================================

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",

  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",

  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// ============================================================
// RESPUESTA JSON
// ============================================================

function jsonResponse(body: unknown, status = 200) {
  return new Response(
    JSON.stringify(body),

    {
      status,

      headers: {
        ...corsHeaders,

        "Content-Type": "application/json",
      },
    },
  );
}

// ============================================================
// MIME FALLBACK
// ============================================================

function getMimeType(fileName: string) {
  const extension = fileName.split(".").pop()?.toLowerCase();

  const mimeTypes: Record<string, string> = {
    webm: "audio/webm",

    mp4: "audio/mp4",

    m4a: "audio/mp4",

    mp3: "audio/mpeg",

    wav: "audio/wav",

    mpeg: "audio/mpeg",

    mpga: "audio/mpeg",
  };

  return mimeTypes[extension ?? ""] ?? "audio/webm";
}

// ============================================================
// FUNCIÓN
// ============================================================

Deno.serve(async (request: Request) => {
  // ====================================================
  // PREFLIGHT
  // ====================================================

  if (request.method === "OPTIONS") {
    return new Response("ok", {
      headers: corsHeaders,
    });
  }

  if (request.method !== "POST") {
    return jsonResponse(
      {
        error: "Método no permitido.",
      },
      405,
    );
  }

  try {
    // =================================================
    // VARIABLES
    // =================================================

    const supabaseUrl = Deno.env.get("SUPABASE_URL");

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");

    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    const openAiKey = Deno.env.get("GROQ_API_KEY");

    if (!supabaseUrl || !anonKey || !serviceRoleKey) {
      return jsonResponse(
        {
          error: "Configuración de Supabase incompleta.",
        },
        500,
      );
    }

    if (!openAiKey) {
      return jsonResponse(
        {
          error: "GROQ_API_KEY no configurada.",
        },
        500,
      );
    }

    // =================================================
    // AUTORIZACIÓN
    // =================================================

    const authHeader = request.headers.get("Authorization");

    if (!authHeader) {
      return jsonResponse(
        {
          error: "Usuario no autenticado.",
        },
        401,
      );
    }

    const token = authHeader.replace(/^Bearer\s+/i, "");

    const userClient = createClient(
      supabaseUrl,

      anonKey,

      {
        global: {
          headers: {
            Authorization: authHeader,
          },
        },

        auth: {
          persistSession: false,

          autoRefreshToken: false,
        },
      },
    );

    const {
      data: { user },
      error: userError,
    } = await userClient.auth.getUser(token);

    if (userError || !user) {
      return jsonResponse(
        {
          error: "Sesión inválida.",
        },
        401,
      );
    }

    // =================================================
    // BODY
    // =================================================

    const body = await request.json();

    const executionId = Number(body?.execution_id);

    if (!Number.isSafeInteger(executionId) || executionId <= 0) {
      return jsonResponse(
        {
          error: "execution_id inválido.",
        },
        400,
      );
    }

    // =================================================
    // CLIENTE ADMINISTRATIVO
    // =================================================

    const adminClient = createClient(
      supabaseUrl,

      serviceRoleKey,

      {
        auth: {
          persistSession: false,

          autoRefreshToken: false,
        },
      },
    );

    // =================================================
    // PERFIL
    // =================================================

    const { data: profile, error: profileError } = await adminClient

      .from("profiles")

      .select(
        `
                        id,
                        organization_id,
                        rol,
                        activo
                    `,
      )

      .eq("id", user.id)

      .single();

    if (profileError || !profile || !profile.activo) {
      return jsonResponse(
        {
          error: "Usuario inexistente o inactivo.",
        },
        403,
      );
    }

    // =================================================
    // EJECUCIÓN
    // =================================================

    const { data: execution, error: executionError } = await adminClient

      .from("task_executions")

      .select(
        `
                        id,
                        task_id,
                        user_id,
                        audio_path,
                        transcripcion
                    `,
      )

      .eq("id", executionId)

      .single();

    if (executionError || !execution) {
      return jsonResponse(
        {
          error: "Ejecución inexistente.",
        },
        404,
      );
    }

    // =================================================
    // SI YA EXISTE TRANSCRIPCIÓN
    // =================================================

    if (execution.transcripcion && execution.transcripcion.trim()) {
      return jsonResponse({
        ok: true,

        existing: true,

        execution_id: execution.id,

        transcription: execution.transcripcion,
      });
    }

    // =================================================
    // TAREA
    // =================================================

    const { data: task, error: taskError } = await adminClient

      .from("tasks")

      .select(
        `
                        id,
                        organization_id,
                        titulo,
                        ticket_number
                    `,
      )

      .eq("id", execution.task_id)

      .single();

    if (taskError || !task) {
      return jsonResponse(
        {
          error: "Tarea inexistente.",
        },
        404,
      );
    }

    // =================================================
    // MISMA ORGANIZACIÓN
    // =================================================

    if (task.organization_id !== profile.organization_id) {
      return jsonResponse(
        {
          error: "Acceso denegado.",
        },
        403,
      );
    }

    // =================================================
    // AUTORIZACIÓN INDIVIDUAL
    //
    // trabajador:
    // solo puede transcribir su propia ejecución.
    //
    // admin / supervisor:
    // puede actuar sobre ejecuciones de su empresa.
    // =================================================

    const privileged = profile.rol === "admin" || profile.rol === "supervisor";

    if (!privileged && execution.user_id !== user.id) {
      return jsonResponse(
        {
          error: "Esta ejecución pertenece a otro técnico.",
        },
        403,
      );
    }

    // =================================================
    // AUDIO
    // =================================================

    if (!execution.audio_path) {
      return jsonResponse(
        {
          error: "La ejecución no tiene audio.",
        },
        400,
      );
    }

    // =================================================
    // DESCARGAR AUDIO PRIVADO
    // =================================================

    const { data: audioBlob, error: audioError } = await adminClient.storage

      .from("audios")

      .download(execution.audio_path);

    if (audioError || !audioBlob) {
      console.error("Storage download error:", audioError);

      return jsonResponse(
        {
          error: "No fue posible obtener el audio.",
        },
        500,
      );
    }

    // =================================================
    // LÍMITE OPENAI
    // =================================================

    const maxBytes = 25 * 1024 * 1024;

    if (audioBlob.size > maxBytes) {
      return jsonResponse(
        {
          error: "El audio supera el límite permitido para transcripción.",
        },
        413,
      );
    }

    // =================================================
    // ARCHIVO
    // =================================================

    const fileName = execution.audio_path.split("/").pop() ?? "audio.webm";

    const mimeType = audioBlob.type || getMimeType(fileName);

    const audioFile = new File(
      [audioBlob],

      fileName,

      {
        type: mimeType,
      },
    );

    // =================================================
    // GROQ TRANSCRIPTION API
    // =================================================

    const formData = new FormData();

    formData.append("file", audioFile);

    formData.append("model", "whisper-large-v3-turbo");

    formData.append("language", "es");

    formData.append("response_format", "json");

    // -------------------------------------------------
    // Contexto para mejorar términos técnicos.
    // No le pedimos resumir:
    // necesitamos una transcripción fiel.
    // -------------------------------------------------

    formData.append(
      "prompt",

      [
        "Informe técnico de mantenimiento en español.",
        "Transcribir fielmente el audio.",
        "Conservar números, siglas, nombres de equipos,",
        "marcas, componentes, medidas y términos técnicos.",
        task.titulo ? `Tarea: ${task.titulo}.` : "",
        task.ticket_number ? `Ticket: ${task.ticket_number}.` : "",
      ]
        .filter(Boolean)
        .join(" "),
    );

    const groqResponse = await fetch(
      "https://api.groq.com/openai/v1/audio/transcriptions",

      {
        method: "POST",

        headers: {
          Authorization: `Bearer ${openAiKey}`,
        },

        body: formData,
      },
    );

    // =================================================
    // ERROR OPENAI
    // =================================================

    if (!groqResponse.ok) {
      const errorText = await groqResponse.text();

      console.error(
        "Groq transcription error:",

        groqResponse.status,

        errorText.slice(0, 500),
      );

      return jsonResponse(
        {
          error: "No fue posible transcribir el audio.",
        },
        502,
      );
    }

    const transcriptionResult = await groqResponse.json();

    const transcription = String(transcriptionResult?.text ?? "").trim();

    if (!transcription) {
      return jsonResponse(
        {
          error: "La transcripción fue devuelta vacía.",
        },
        502,
      );
    }

    // =================================================
    // GUARDAR
    // =================================================

    const { error: updateError } = await adminClient

      .from("task_executions")

      .update({
        transcripcion: transcription,
      })

      .eq("id", execution.id);

    if (updateError) {
      console.error("Error guardando transcripción:", updateError);

      return jsonResponse(
        {
          error: "La transcripción se generó pero no pudo guardarse.",
        },
        500,
      );
    }

    return jsonResponse({
      ok: true,

      existing: false,

      execution_id: execution.id,

      transcription,
    });
  } catch (error) {
    console.error("transcribe-execution:", error);

    return jsonResponse(
      {
        error: "Error interno de transcripción.",
      },
      500,
    );
  }
});
