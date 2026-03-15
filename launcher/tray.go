package main

import (
	"fmt"
	"log"
	"os"
	"path/filepath"

	"github.com/getlantern/systray"
)

// TrayApp holds references needed by the system tray.
type TrayApp struct {
	port    int
	dataDir string
	cfg     *Config
	server  *Server
	onQuit  func()
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
	mChangeDir := systray.AddMenuItem("Change Data Directory...", "Change where Kubby stores data")
	systray.AddSeparator()
	mQuit := systray.AddMenuItem("Quit", "Quit Kubby")

	go func() {
		for {
			select {
			case <-mOpen.ClickedCh:
				log.Println("Opening browser...")
				_ = openBrowser(serverURL(app.port))
			case <-mChangeDir.ClickedCh:
				handleChangeDataDir(app)
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

// handleChangeDataDir handles the "Change Data Directory..." menu action.
func handleChangeDataDir(app *TrayApp) {
	newDir, ok := pickFolder("Select Kubby Data Directory")
	if !ok || newDir == "" {
		return
	}

	newDir = filepath.Clean(newDir)
	oldDir := filepath.Clean(app.dataDir)

	if newDir == oldDir {
		showInfo("Kubby", "This is already the current data directory.")
		return
	}

	// Check if destination already has Kubby data
	if _, err := os.Stat(filepath.Join(newDir, "kubby.db")); err == nil {
		if !confirmYesNo("Existing Data Found",
			"The selected directory already contains Kubby data.\nUsing it will replace your current data.\n\nContinue?") {
			return
		}
	} else {
		// Offer to migrate existing data to the new location
		if _, err := os.Stat(filepath.Join(oldDir, "kubby.db")); err == nil {
			if confirmYesNo("Migrate Data?",
				"Migrate existing data to the new directory?\n\nFrom: "+oldDir+"\nTo: "+newDir+"\n\nChoose 'No' to start fresh.") {
				if err := migrateData(oldDir, newDir); err != nil {
					showInfo("Migration Failed",
						"Failed to migrate data: "+err.Error()+"\n\nThe data directory was NOT changed.")
					return
				}
			}
		}
	}

	// Save new dataDir to config
	app.cfg.DataDir = newDir
	if err := saveConfig(app.cfg); err != nil {
		showInfo("Error", "Failed to save configuration: "+err.Error())
		return
	}

	log.Printf("Data directory changed to: %s", newDir)
	showInfo("Restart Required",
		"Data directory changed to:\n"+newDir+"\n\nPlease restart Kubby for the change to take effect.")
}
