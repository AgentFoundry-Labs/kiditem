"use client";

const HAIR: Record<string, string> = {
  blue: "#2563eb", emerald: "#059669", amber: "#d97706",
  rose: "#e11d48", violet: "#7c3aed", cyan: "#0891b2",
  teal: "#0d9488", orange: "#ea580c", pink: "#db2777",
  indigo: "#4f46e5",
};

export default function AgentFace({ color, role, size = 40 }: { color: string; role: string; size?: number }) {
  const hair = HAIR[color] || "#7c3aed";
  const isCeo = role === "ceo";
  const hasGlasses = /finance|data_fin|data_ad|data_inv/.test(role);
  const hasHeadset = /^(cs|data_cs)$/.test(role);
  const hasCap = role === "inventory";
  const isData = role.startsWith("data_");

  return (
    <svg width={size} height={size} viewBox="0 0 48 48" fill="none">
      {/* Face */}
      <circle cx="24" cy="28" r="12" fill="#FFD5B8" />

      {/* Ears */}
      <circle cx="12" cy="28" r="2" fill="#FFCBA4" />
      <circle cx="36" cy="28" r="2" fill="#FFCBA4" />

      {/* Hair */}
      {isCeo ? (
        <>
          <ellipse cx="24" cy="19" rx="14" ry="9" fill={hair} />
          <path d="M10 22 Q10 11 24 10 Q38 11 38 22 L38 18 Q37 10 24 9 Q11 10 10 18Z" fill={hair} />
        </>
      ) : hasCap ? (
        <>
          <ellipse cx="24" cy="20" rx="13" ry="8" fill={hair} />
          <rect x="9" y="18" width="30" height="4" rx="2" fill={hair} />
          <rect x="22" y="14" width="15" height="8" rx="3" fill={hair} opacity="0.85" />
        </>
      ) : hasHeadset ? (
        <>
          <ellipse cx="24" cy="20" rx="13" ry="8" fill={hair} />
          <path d="M12 23 C13 16 20 14 24 14 C28 14 35 16 36 23 L36 20 C34 13 28 11 24 11 C20 11 14 13 12 20Z" fill={hair} opacity="0.85" />
        </>
      ) : (
        <>
          <ellipse cx="24" cy="20" rx="13" ry="8" fill={hair} />
          <path d="M12 23 C13 15 19 13 24 13 C29 13 35 15 36 23 L36 19 C34 12 29 10 24 10 C19 10 14 12 12 19Z" fill={hair} opacity="0.85" />
          <path d="M14 20 C15 16 19 14 24 14 C29 14 33 16 34 20 C33 17 29 15 24 15 C19 15 15 17 14 20Z" fill={hair} />
        </>
      )}

      {/* ad_manager: spiky accent */}
      {role === "ad_manager" && (
        <>
          <path d="M16 14 L18 8 L20 13" fill={hair} />
          <path d="M22 12 L24 6 L26 12" fill={hair} />
          <path d="M28 14 L30 8 L32 13" fill={hair} />
        </>
      )}

      {/* Headset */}
      {hasHeadset && (
        <>
          <path d="M10 28 C10 22 14 18 24 18 C34 18 38 22 38 28" stroke="#1f2937" strokeWidth="1.5" fill="none" />
          <rect x="8" y="27" width="3" height="5" rx="1.5" fill="#1f2937" />
          <rect x="37" y="27" width="3" height="5" rx="1.5" fill="#1f2937" />
          <circle cx="9.5" cy="34" r="1.5" fill="#ef4444" />
        </>
      )}

      {/* Glasses */}
      {hasGlasses && (
        <>
          <circle cx="19" cy="27" r="3" stroke="#1f2937" strokeWidth="1.2" fill="white" fillOpacity="0.85" />
          <circle cx="29" cy="27" r="3" stroke="#1f2937" strokeWidth="1.2" fill="white" fillOpacity="0.85" />
          <path d="M22 27 L26 27" stroke="#1f2937" strokeWidth="1.2" />
        </>
      )}

      {/* Eyes (no glasses) */}
      {!hasGlasses && (
        <>
          <circle cx="19" cy="27" r="1.4" fill="#1f2937" />
          <circle cx="29" cy="27" r="1.4" fill="#1f2937" />
          <circle cx="19.4" cy="26.6" r="0.45" fill="white" />
          <circle cx="29.4" cy="26.6" r="0.45" fill="white" />
        </>
      )}

      {/* Cheeks */}
      <circle cx="16.5" cy="31" r="1.6" fill="#FCA5A5" opacity="0.55" />
      <circle cx="31.5" cy="31" r="1.6" fill="#FCA5A5" opacity="0.55" />

      {/* Mouth */}
      {isCeo ? (
        <path d="M21 33 Q24 36 27 33" stroke="#1f2937" strokeWidth="1.4" fill="none" strokeLinecap="round" />
      ) : isData ? (
        <path d="M22 33 L26 33" stroke="#1f2937" strokeWidth="1.3" strokeLinecap="round" />
      ) : (
        <path d="M21.5 33 Q24 35 26.5 33" stroke="#1f2937" strokeWidth="1.3" fill="none" strokeLinecap="round" />
      )}
    </svg>
  );
}
