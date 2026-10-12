import * as SecureStore from "expo-secure-store";
import { fetch as expoFetch } from "expo/fetch";
import {
  File,
  Paths,
} from "expo-file-system";

export type AssistantLanguage =
  | "te"
  | "en";

export type GraniteAssistantResponse = {
  transcript?: string;
  answer?: string;
  language?: string;
  fact_type?: string;
  data_fields_referenced?: string[];
  disclaimer?: string;
  suggested_followups?: string[];
  audio_url?: string | null;
  [key: string]: unknown;
};

export type VoiceTranscription = {
  status?: string;
  text?: string;
  language?: string;
  confidence?: number;
  error?: string;
  [key: string]: unknown;
};

export type BlockAIContext = {
  block: Record<string, unknown>;
  analysis: Record<string, unknown>;
};

const LANGUAGE_KEY =
  "granitemeasure.mobile.language";

const SELECTED_USER_KEY =
  "granitemeasure.mobile.selectedUserId";

const RAW_API_BASE =
  process.env
    .EXPO_PUBLIC_API_URL
    ?.trim() ||
  "http://127.0.0.1:8000";

export const GRANITE_SERVER_ROOT =
  RAW_API_BASE
    .replace(
      /\/api\/v1\/?$/i,
      "",
    )
    .replace(
      /\/+$/,
      "",
    );

export const GRANITE_API_ROOT =
  `${GRANITE_SERVER_ROOT}/api/v1`;

async function selectedUserHeaders(
  base?: HeadersInit,
): Promise<Headers> {
  const headers =
    new Headers(base);

  const selectedUserId =
    await SecureStore
      .getItemAsync(
        SELECTED_USER_KEY,
      )
      .catch(
        () => null,
      );

  if (
    selectedUserId &&
    !headers.has(
      "x-selected-user-id",
    )
  ) {
    headers.set(
      "x-selected-user-id",
      selectedUserId,
    );
  }

  return headers;
}

async function parseFailure(
  response: Response,
): Promise<string> {
  const raw =
    await response
      .text()
      .catch(
        () => "",
      );

  if (!raw) {
    return `HTTP ${response.status}`;
  }

  try {
    const parsed =
      JSON.parse(raw) as {
        detail?: unknown;
        message?: unknown;
      };

    if (
      typeof parsed.detail ===
      "string"
    ) {
      return parsed.detail;
    }

    if (
      typeof parsed.message ===
      "string"
    ) {
      return parsed.message;
    }

    if (parsed.detail) {
      return JSON.stringify(
        parsed.detail,
      );
    }
  } catch {
    // Return the raw server error.
  }

  return raw;
}

async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs = 60_000,
): Promise<T> {
  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      timeoutMs,
    );

  try {
    const headers =
      await selectedUserHeaders(
        init.headers,
      );

    if (
      !headers.has(
        "Accept",
      )
    ) {
      headers.set(
        "Accept",
        "application/json",
      );
    }

    const response =
      await expoFetch(
        `${GRANITE_API_ROOT}${path}`,
        {
          ...init,
          headers,
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        await parseFailure(
          response,
        ),
      );
    }

    return (
      await response.json()
    ) as T;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "REQUEST_TIMEOUT",
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function saveAssistantLanguage(
  language: AssistantLanguage,
): Promise<void> {
  await SecureStore
    .setItemAsync(
      LANGUAGE_KEY,
      language,
    )
    .catch(
      () => undefined,
    );
}

export async function loadAssistantLanguage():
Promise<AssistantLanguage> {
  const saved =
    await SecureStore
      .getItemAsync(
        LANGUAGE_KEY,
      )
      .catch(
        () => null,
      );

  return saved === "en" ||
    saved === "te"
    ? saved
    : "te";
}

export async function loadBlockAIContext(
  blockId: string,
  language: AssistantLanguage,
): Promise<BlockAIContext> {
  const id =
    encodeURIComponent(
      blockId,
    );

  const [
    block,
    analysis,
  ] =
    await Promise.all([
      requestJson<
        Record<
          string,
          unknown
        >
      >(
        `/granite-blocks/${id}`,
      ),
      requestJson<
        Record<
          string,
          unknown
        >
      >(
        `/granite-blocks/${id}/analysis?language=${encodeURIComponent(
          language,
        )}`,
      ),
    ]);

  return {
    block,
    analysis,
  };
}

export async function askGraniteAIText(
  blockId: string,
  question: string,
  language: AssistantLanguage,
): Promise<GraniteAssistantResponse> {
  return requestJson<
    GraniteAssistantResponse
  >(
    `/granite-blocks/${encodeURIComponent(
      blockId,
    )}/ai-assistant?language=${encodeURIComponent(
      language,
    )}`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        question:
          question.trim(),
        language,
      }),
    },
    90_000,
  );
}

