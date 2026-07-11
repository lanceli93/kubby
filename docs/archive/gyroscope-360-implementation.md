# Gyroscope 360° View Control (Pending HTTPS)

Status: **Deferred** — requires HTTPS (Secure Context) which is not available in local dev.

## Overview

Mobile gyroscope support for the 360° panorama player. When enabled via a player button, the phone's physical orientation drives the camera direction — point the phone up to look at the sky, rotate to look around.

## Prerequisite

- **HTTPS required**: `DeviceOrientationEvent` only works in Secure Contexts. Local `http://` will silently deny permission.
- **iOS 13+**: Requires `DeviceOrientationEvent.requestPermission()` called from a user gesture (button click). Once denied, the user must reset in Settings > Safari.
- **Android Chrome**: No permission prompt needed, works automatically over HTTPS.

## Implementation Plan

### 3 files to modify

#### 1. `src/components/player/panorama-360-player.tsx`

Add `gyroEnabled` prop. When enabled, listen to `deviceorientation` events and map to camera lon/lat:

```tsx
// Add to props interface
gyroEnabled?: boolean;

// Add refs and effect inside the component
const gyroOffsetRef = useRef<{ lonOffset: number } | null>(null);

useEffect(() => {
  if (!gyroEnabled) {
    gyroOffsetRef.current = null;
    return;
  }

  const onOrientation = (e: DeviceOrientationEvent) => {
    if (e.alpha == null || e.beta == null) return;

    const alpha = e.alpha; // 0-360, compass heading
    const beta = e.beta;   // -180 to 180, tilt (90 = upright facing horizon)
    const screenAngle = window.screen?.orientation?.angle ?? 0;
    const adjustedAlpha = alpha + screenAngle; // landscape support

    // First event: compute offset to preserve current view direction
    if (!gyroOffsetRef.current) {
      gyroOffsetRef.current = { lonOffset: lonRef.current + adjustedAlpha };
    }

    lonRef.current = gyroOffsetRef.current.lonOffset - adjustedAlpha;
    latRef.current = Math.max(-85, Math.min(85, -(beta - 90)));
    updateCamera();
    renderOnce();
  };

  window.addEventListener("deviceorientation", onOrientation);
  return () => window.removeEventListener("deviceorientation", onOrientation);
}, [gyroEnabled, updateCamera, renderOnce]);
```

Orientation mapping:
- `alpha` (compass heading) → horizontal rotation (`lon`)
- `beta` (front-back tilt, 90° = upright) → vertical angle (`lat`), formula: `-(beta - 90)`
- `screenAngle` correction handles landscape mode
- Offset calculated on first event so toggling gyro doesn't jump the view

#### 2. `src/components/player/player-controls.tsx`

Add a `Compass` icon button, visible only in 360° mode on mobile:

```tsx
import { Compass } from "lucide-react";

// Add to PlayerControlsProps
gyroEnabled: boolean;
isMobile: boolean;
onToggleGyro: () => void;

// Button placement: after the 360° reset view button
{is360Mode && isMobile && (
  <button
    onClick={onToggleGyro}
    className={`transition-colors cursor-pointer ${
      gyroEnabled ? "text-primary" : "text-white/60 hover:text-white"
    }`}
    title={gyroEnabled ? "Gyroscope: ON" : "Gyroscope: OFF"}
  >
    <Compass className="h-5 w-5" />
  </button>
)}
```

#### 3. `src/app/(main)/movies/[id]/play/page.tsx`

State management + iOS permission handling:

```tsx
const [gyroEnabled, setGyroEnabled] = useState(false);

async function toggleGyro() {
  if (gyroEnabled) {
    setGyroEnabled(false);
    showOsd("Gyro OFF");
    return;
  }
  // iOS 13+ permission gate — must be called from user gesture
  const DOE = DeviceOrientationEvent as unknown as {
    requestPermission?: () => Promise<string>;
  };
  if (typeof DOE.requestPermission === "function") {
    try {
      const perm = await DOE.requestPermission();
      if (perm !== "granted") {
        showOsd("Gyro permission denied");
        return;
      }
    } catch {
      showOsd("Gyro permission error");
      return;
    }
  }
  setGyroEnabled(true);
  showOsd("Gyro ON");
}

// Pass to Panorama360Player:
//   gyroEnabled={gyroEnabled}
// Pass to PlayerControls:
//   gyroEnabled={gyroEnabled} isMobile={isMobile} onToggleGyro={toggleGyro}
// When toggling 360 off, also disable gyro:
//   if (!next) setGyroEnabled(false);
```

## Notes

- Touch drag still works when gyro is active (gyro sets the base, drag could add offset in a future enhancement)
- Closing 360° mode should auto-disable gyro
- The `isMobile` detection already exists in the player page: `/iPad|iPhone|iPod|Android/i.test(navigator.userAgent)`
