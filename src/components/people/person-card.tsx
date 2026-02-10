import Link from "next/link";
import Image from "next/image";

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
      className="group flex-shrink-0 overflow-hidden rounded-xl transition-transform hover:scale-[1.03]"
      style={{ width, height }}
    >
      <div className="relative h-full w-full bg-[var(--surface)]">
        {photoPath ? (
          <Image
            src={`/api/images/${encodeURIComponent(photoPath)}`}
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

        {/* Bottom gradient overlay */}
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/90 to-transparent" />

        {/* Name & role */}
        <div className="absolute inset-x-0 bottom-0 px-3 pb-2">
          <p className="truncate text-sm font-medium text-white">{name}</p>
          {role && (
            <p className="truncate text-xs text-[#8888a0]">{role}</p>
          )}
        </div>
      </div>
    </Link>
  );
}
