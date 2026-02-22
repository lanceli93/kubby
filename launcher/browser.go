package main

import (
	"fmt"
	"os/exec"
	"runtime"
)

// openBrowser opens the default browser to the given URL.
func openBrowser(url string) error {
	switch runtime.GOOS {
	case "darwin":
		return exec.Command("open", url).Start()
	case "windows":
		return exec.Command("cmd", "/c", "start", url).Start()
	default: // linux
		return exec.Command("xdg-open", url).Start()
	}
}

// serverURL returns the base URL for the given port.
func serverURL(port int) string {
	return fmt.Sprintf("http://localhost:%d", port)
}
