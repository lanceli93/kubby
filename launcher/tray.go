package main

import (
	"fmt"
	"log"
	"runtime"
	"time"

	"fyne.io/systray"
)

// doubleClickInterval is the maximum gap between two tray left-clicks for them
// to count as a double-click.
const doubleClickInterval = 400 * time.Millisecond

// TrayApp holds references needed by the system tray.
type TrayApp struct {
	port   int
	server *Server
	onQuit func()
}

// RunTray starts the system tray and blocks until Quit is clicked.
func RunTray(app *TrayApp) {
	systray.Run(func() { onReady(app) }, func() { onExit(app) })
}

func onReady(app *TrayApp) {
	systray.SetTitle("Kubby")
	systray.SetTooltip(fmt.Sprintf("Kubby — localhost:%d", app.port))

	// Set platform-appropriate tray icon
	if icon := trayIcon(); len(icon) > 0 {
		systray.SetIcon(icon)
	}

	mOpen := systray.AddMenuItem("Open Kubby", "Open in browser")
	systray.AddMenuItem(fmt.Sprintf("Port: %d", app.port), "Current port").Disable()
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit Kubby")

	// On Windows, wire a left-click handler so a DOUBLE left-click opens the
	// web UI directly. A single click does nothing; the right-click menu
	// (Open Kubby / Quit) is unaffected. We only do this on Windows because
	// setting a tap handler suppresses the default single-click-opens-menu
	// behavior, which is the expected convention on macOS/Linux.
	if runtime.GOOS == "windows" {
		// SetOnTapped's callback is invoked from systray's single message-loop
		// goroutine, so lastTap needs no synchronization.
		var lastTap time.Time
		systray.SetOnTapped(func() {
			now := time.Now()
			if !lastTap.IsZero() && now.Sub(lastTap) <= doubleClickInterval {
				lastTap = time.Time{} // reset so a triple-click doesn't double-fire
				log.Println("Tray double-click: opening browser...")
				_ = openBrowser(serverURL(app.port))
				return
			}
			lastTap = now
		})
	}

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				log.Println("Opening browser...")
				_ = openBrowser(serverURL(app.port))
			case <-mQuit.ClickedCh:
				log.Println("Quit requested from tray")
				systray.Quit()
				return
			}
		}
	}()
}

func onExit(app *TrayApp) {
	if app.server != nil {
		app.server.Stop()
	}
	if app.onQuit != nil {
		app.onQuit()
	}
}
