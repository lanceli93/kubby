package main

import (
	"fmt"
	"log"

	"github.com/getlantern/systray"
)

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
