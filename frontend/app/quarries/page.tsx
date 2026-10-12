"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
  AlertTriangle,
  Check,
  ChevronDown,
  CircleDot,
  Clipboard,
  Crosshair,
  Database,
  Globe2,
  LocateFixed,
  MapPin,
  Mountain,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  X,
} from "lucide-react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  createQuarry,
  getQuarries,
} from "../../lib/api";
import { useTranslation } from "../../lib/i18n";
import type { Quarry } from "../../lib/types";

type Coordinates = {
  latitude: number | null;
  longitude: number | null;
};

type SortMode =
  | "NAME"
  | "DISTRICT"
  | "GPS_FIRST";

const EMPTY_COORDINATES: Coordinates = {
  latitude: null,
  longitude: null,
};

const COPY = {
  en: {
    eyebrow: "QUARRY NETWORK",
    title: "Quarry Operations Atlas",
    subtitle:
      "A clean operational directory for quarry identity, lease references and field coordinates used during granite capture.",
    add: "Register Quarry",
    search: "Search quarry, code, district, mandal, village or lease...",
    refresh: "Refresh",
    total: "Registered",
    gpsCoverage: "GPS coverage",
    leaseCoverage: "Lease coverage",
    districts: "Districts",
    network: "Registered quarry network",
    networkSub: "Each live node represents one backend quarry record. This is not a geographic map.",
    code: "Quarry code",
    lease: "Lease",
    location: "Location",
    coordinates: "Coordinates",
    complete: "Location complete",
    partial: "Location partial",
    gpsReady: "GPS recorded",
    gpsMissing: "GPS not recorded",
    details: "View Details",
    hideDetails: "Hide Details",
    copyCode: "Copy code",
    copied: "Copied",
    noMatch: "No matching quarries",
    noMatchSub: "Try a different quarry name, code, location or lease reference.",
    noQuarries: "No quarries registered yet",
    noQuarriesSub: "Register the first quarry before starting field capture.",
    loadFailed: "Unable to load quarries",
    addTitle: "Register a Quarry",
    addHint:
      "Only quarry name is required. Add lease and GPS evidence when it is available; missing values are not invented.",
    name: "Quarry name",
    namePlaceholder: "Enter quarry name",
    codePlaceholder: "Enter quarry code",
    leasePlaceholder: "Enter lease number / ID",
    district: "District",
    mandal: "Mandal",
    village: "Village",
    gps: "Field GPS",
    optional: "Optional",
    useGps: "Use device GPS",
    locating: "Getting location...",
    latitude: "Latitude",
    longitude: "Longitude",
    gpsSaved: "GPS coordinates are ready to save.",
    noGps: "No GPS coordinates added.",
    gpsUnsupported: "GPS is not supported on this device or browser.",
    gpsFailed: "Unable to get device location.",
    createFailed: "Unable to save quarry.",
    cancel: "Cancel",
    save: "Save Quarry",
    saving: "Saving...",
    sortName: "Name A-Z",
    sortDistrict: "District",
    sortGps: "GPS first",
  },
  te: {
    eyebrow: "క్వారీ నెట్‌వర్క్",
    title: "క్వారీ ఆపరేషన్స్ అట్లాస్",
    subtitle:
      "గ్రానైట్ క్యాప్చర్‌లో ఉపయోగించే క్వారీ గుర్తింపు, లీజ్ వివరాలు మరియు ఫీల్డ్ కోఆర్డినేట్స్ కోసం ఆపరేషనల్ డైరెక్టరీ.",
    add: "క్వారీ నమోదు చేయండి",
    search: "క్వారీ, కోడ్, జిల్లా, మండలం, గ్రామం లేదా లీజ్ వెతకండి...",
    refresh: "రిఫ్రెష్",
    total: "నమోదైనవి",
    gpsCoverage: "GPS కవరేజ్",
    leaseCoverage: "లీజ్ కవరేజ్",
    districts: "జిల్లాలు",
    network: "నమోదైన క్వారీ నెట్‌వర్క్",
    networkSub: "ప్రతి నోడ్ ఒక బ్యాక్‌ఎండ్ క్వారీ రికార్డ్‌ను సూచిస్తుంది. ఇది భౌగోళిక మ్యాప్ కాదు.",
    code: "క్వారీ కోడ్",
    lease: "లీజ్",
    location: "స్థానం",
    coordinates: "కోఆర్డినేట్స్",
    complete: "స్థానం పూర్తి",
    partial: "స్థానం అసంపూర్తి",
    gpsReady: "GPS నమోదు అయింది",
    gpsMissing: "GPS నమోదు కాలేదు",
    details: "వివరాలు చూడండి",
    hideDetails: "వివరాలు దాచండి",
    copyCode: "కోడ్ కాపీ",
    copied: "కాపీ అయింది",
    noMatch: "సరిపోలే క్వారీలు లేవు",
    noMatchSub: "వేరే క్వారీ పేరు, కోడ్, ప్రాంతం లేదా లీజ్‌తో వెతకండి.",
    noQuarries: "ఇంకా క్వారీలు నమోదు కాలేదు",
    noQuarriesSub: "ఫీల్డ్ క్యాప్చర్‌కు ముందు మొదటి క్వారీని నమోదు చేయండి.",
    loadFailed: "క్వారీలు లోడ్ కాలేదు",
    addTitle: "క్వారీ నమోదు",
    addHint:
      "క్వారీ పేరు మాత్రమే తప్పనిసరి. లీజ్ మరియు GPS అందుబాటులో ఉన్నప్పుడు జోడించండి; లేని విలువలు ఊహించబడవు.",
    name: "క్వారీ పేరు",
    namePlaceholder: "క్వారీ పేరు నమోదు చేయండి",
    codePlaceholder: "క్వారీ కోడ్ నమోదు చేయండి",
    leasePlaceholder: "లీజ్ నంబర్ / ID నమోదు చేయండి",
    district: "జిల్లా",
    mandal: "మండలం",
    village: "గ్రామం",
    gps: "ఫీల్డ్ GPS",
    optional: "ఐచ్చికం",
    useGps: "డివైస్ GPS ఉపయోగించండి",
    locating: "స్థానం పొందుతోంది...",
    latitude: "అక్షాంశం",
    longitude: "రేఖాంశం",
    gpsSaved: "GPS కోఆర్డినేట్స్ సేవ్ చేయడానికి సిద్ధంగా ఉన్నాయి.",
    noGps: "GPS కోఆర్డినేట్స్ జోడించలేదు.",
    gpsUnsupported: "ఈ డివైస్ లేదా బ్రౌజర్‌లో GPS అందుబాటులో లేదు.",
    gpsFailed: "డివైస్ స్థానం పొందలేకపోయాం.",
    createFailed: "క్వారీని సేవ్ చేయలేకపోయాం.",
    cancel: "రద్దు",
    save: "క్వారీ సేవ్ చేయండి",
    saving: "సేవ్ చేస్తోంది...",
    sortName: "పేరు A-Z",
    sortDistrict: "జిల్లా",
    sortGps: "GPS ముందుగా",
  },
} as const;

