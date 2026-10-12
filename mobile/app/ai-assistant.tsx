import * as ExpoRouter from "expo-router";
import React, {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import {
  useSafeAreaInsets,
} from "react-native-safe-area-context";
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  setIsAudioActiveAsync,
  useAudioPlaylist,
  useAudioPlaylistStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from "expo-audio";

import {
  askGraniteAIText,
  getVoiceCapabilities,
  loadAssistantLanguage,
  loadBlockAIContext,
  saveAssistantLanguage,
  synthesizeGraniteReply,
  transcribeGraniteVoice,
  type AssistantLanguage,
  type BlockAIContext,
} from "../lib/granite-voice";

type RouteParams = Record<
  string,
  string | string[] | undefined
>;

type RouterRuntime = {
  useLocalSearchParams:
    () => RouteParams;
};

const useLocalSearchParams = (
  ExpoRouter as unknown as RouterRuntime
).useLocalSearchParams;

const router =
  ExpoRouter.router;

const RECORDING_OPTIONS = {
  ...RecordingPresets
    .HIGH_QUALITY,
  isMeteringEnabled: true,
};

const MAX_RECORDING_MS =
  45_000;

const COPY = {
  te: {
    title: "గ్రానైట్ AI",
    ready:
      "మాట్లాడటానికి నొక్కండి",
    listening:
      "వింటున్నాను… మాట్లాడి, పూర్తయ్యాక మళ్లీ నొక్కండి",
    thinking:
      "అర్థం చేసుకుంటున్నాను…",
    speaking:
      "సమాధానం చెబుతున్నాను…",
    retry:
      "మళ్లీ ప్రయత్నించండి",
    replay:
      "మళ్లీ వినండి",
    placeholder:
      "ప్రశ్న టైప్ చేయండి…",
    noBlock:
      "విశ్లేషిత బ్లాక్‌ను ముందుగా తెరవండి.",
    micPermission:
      "మైక్రోఫోన్ అనుమతి అవసరం.",
    noSpeech:
      "మీ మాట స్పష్టంగా వినిపించలేదు. మళ్లీ మాట్లాడండి.",
    sttUnavailable:
      "వాయిస్ గుర్తింపు ప్రస్తుతం అందుబాటులో లేదు.",
    network:
      "బ్యాక్‌ఎండ్ కనెక్షన్ అందుబాటులో లేదు.",
    answerError:
      "సమాధానం పొందలేకపోయాం. మళ్లీ ప్రయత్నించండి.",
    voiceError:
      "సమాధానం వచ్చింది. వాయిస్ ప్లేబ్యాక్‌ను మళ్లీ ప్రయత్నించండి.",
    blockError:
      "బ్లాక్ విశ్లేషణను లోడ్ చేయలేకపోయాం.",
    youAsked:
      "మీ ప్రశ్న",
    answer:
      "సమాధానం",
    stop:
      "పూర్తయితే నొక్కండి",
  },
  en: {
    title: "Granite AI",
    ready:
      "Tap to speak",
    listening:
      "Listening… speak, then tap again when finished",
    thinking:
      "Understanding…",
    speaking:
      "Speaking…",
    retry:
      "Try again",
    replay:
      "Replay",
    placeholder:
      "Type a question…",
    noBlock:
      "Open an analyzed block first.",
    micPermission:
      "Microphone permission is required.",
    noSpeech:
      "I could not hear you clearly. Please try again.",
    sttUnavailable:
      "Voice recognition is unavailable.",
    network:
      "Backend connection is unavailable.",
    answerError:
      "Unable to get an answer. Please try again.",
    voiceError:
      "The answer is ready. Try voice playback again.",
    blockError:
      "Unable to load block analysis.",
    youAsked:
      "You asked",
    answer:
      "Answer",
    stop:
      "Tap when finished",
  },
} as const;

function firstParam(
  value:
    | string
    | string[]
    | undefined,
): string {
  return Array.isArray(value)
    ? value[0] || ""
    : value || "";
}

function cleanText(
  value: unknown,
): string {
  return typeof value ===
    "string"
    ? value.trim()
    : "";
}



type ResolvedAnswer = {
  text: string;
  speech: string;
  source:
    | "instant"
    | "evidence"
    | "reasoned";
  intent: AssistantIntent;
  evidence: string[];
  followups: string[];
};

function asRecord(
  value: unknown,
): Record<string, unknown> | null {
  return value &&
    typeof value === "object" &&
    !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asArray(
  value: unknown,
): unknown[] {
  return Array.isArray(value)
    ? value
    : [];
}

function finiteNumber(
  value: unknown,
): number | null {
  if (
    typeof value === "number" &&
    Number.isFinite(value)
  ) {
    return value;
  }

  if (
    typeof value === "string" &&
    value.trim()
  ) {
    const parsed =
      Number(value);

    return Number.isFinite(parsed)
      ? parsed
      : null;
  }

  return null;
}

function firstNumber(
  record: Record<string, unknown> | null,
  keys: string[],
): number | null {
  if (!record) {
    return null;
  }

  for (const key of keys) {
    const value =
      finiteNumber(
        record[key],
      );

    if (value !== null) {
      return value;
    }
  }

  return null;
}

function firstText(
  record: Record<string, unknown> | null,
  keys: string[],
): string {
  if (!record) {
    return "";
  }

  for (const key of keys) {
    const value =
      cleanText(
        record[key],
      );

    if (value) {
      return value;
    }
  }

  return "";
}

function roundSmart(
  value: number,
  digits = 2,
): string {
  return value
    .toFixed(digits)
    .replace(
      /\.?0+$/,
      "",
    );
}

function formatCm(
  value: number,
): string {
  return `${roundSmart(
    value,
    1,
  )} cm`;
}

function formatM3(
  value: number,
): string {
  return `${roundSmart(
    value,
    4,
  )} m³`;
}

function formatPct(
  value: number,
): string {
  return `${roundSmart(
    value,
    1,
  )}%`;
}

function stringList(
  value: unknown,
): string[] {
  return asArray(value)
    .map(
      (item) =>
        typeof item ===
        "string"
          ? item.trim()
          : "",
    )
    .filter(Boolean);
}

function objectList(
  value: unknown,
): Record<string, unknown>[] {
  return asArray(value)
    .map(asRecord)
    .filter(
      (
        item,
      ): item is Record<
        string,
        unknown
      > => Boolean(item),
    );
}

function languageFollowups(
  intent: AssistantIntent,
  language: AssistantLanguage,
): string[] {
  const te =
    language === "te";

  switch (intent) {
    case "measurement":
      return te
        ? [
            "ఈ కొలతల నమ్మక స్థాయి ఎంత?",
            "కట్టింగ్ తర్వాత ఉపయోగకర పరిమాణం ఎంత?",
          ]
        : [
            "How reliable are these measurements?",
            "What is the usable size after cutting?",
          ];
    case "cutting":
      return te
        ? [
            "ఈ దిశను ఎందుకు ఎంచుకున్నారు?",
            "రికవరీ మరియు వేస్టేజ్ ఎంత?",
          ]
        : [
            "Why was this orientation selected?",
            "What are the recovery and wastage?",
          ];
    case "wastage":
      return te
        ? [
            "వేస్టేజ్‌కు ప్రధాన కారణం ఏమిటి?",
            "రికవరీ పెంచే ప్రత్యామ్నాయం ఉందా?",
          ]
        : [
            "What is causing the wastage?",
            "Is there a higher-recovery alternative?",
          ];
    case "defects":
      return te
        ? [
            "ఈ లోపాలు కట్టింగ్‌పై ఎలా ప్రభావితం చేస్తాయి?",
            "ఏ ఫోటోలో లోపం కనిపించింది?",
          ]
        : [
            "How do these defects affect cutting?",
            "Which photo shows the defect?",
          ];
    case "surfaces":
      return te
        ? [
            "ఏ ఉపరితలం మళ్లీ క్యాప్చర్ చేయాలి?",
            "3D మోడల్ ఎంత పూర్తి అయింది?",
          ]
        : [
            "Which surface should I recapture?",
            "How complete is the 3D evidence?",
          ];
    case "confidence":
      return te
        ? [
            "నమ్మకాన్ని ఎలా మెరుగుపరచాలి?",
            "ఏ డేటా ఇంకా లేదు?",
          ]
        : [
            "How can I improve confidence?",
            "What evidence is still missing?",
          ];
    default:
      return te
        ? [
            "కొలతలు చెప్పండి",
            "కట్టింగ్ మరియు వేస్టేజ్ చెప్పండి",
          ]
        : [
            "Tell me the measurements",
            "Explain cutting and wastage",
          ];
  }
}

function evidenceAnswerFromContext(
  question: string,
  context: BlockAIContext | null,
  language: AssistantLanguage,
): ResolvedAnswer | null {
  if (!context) {
    return null;
  }

  const intent =
    assistantIntent(
      question,
    );

  const analysis =
    asRecord(
      context.analysis,
    );

  if (!analysis) {
    return null;
  }

  const measurement =
    asRecord(
      analysis.measurement,
    );

  const cutting =
    asRecord(
      analysis.cutting,
    );

  const wastage =
    asRecord(
      analysis.wastage,
    );

  const defects =
    asRecord(
      analysis.defects,
    );

  const reconstruction =
    asRecord(
      analysis.reconstruction_quality,
    );

  const geometry =
    asRecord(
      analysis.geometry,
    );

  const boundingBox =
    asRecord(
      geometry?.bounding_box_json,
    );

  const digitalTwin =
    asRecord(
      analysis.digital_twin,
    );

  const te =
    language === "te";

  const unavailable =
    te
      ? "ఈ విలువకు ధృవీకరించిన విశ్లేషణ డేటా ఇంకా అందుబాటులో లేదు."
      : "Verified analysis data for that value is not available yet.";

  if (
    intent === "measurement"
  ) {
    const length =
      firstNumber(
        measurement,
        [
          "length_cm",
          "length",
        ],
      );
    const breadth =
      firstNumber(
        measurement,
        [
          "breadth_cm",
          "width_cm",
          "breadth",
          "width",
        ],
      );
    const height =
      firstNumber(
        measurement,
        [
          "height_cm",
          "height",
        ],
      );
    const volume =
      firstNumber(
        measurement,
        [
          "volume_m3",
          "raw_volume_m3",
        ],
      );
    const confidence =
      firstNumber(
        measurement,
        [
          "confidence",
          "measurement_confidence",
          "confidence_score",
        ],
      );

    if (
      length === null ||
      breadth === null ||
      height === null
    ) {
      return {
        text: unavailable,
        speech: unavailable,
        source: "evidence",
        intent,
        evidence: [
          te
            ? "కొలతల రికార్డు"
            : "Measurement record",
        ],
        followups:
          languageFollowups(
            intent,
            language,
          ),
      };
    }

    const confidenceText =
      confidence !== null
        ? confidence <= 1
          ? formatPct(
              confidence *
                100,
            )
          : formatPct(
              confidence,
            )
        : "";

    const detail =
      te
        ? `ఈ బ్లాక్ కొలతలు ${formatCm(
            length,
          )} × ${formatCm(
            breadth,
          )} × ${formatCm(
            height,
          )}.` +
          (
            volume !== null
              ? ` నమోదైన రా వాల్యూమ్ ${formatM3(
                  volume,
                )}.`
              : ""
          ) +
          (
            confidenceText
              ? ` కొలత నమ్మక స్థాయి ${confidenceText}.`
              : ""
          )
        : `This block measures ${formatCm(
            length,
          )} × ${formatCm(
            breadth,
          )} × ${formatCm(
            height,
          )}.` +
          (
            volume !== null
              ? ` The recorded raw volume is ${formatM3(
                  volume,
                )}.`
              : ""
          ) +
          (
            confidenceText
              ? ` Measurement confidence is ${confidenceText}.`
              : ""
          );

    return {
      text: detail,
      speech:
        speechSafeText(
          detail,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "నేరుగా MeasurementResult నుంచి"
          : "Direct MeasurementResult",
        volume !== null
          ? te
            ? "రా వాల్యూమ్ లింక్ అయింది"
            : "Raw volume linked"
          : te
            ? "వాల్యూమ్ అందుబాటులో లేదు"
            : "Volume unavailable",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "volume") {
    const volume =
      firstNumber(
        measurement,
        [
          "volume_m3",
          "raw_volume_m3",
        ],
      );

    if (volume === null) {
      return null;
    }

    const response =
      te
        ? `ఈ బ్లాక్‌కు నమోదైన రా వాల్యూమ్ ${formatM3(
            volume,
          )}. ఇది బ్యాక్‌ఎండ్ కొలత రికార్డు నుంచి తీసుకున్న విలువ.`
        : `The recorded raw volume is ${formatM3(
            volume,
          )}. This comes directly from the backend measurement record.`;

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "రా వాల్యూమ్"
          : "Raw volume",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "wastage") {
    const scenarios =
      asRecord(
        cutting?.scenarios,
      );

    const confirmed =
      asRecord(
        cutting?.confirmed_case,
      ) ||
      asRecord(
        scenarios?.CONFIRMED_DAMAGE,
      );

    const wastePct =
      firstNumber(
        confirmed,
        [
          "waste_percentage",
        ],
      ) ??
      firstNumber(
        cutting,
        [
          "wastage_percentage",
          "waste_percentage",
        ],
      ) ??
      firstNumber(
        wastage,
        [
          "waste_percentage",
        ],
      );

    const recoveryPct =
      firstNumber(
        confirmed,
        [
          "recovery_yield_percentage",
          "yield_percentage",
        ],
      ) ??
      firstNumber(
        cutting,
        [
          "yield_percentage",
          "recovery_yield_percentage",
        ],
      );

    const usable =
      firstNumber(
        confirmed,
        [
          "usable_volume_m3",
        ],
      ) ??
      firstNumber(
        cutting,
        [
          "usable_volume_m3",
        ],
      );

    if (
      wastePct === null &&
      recoveryPct === null &&
      usable === null
    ) {
      return null;
    }

    const parts: string[] =
      [];

    if (recoveryPct !== null) {
      parts.push(
        te
          ? `రికవరీ యీల్డ్ ${formatPct(
              recoveryPct,
            )}`
          : `recovery yield is ${formatPct(
              recoveryPct,
            )}`,
      );
    }

    if (wastePct !== null) {
      parts.push(
        te
          ? `అంచనా వేస్టేజ్ ${formatPct(
              wastePct,
            )}`
          : `estimated wastage is ${formatPct(
              wastePct,
            )}`,
      );
    }

    if (usable !== null) {
      parts.push(
        te
          ? `ఉపయోగకర వాల్యూమ్ ${formatM3(
              usable,
            )}`
          : `usable volume is ${formatM3(
              usable,
            )}`,
      );
    }

    const response =
      te
        ? `ధృవీకరించిన కట్టింగ్ కేసు ప్రకారం ${parts.join(
            ", ",
          )}.`
        : `For the confirmed cutting case, ${parts.join(
            ", ",
          )}.`;

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "కట్టింగ్ confirmed case"
          : "Confirmed cutting case",
        te
          ? "వేస్టేజ్ రికార్డు"
          : "Wastage record",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "cutting") {
    const orientation =
      firstText(
        cutting,
        [
          "recommended_orientation",
          "orientation",
        ],
      );

    const params =
      asRecord(
        cutting?.parameters,
      );

    const dressed =
      asRecord(
        cutting?.final_dressed_dimensions,
      ) ||
      asRecord(
        params?.final_dressed_dimensions,
      );

    const dl =
      firstNumber(
        dressed,
        [
          "length_cm",
        ],
      );
    const db =
      firstNumber(
        dressed,
        [
          "breadth_cm",
          "width_cm",
        ],
      );
    const dh =
      firstNumber(
        dressed,
        [
          "height_cm",
        ],
      );

    const steps =
      objectList(
        cutting?.cutting_steps ??
          params?.cutting_steps,
      );

    if (
      !orientation &&
      dl === null &&
      steps.length === 0
    ) {
      return null;
    }

    const lines: string[] =
      [];

    if (orientation) {
      lines.push(
        te
          ? `సిఫార్సు చేసిన కట్టింగ్ దిశ ${orientation}.`
          : `The recommended cutting orientation is ${orientation}.`,
      );
    }

    if (
      dl !== null &&
      db !== null &&
      dh !== null
    ) {
      lines.push(
        te
          ? `అంచనా డ్రెస్డ్ పరిమాణం ${formatCm(
              dl,
            )} × ${formatCm(
              db,
            )} × ${formatCm(
              dh,
            )}.`
          : `The estimated dressed size is ${formatCm(
              dl,
            )} × ${formatCm(
              db,
            )} × ${formatCm(
              dh,
            )}.`,
      );
    }

    const reasons =
      steps
        .map(
          (step) =>
            firstText(
              step,
              [
                "reason",
                "why",
              ],
            ),
        )
        .filter(Boolean)
        .slice(0, 2);

    if (reasons.length) {
      lines.push(
        te
          ? `కట్ కారణం: ${reasons.join(
              " ",
            )}`
          : `Why: ${reasons.join(
              " ",
            )}`,
      );
    }

    const response =
      lines.join(" ");

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "కట్టింగ్ ఆప్టిమైజర్"
          : "Cutting optimizer",
        steps.length
          ? te
            ? `${steps.length} కట్టింగ్ దశలు`
            : `${steps.length} cutting steps`
          : te
            ? "కట్టింగ్ దశలు లేవు"
            : "No cutting steps recorded",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "defects") {
    const visible =
      objectList(
        defects?.visible_defects,
      );

    const bottom =
      firstText(
        defects,
        [
          "bottom_surface",
        ],
      );

    const internal =
      defects?.internal_defects_claimed;

    if (
      visible.length === 0 &&
      !bottom &&
      typeof internal !==
        "boolean"
    ) {
      return null;
    }

    const names =
      visible
        .map(
          (item) =>
            firstText(
              item,
              [
                "type",
                "kind",
                "category",
              ],
            ),
        )
        .filter(Boolean)
        .slice(0, 3);

    let response =
      te
        ? `${visible.length} కనిపించే లోపాలు రికార్డ్ అయ్యాయి.`
        : `${visible.length} visible defect${
            visible.length === 1
              ? ""
              : "s"
          } were recorded.`;

    if (names.length) {
      response +=
        te
          ? ` ప్రధానంగా: ${names.join(
              ", ",
            )}.`
          : ` Reported types include ${names.join(
              ", ",
            )}.`;
    }

    if (bottom) {
      response +=
        te
          ? ` బాటమ్ ఉపరితలం: ${bottom}.`
          : ` Bottom surface: ${bottom}.`;
    }

    if (internal === false) {
      response +=
        te
          ? " కనిపించని అంతర్గత లోపాలను AI ధృవీకరించలేదు."
          : " The AI does not claim unseen internal defects.";
    }

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "కనిపించే ఫోటో ఆధారాలు"
          : "Visible photo evidence",
        te
          ? "అంతర్గత లోపాలు ఊహించబడవు"
          : "No inferred internal defects",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "surfaces") {
    const observed =
      stringList(
        reconstruction
          ?.observed_surfaces,
      ).length
        ? stringList(
            reconstruction
              ?.observed_surfaces,
          )
        : stringList(
            boundingBox
              ?.observed_surfaces,
          );

    const missing =
      stringList(
        reconstruction
          ?.missing_surfaces,
      ).length
        ? stringList(
            reconstruction
              ?.missing_surfaces,
          )
        : stringList(
            boundingBox
              ?.missing_surfaces,
          );

    const rawMesh =
      digitalTwin
        ?.raw_irregular_mesh_available ===
      true;

    if (
      observed.length === 0 &&
      missing.length === 0 &&
      !rawMesh
    ) {
      return null;
    }

    const response =
      te
        ? `${
            observed.length
              ? `కనిపించిన ఉపరితలాలు: ${observed.join(
                  ", ",
                )}. `
              : ""
          }${
            missing.length
              ? `కనిపించని ఉపరితలాలు: ${missing.join(
                  ", ",
                )}. `
              : ""
          }${
            rawMesh
              ? "రా irregular 3D mesh అందుబాటులో ఉంది."
              : "రా 3D mesh ఇంకా అందుబాటులో లేదు."
          } కనిపించని ఉపరితలాలను సిస్టమ్ తయారు చేయదు.`
        : `${
            observed.length
              ? `Observed surfaces: ${observed.join(
                  ", ",
                )}. `
              : ""
          }${
            missing.length
              ? `Unobserved surfaces: ${missing.join(
                  ", ",
                )}. `
              : ""
          }${
            rawMesh
              ? "A raw irregular 3D mesh is available."
              : "A raw 3D mesh is not yet available."
          } Unobserved surfaces are not fabricated.`;

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "రీకన్‌స్ట్రక్షన్ evidence"
          : "Reconstruction evidence",
        te
          ? "open-boundary policy"
          : "Open-boundary policy",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "confidence") {
    const measurementConfidence =
      firstNumber(
        measurement,
        [
          "confidence",
          "measurement_confidence",
          "confidence_score",
        ],
      );

    const reconConfidence =
      firstNumber(
        geometry,
        [
          "reconstruction_confidence",
          "confidence",
        ],
      );

    const targetMet =
      reconstruction
        ?.target_met;

    const pieces: string[] =
      [];

    if (
      measurementConfidence !==
      null
    ) {
      pieces.push(
        te
          ? `కొలత నమ్మకం ${
              measurementConfidence <=
              1
                ? formatPct(
                    measurementConfidence *
                      100,
                  )
                : formatPct(
                    measurementConfidence,
                  )
            }`
          : `measurement confidence ${
              measurementConfidence <=
              1
                ? formatPct(
                    measurementConfidence *
                      100,
                  )
                : formatPct(
                    measurementConfidence,
                  )
            }`,
      );
    }

    if (
      reconConfidence !== null
    ) {
      pieces.push(
        te
          ? `రీకన్‌స్ట్రక్షన్ నమ్మకం ${
              reconConfidence <=
              1
                ? formatPct(
                    reconConfidence *
                      100,
                  )
                : formatPct(
                    reconConfidence,
                  )
            }`
          : `reconstruction confidence ${
              reconConfidence <=
              1
                ? formatPct(
                    reconConfidence *
                      100,
                  )
                : formatPct(
                    reconConfidence,
                  )
            }`,
      );
    }

    if (
      typeof targetMet ===
      "boolean"
    ) {
      pieces.push(
        te
          ? `90% shape validation ${
              targetMet
                ? "చేరింది"
                : "ఇంకా చేరలేదు"
            }`
          : `90% shape-validation target ${
              targetMet
                ? "is met"
                : "is not yet met"
            }`,
      );
    }

    if (!pieces.length) {
      return null;
    }

    const response =
      te
        ? `${pieces.join(
            ", ",
          )}. ఇవి బ్యాక్‌ఎండ్‌లో ఉన్న ధృవీకరించిన confidence ఫీల్డ్స్ మాత్రమే; లేని శాతాన్ని AI ఊహించదు.`
        : `${pieces.join(
            ", ",
          )}. These are only backend-reported confidence fields; the assistant does not invent missing percentages.`;

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "confidence fields మాత్రమే"
          : "Backend confidence fields only",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  if (intent === "summary") {
    const length =
      firstNumber(
        measurement,
        [
          "length_cm",
        ],
      );
    const breadth =
      firstNumber(
        measurement,
        [
          "breadth_cm",
          "width_cm",
        ],
      );
    const height =
      firstNumber(
        measurement,
        [
          "height_cm",
        ],
      );
    const volume =
      firstNumber(
        measurement,
        [
          "volume_m3",
        ],
      );

    const scenarios =
      asRecord(
        cutting?.scenarios,
      );

    const confirmed =
      asRecord(
        cutting?.confirmed_case,
      ) ||
      asRecord(
        scenarios?.CONFIRMED_DAMAGE,
      );

    const recovery =
      firstNumber(
        confirmed,
        [
          "recovery_yield_percentage",
        ],
      );

    const waste =
      firstNumber(
        confirmed,
        [
          "waste_percentage",
        ],
      ) ??
      firstNumber(
        wastage,
        [
          "waste_percentage",
        ],
      );

    const visible =
      objectList(
        defects?.visible_defects,
      );

    const missing =
      stringList(
        reconstruction
          ?.missing_surfaces,
      );

    const lines: string[] =
      [];

    if (
      length !== null &&
      breadth !== null &&
      height !== null
    ) {
      lines.push(
        te
          ? `కొలతలు ${formatCm(
              length,
            )} × ${formatCm(
              breadth,
            )} × ${formatCm(
              height,
            )}.`
          : `Measurements are ${formatCm(
              length,
            )} × ${formatCm(
              breadth,
            )} × ${formatCm(
              height,
            )}.`,
      );
    }

    if (volume !== null) {
      lines.push(
        te
          ? `రా వాల్యూమ్ ${formatM3(
              volume,
            )}.`
          : `Raw volume is ${formatM3(
              volume,
            )}.`,
      );
    }

    if (
      recovery !== null ||
      waste !== null
    ) {
      lines.push(
        te
          ? `${
              recovery !== null
                ? `రికవరీ ${formatPct(
                    recovery,
                  )}`
                : ""
            }${
              recovery !== null &&
              waste !== null
                ? ", "
                : ""
            }${
              waste !== null
                ? `వేస్టేజ్ ${formatPct(
                    waste,
                  )}`
                : ""
            }.`
          : `${
              recovery !== null
                ? `Recovery is ${formatPct(
                    recovery,
                  )}`
                : ""
            }${
              recovery !== null &&
              waste !== null
                ? "; "
                : ""
            }${
              waste !== null
                ? `wastage is ${formatPct(
                    waste,
                  )}`
                : ""
            }.`,
      );
    }

    if (visible.length) {
      lines.push(
        te
          ? `${visible.length} కనిపించే లోపాలు రికార్డ్ అయ్యాయి.`
          : `${visible.length} visible defect${
              visible.length ===
              1
                ? ""
                : "s"
            } were recorded.`,
      );
    }

    if (missing.length) {
      lines.push(
        te
          ? `కనిపించని ఉపరితలాలు: ${missing.join(
              ", ",
            )}.`
          : `Unobserved surfaces: ${missing.join(
              ", ",
            )}.`,
      );
    }

    if (!lines.length) {
      return null;
    }

    const response =
      lines.join(" ");

    return {
      text: response,
      speech:
        speechSafeText(
          response,
          language,
        ),
      source: "evidence",
      intent,
      evidence: [
        te
          ? "ఎంచుకున్న బ్లాక్ live analysis"
          : "Selected block live analysis",
      ],
      followups:
        languageFollowups(
          intent,
          language,
        ),
    };
  }

  return null;
}


function speechChunks(
  text: string,
  language: AssistantLanguage,
): string[] {
  const clean =
    speechSafeText(
      text,
      language,
    );

  if (!clean) {
    return [];
  }

  const MAX_CHARS = 135;

  const sentences =
    clean
      .split(
        /(?<=[.!?।])\s+/u,
      )
      .map(
        (part) =>
          part.trim(),
      )
      .filter(Boolean);

  const units =
    sentences.length
      ? sentences
      : [clean];

  const chunks: string[] =
    [];

  const pushWords = (
    value: string,
  ) => {
    const words =
      value
        .split(/\s+/u)
        .filter(Boolean);

    let current = "";

    for (const word of words) {
      const next =
        current
          ? `${current} ${word}`
          : word;

      if (
        next.length >
          MAX_CHARS &&
        current
      ) {
        chunks.push(
          current,
        );
        current = word;
      } else {
        current = next;
      }
    }

    if (current) {
      chunks.push(
        current,
      );
    }
  };

  for (const unit of units) {
    if (
      unit.length <=
      MAX_CHARS
    ) {
      const previous =
        chunks[
          chunks.length - 1
        ];

      if (
        previous &&
        (
          previous.length +
          1 +
          unit.length
        ) <=
          MAX_CHARS
      ) {
        chunks[
          chunks.length - 1
        ] =
          `${previous} ${unit}`;
      } else {
        chunks.push(unit);
      }

      continue;
    }

    const clauses =
      unit
        .split(
          /(?<=[,;:])\s+/u,
        )
        .map(
          (part) =>
            part.trim(),
        )
        .filter(Boolean);

    for (const clause of clauses) {
      if (
        clause.length <=
        MAX_CHARS
      ) {
        chunks.push(
          clause,
        );
      } else {
        pushWords(
          clause,
        );
      }
    }
  }

  return chunks
    .filter(Boolean)
    .slice(0, 5);
}

function voiceBrief(
  text: string,
  language: AssistantLanguage,
): string {
  const clean =
    speechSafeText(
      text,
      language,
    );

  if (
    clean.length <= 430
  ) {
    return clean;
  }

  const sentences =
    clean
      .split(
        /(?<=[.!?])\s+/u,
      )
      .filter(Boolean)
      .slice(0, 3)
      .join(" ");

  return `${sentences} ${
    language === "te"
      ? "మరిన్ని వివరాలు స్క్రీన్‌పై ఉన్నాయి."
      : "More detail is shown on screen."
  }`;
}

type AssistantIntent =
  | "conversation"
  | "measurement"
  | "volume"
  | "cutting"
  | "wastage"
  | "defects"
  | "surfaces"
  | "confidence"
  | "summary"
  | "domain"
  | "unknown";

function plainAssistantText(
  value: string,
): string {
  return value
    .replace(
      /```[\s\S]*?```/g,
      " ",
    )
    .replace(
      /[`*_#>|~]+/g,
      " ",
    )
    .replace(
      /^\s*[-•]\s+/gm,
      "",
    )
    .replace(
      /^\s*\d+[.)]\s+/gm,
      "",
    )
    .replace(
      /\[([^\]]+)\]\([^)]+\)/g,
      "$1",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .trim();
}

function speechSafeText(
  value: string,
  language: AssistantLanguage,
): string {
  let result =
    plainAssistantText(
      value,
    );

  // Do not speak raw database UUIDs. They are useful to machines,
  // but sound terrible and add no value to a voice response.
  result = result.replace(
    /\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi,
    language === "te"
      ? "ఈ బ్లాక్"
      : "this block",
  );

  result = result
    .replace(
      /\bL\s*[×x]\s*B\s*[×x]\s*H\b/gi,
      language === "te"
        ? "పొడవు బై వెడల్పు బై ఎత్తు"
        : "length by breadth by height",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*m³/gi,
      language === "te"
        ? "$1 ఘన మీటర్లు"
        : "$1 cubic meters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*cm³/gi,
      language === "te"
        ? "$1 ఘన సెంటీమీటర్లు"
        : "$1 cubic centimeters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*m²/gi,
      language === "te"
        ? "$1 చదరపు మీటర్లు"
        : "$1 square meters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*cm²/gi,
      language === "te"
        ? "$1 చదరపు సెంటీమీటర్లు"
        : "$1 square centimeters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*cm\b/gi,
      language === "te"
        ? "$1 సెంటీమీటర్లు"
        : "$1 centimeters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*m\b/gi,
      language === "te"
        ? "$1 మీటర్లు"
        : "$1 meters",
    )
    .replace(
      /(\d+(?:\.\d+)?)\s*%/g,
      language === "te"
        ? "$1 శాతం"
        : "$1 percent",
    )
    .replace(
      /[×x]/g,
      " by ",
    )
    .replace(
      /[()[\]{}]/g,
      ", ",
    )
    .replace(
      /[:;]+/g,
      ". ",
    )
    .replace(
      /\s+/g,
      " ",
    )
    .replace(
      /\s+([,.!?])/g,
      "$1",
    )
    .trim();

  return result;
}

function assistantIntent(
  question: string,
): AssistantIntent {
  const q =
    question
      .trim()
      .toLocaleLowerCase();

  const greeting =
    /^(hi|hii+|hello|hey|good\s+(morning|afternoon|evening)|నమస్కారం|హాయ్|హలో|హే)[.!?\s]*$/iu;

  const thanks =
    /^(thanks|thank you|thankyou|ధన్యవాదాలు|థ్యాంక్స్)[.!?\s]*$/iu;

  const wellbeing =
    /(how are you|how r u|ఎలా ఉన్నావు|ఎలా ఉన్నారు)/iu;

  const identity =
    /(who are you|what are you|నువ్వెవరు|మీరు ఎవరు)/iu;

  const capabilities =
    /(what can you do|help me|help|ఏం చేయగలవు|ఏమి చేయగలవు|సహాయం)/iu;

  if (
    greeting.test(q) ||
    thanks.test(q) ||
    wellbeing.test(q) ||
    identity.test(q) ||
    capabilities.test(q)
  ) {
    return "conversation";
  }

  if (
    /(dimension|dimensions|measurement|measurements|length|breadth|width|height|size|కొలత|కొలతలు|పొడవు|వెడల్పు|ఎత్తు|సైజ్|సైజు)/iu.test(
      q,
    )
  ) {
    return "measurement";
  }

  if (
    /(volume|cubic|ఘనపరిమాణం|వాల్యూమ్)/iu.test(
      q,
    )
  ) {
    return "volume";
  }

  if (
    /(cut|cutting|dress|dressing|orientation|slice|కట్|కట్టింగ్|దిశ|కోయాలి|కోయడం|కత్తిరించ|డ్రెస్సింగ్)/iu.test(
      q,
    )
  ) {
    return "cutting";
  }

  if (
    /(waste|wastage|recovery|yield|వేస్ట్|వేస్టేజ్|రికవరీ|యీల్డ్|వ్యర్థం|వృథా)/iu.test(
      q,
    )
  ) {
    return "wastage";
  }

  if (
    /(defect|defects|crack|cracks|hole|holes|damage|లోపం|లోపాలు|పగులు|పగుళ్లు|రంధ్రం|చీలిక|గుంత)/iu.test(
      q,
    )
  ) {
    return "defects";
  }

  if (
    /(surface|surfaces|observed|unobserved|bottom|top|front|back|left|right|ఉపరితలం|ఉపరితలాలు|కనిపించ|కనిపించలేదు|కింద భాగం|పై భాగం|వైపు|ముఖం)/iu.test(
      q,
    )
  ) {
    return "surfaces";
  }

  if (
    /(confidence|accuracy|reliable|reliability|uncertainty|ఖచ్చితత్వం|నమ్మదగిన|కాన్ఫిడెన్స్)/iu.test(
      q,
    )
  ) {
    return "confidence";
  }

  if (
    /(summary|summarize|overview|everything|all details|సారాంశం|మొత్తం వివరాలు|అన్నీ)/iu.test(
      q,
    )
  ) {
    return "summary";
  }

  if (
    /(granite|block|quarry|analysis|3d|mesh|model|seigniorage|గ్రానైట్|బ్లాక్|క్వారీ|విశ్లేషణ|సీగ్నియరేజ్)/iu.test(
      q,
    )
  ) {
    return "domain";
  }

  return "unknown";
}


function normalizeSpokenQuestion(
  value: string,
  language: AssistantLanguage,
): string {
  let text =
    value
      .normalize("NFC")
      .replace(
        /\s+/gu,
        " ",
      )
      .trim();

  if (
    language !== "te" ||
    !text
  ) {
    return text;
  }

  const replacements: Array<
    [RegExp, string]
  > = [
    [
      /\bgranite\b/giu,
      "గ్రానైట్",
    ],
    [
      /\bblock\b/giu,
      "బ్లాక్",
    ],
    [
      /\b(?:measurement|measurements|dimensions?)\b/giu,
      "కొలతలు",
    ],
    [
      /\blength\b/giu,
      "పొడవు",
    ],
    [
      /\b(?:breadth|width)\b/giu,
      "వెడల్పు",
    ],
    [
      /\bheight\b/giu,
      "ఎత్తు",
    ],
    [
      /\bvolume\b/giu,
      "వాల్యూమ్",
    ],
    [
      /\b(?:cut|cutting)\b/giu,
      "కట్టింగ్",
    ],
    [
      /\bwastage?\b/giu,
      "వేస్టేజ్",
    ],
    [
      /\brecovery\b/giu,
      "రికవరీ",
    ],
    [
      /\bdefects?\b/giu,
      "లోపాలు",
    ],
    [
      /\bcracks?\b/giu,
      "పగుళ్లు",
    ],
    [
      /గ్రానైటు|గ్రానైట|గ్రానైట్‌/giu,
      "గ్రానైట్",
    ],
    [
      /మెజర్[‌-]?మెంట్స్?|మెజర్మెంట్స్?|డైమెన్షన్స్?/giu,
      "కొలతలు",
    ],
    [
      /లెంగ్త్|లెంథ్/giu,
      "పొడవు",
    ],
    [
      /విడ్త్|బ్రెడ్త్|బ్రెడ్[‌-]?త్/giu,
      "వెడల్పు",
    ],
    [
      /హైట్/giu,
      "ఎత్తు",
    ],
    [
      /వాల్యుమ్|వాల్యూం|వోల్యూమ్/giu,
      "వాల్యూమ్",
    ],
    [
      /కటింగ్|కట్టింగు/giu,
      "కట్టింగ్",
    ],
    [
      /వేస్టేజి|వేస్టేజీ/giu,
      "వేస్టేజ్",
    ],
    [
      /రికవరి/giu,
      "రికవరీ",
    ],
    [
      /డిఫెక్ట్స్?|డిఫెక్టు/giu,
      "లోపాలు",
    ],
    [
      /క్రాక్స్?|క్రాక్/giu,
      "పగుళ్లు",
    ],
    [
      /సర్[‌-]?ఫేస్|సర్ఫేస్/giu,
      "ఉపరితలం",
    ],
    [
      /బాటమ్|బాటం/giu,
      "కింద ఉపరితలం",
    ],
    [
      /టాప్/giu,
      "పై ఉపరితలం",
    ],
  ];

  for (
    const [
      pattern,
      replacement,
    ] of replacements
  ) {
    text = text.replace(
      pattern,
      replacement,
    );
  }

  return text
    .replace(
      /\s+/gu,
      " ",
    )
    .trim();
}

function sttQuality(
  value: unknown,
): number | null {
  const numeric =
    finiteNumber(value);

  if (numeric === null) {
    return null;
  }

  return Math.max(
    0,
    Math.min(
      1,
      numeric,
    ),
  );
}

function localAssistantReply(
  question: string,
  language: AssistantLanguage,
): string | null {
  const q =
    question
      .trim()
      .toLocaleLowerCase();

  if (
    /^(hi|hii+|hello|hey|good\s+(morning|afternoon|evening)|నమస్కారం|హాయ్|హలో|హే)[.!?\s]*$/iu.test(
      q,
    )
  ) {
    return language === "te"
      ? "నమస్కారం. నేను గ్రానైట్ AI. మీకు ఎలా సహాయం చేయగలను?"
      : "Hi. I’m Granite AI. How can I help?";
  }

  if (
    /^(thanks|thank you|thankyou|ధన్యవాదాలు|థ్యాంక్స్)[.!?\s]*$/iu.test(
      q,
    )
  ) {
    return language === "te"
      ? "సంతోషం. ఇంకేమైనా కావాలంటే అడగండి."
      : "You’re welcome. Ask me anything else about this block.";
  }

  if (
    /(how are you|how r u|ఎలా ఉన్నావు|ఎలా ఉన్నారు)/iu.test(
      q,
    )
  ) {
    return language === "te"
      ? "నేను సిద్ధంగా ఉన్నాను. ఈ గ్రానైట్ బ్లాక్ గురించి ఏమి తెలుసుకోవాలనుకుంటున్నారు?"
      : "I’m ready. What would you like to know about this granite block?";
  }

  if (
    /(who are you|what are you|నువ్వెవరు|మీరు ఎవరు)/iu.test(
      q,
    )
  ) {
    return language === "te"
      ? "నేను గ్రానైట్ AI సహాయకుడిని. ఈ బ్లాక్ కొలతలు, 3D ఆధారాలు, లోపాలు, కట్టింగ్, రికవరీ మరియు వేస్టేజ్ గురించి సమాధానం చెబుతాను."
      : "I’m Granite AI. I can explain this block’s measurements, 3D evidence, defects, cutting, recovery, and wastage.";
  }

  if (
    /(what can you do|help me|^help$|ఏం చేయగలవు|ఏమి చేయగలవు|సహాయం)/iu.test(
      q,
    )
  ) {
    return language === "te"
      ? "మీరు సహజంగా మాట్లాడండి. ఉదాహరణకు, ఈ బ్లాక్ కొలతలు ఎంత, ఎక్కడ కట్ చేయాలి, వేస్టేజ్ ఎంత, లేదా ఏ ఉపరితలం కనిపించలేదు అని అడగండి."
      : "Speak naturally. For example, ask for the measurements, where to cut, the expected wastage, or which surfaces were not observed.";
  }

  return null;
}

function answerKeywords(
  intent: AssistantIntent,
): RegExp | null {
  switch (intent) {
    case "measurement":
      return /(extent|dimension|measurement|length|breadth|width|height|cm\b|meter|కొలత|పొడవు|వెడల్పు|ఎత్తు)/iu;
    case "volume":
      return /(volume|m³|cubic|వాల్యూమ్|ఘనపరిమాణం)/iu;
    case "cutting":
      return /(cut|cutting|dress|orientation|recommended|solver|కట్|కట్టింగ్|దిశ|సాల్వర్)/iu;
    case "wastage":
      return /(waste|wastage|recovery|yield|వేస్ట్|వేస్టేజ్|రికవరీ|యీల్డ్)/iu;
    case "defects":
      return /(defect|crack|hole|damage|finding|లోపం|లోపాలు|పగులు|రంధ్రం)/iu;
    case "surfaces":
      return /(surface|observed|unobserved|bottom|top|front|back|left|right|ఉపరితలం|కనిపించ)/iu;
    case "confidence":
      return /(confidence|accuracy|reliable|uncertainty|percent|ఖచ్చితత్వం|నమ్మదగిన|కాన్ఫిడెన్స్)/iu;
    default:
      return null;
  }
}

function focusedAssistantAnswer(
  question: string,
  rawAnswer: string,
  language: AssistantLanguage,
): string {
  const cleaned =
    plainAssistantText(
      rawAnswer,
    );

  if (!cleaned) {
    return cleaned;
  }

  const intent =
    assistantIntent(
      question,
    );

  if (
    intent === "summary" ||
    intent === "domain"
  ) {
    return cleaned;
  }

  const keywords =
    answerKeywords(
      intent,
    );

  if (!keywords) {
    return cleaned;
  }

  const chunks =
    rawAnswer
      .split(
        /\n+|(?<=[.!?])\s+/u,
      )
      .map(
        (item) =>
          plainAssistantText(
            item,
          ),
      )
      .filter(Boolean);

  const matches =
    chunks.filter(
      (item) =>
        keywords.test(item),
    );

  if (!matches.length) {
    return cleaned;
  }

  const unique =
    Array.from(
      new Set(matches),
    );

  const limit =
    intent === "measurement" ||
    intent === "cutting"
      ? 3
      : 2;

  const focused =
    unique
      .slice(0, limit)
      .join(" ");

  return focused ||
    cleaned;
}

function hasTelugu(
  text: string,
): boolean {
  return /[\u0C00-\u0C7F]/
    .test(text);
}

function capabilitiesOkay(
  payload:
    Record<string, unknown>,
): boolean {
  return (
    payload
      .stt_whisper_available ===
      true &&
    payload
      .tts_edge_available ===
      true
  );
}

function mapError(
  error: unknown,
  language:
    AssistantLanguage,
): string {
  const copy =
    COPY[language];

  const raw =
    error instanceof Error
      ? error.message
      : String(
          error ?? "",
        );

  const upper =
    raw.toUpperCase();

  if (
    upper.includes(
      "NO_SPEECH",
    )
  ) {
    return copy.noSpeech;
  }

  if (
    upper.includes(
      "WHISPER",
    ) ||
    upper.includes(
      "TRANSCRIPTION",
    )
  ) {
    return copy.sttUnavailable;
  }

  if (
    upper.includes(
      "PERMISSION",
    ) ||
    upper.includes(
      "MICROPHONE",
    )
  ) {
    return copy.micPermission;
  }

  if (
    upper.includes(
      "NETWORK",
    ) ||
    upper.includes(
      "FETCH",
    ) ||
    upper.includes(
      "TIMEOUT",
    )
  ) {
    return copy.network;
  }

  return (
    raw ||
    copy.answerError
  );
}

export default function GraniteAIScreen() {
  const params =
    useLocalSearchParams();

  const insets =
    useSafeAreaInsets();

  const blockId =
    firstParam(
      params.blockId,
    );

  const routeBlockCode =
    firstParam(
      params.blockCode,
    );

  const routeLanguage =
    firstParam(
      params.language,
    );

  const autoVoice =
    firstParam(
      params.voice,
    ) === "1";

  const [
    language,
    setLanguage,
  ] =
    useState<
      AssistantLanguage
    >(
      routeLanguage === "en"
        ? "en"
        : "te",
    );

  const [
    blockCode,
    setBlockCode,
  ] =
    useState(
      routeBlockCode,
    );

  const [
    contextReady,
    setContextReady,
  ] =
    useState(false);

  const [
    loadingContext,
    setLoadingContext,
  ] =
    useState(
      Boolean(blockId),
    );

  const [
    blockContext,
    setBlockContext,
  ] =
    useState<BlockAIContext | null>(
      null,
    );

  const [
    answerSource,
    setAnswerSource,
  ] =
    useState<
      ResolvedAnswer["source"] | null
    >(null);

  const [
    evidenceTags,
    setEvidenceTags,
  ] =
    useState<string[]>([]);

  const [
    followups,
    setFollowups,
  ] =
    useState<string[]>([]);

  const [
    voiceReady,
    setVoiceReady,
  ] =
    useState<
      boolean | null
    >(null);

  const [
    input,
    setInput,
  ] =
    useState("");

  const [
    transcript,
    setTranscript,
  ] =
    useState("");

  const [
    answer,
    setAnswer,
  ] =
    useState("");

  const [
    error,
    setError,
  ] =
    useState<
      string | null
    >(null);

  const [
    processing,
    setProcessing,
  ] =
    useState(false);

  const [
    preparingSpeech,
    setPreparingSpeech,
  ] =
    useState(false);

  const [
    lastSpeechText,
    setLastSpeechText,
  ] =
    useState("");


  const recorder =
    useAudioRecorder(
      RECORDING_OPTIONS as never,
    );

  const recorderState =
    useAudioRecorderState(
      recorder,
      80,
    );

  const speechPlayer =
    useAudioPlaylist({
      sources: [],
      loop: "none",
      updateInterval: 120,
    });

  const speechStatus =
    useAudioPlaylistStatus(
      speechPlayer,
    );

  const speaking =
    speechStatus.playing ===
    true;

  const stoppingRef =
    useRef(false);


  const autoStartedRef =
    useRef(false);


  const pulse =
    useSharedValue(0);

  const copy =
    COPY[language];

  const phase:
    | "idle"
    | "listening"
    | "thinking"
    | "speaking" =
    recorderState
      .isRecording
      ? "listening"
      : speaking
        ? "speaking"
        : processing ||
            preparingSpeech
          ? "thinking"
          : "idle";

  const meter =
    typeof recorderState
      .metering ===
      "number"
      ? Math.max(
          0,
          Math.min(
            1,
            (
              recorderState
                .metering +
              65
            ) /
              55,
          ),
        )
      : 0;

  useEffect(() => {
    void setIsAudioActiveAsync(
      true,
    ).catch(
      () => undefined,
    );

    void setAudioModeAsync({
      playsInSilentMode: true,
      allowsRecording: false,
      shouldRouteThroughEarpiece:
        false,
      interruptionMode:
        "doNotMix",
    }).catch(
      () => undefined,
    );
  }, []);

  useEffect(() => {
    if (
      routeLanguage ===
        "te" ||
      routeLanguage ===
        "en"
    ) {
      setLanguage(
        routeLanguage,
      );
      return;
    }

    void loadAssistantLanguage()
      .then(
        setLanguage,
      )
      .catch(
        () => undefined,
      );
  }, [
    routeLanguage,
  ]);

  useEffect(() => {
    void saveAssistantLanguage(
      language,
    );
  }, [
    language,
  ]);

  useEffect(() => {
    let active = true;

    void getVoiceCapabilities()
      .then(
        (payload) => {
          if (!active) {
            return;
          }

          setVoiceReady(
            capabilitiesOkay(
              payload,
            ),
          );
        },
      )
      .catch(
        () => {
          if (active) {
            setVoiceReady(
              false,
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!blockId) {
      setContextReady(
        false,
      );
      setLoadingContext(
        false,
      );
      return;
    }

    let active = true;

    setLoadingContext(
      true,
    );

    void loadBlockAIContext(
      blockId,
      language,
    )
      .then(
        (result) => {
          if (!active) {
            return;
          }

          const code =
            cleanText(
              result
                .block
                .block_code,
            );

          if (code) {
            setBlockCode(
              code,
            );
          }

          setBlockContext(
            result,
          );
          setContextReady(
            true,
          );
          setError(null);
        },
      )
      .catch(
        () => {
          if (!active) {
            return;
          }

          setBlockContext(
            null,
          );
          setContextReady(
            false,
          );
          setError(
            copy.blockError,
          );
        },
      )
      .finally(
        () => {
          if (active) {
            setLoadingContext(
              false,
            );
          }
        },
      );

    return () => {
      active = false;
    };
  }, [
    blockId,
    copy.blockError,
    language,
  ]);

  useEffect(() => {
    pulse.value =
      phase === "idle"
        ? withTiming(
            0,
            {
              duration: 180,
            },
          )
        : withRepeat(
            withTiming(
              1,
              {
                duration:
                  phase ===
                  "listening"
                    ? 650
                    : 950,
                easing:
                  Easing
                    .inOut(
                      Easing.quad,
                    ),
              },
            ),
            -1,
            true,
          );
  }, [
    phase,
    pulse,
  ]);

  const pulseStyle =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            pulse.value,
            [0, 1],
            [0.12, 0.46],
          ),
        transform: [
          {
            scale:
              interpolate(
                pulse.value,
                [0, 1],
                [0.94, 1.25],
              ),
          },
        ],
      }),
    );

  const preparePlayback =
    useCallback(
      async () => {
        // Recording has already stopped before this is called.
        // Switch the iOS session from microphone mode to playback mode
        // without globally deactivating the audio subsystem/player.
        await setAudioModeAsync({
          playsInSilentMode:
            true,
          allowsRecording:
            false,
          shouldRouteThroughEarpiece:
            false,
          interruptionMode:
            "doNotMix",
        });

        await setIsAudioActiveAsync(
          true,
        );

        // Give AVAudioSession a short moment to apply the speaker route.
        await new Promise<void>(
          (resolve) =>
            setTimeout(
              resolve,
              160,
            ),
        );
      },
      [],
    );

  const playSpeech =
    useCallback(
      async (
        text: string,
        speakLanguage:
          AssistantLanguage =
          language,
      ) => {
        const value =
          text.trim();

        if (!value) {
          return;
        }

        setPreparingSpeech(
          true,
        );
        setError(null);
        setLastSpeechText(
          value,
        );

        try {
          const chunks =
            speechChunks(
              value,
              speakLanguage,
            );

          if (!chunks.length) {
            throw new Error(
              "TTS_TEXT_EMPTY",
            );
          }

          // Generate short speech segments in parallel. Short MP3 files are
          // substantially more reliable on iOS than one long dynamic MP3,
          // and Expo AudioPlaylist plays them continuously in order.
          const uris =
            await Promise.all(
              chunks.map(
                (chunk) =>
                  synthesizeGraniteReply(
                    chunk,
                    speakLanguage,
                  ),
              ),
            );

          await preparePlayback();

          speechPlayer.pause();
          speechPlayer.clear();

          for (const uri of uris) {
            speechPlayer.add({
              uri,
            });
          }

          speechPlayer.volume =
            1;

          speechPlayer.play();

          setPreparingSpeech(
            false,
          );
        } catch (cause) {
          setPreparingSpeech(
            false,
          );

          const detail =
            cause instanceof Error
              ? cause.message
              : String(
                  cause ?? "",
                );

          setError(
            detail
              ? `${copy.voiceError} (${detail})`
              : copy.voiceError,
          );
        }
      },
      [
        copy.voiceError,
        language,
        preparePlayback,
        speechPlayer,
      ],
    );

  useEffect(() => {
    if (
      !speechStatus
        .didJustFinish
    ) {
      return;
    }

    if (
      speechStatus
        .trackCount > 0 &&
      speechStatus
        .currentIndex >=
        speechStatus
          .trackCount -
          1
    ) {
      setPreparingSpeech(
        false,
      );
    }
  }, [
    speechStatus
      .currentIndex,
    speechStatus
      .didJustFinish,
    speechStatus
      .trackCount,
  ]);

  const resolveAssistantAnswer =
    useCallback(
      async (
        question: string,
      ): Promise<ResolvedAnswer> => {
        const intent =
          assistantIntent(
            question,
          );

        const local =
          localAssistantReply(
            question,
            language,
          );

        if (local) {
          return {
            text: local,
            speech:
              speechSafeText(
                local,
                language,
              ),
            source:
              "instant",
            intent:
              "conversation",
            evidence: [],
            followups:
              languageFollowups(
                "conversation",
                language,
              ),
          };
        }

        // First use structured persisted analysis when the intent maps to
        // a field we can answer deterministically. This is both faster and
        // more accurate than asking the generic Q&A layer to summarize.
        const direct =
          evidenceAnswerFromContext(
            question,
            blockContext,
            language,
          );

        if (direct) {
          return direct;
        }

        if (
          intent === "unknown"
        ) {
          const response =
            language === "te"
              ? "మీ ప్రశ్నను గ్రానైట్ విశ్లేషణకు సంబంధించి కొంచెం స్పష్టంగా అడగండి. ఉదాహరణకు కొలతలు, 3D, లోపాలు, కట్టింగ్, రికవరీ, వేస్టేజ్ లేదా నమ్మక స్థాయి గురించి అడగవచ్చు."
              : "Please make the question a little more specific to the granite analysis. You can ask about measurements, 3D evidence, defects, cutting, recovery, wastage, or confidence.";

          return {
            text: response,
            speech:
              speechSafeText(
                response,
                language,
              ),
            source:
              "instant",
            intent,
            evidence: [],
            followups:
              languageFollowups(
                intent,
                language,
              ),
          };
        }

        const response =
          await askGraniteAIText(
            blockId,
            question,
            language,
          );

        let responseText =
          cleanText(
            response.answer,
          );

        if (
          language === "te" &&
          responseText &&
          !hasTelugu(
            responseText,
          )
        ) {
          const retry =
            await askGraniteAIText(
              blockId,
              question,
              "te",
            );

          const retryText =
            cleanText(
              retry.answer,
            );

          if (retryText) {
            responseText =
              retryText;
          }
        }

        if (!responseText) {
          throw new Error(
            "ANSWER_EMPTY",
          );
        }

        const focused =
          focusedAssistantAnswer(
            question,
            responseText,
            language,
          );

        const backendEvidence =
          Array.isArray(
            response
              .data_fields_referenced,
          )
            ? response
                .data_fields_referenced
                .filter(
                  (
                    item,
                  ): item is string =>
                    typeof item ===
                    "string" &&
                    Boolean(
                      item.trim(),
                    ),
                )
                .slice(0, 3)
            : [];

        const backendFollowups =
          Array.isArray(
            response
              .suggested_followups,
          )
            ? response
                .suggested_followups
                .filter(
                  (
                    item,
                  ): item is string =>
                    typeof item ===
                    "string" &&
                    Boolean(
                      item.trim(),
                    ),
                )
                .slice(0, 2)
            : [];

        return {
          text:
            plainAssistantText(
              focused,
            ),
          speech:
            voiceBrief(
              focused,
              language,
            ),
          source:
            "reasoned",
          intent,
          evidence:
            backendEvidence.length
              ? backendEvidence
              : [
                  language === "te"
                    ? "బ్యాక్‌ఎండ్ విశ్లేషణ ఆధారంగా"
                    : "Backend-grounded analysis",
                ],
          followups:
            backendFollowups.length
              ? backendFollowups
              : languageFollowups(
                  intent,
                  language,
                ),
        };
      },
      [
        blockContext,
        blockId,
        language,
      ],
    );

  const askQuestion =
    useCallback(
      async (
        question: string,
      ) => {
        const value =
          question.trim();

        if (
          !value ||
          !blockId ||
          !contextReady
        ) {
          return;
        }

        setProcessing(
          true,
        );
        setTranscript(
          value,
        );
        setAnswer("");
        setAnswerSource(
          null,
        );
        setEvidenceTags([]);
        setFollowups([]);
        setError(null);

        try {
          const resolved =
            await resolveAssistantAnswer(
              value,
            );

          setAnswer(
            resolved.text,
          );
          setAnswerSource(
            resolved.source,
          );
          setEvidenceTags(
            resolved.evidence,
          );
          setFollowups(
            resolved.followups,
          );

          setProcessing(
            false,
          );

          await playSpeech(
            resolved.speech,
            language,
          );
        } catch (cause) {
          setProcessing(
            false,
          );
          setError(
            mapError(
              cause,
              language,
            ),
          );
        }
      },
      [
        blockId,
        contextReady,
        language,
        playSpeech,
        resolveAssistantAnswer,
      ],
    );

  const startListening =
    useCallback(
      async () => {
        if (
          !contextReady ||
          processing ||
          preparingSpeech ||
          recorderState
            .isRecording
        ) {
          return;
        }

        if (
          voiceReady ===
          false
        ) {
          setError(
            copy.sttUnavailable,
          );
          return;
        }

        setError(null);
        setTranscript("");
        setAnswer("");
        setAnswerSource(
          null,
        );
        setEvidenceTags([]);
        setFollowups([]);

        try {
          if (speaking) {
            speechPlayer.pause();
          }

          setLastSpeechText(
            "",
          );

          const permission =
            await AudioModule
              .requestRecordingPermissionsAsync();

          if (
            !permission.granted
          ) {
            setError(
              copy.micPermission,
            );
            return;
          }

          await setIsAudioActiveAsync(
            false,
          ).catch(
            () => undefined,
          );

          await setAudioModeAsync({
            playsInSilentMode:
              true,
            allowsRecording:
              true,
            shouldRouteThroughEarpiece:
              false,
            interruptionMode:
              "doNotMix",
          });


          await recorder
            .prepareToRecordAsync();

          recorder.record();
        } catch (cause) {
          setError(
            mapError(
              cause,
              language,
            ),
          );
        }
      },
      [
        contextReady,
        copy.micPermission,
        copy.sttUnavailable,
        language,
        speechPlayer,
        preparingSpeech,
        processing,
        recorder,
        recorderState
          .isRecording,
        speaking,
        voiceReady,
      ],
    );

  const stopAndSend =
    useCallback(
      async () => {
        if (
          !recorderState
            .isRecording ||
          stoppingRef.current
        ) {
          return;
        }

        stoppingRef.current =
          true;
        setProcessing(
          true,
        );
        setError(null);

        try {
          await recorder.stop();

          const uri =
            recorder.uri;

          if (!uri) {
            throw new Error(
              "RECORDED_AUDIO_UNAVAILABLE",
            );
          }

          await preparePlayback();

          const stt =
            await transcribeGraniteVoice(
              uri,
              language,
            );

          const heard =
            normalizeSpokenQuestion(
              cleanText(
                stt.text,
              ),
              language,
            );

          if (!heard) {
            throw new Error(
              "NO_SPEECH_DETECTED",
            );
          }

          setTranscript(
            heard,
          );

          const quality =
            sttQuality(
              stt
                .transcription_quality,
            );

          const heardIntent =
            assistantIntent(
              heard,
            );

          // A weak Telugu transcript must never be converted into a confident
          // but unrelated granite answer. Ask for a repeat only when both the
          // acoustic quality is weak and the intent is still unknown.
          if (
            language === "te" &&
            quality !== null &&
            quality < 0.1 &&
            heardIntent ===
              "unknown"
          ) {
            const clarification =
              "సరిగ్గా వినలేకపోయాను. మరోసారి కొంచెం స్పష్టంగా చెప్పండి.";

            setAnswer(
              clarification,
            );
            setAnswerSource(
              "instant",
            );
            setEvidenceTags([]);
            setFollowups([]);

            setProcessing(
              false,
            );

            await playSpeech(
              clarification,
              "te",
            );

            return;
          }

          const resolved =
            await resolveAssistantAnswer(
              heard,
            );

          setAnswer(
            resolved.text,
          );
          setAnswerSource(
            resolved.source,
          );
          setEvidenceTags(
            resolved.evidence,
          );
          setFollowups(
            resolved.followups,
          );

          setProcessing(
            false,
          );

          await playSpeech(
            resolved.speech,
            language,
          );
        } catch (cause) {
          setProcessing(
            false,
          );
          setError(
            mapError(
              cause,
              language,
            ),
          );
        } finally {
          stoppingRef.current =
            false;
        }
      },
      [
        blockId,
        language,
        playSpeech,
        preparePlayback,
        recorder,
        recorderState
          .isRecording,
        resolveAssistantAnswer,
      ],
    );

  useEffect(() => {
    if (
      !recorderState
        .isRecording ||
      stoppingRef.current
    ) {
      return;
    }

    // Do not auto-send on silence. Telugu has natural pauses that were
    // being mistaken for end-of-speech. The user taps once to start and
    // taps again to send. Only the safety timeout remains.
    if (
      recorderState
        .durationMillis >=
      MAX_RECORDING_MS
    ) {
      void stopAndSend();
    }
  }, [
    recorderState
      .durationMillis,
    recorderState
      .isRecording,
    stopAndSend,
  ]);

  useEffect(() => {
    if (
      !autoVoice ||
      autoStartedRef.current ||
      !contextReady ||
      loadingContext ||
      voiceReady !== true
    ) {
      return;
    }

    autoStartedRef.current =
      true;

    const timer =
      setTimeout(
        () => {
          void startListening();
        },
        450,
      );

    return () =>
      clearTimeout(timer);
  }, [
    autoVoice,
    contextReady,
    loadingContext,
    startListening,
    voiceReady,
  ]);

  const pressOrb =
    useCallback(
      () => {
        if (
          processing ||
          preparingSpeech ||
          !contextReady
        ) {
          return;
        }

        if (
          recorderState
            .isRecording
        ) {
          void stopAndSend();
          return;
        }

        if (speaking) {
          speechPlayer.pause();
        }

        void startListening();
      },
      [
        contextReady,
        speechPlayer,
        preparingSpeech,
        processing,
        recorderState
          .isRecording,
        speaking,
        startListening,
        stopAndSend,
      ],
    );

  const toggleLanguage =
    useCallback(
      () => {
        const next:
          AssistantLanguage =
          language === "te"
            ? "en"
            : "te";

        setLanguage(
          next,
        );
        setError(null);

        void saveAssistantLanguage(
          next,
        );
      },
      [
        language,
      ],
    );

  const submitText =
    useCallback(
      () => {
        const value =
          input.trim();

        if (!value) {
          return;
        }

        setInput("");
        void askQuestion(
          value,
        );
      },
      [
        askQuestion,
        input,
      ],
    );

  const status =
    loadingContext
      ? language === "te"
        ? "లోడ్ అవుతోంది…"
        : "Loading…"
      : phase ===
          "listening"
        ? copy.listening
        : phase ===
            "thinking"
          ? copy.thinking
          : phase ===
              "speaking"
            ? copy.speaking
            : copy.ready;

  const pulseBars =
    Array.from({
      length: 13,
    });

  return (
    <View
      style={
        styles.screen
      }
    >
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={
          Platform.OS ===
          "ios"
            ? "padding"
            : undefined
        }
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[
            styles.content,
            {
              paddingTop:
                Math.max(
                  insets.top,
                  12,
                ),
              paddingBottom:
                Math.max(
                  insets.bottom,
                  12,
                ) + 20,
            },
          ]}
        >
          <View
            style={
              styles.header
            }
          >
            <Pressable
              onPress={() =>
                router.back()
              }
              style={
                styles.back
              }
            >
              <Text
                style={
                  styles.backText
                }
              >
                ‹
              </Text>
            </Pressable>

            <View
              style={
                styles.headerCenter
              }
            >
              <Text
                style={
                  styles.title
                }
              >
                {copy.title}
              </Text>

              <Text
                numberOfLines={
                  1
                }
                style={
                  styles.block
                }
              >
                {blockCode ||
                  blockId ||
                  copy.noBlock}
              </Text>
            </View>

            <Pressable
              onPress={
                toggleLanguage
              }
              style={
                styles.lang
              }
            >
              <Text
                style={
                  styles.langText
                }
              >
                {language ===
                "te"
                  ? "TE"
                  : "EN"}
              </Text>
            </Pressable>
          </View>

          <View
            style={
              styles.assistant
            }
          >
            <View
              style={
                styles.orbWrap
              }
            >
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.pulse,
                  pulseStyle,
                ]}
              />

              <NeuralOrbit
                phase={phase}
              />

              <Pressable
                onPress={
                  pressOrb
                }
                disabled={
                  !contextReady ||
                  processing ||
                  preparingSpeech
                }
                style={[
                  styles.orb,
                  phase ===
                    "listening" &&
                    styles
                      .orbListening,
                  phase ===
                    "speaking" &&
                    styles
                      .orbSpeaking,
                  (
                    !contextReady ||
                    processing ||
                    preparingSpeech
                  ) &&
                    styles.disabled,
                ]}
              >
                {phase ===
                "listening" ? (
                  <MicIcon />
                ) : (
                  <Text
                    style={
                      styles.spark
                    }
                  >
                    ✦
                  </Text>
                )}
              </Pressable>
            </View>

            <Text
              style={
                styles.status
              }
            >
              {status}
            </Text>

            <View
              style={
                styles.contextRibbon
              }
            >
              <View
                style={
                  styles.contextDot
                }
              />
              <Text
                style={
                  styles.contextRibbonText
                }
              >
                {language === "te"
                  ? "TELUGU DOMAIN · LIVE EVIDENCE"
                  : "LIVE EVIDENCE · CONTEXT LINKED"}
              </Text>
            </View>

            {phase ===
            "listening" ? (
              <Text
                style={
                  styles.helper
                }
              >
                {copy.stop}
              </Text>
            ) : null}

            <View
              style={
                styles.wave
              }
            >
              {pulseBars.map(
                (
                  _,
                  index,
                ) => (
                  <WaveBar
                    key={
                      index
                    }
                    index={
                      index
                    }
                    meter={
                      meter
                    }
                    listening={
                      phase ===
                      "listening"
                    }
                    speaking={
                      phase ===
                      "speaking"
                    }
                  />
                ),
              )}
            </View>
          </View>

          {transcript ? (
            <View
              style={
                styles.userCard
              }
            >
              <Text
                style={
                  styles.label
                }
              >
                {copy.youAsked}
              </Text>

              <Text
                style={
                  styles.userText
                }
              >
                {transcript}
              </Text>
            </View>
          ) : null}

          {answer ? (
            <View
              style={
                styles.answerCard
              }
            >
              <View
                style={
                  styles.answerTop
                }
              >
                <View
                  style={
                    styles.answerIdentity
                  }
                >
                  <View
                    style={
                      styles.answerSpark
                    }
                  >
                    <Text
                      style={
                        styles.answerSparkText
                      }
                    >
                      ✦
                    </Text>
                  </View>

                  <View>
                    <Text
                      style={
                        styles.answerLabel
                      }
                    >
                      {copy.answer}
                    </Text>

                    <Text
                      style={
                        styles.answerSourceText
                      }
                    >
                      {answerSource ===
                      "evidence"
                        ? language ===
                          "te"
                          ? "DIRECT EVIDENCE"
                          : "DIRECT EVIDENCE"
                        : answerSource ===
                            "reasoned"
                          ? language ===
                            "te"
                            ? "EVIDENCE REASONING"
                            : "EVIDENCE REASONING"
                          : language ===
                              "te"
                            ? "INSTANT RESPONSE"
                            : "INSTANT RESPONSE"}
                    </Text>
                  </View>
                </View>

                {!speaking &&
                !processing &&
                !preparingSpeech ? (
                  <Pressable
                    onPress={() =>
                      void playSpeech(
                        voiceBrief(
                          answer,
                          language,
                        ),
                        language,
                      )
                    }
                    style={
                      styles.replay
                    }
                  >
                    <Text
                      style={
                        styles.replayText
                      }
                    >
                      {copy.replay}
                    </Text>
                  </Pressable>
                ) : null}
              </View>

              <Text
                selectable
                style={
                  styles.answerText
                }
              >
                {answer}
              </Text>

              {evidenceTags.length ? (
                <View
                  style={
                    styles.evidencePanel
                  }
                >
                  <Text
                    style={
                      styles.evidenceTitle
                    }
                  >
                    {language === "te"
                      ? "EVIDENCE USED"
                      : "EVIDENCE USED"}
                  </Text>

                  <View
                    style={
                      styles.evidenceTags
                    }
                  >
                    {evidenceTags
                      .slice(0, 3)
                      .map(
                        (
                          tag,
                          index,
                        ) => (
                          <View
                            key={`${tag}-${index}`}
                            style={
                              styles.evidenceTag
                            }
                          >
                            <View
                              style={
                                styles.evidenceTagDot
                              }
                            />
                            <Text
                              numberOfLines={1}
                              style={
                                styles.evidenceTagText
                              }
                            >
                              {tag}
                            </Text>
                          </View>
                        ),
                      )}
                  </View>
                </View>
              ) : null}

              {followups.length ? (
                <View
                  style={
                    styles.followupWrap
                  }
                >
                  <Text
                    style={
                      styles.followupTitle
                    }
                  >
                    {language === "te"
                      ? "తర్వాత అడగండి"
                      : "ASK NEXT"}
                  </Text>

                  <View
                    style={
                      styles.followupRow
                    }
                  >
                    {followups
                      .slice(0, 2)
                      .map(
                        (
                          item,
                          index,
                        ) => (
                          <Pressable
                            key={`${item}-${index}`}
                            onPress={() =>
                              void askQuestion(
                                item,
                              )
                            }
                            disabled={
                              processing ||
                              preparingSpeech ||
                              recorderState
                                .isRecording
                            }
                            style={({ pressed }) => [
                              styles.followupChip,
                              pressed &&
                                styles.followupChipPressed,
                            ]}
                          >
                            <Text
                              numberOfLines={2}
                              style={
                                styles.followupChipText
                              }
                            >
                              {item}
                            </Text>
                          </Pressable>
                        ),
                      )}
                  </View>
                </View>
              ) : null}
            </View>
          ) : null}

          {error ? (
            <View
              style={
                styles.error
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {error}
              </Text>
            </View>
          ) : null}

          {!blockId ? (
            <View
              style={
                styles.error
              }
            >
              <Text
                style={
                  styles.errorText
                }
              >
                {copy.noBlock}
              </Text>
            </View>
          ) : null}

          <View
            style={
              styles.composer
            }
          >
            <TextInput
              value={input}
              onChangeText={
                setInput
              }
              placeholder={
                copy.placeholder
              }
              placeholderTextColor="#8D9CA0"
              multiline
              maxLength={
                700
              }
              editable={
                contextReady &&
                !processing &&
                !recorderState
                  .isRecording
              }
              style={
                styles.input
              }
              returnKeyType="send"
              blurOnSubmit={
                false
              }
            />

            <Pressable
              onPress={
                submitText
              }
              disabled={
                !input.trim() ||
                !contextReady ||
                processing ||
                recorderState
                  .isRecording
              }
              style={[
                styles.send,
                (
                  !input.trim() ||
                  !contextReady ||
                  processing ||
                  recorderState
                    .isRecording
                ) &&
                  styles.disabled,
              ]}
            >
              {processing ? (
                <ActivityIndicator
                  size="small"
                  color="#FFFFFF"
                />
              ) : (
                <Text
                  style={
                    styles.sendText
                  }
                >
                  ↑
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}


function NeuralOrbit({
  phase,
}: {
  phase:
    | "idle"
    | "listening"
    | "thinking"
    | "speaking";
}) {
  const spin =
    useSharedValue(0);

  const breathe =
    useSharedValue(0);

  useEffect(() => {
    spin.value =
      withRepeat(
        withTiming(
          1,
          {
            duration:
              phase ===
              "thinking"
                ? 2600
                : 6200,
            easing:
              Easing.linear,
          },
        ),
        -1,
        false,
      );

    breathe.value =
      withRepeat(
        withTiming(
          1,
          {
            duration:
              phase ===
              "listening"
                ? 650
                : 1500,
            easing:
              Easing.inOut(
                Easing.ease,
              ),
          },
        ),
        -1,
        true,
      );
  }, [
    breathe,
    phase,
    spin,
  ]);

  const orbit =
    useAnimatedStyle(
      () => ({
        transform: [
          {
            rotate:
              `${interpolate(
                spin.value,
                [0, 1],
                [0, 360],
              )}deg`,
          },
        ],
      }),
    );

  const ring =
    useAnimatedStyle(
      () => ({
        opacity:
          interpolate(
            breathe.value,
            [0, 1],
            [0.28, 0.72],
          ),
        transform: [
          {
            scale:
              interpolate(
                breathe.value,
                [0, 1],
                [0.94, 1.06],
              ),
          },
        ],
      }),
    );

  return (
    <>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.neuralRing,
          ring,
        ]}
      />

      <Animated.View
        pointerEvents="none"
        style={[
          styles.neuralOrbit,
          orbit,
        ]}
      >
        <View
          style={
            styles.neuralNodeA
          }
        />
        <View
          style={
            styles.neuralNodeB
          }
        />
        <View
          style={
            styles.neuralNodeC
          }
        />
      </Animated.View>
    </>
  );
}

function MicIcon() {
  return (
    <View
      style={
        styles.micRoot
      }
    >
      <View
        style={
          styles.micCapsule
        }
      />
      <View
        style={
          styles.micArc
        }
      />
      <View
        style={
          styles.micStem
        }
      />
      <View
        style={
          styles.micBase
        }
      />
    </View>
  );
}

function WaveBar({
  index,
  meter,
  listening,
  speaking,
}: {
  index: number;
  meter: number;
  listening: boolean;
  speaking: boolean;
}) {
  const motion =
    useSharedValue(0);

  useEffect(() => {
    if (!speaking) {
      motion.value =
        withTiming(
          0,
          {
            duration: 120,
          },
        );
      return;
    }

    motion.value =
      withRepeat(
        withTiming(
          1,
          {
            duration:
              320 +
              (
                index %
                4
              ) *
                55,
            easing:
              Easing
                .inOut(
                  Easing.quad,
                ),
          },
        ),
        -1,
        true,
      );
  }, [
    index,
    motion,
    speaking,
  ]);

  const style =
    useAnimatedStyle(
      () => {
        const center =
          1 -
          Math.min(
            0.55,
            Math.abs(
              index - 6,
            ) *
              0.08,
          );

        const listeningHeight =
          4 +
          meter *
            27 *
            center;

        const speakingHeight =
          interpolate(
            motion.value,
            [0, 1],
            [
              5,
              12 +
                (
                  index %
                  4
                ) *
                  4,
            ],
          );

        return {
          height:
            listening
              ? listeningHeight
              : speaking
                ? speakingHeight
                : 4,
          opacity:
            listening ||
            speaking
              ? 1
              : 0.18,
        };
      },
    );

  return (
    <Animated.View
      style={[
        styles.waveBar,
        style,
      ]}
    />
  );
}

const styles =
  StyleSheet.create({
    flex: {
      flex: 1,
    },
    screen: {
      flex: 1,
      backgroundColor:
        "#F4F8F7",
    },
    content: {
      width: "100%",
      maxWidth: 600,
      alignSelf:
        "center",
      paddingHorizontal:
        16,
      gap: 10,
    },
    header: {
      minHeight: 50,
      flexDirection:
        "row",
      alignItems:
        "center",
      gap: 8,
    },
    back: {
      width: 38,
      height: 38,
      borderRadius: 13,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#DFE8E7",
    },
    backText: {
      color:
        "#244650",
      fontSize: 28,
      lineHeight: 30,
    },
    headerCenter: {
      flex: 1,
      alignItems:
        "center",
    },
    title: {
      color:
        "#183B47",
      fontSize: 15,
      fontWeight:
        "900",
    },
    block: {
      marginTop: 2,
      maxWidth: 215,
      color:
        "#819196",
      fontSize: 8,
      fontWeight:
        "700",
    },
    lang: {
      width: 38,
      height: 34,
      borderRadius: 11,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E4F4F0",
      borderWidth: 1,
      borderColor:
        "#CAE4DE",
    },
    langText: {
      color:
        "#138187",
      fontSize: 9,
      fontWeight:
        "900",
    },
    assistant: {
      minHeight: 305,
      borderRadius: 28,
      alignItems:
        "center",
      justifyContent:
        "center",
      padding: 18,
      backgroundColor:
        "#153844",
      shadowColor:
        "#0A2730",
      shadowOpacity: 0.13,
      shadowRadius: 18,
      shadowOffset: {
        width: 0,
        height: 8,
      },
      elevation: 5,
    },
    orbWrap: {
      width: 150,
      height: 150,
      alignItems:
        "center",
      justifyContent:
        "center",
    },
    pulse: {
      position:
        "absolute",
      width: 128,
      height: 128,
      borderRadius: 64,
      backgroundColor:
        "rgba(79,216,188,0.24)",
    },
    orb: {
      width: 108,
      height: 108,
      borderRadius: 40,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#15949B",
      borderWidth: 1,
      borderColor:
        "rgba(255,255,255,0.22)",
      elevation: 8,
    },
    orbListening: {
      backgroundColor:
        "#116E73",
      borderColor:
        "#8BE3D3",
    },
    orbSpeaking: {
      backgroundColor:
        "#205B6D",
      borderColor:
        "#9CDDF2",
    },
    spark: {
      color:
        "#FFFFFF",
      fontSize: 44,
      lineHeight: 48,
      fontWeight:
        "900",
    },
    status: {
      color:
        "#FFFFFF",
      fontSize: 14,
      lineHeight: 19,
      fontWeight:
        "900",
      textAlign:
        "center",
    },
    helper: {
      marginTop: 4,
      color:
        "#A8C0C5",
      fontSize: 8,
      fontWeight:
        "700",
    },
    wave: {
      height: 35,
      marginTop: 12,
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "center",
      gap: 4,
    },
    waveBar: {
      width: 3,
      borderRadius: 3,
      backgroundColor:
        "#7BDCC9",
    },
    micRoot: {
      width: 40,
      height: 50,
      alignItems:
        "center",
    },
    micCapsule: {
      width: 20,
      height: 28,
      borderRadius: 10,
      borderWidth: 3,
      borderColor:
        "#FFFFFF",
    },
    micArc: {
      width: 30,
      height: 17,
      marginTop: -12,
      borderLeftWidth: 3,
      borderRightWidth: 3,
      borderBottomWidth: 3,
      borderColor:
        "#FFFFFF",
      borderBottomLeftRadius:
        15,
      borderBottomRightRadius:
        15,
    },
    micStem: {
      width: 3,
      height: 8,
      backgroundColor:
        "#FFFFFF",
    },
    micBase: {
      width: 17,
      height: 3,
      borderRadius: 2,
      backgroundColor:
        "#FFFFFF",
    },
    userCard: {
      borderRadius: 16,
      padding: 12,
      backgroundColor:
        "#E8F4F2",
      borderWidth: 1,
      borderColor:
        "#CCE5DF",
    },
    label: {
      color:
        "#17858A",
      fontSize: 8,
      fontWeight:
        "900",
    },
    userText: {
      marginTop: 5,
      color:
        "#36545D",
      fontSize: 11,
      lineHeight: 17,
      fontWeight:
        "700",
    },
    answerCard: {
      borderRadius: 21,
      padding: 14,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#D7E6E3",
      shadowColor:
        "#143B46",
      shadowOpacity: 0.05,
      shadowRadius: 13,
      shadowOffset: {
        width: 0,
        height: 6,
      },
      elevation: 2,
    },
    answerTop: {
      flexDirection:
        "row",
      alignItems:
        "center",
      justifyContent:
        "space-between",
      gap: 8,
    },
    answerLabel: {
      color:
        "#254850",
      fontSize: 9,
      fontWeight:
        "900",
    },
    replay: {
      minHeight: 29,
      borderRadius: 9,
      paddingHorizontal:
        10,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#E6F4F1",
    },
    replayText: {
      color:
        "#157F84",
      fontSize: 8,
      fontWeight:
        "900",
    },
    answerText: {
      marginTop: 9,
      color:
        "#2D4B53",
      fontSize: 11,
      lineHeight: 18,
      fontWeight:
        "600",
    },
    contextRibbon: {
      marginTop: 7,
      minHeight: 22,
      borderRadius: 999,
      paddingHorizontal: 9,
      flexDirection: "row",
      alignItems: "center",
      gap: 6,
      backgroundColor:
        "rgba(110,220,198,0.07)",
      borderWidth: 1,
      borderColor:
        "rgba(110,220,198,0.13)",
    },
    contextDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#76DEC9",
    },
    contextRibbonText: {
      color:
        "#9ADACC",
      fontSize: 6,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    neuralRing: {
      position: "absolute",
      width: 142,
      height: 142,
      borderRadius: 71,
      borderWidth: 1,
      borderColor:
        "rgba(126,225,207,0.22)",
    },
    neuralOrbit: {
      position: "absolute",
      width: 148,
      height: 148,
      borderRadius: 74,
    },
    neuralNodeA: {
      position: "absolute",
      top: -2,
      left: 70,
      width: 7,
      height: 7,
      borderRadius: 4,
      backgroundColor:
        "#88E6D4",
      shadowColor:
        "#88E6D4",
      shadowOpacity: 0.6,
      shadowRadius: 8,
    },
    neuralNodeB: {
      position: "absolute",
      right: 8,
      top: 103,
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#8DCAE8",
    },
    neuralNodeC: {
      position: "absolute",
      left: 10,
      top: 33,
      width: 4,
      height: 4,
      borderRadius: 2,
      backgroundColor:
        "#D7B66A",
    },
    answerIdentity: {
      flex: 1,
      minWidth: 0,
      flexDirection: "row",
      alignItems: "center",
      gap: 8,
    },
    answerSpark: {
      width: 30,
      height: 30,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
      backgroundColor:
        "#153A46",
    },
    answerSparkText: {
      color:
        "#7CDFCB",
      fontSize: 14,
      fontWeight: "900",
    },
    answerSourceText: {
      marginTop: 2,
      color:
        "#7A9397",
      fontSize: 5.8,
      lineHeight: 8,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    evidencePanel: {
      marginTop: 12,
      paddingTop: 10,
      borderTopWidth:
        StyleSheet.hairlineWidth,
      borderTopColor:
        "#E4ECEA",
    },
    evidenceTitle: {
      color:
        "#7D9296",
      fontSize: 5.8,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    evidenceTags: {
      marginTop: 7,
      flexDirection: "row",
      flexWrap: "wrap",
      gap: 6,
    },
    evidenceTag: {
      maxWidth: "100%",
      minHeight: 25,
      borderRadius: 9,
      paddingHorizontal: 8,
      flexDirection: "row",
      alignItems: "center",
      gap: 5,
      backgroundColor:
        "#F0F7F5",
      borderWidth: 1,
      borderColor:
        "#DFECE8",
    },
    evidenceTagDot: {
      width: 5,
      height: 5,
      borderRadius: 3,
      backgroundColor:
        "#39A384",
    },
    evidenceTagText: {
      maxWidth: 210,
      color:
        "#4D6C72",
      fontSize: 6.6,
      fontWeight: "800",
    },
    followupWrap: {
      marginTop: 11,
    },
    followupTitle: {
      color:
        "#7D9296",
      fontSize: 5.8,
      fontWeight: "900",
      letterSpacing: 0.65,
    },
    followupRow: {
      marginTop: 7,
      flexDirection: "row",
      gap: 6,
    },
    followupChip: {
      flex: 1,
      minHeight: 42,
      borderRadius: 12,
      paddingHorizontal: 9,
      paddingVertical: 7,
      justifyContent: "center",
      backgroundColor:
        "#E8F4F2",
      borderWidth: 1,
      borderColor:
        "#D4E9E4",
    },
    followupChipPressed: {
      opacity: 0.74,
      transform: [
        {
          scale: 0.985,
        },
      ],
    },
    followupChipText: {
      color:
        "#27636A",
      fontSize: 7.2,
      lineHeight: 10,
      fontWeight: "800",
    },
    error: {
      borderRadius: 13,
      padding: 10,
      backgroundColor:
        "#FFF0EC",
      borderWidth: 1,
      borderColor:
        "#F0CEC6",
    },
    errorText: {
      color:
        "#8A493C",
      fontSize: 8.5,
      lineHeight: 13,
      fontWeight:
        "700",
    },
    composer: {
      minHeight: 58,
      borderRadius: 18,
      padding: 6,
      flexDirection:
        "row",
      alignItems:
        "flex-end",
      gap: 7,
      backgroundColor:
        "#FFFFFF",
      borderWidth: 1,
      borderColor:
        "#D9E5E4",
    },
    input: {
      flex: 1,
      minHeight: 44,
      maxHeight: 100,
      paddingHorizontal:
        10,
      paddingTop: 10,
      paddingBottom: 8,
      color:
        "#294750",
      fontSize: 10.5,
      lineHeight: 16,
      fontWeight:
        "600",
      textAlignVertical:
        "top",
    },
    send: {
      width: 45,
      height: 45,
      borderRadius: 14,
      alignItems:
        "center",
      justifyContent:
        "center",
      backgroundColor:
        "#15949B",
    },
    sendText: {
      color:
        "#FFFFFF",
      fontSize: 20,
      lineHeight: 22,
      fontWeight:
        "900",
    },
    disabled: {
      opacity: 0.42,
    },
  });
