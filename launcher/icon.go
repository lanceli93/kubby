package main

import (
	_ "embed"
	"runtime"
)

//go:embed assets/tray_icon.png
var iconDataMac []byte

//go:embed assets/tray_icon_win.png
var iconDataWin []byte

// iconData returns the platform-appropriate tray icon.
func trayIcon() []byte {
	if runtime.GOOS == "windows" {
		return iconDataWin
	}
	return iconDataMac
}