function hasGps(quarry: Quarry) {
  return (
    typeof quarry.latitude === "number" &&
    Number.isFinite(quarry.latitude) &&
    typeof quarry.longitude === "number" &&
    Number.isFinite(quarry.longitude)
  );
}

function quarryLocation(quarry: Quarry) {
  return [
    quarry.village,
    quarry.mandal,
    quarry.district,
  ]
    .filter(Boolean)
    .join(", ");
}

function percent(part: number, total: number) {
  return total > 0
    ? Math.round((part / total) * 100)
    : 0;
}

export default function QuarriesPage() {
  const { language } = useTranslation();
  const copy = COPY[language];

  const [quarries, setQuarries] = useState<Quarry[] | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortMode>("NAME");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [gpsError, setGpsError] = useState<string | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newLeaseId, setNewLeaseId] = useState("");
  const [newDistrict, setNewDistrict] = useState("");
  const [newMandal, setNewMandal] = useState("");
  const [newVillage, setNewVillage] = useState("");
  const [coordinates, setCoordinates] = useState<Coordinates>(
    EMPTY_COORDINATES,
  );

  const fetchQuarries = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const data = await getQuarries();
      setQuarries(Array.isArray(data) ? data : []);
    } catch (fetchError) {
      setQuarries(null);
      setError(
        fetchError instanceof Error
          ? fetchError.message
          : COPY.en.loadFailed,
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchQuarries();
  }, [fetchQuarries]);

  const metrics = useMemo(() => {
    const source = quarries ?? [];
    const gpsCount = source.filter(hasGps).length;
    const leaseCount = source.filter((q) => Boolean(q.lease_id?.trim())).length;
    const districts = new Set(
      source
        .map((q) => q.district?.trim())
        .filter((value): value is string => Boolean(value)),
    );

    return {
      total: source.length,
      gpsCount,
      leaseCount,
      gpsPct: percent(gpsCount, source.length),
      leasePct: percent(leaseCount, source.length),
      districts: districts.size,
    };
  }, [quarries]);

  const visible = useMemo(() => {
    if (!quarries) return [];

    const needle = query.trim().toLowerCase();

    const filtered = quarries.filter((quarry) => {
      if (!needle) return true;

      return [
        quarry.quarry_name,
        quarry.quarry_code,
        quarry.district,
        quarry.mandal,
        quarry.village,
        quarry.lease_id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(needle);
    });

    return [...filtered].sort((a, b) => {
      if (sort === "GPS_FIRST") {
        const gpsDelta = Number(hasGps(b)) - Number(hasGps(a));
        if (gpsDelta !== 0) return gpsDelta;
      }

      if (sort === "DISTRICT") {
        const districtDelta = (a.district || "").localeCompare(
          b.district || "",
        );
        if (districtDelta !== 0) return districtDelta;
      }

      return a.quarry_name.localeCompare(b.quarry_name);
    });
  }, [quarries, query, sort]);

  function resetForm() {
    setNewName("");
    setNewCode("");
    setNewLeaseId("");
    setNewDistrict("");
    setNewMandal("");
    setNewVillage("");
    setCoordinates(EMPTY_COORDINATES);
    setGpsError(null);
    setFormError(null);
  }

  function closeModal() {
    if (submitting) return;
    setIsAddModalOpen(false);
    resetForm();
  }

  function handleAcquireGps() {
    setGpsError(null);

    if (!navigator.geolocation) {
      setGpsError(copy.gpsUnsupported);
      return;
    }

    setGpsLoading(true);

    navigator.geolocation.getCurrentPosition(
      (position) => {
        setCoordinates({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
        setGpsLoading(false);
      },
      (gpsFailure) => {
        setGpsError(gpsFailure.message || copy.gpsFailed);
        setGpsLoading(false);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  }

  async function handleCreateQuarry(event: React.FormEvent) {
    event.preventDefault();

    const quarryName = newName.trim();
    if (!quarryName || submitting) return;

    setSubmitting(true);
    setFormError(null);

    try {
      await createQuarry({
        quarry_name: quarryName,
        quarry_code: newCode.trim() || undefined,
        lease_id: newLeaseId.trim() || undefined,
        district: newDistrict.trim() || undefined,
        mandal: newMandal.trim() || undefined,
        village: newVillage.trim() || undefined,
        latitude: coordinates.latitude,
        longitude: coordinates.longitude,
      });

      setIsAddModalOpen(false);
      resetForm();
      await fetchQuarries();
    } catch (createError) {
      setFormError(
        createError instanceof Error
          ? createError.message
          : copy.createFailed,
      );
    } finally {
      setSubmitting(false);
    }
  }

  async function copyQuarryCode(quarry: Quarry) {
    if (!quarry.quarry_code) return;

    try {
      await navigator.clipboard.writeText(quarry.quarry_code);
      setCopiedId(quarry.id);
      window.setTimeout(() => setCopiedId(null), 1600);
    } catch {
      // Clipboard can be unavailable in restricted browser contexts.
    }
  }

  const formHasGps =
    typeof coordinates.latitude === "number" &&
    Number.isFinite(coordinates.latitude) &&
    typeof coordinates.longitude === "number" &&
    Number.isFinite(coordinates.longitude);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[#f6fcfb] text-slate-900 dark:bg-[#0d2428] dark:text-slate-100">
      <QuarryBackground />

      <div className="relative mx-auto w-full max-w-[1720px] px-3 pb-28 pt-4 sm:px-5 lg:px-6">
        <motion.header
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="relative overflow-hidden rounded-[28px] border border-teal-200/80 bg-white/90 p-4 shadow-[0_22px_65px_rgba(15,23,42,.07)] backdrop-blur-2xl dark:border-teal-300/15 dark:bg-[#123238]/94 sm:p-5"
        >
          <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400" />

          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_560px] xl:items-center">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-200/80 bg-cyan-50 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.13em] text-teal-700 dark:border-teal-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200">
                  <Mountain size={9} />
                  {copy.eyebrow}
                </span>

                <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200/80 bg-emerald-50/80 px-2.5 py-1 text-[6px] font-black uppercase tracking-[0.12em] text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200">
                  <Database size={9} />
                  LIVE BACKEND DIRECTORY
                </span>
              </div>

              <h1 className="mt-3 text-[31px] font-black leading-[1.02] tracking-[-0.055em] text-slate-950 sm:text-[40px] dark:text-white">
                {copy.title}
              </h1>

              <p className="mt-2 max-w-3xl text-[10px] leading-5 text-slate-500 dark:text-slate-400">
                {copy.subtitle}
              </p>

              <div className="mt-4 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => {
                    resetForm();
                    setIsAddModalOpen(true);
                  }}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] bg-teal-600 px-4 text-[7px] font-black uppercase tracking-[0.1em] text-white shadow-[0_10px_24px_rgba(13,148,136,.20)] transition hover:-translate-y-0.5 hover:bg-teal-700"
                >
                  <Plus size={13} />
                  {copy.add}
                </button>

                <button
                  type="button"
                  onClick={() => void fetchQuarries()}
                  disabled={loading}
                  className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[13px] border border-slate-200/80 bg-[#f6fbfa] px-4 text-[7px] font-black uppercase tracking-[0.1em] text-slate-600 transition hover:border-teal-200/80 hover:bg-cyan-50 hover:text-teal-700 disabled:opacity-40 dark:border-teal-300/12 dark:bg-teal-300/[0.045] dark:text-slate-300"
                >
                  <RefreshCw
                    size={12}
                    className={loading ? "animate-spin" : ""}
                  />
                  {copy.refresh}
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              <QuarryMetric
                label={copy.total}
                value={loading ? null : String(metrics.total)}
                icon={<Mountain size={13} />}
                tone="sky"
              />

              <QuarryMetric
                label={copy.gpsCoverage}
                value={loading ? null : `${metrics.gpsPct}%`}
                detail={loading ? undefined : `${metrics.gpsCount}/${metrics.total}`}
                icon={<LocateFixed size={13} />}
                tone="cyan"
              />

              <QuarryMetric
                label={copy.leaseCoverage}
                value={loading ? null : `${metrics.leasePct}%`}
                detail={loading ? undefined : `${metrics.leaseCount}/${metrics.total}`}
                icon={<ShieldCheck size={13} />}
                tone="good"
              />

              <QuarryMetric
                label={copy.districts}
                value={loading ? null : String(metrics.districts)}
                icon={<Globe2 size={13} />}
                tone="teal"
              />
            </div>
          </div>
        </motion.header>

        <section className="mt-4 grid gap-3 xl:grid-cols-[minmax(0,1fr)_360px]">
          <div className="rounded-[20px] border border-slate-200/80/90 bg-white/90 p-3 shadow-[0_14px_36px_rgba(15,23,42,.055)] backdrop-blur-xl dark:border-teal-300/12 dark:bg-[#123238]/90">
            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="relative min-w-0 flex-1">
                <Search
                  size={13}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder={copy.search}
                  className="h-10 w-full rounded-[12px] border border-slate-200/80 bg-[#f6fbfa] pl-9 pr-3 text-[8px] font-semibold text-slate-700 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:bg-white focus:ring-4 focus:ring-teal-100/60 dark:border-teal-300/12 dark:bg-teal-300/[0.045] dark:text-slate-200 dark:focus:border-teal-300/20 dark:focus:ring-cyan-300/[0.05]"
                />
              </div>

              <div className="relative shrink-0">
                <SlidersHorizontal
                  size={12}
                  className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
                <select
                  value={sort}
                  onChange={(event) => setSort(event.target.value as SortMode)}
                  className="h-10 appearance-none rounded-[12px] border border-slate-200/80 bg-white pl-9 pr-8 text-[6.5px] font-black uppercase tracking-[0.08em] text-slate-500 outline-none transition hover:border-teal-200/80 focus:border-teal-300 dark:border-teal-300/12 dark:bg-slate-700/12 dark:text-slate-400"
                >
                  <option value="NAME">{copy.sortName}</option>
                  <option value="DISTRICT">{copy.sortDistrict}</option>
                  <option value="GPS_FIRST">{copy.sortGps}</option>
                </select>
                <ChevronDown
                  size={11}
                  className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                />
              </div>
            </div>
          </div>

          <QuarryNetworkPulse
            quarries={quarries ?? []}
            title={copy.network}
            subtitle={copy.networkSub}
          />
        </section>

        {error ? (
          <div className="mt-4 flex items-start gap-3 rounded-[17px] border border-rose-200 bg-rose-50/88 p-4 text-rose-700 dark:border-rose-300/15 dark:bg-rose-300/[0.05] dark:text-rose-200">
            <AlertTriangle size={15} className="mt-0.5 shrink-0" />
            <div>
              <p className="text-[8px] font-black">{copy.loadFailed}</p>
              <p className="mt-1 text-[7px] leading-4">{error}</p>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {[0, 1, 2, 3, 4, 5].map((item) => (
              <div
                key={item}
                className="h-[205px] animate-pulse rounded-[20px] border border-slate-200/80 bg-white/80 dark:border-teal-300/12 dark:bg-teal-300/[0.045]"
              />
            ))}
          </div>
        ) : null}

        {!loading && quarries && quarries.length === 0 ? (
          <EmptyQuarries title={copy.noQuarries} subtitle={copy.noQuarriesSub} />
        ) : null}

        {!loading && quarries && quarries.length > 0 && visible.length === 0 ? (
          <EmptyQuarries title={copy.noMatch} subtitle={copy.noMatchSub} />
        ) : null}

        {!loading && visible.length > 0 ? (
          <div className="mt-4 grid gap-3 md:grid-cols-2 2xl:grid-cols-3">
            {visible.map((quarry, index) => {
              const gps = hasGps(quarry);
              const location = quarryLocation(quarry);
              const expanded = expandedId === quarry.id;
              const locationComplete = Boolean(
                quarry.district && quarry.mandal && quarry.village,
              );

              return (
                <motion.article
                  key={quarry.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{
                    duration: 0.34,
                    delay: Math.min(index * 0.025, 0.18),
                  }}
                  whileHover={{ y: -3 }}
                  className="group relative overflow-hidden rounded-[20px] border border-slate-200/80/90 bg-white/90 shadow-[0_12px_34px_rgba(15,23,42,.055)] transition duration-300 hover:border-teal-200/80 hover:shadow-[0_18px_42px_rgba(20,184,166,.10)] dark:border-teal-300/12 dark:bg-[#123238]/90 dark:hover:border-teal-300/15"
                >
                  <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-300" />

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-3">
                        <span className="relative grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-[13px] border border-teal-200/80 bg-cyan-50 text-teal-700 dark:border-teal-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200">
                          <Mountain size={17} />
                          {gps ? (
                            <motion.span
                              animate={{ scale: [1, 1.7, 1], opacity: [0.45, 1, 0.45] }}
                              transition={{ duration: 1.8, repeat: Infinity }}
                              className="absolute right-1.5 top-1.5 h-1.5 w-1.5 rounded-full bg-emerald-50/800"
                            />
                          ) : null}
                        </span>

                        <div className="min-w-0">
                          <p className="text-[5.5px] font-black uppercase tracking-[0.11em] text-teal-600 dark:text-teal-300">
                            {quarry.quarry_code || "CODE NOT ADDED"}
                          </p>
                          <h2 className="mt-1 truncate text-[15px] font-black tracking-[-0.035em] text-slate-900 dark:text-white">
                            {quarry.quarry_name}
                          </h2>
                          <p className="mt-1 truncate text-[6px] font-semibold text-slate-400 dark:text-slate-500">
                            {location || copy.partial}
                          </p>
                        </div>
                      </div>

                      <span
                        className={[
                          "shrink-0 rounded-full border px-2 py-1 text-[5px] font-black uppercase tracking-[0.08em]",
                          locationComplete
                            ? "border-emerald-200/80 bg-emerald-50/80 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200"
                            : "border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-300/15 dark:bg-amber-300/[0.05] dark:text-amber-200",
                        ].join(" ")}
                      >
                        {locationComplete ? copy.complete : copy.partial}
                      </span>
                    </div>

                    <div className="mt-4 grid grid-cols-2 gap-2">
                      <MetaTile
                        icon={<ShieldCheck size={10} />}
                        label={copy.lease}
                        value={quarry.lease_id || "—"}
                      />
                      <MetaTile
                        icon={<MapPin size={10} />}
                        label="GPS"
                        value={gps ? copy.gpsReady : copy.gpsMissing}
                        good={gps}
                      />
                    </div>

                    <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-200/80/70 pt-3 dark:border-slate-600/25">
                      <button
                        type="button"
                        onClick={() => setExpandedId(expanded ? null : quarry.id)}
                        className="inline-flex min-h-8 items-center gap-1.5 rounded-[9px] px-2 text-[5.5px] font-black uppercase tracking-[0.08em] text-slate-500 transition hover:bg-teal-50 hover:text-teal-700 dark:text-slate-400 dark:hover:bg-slate-700/20 dark:hover:text-teal-200"
                      >
                        <CircleDot size={9} />
                        {expanded ? copy.hideDetails : copy.details}
                      </button>

                      {quarry.quarry_code ? (
                        <button
                          type="button"
                          onClick={() => void copyQuarryCode(quarry)}
                          className="inline-flex min-h-8 items-center gap-1.5 rounded-[9px] border border-slate-200/80 bg-[#f6fbfa] px-2 text-[5.5px] font-black uppercase tracking-[0.08em] text-slate-500 transition hover:border-teal-200/80 hover:bg-cyan-50 hover:text-teal-700 dark:border-teal-300/12 dark:bg-teal-300/[0.045] dark:text-slate-400"
                        >
                          {copiedId === quarry.id ? <Check size={9} /> : <Clipboard size={9} />}
                          {copiedId === quarry.id ? copy.copied : copy.copyCode}
                        </button>
                      ) : null}
                    </div>

                    <AnimatePresence initial={false}>
                      {expanded ? (
                        <motion.div
                          initial={{ opacity: 0, height: 0 }}
                          animate={{ opacity: 1, height: "auto" }}
                          exit={{ opacity: 0, height: 0 }}
                          className="overflow-hidden"
                        >
                          <div className="mt-3 grid gap-2 border-t border-slate-200/80/70 pt-3 dark:border-slate-600/25 sm:grid-cols-2">
                            <DetailRow label={copy.code} value={quarry.quarry_code || "—"} />
                            <DetailRow label={copy.lease} value={quarry.lease_id || "—"} />
                            <DetailRow label={copy.district} value={quarry.district || "—"} />
                            <DetailRow label={copy.mandal} value={quarry.mandal || "—"} />
                            <DetailRow label={copy.village} value={quarry.village || "—"} />
                            <DetailRow
                              label={copy.coordinates}
                              value={formatCoordinates(quarry.latitude, quarry.longitude)}
                            />
                          </div>
                        </motion.div>
                      ) : null}
                    </AnimatePresence>
                  </div>
                </motion.article>
              );
            })}
          </div>
        ) : null}
      </div>

      <AnimatePresence>
        {isAddModalOpen ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[120] bg-slate-950/30 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="add-quarry-title"
          >
            <button
              type="button"
              aria-label={copy.cancel}
              onClick={closeModal}
              className="absolute inset-0 h-full w-full cursor-default"
            />

            <motion.aside
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.34, ease: [0.16, 1, 0.3, 1] }}
              className="absolute inset-y-0 right-0 flex w-full max-w-[560px] flex-col border-l border-teal-200/80 bg-[#f3fbfa] shadow-[-28px_0_80px_rgba(15,23,42,.18)] dark:border-teal-300/15 dark:bg-[#102e33]"
            >
              <div className="relative overflow-hidden border-b border-slate-200/80/80 px-5 py-5 dark:border-teal-300/12">
                <div className="absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-cyan-500 via-teal-400 to-emerald-400" />

                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-[6px] font-black uppercase tracking-[0.14em] text-teal-700 dark:text-cyan-300">
                      QUARRY REGISTRATION
                    </p>
                    <h2
                      id="add-quarry-title"
                      className="mt-1 text-[22px] font-black tracking-[-0.04em] text-slate-950 dark:text-white"
                    >
                      {copy.addTitle}
                    </h2>
                    <p className="mt-1 max-w-md text-[8px] leading-4 text-slate-500 dark:text-slate-400">
                      {copy.addHint}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={closeModal}
                    disabled={submitting}
                    className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-slate-200/80 bg-white text-slate-500 transition hover:border-teal-200/80 hover:bg-cyan-50 hover:text-teal-700 disabled:opacity-40 dark:border-teal-300/12 dark:bg-teal-300/[0.045] dark:text-slate-400"
                  >
                    <X size={14} />
                  </button>
                </div>
              </div>

              <form
                onSubmit={handleCreateQuarry}
                className="flex min-h-0 flex-1 flex-col"
              >
                <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5">
                  {formError ? (
                    <div className="flex gap-2 rounded-[13px] border border-rose-200 bg-rose-50 p-3 text-[7px] leading-4 text-rose-700 dark:border-rose-300/15 dark:bg-rose-300/[0.05] dark:text-rose-200">
                      <AlertTriangle size={13} className="mt-0.5 shrink-0" />
                      <span>{formError}</span>
                    </div>
                  ) : null}

                  <FormField label={`${copy.name} *`}>
                    <input
                      required
                      value={newName}
                      onChange={(event) => setNewName(event.target.value)}
                      placeholder={copy.namePlaceholder}
                      className="quarry-input"
                    />
                  </FormField>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <FormField label={copy.code}>
                      <input
                        value={newCode}
                        onChange={(event) => setNewCode(event.target.value)}
                        placeholder={copy.codePlaceholder}
                        className="quarry-input"
                      />
                    </FormField>

                    <FormField label={copy.lease}>
                      <input
                        value={newLeaseId}
                        onChange={(event) => setNewLeaseId(event.target.value)}
                        placeholder={copy.leasePlaceholder}
                        className="quarry-input"
                      />
                    </FormField>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <FormField label={copy.district}>
                      <input
                        value={newDistrict}
                        onChange={(event) => setNewDistrict(event.target.value)}
                        placeholder={copy.district}
                        className="quarry-input"
                      />
                    </FormField>

                    <FormField label={copy.mandal}>
                      <input
                        value={newMandal}
                        onChange={(event) => setNewMandal(event.target.value)}
                        placeholder={copy.mandal}
                        className="quarry-input"
                      />
                    </FormField>

                    <FormField label={copy.village}>
                      <input
                        value={newVillage}
                        onChange={(event) => setNewVillage(event.target.value)}
                        placeholder={copy.village}
                        className="quarry-input"
                      />
                    </FormField>
                  </div>

                  <section className="rounded-[17px] border border-teal-200/80 bg-[linear-gradient(145deg,#f0fbff,#ecfdfb)] p-4 dark:border-cyan-300/15 dark:bg-[linear-gradient(145deg,#1b364f,#173a3c)]">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[11px] border border-teal-200 bg-white/80 text-teal-700 dark:border-cyan-300/15 dark:bg-teal-300/[0.045] dark:text-teal-200">
                          <MapPin size={14} />
                        </span>
                        <div>
                          <p className="text-[7px] font-black text-slate-800 dark:text-slate-100">
                            {copy.gps}
                          </p>
                          <p className="mt-0.5 text-[5.5px] font-semibold uppercase tracking-[0.08em] text-slate-400 dark:text-slate-500">
                            {copy.optional}
                          </p>
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={handleAcquireGps}
                        disabled={gpsLoading}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-[10px] bg-teal-600 px-3 text-[6px] font-black uppercase tracking-[0.08em] text-white transition hover:bg-teal-700 disabled:opacity-40"
                      >
                        <Crosshair
                          size={11}
                          className={gpsLoading ? "animate-pulse" : ""}
                        />
                        {gpsLoading ? copy.locating : copy.useGps}
                      </button>
                    </div>

                    {gpsError ? (
                      <p className="mt-3 text-[6.5px] leading-4 text-rose-600 dark:text-rose-300">
                        {gpsError}
                      </p>
                    ) : null}

                    <div className="mt-3 grid gap-2 sm:grid-cols-2">
                      <input
                        type="number"
                        step="any"
                        min="-90"
                        max="90"
                        value={coordinates.latitude ?? ""}
                        onChange={(event) =>
                          setCoordinates((current) => ({
                            ...current,
                            latitude:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          }))
                        }
                        placeholder={copy.latitude}
                        className="quarry-input"
                      />

                      <input
                        type="number"
                        step="any"
                        min="-180"
                        max="180"
                        value={coordinates.longitude ?? ""}
                        onChange={(event) =>
                          setCoordinates((current) => ({
                            ...current,
                            longitude:
                              event.target.value === ""
                                ? null
                                : Number(event.target.value),
                          }))
                        }
                        placeholder={copy.longitude}
                        className="quarry-input"
                      />
                    </div>

                    <p className="mt-2 text-[5.5px] font-semibold text-slate-400 dark:text-slate-500">
                      {formHasGps ? copy.gpsSaved : copy.noGps}
                    </p>
                  </section>
                </div>

                <div className="border-t border-slate-200/80/80 bg-white/90 p-4 backdrop-blur dark:border-teal-300/12 dark:bg-[#12383d]/92">
                  <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                    <button
                      type="button"
                      onClick={closeModal}
                      disabled={submitting}
                      className="inline-flex min-h-10 items-center justify-center rounded-[12px] border border-slate-200/80 bg-white px-4 text-[7px] font-black uppercase tracking-[0.08em] text-slate-600 transition hover:bg-[#f6fbfa] disabled:opacity-40 dark:border-teal-300/12 dark:bg-teal-300/[0.045] dark:text-slate-300"
                    >
                      {copy.cancel}
                    </button>

                    <button
                      type="submit"
                      disabled={!newName.trim() || submitting}
                      className="inline-flex min-h-10 items-center justify-center gap-2 rounded-[12px] bg-gradient-to-r from-teal-600 to-cyan-500 px-4 text-[7px] font-black uppercase tracking-[0.08em] text-white shadow-[0_9px_24px_rgba(20,184,166,.18)] transition hover:-translate-y-0.5 disabled:opacity-40"
                    >
                      {submitting ? (
                        <RefreshCw size={11} className="animate-spin" />
                      ) : (
                        <Plus size={11} />
                      )}
                      {submitting ? copy.saving : copy.save}
                    </button>
                  </div>
                </div>
              </form>
            </motion.aside>
          </motion.div>
        ) : null}
      </AnimatePresence>

      <style jsx global>{`
        .quarry-input {
          width: 100%;
          min-height: 42px;
          border-radius: 12px;
          border: 1px solid rgba(148, 163, 184, 0.28);
          background: rgba(255, 255, 255, 0.86);
          padding: 0 12px;
          font-size: 12px;
          font-weight: 650;
          color: #334155;
          outline: none;
          transition: border-color 160ms ease, box-shadow 160ms ease, background 160ms ease;
        }

        .quarry-input::placeholder {
          color: #94a3b8;
        }

        .quarry-input:focus {
          border-color: rgba(6, 182, 212, 0.6);
          box-shadow: 0 0 0 4px rgba(6, 182, 212, 0.09);
          background: #ffffff;
        }

        .dark .quarry-input {
          border-color: rgba(148, 163, 184, 0.2);
          background: rgba(51, 65, 85, 0.22);
          color: #e2e8f0;
        }
      `}</style>
    </div>
  );
}

