package main

import (
	_ "embed"
	"runtime"
)

//go:embed assets/tray_icon.png
var iconDataMac []byte

//go:embed assets/icon.ico
var iconDataWinICO []byte

// trayIcon returns the platform-appropriate tray icon bytes.
// Windows systray requires ICO format; macOS/Linux use PNG.
func trayIcon() []byte {
	if runtime.GOOS == "windows" {
		return iconDataWinICO
	}
	return iconDataMac
}
