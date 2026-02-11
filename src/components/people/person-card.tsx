import Link from "next/link";
import Image from "next/image";
import { resolveImageSrc } from "@/lib/image-utils";

interface PersonCardProps {
  id: string;
  name: string;
  role?: string;
  photoPath?: string | null;
  size?: "sm" | "md" | "lg";
}

const sizeConfig = {
  sm: { width: 140, height: 210 },
  md: { width: 160, height: 240 },
  lg: { width: 240, height: 340 },
};

export function PersonCard({
  id,
  name,
  role,
  photoPath,
  size = "sm",
}: PersonCardProps) {
  const { width, height } = sizeConfig[size];

  return (
    <Link
      href={`/people/${id}`}
      className="group flex-shrink-0 transition-transform hover:scale-[1.03]"
      style={{ width }}
    >
      {/* Photo */}
      <div
        className="relative overflow-hidden rounded-md bg-[var(--surface)]"
        style={{ width, height }}
      >
        {photoPath ? (
          <Image
            src={resolveImageSrc(photoPath)}
            alt={name}
            fill
            className="object-cover"
            sizes={`${width}px`}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground text-3xl">
            {name[0]?.toUpperCase()}
          </div>
        )}
      </div>

      {/* Name & role below poster */}
      <div className="mt-1.5 px-0.5 text-center">
        <p className="truncate text-sm font-medium text-foreground">{name}</p>
        {role && (
          <p className="truncate text-xs text-muted-foreground">{role}</p>
        )}
      </div>
    </Link>
  );
}