function QuarryMetric({
  label,
  value,
  detail,
  icon,
  tone,
}: {
  label: string;
  value: string | null;
  detail?: string;
  icon: React.ReactNode;
  tone: "sky" | "cyan" | "good" | "teal";
}) {
  const toneClass = {
    sky: "border-teal-200/80 bg-teal-50/80 text-teal-700 dark:border-teal-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200",
    cyan: "border-teal-200 bg-teal-50/80 text-teal-700 dark:border-cyan-300/15 dark:bg-cyan-300/[0.05] dark:text-teal-200",
    good: "border-emerald-200/80 bg-emerald-50/80/80 text-emerald-700 dark:border-emerald-300/15 dark:bg-emerald-300/[0.05] dark:text-emerald-200",
    teal: "border-teal-200 bg-teal-50/80 text-teal-700 dark:border-teal-300/15 dark:bg-teal-300/[0.05] dark:text-teal-200",
  }[tone];

  return (
    <div className={`rounded-[15px] border px-3 py-2.5 ${toneClass}`}>
      <div className="flex items-center justify-between gap-2">
        {icon}
        <Sparkles size={8} className="opacity-30" />
      </div>
      <p className="mt-2 text-[4.8px] font-black uppercase tracking-[0.1em] opacity-65">
        {label}
      </p>
      {value === null ? (
        <div className="mt-1 h-5 w-12 animate-pulse rounded bg-white/45 dark:bg-slate-700/20" />
      ) : (
        <p className="mt-0.5 text-[18px] font-black leading-none tracking-[-0.045em]">
          {value}
        </p>
      )}
      {detail ? (
        <p className="mt-1 text-[4.8px] font-semibold opacity-55">{detail}</p>
      ) : null}
    </div>
  );
}