function recordingFile(
  audioUri: string,
): File {
  const file =
    new File(audioUri);

  const size =
    file.size ?? 0;

  if (
    !file.exists ||
    size < 256
  ) {
    throw new Error(
      "RECORDED_AUDIO_UNAVAILABLE",
    );
  }

  return file;
}

export async function transcribeGraniteVoice(
  audioUri: string,
  language: AssistantLanguage,
): Promise<VoiceTranscription> {
  const audioFile =
    recordingFile(
      audioUri,
    );

  const formData =
    new FormData();

  formData.append(
    "audio",
    audioFile,
  );

  const headers =
    await selectedUserHeaders({
      Accept:
        "application/json",
    });

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      120_000,
    );

  try {
    const response =
      await expoFetch(
        `${GRANITE_API_ROOT}/voice/transcribe?language=${encodeURIComponent(
          language,
        )}`,
        {
          method: "POST",
          headers,
          body: formData,
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        await parseFailure(
          response,
        ),
      );
    }

    const result =
      (
        await response.json()
      ) as VoiceTranscription;

    const status =
      typeof result.status ===
      "string"
        ? result.status
            .toUpperCase()
        : "";

    const text =
      typeof result.text ===
      "string"
        ? result.text.trim()
        : "";

    if (
      status &&
      status !==
        "SUCCESS"
    ) {
      throw new Error(
        result.error ||
          result.status ||
          "TRANSCRIPTION_FAILED",
      );
    }

    if (!text) {
      throw new Error(
        "NO_SPEECH_DETECTED",
      );
    }

    return {
      ...result,
      text,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "TRANSCRIPTION_TIMEOUT",
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function absoluteAudioUrl(
  value: string,
): string {
  if (
    /^https?:\/\//i.test(
      value,
    )
  ) {
    return value;
  }

  if (
    value.startsWith("/")
  ) {
    return (
      GRANITE_SERVER_ROOT +
      value
    );
  }

  return (
    `${GRANITE_API_ROOT}/${value}`
  );
}

export async function synthesizeGraniteReply(
  text: string,
  language: AssistantLanguage,
): Promise<string> {
  const trimmed =
    text.trim();

  if (!trimmed) {
    throw new Error(
      "TTS_TEXT_EMPTY",
    );
  }

  const headers =
    await selectedUserHeaders({
      Accept:
        "audio/mpeg,application/json",
      "Content-Type":
        "application/json",
    });

  const controller =
    new AbortController();

  const timer =
    setTimeout(
      () =>
        controller.abort(),
      90_000,
    );

  try {
    const response =
      await expoFetch(
        `${GRANITE_API_ROOT}/voice/synthesize`,
        {
          method: "POST",
          headers,
          body:
            JSON.stringify({
              text: trimmed,
              language,
            }),
          signal:
            controller.signal,
        },
      );

    if (!response.ok) {
      throw new Error(
        await parseFailure(
          response,
        ),
      );
    }

    const contentType =
      (
        response.headers.get(
          "content-type",
        ) || ""
      ).toLowerCase();

    if (
      contentType.includes(
        "application/json",
      )
    ) {
      const payload =
        (
          await response.json()
        ) as {
          audio_url?: unknown;
          url?: unknown;
        };

      const remote =
        typeof payload.audio_url ===
        "string"
          ? payload.audio_url
          : typeof payload.url ===
              "string"
            ? payload.url
            : "";

      if (!remote) {
        throw new Error(
          "TTS_AUDIO_URL_MISSING",
        );
      }

      return absoluteAudioUrl(
        remote,
      );
    }

    const bytes =
      await response.bytes();

    if (
      bytes.length < 128
    ) {
      throw new Error(
        "TTS_AUDIO_EMPTY",
      );
    }

    const target =
      new File(
        Paths.cache,
        `${language}-granite-ai-speech-${Date.now()}-${Math.random().toString(36).slice(2, 8)}.mp3`,
      );

    if (target.exists) {
      target.delete();
    }

    target.create();
    target.write(bytes);

    const size =
      target.size ?? 0;

    if (
      !target.exists ||
      size < 128
    ) {
      throw new Error(
        "TTS_CACHE_WRITE_FAILED",
      );
    }

    return target.uri;
  } catch (error) {
    if (
      error instanceof Error &&
      error.name ===
        "AbortError"
    ) {
      throw new Error(
        "TTS_TIMEOUT",
      );
    }

    throw error;
  } finally {
    clearTimeout(timer);
  }
}

export async function getVoiceCapabilities():
Promise<Record<string, unknown>> {
  return requestJson<
    Record<
      string,
      unknown
    >
  >(
    "/voice/capabilities",
    {},
    20_000,
  );
}
