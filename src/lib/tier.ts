export type Tier = "SSS" | "SS" | "S" | "A" | "B" | "C";

export function getTier(rating: number): Tier {
  if (rating >= 9.8) return "SSS";
  if (rating >= 9.5) return "SS";
  if (rating >= 9.0) return "S";
  if (rating >= 8.0) return "A";
  if (rating >= 6.0) return "B";
  return "C";
}

export function getTierColor(tier: Tier): string {
  switch (tier) {
    case "SSS": return "text-amber-300";
    case "SS": return "text-orange-400";
    case "S": return "text-red-400";
    case "A": return "text-purple-400";
    case "B": return "text-blue-400";
    case "C": return "text-gray-400";
  }
}

export function getTierBorderColor(tier: Tier): string {
  switch (tier) {
    case "SSS": return "border-amber-300/70";
    case "SS": return "border-orange-400/50";
    case "S": return "border-red-400/50";
    case "A": return "border-purple-400/50";
    case "B": return "border-blue-400/50";
    case "C": return "border-gray-400/50";
  }
}

export function getTierGlow(tier: Tier): string {
  if (tier === "SSS") return "shadow-[0_0_8px_rgba(252,211,77,0.6),0_0_20px_rgba(252,211,77,0.3)]";
  return "";
}