function QuarryNetworkPulse({
  quarries,
  title,
  subtitle,
}: {
  quarries: Quarry[];
  title: string;
  subtitle: string;
}) {
  const nodes = quarries.slice(0, 8);

  return (
    <div className="relative min-h-[66px] overflow-hidden rounded-[20px] border border-teal-200/80 bg-[linear-gradient(145deg,#effcfb,#ecfdf8)] px-3 py-2.5 shadow-[0_12px_30px_rgba(6,182,212,.06)] dark:border-cyan-300/15 dark:bg-[linear-gradient(145deg,#12383e,#123b38)]">
      <div className="pointer-events-none absolute inset-0">
        <motion.div
          animate={{ x: ["-30%", "140%"] }}
          transition={{ duration: 5.8, repeat: Infinity, ease: "linear" }}
          className="absolute inset-y-0 w-[18%] bg-gradient-to-r from-transparent via-white/70 to-transparent blur-xl dark:via-cyan-100/[0.03]"
        />
      </div>

      <div className="relative flex items-center gap-3">
        <div className="relative h-10 w-20 shrink-0">
          {nodes.length === 0 ? (
            <span className="absolute left-1/2 top-1/2 h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-slate-300" />
          ) : (
            nodes.map((quarry, index) => {
              const x = 8 + ((index * 19) % 64);
              const y = 7 + ((index * 13) % 27);
              const gps = hasGps(quarry);

              return (
                <motion.span
                  key={quarry.id}
                  title={quarry.quarry_name}
                  animate={{
                    scale: [0.82, 1.25, 0.82],
                    opacity: [0.45, 1, 0.45],
                  }}
                  transition={{
                    duration: 1.8 + (index % 3) * 0.25,
                    repeat: Infinity,
                    delay: index * 0.12,
                  }}
                  className={[
                    "absolute h-2 w-2 rounded-full shadow-[0_0_10px_rgba(6,182,212,.3)]",
                    gps ? "bg-emerald-50/800" : "bg-teal-400",
                  ].join(" ")}
                  style={{ left: x, top: y }}
                />
              );
            })
          )}
        </div>

        <div className="min-w-0">
          <p className="truncate text-[6px] font-black uppercase tracking-[0.1em] text-teal-700 dark:text-teal-200">
            {title}
          </p>
          <p className="mt-0.5 line-clamp-2 text-[5px] leading-3 text-slate-400 dark:text-slate-500">
            {subtitle}
          </p>
        </div>
      </div>
    </div>
  );
}

