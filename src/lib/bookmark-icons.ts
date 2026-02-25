import {
  Bookmark,
  Star,
  Zap,
  Music,
  MessageSquare,
  Laugh,
  Heart,
  Eye,
  Swords,
  type LucideIcon,
} from "lucide-react";

export interface BuiltinBookmarkIcon {
  id: string;
  label: string;
  icon: LucideIcon;
  color: string;       // Tailwind text color class, e.g. "text-blue-400"
  bgSelected: string;  // Tailwind bg for selected state
  ringSelected: string; // Tailwind ring for selected state
  hexColor: string;    // hex for inline styles (progress bar markers)
}

export const BUILTIN_BOOKMARK_ICONS: BuiltinBookmarkIcon[] = [
  { id: "bookmark",        label: "Bookmark",  icon: Bookmark,       color: "text-blue-400",    bgSelected: "bg-blue-500/20",    ringSelected: "ring-blue-500/50",    hexColor: "#60a5fa" },
  { id: "star",            label: "Star",       icon: Star,           color: "text-yellow-400",  bgSelected: "bg-yellow-500/20",  ringSelected: "ring-yellow-500/50",  hexColor: "#facc15" },
  { id: "zap",             label: "Action",     icon: Zap,            color: "text-orange-500",  bgSelected: "bg-orange-500/20",  ringSelected: "ring-orange-500/50",  hexColor: "#f97316" },
  { id: "music",           label: "Music",      icon: Music,          color: "text-violet-400",  bgSelected: "bg-violet-500/20",  ringSelected: "ring-violet-500/50",  hexColor: "#a78bfa" },
  { id: "message-square",  label: "Dialogue",   icon: MessageSquare,  color: "text-emerald-400", bgSelected: "bg-emerald-500/20", ringSelected: "ring-emerald-500/50", hexColor: "#34d399" },
  { id: "laugh",           label: "Funny",      icon: Laugh,          color: "text-amber-400",   bgSelected: "bg-amber-500/20",   ringSelected: "ring-amber-500/50",   hexColor: "#fbbf24" },
  { id: "heart",           label: "Emotion",    icon: Heart,          color: "text-red-400",     bgSelected: "bg-red-500/20",     ringSelected: "ring-red-500/50",     hexColor: "#f87171" },
  { id: "eye",             label: "Visual",     icon: Eye,            color: "text-sky-400",     bgSelected: "bg-sky-500/20",     ringSelected: "ring-sky-500/50",     hexColor: "#38bdf8" },
  { id: "swords",          label: "Suspense",   icon: Swords,         color: "text-purple-400",  bgSelected: "bg-purple-500/20",  ringSelected: "ring-purple-500/50",  hexColor: "#c084fc" },
];

export function getBuiltinIcon(id: string): BuiltinBookmarkIcon | undefined {
  return BUILTIN_BOOKMARK_ICONS.find((icon) => icon.id === id);
}