function MetaTile({
  icon,
  label,
  value,
  good = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  good?: boolean;
}) {
  return (
    <div className="rounded-[11px] border border-slate-200/80/80 bg-[#f6fbfa]/75 px-2.5 py-2 dark:border-teal-300/12 dark:bg-slate-700/10">
      <div className="flex items-center gap-1.5 text-slate-400">
        {icon}
        <span className="text-[4.7px] font-black uppercase tracking-[0.08em]">{label}</span>
      </div>
      <p
        className={[
          "mt-1 truncate text-[6.3px] font-black",
          good
            ? "text-emerald-700 dark:text-emerald-300"
            : "text-slate-700 dark:text-slate-300",
        ].join(" ")}
      >
        {value}
      </p>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[10px] bg-[#f6fbfa] px-2.5 py-2 dark:bg-slate-700/12">
      <p className="text-[4.8px] font-black uppercase tracking-[0.08em] text-slate-400">
        {label}
      </p>
      <p className="mt-1 break-words text-[6px] font-bold text-slate-700 dark:text-slate-300">
        {value}
      </p>
    </div>
  );
}

function FormField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[6px] font-black uppercase tracking-[0.1em] text-slate-500 dark:text-slate-400">
        {label}
      </span>
      {children}
    </label>
  );
}

function EmptyQuarries({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="mt-6 rounded-[22px] border border-dashed border-slate-300 bg-white/65 px-5 py-12 text-center dark:border-slate-600/40 dark:bg-slate-700/10">
      <Mountain size={22} className="mx-auto text-teal-500" />
      <h2 className="mt-3 text-[13px] font-black text-slate-800 dark:text-slate-100">
        {title}
      </h2>
      <p className="mx-auto mt-1 max-w-lg text-[7px] leading-4 text-slate-400 dark:text-slate-500">
        {subtitle}
      </p>
    </div>
  );
}

function formatCoordinates(
  latitude: number | null | undefined,
  longitude: number | null | undefined,
) {
  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude)
  ) {
    return "—";
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function QuarryBackground() {
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-0 overflow-hidden">
      <motion.div
        animate={{ x: [0, 30, -12, 0], y: [0, 22, 38, 0] }}
        transition={{ duration: 24, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -left-28 -top-28 h-[520px] w-[520px] rounded-full bg-teal-200/20 blur-[130px] dark:bg-teal-400/[0.035]"
      />
      <motion.div
        animate={{ x: [0, -38, 18, 0], y: [0, 44, -8, 0] }}
        transition={{ duration: 30, repeat: Infinity, ease: "easeInOut" }}
        className="absolute -right-36 top-[26%] h-[560px] w-[560px] rounded-full bg-cyan-200/16 blur-[140px] dark:bg-teal-400/[0.03]"
      />
    </div>
  );
}
