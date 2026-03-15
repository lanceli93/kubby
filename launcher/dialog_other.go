//go:build !windows

package main

import (
	"os/exec"
	"runtime"
	"strings"
)

// pickFolder opens a native folder picker dialog.
func pickFolder(title string) (string, bool) {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		safeTitle := strings.ReplaceAll(title, `"`, `\"`)
		cmd = exec.Command("osascript",
			"-e", `set chosenFolder to choose folder with prompt "`+safeTitle+`"`,
			"-e", `POSIX path of chosenFolder`)
	default: // linux
		cmd = exec.Command("zenity", "--file-selection", "--directory", "--title="+title)
	}
	out, err := cmd.Output()
	if err != nil {
		return "", false
	}
	result := strings.TrimSpace(string(out))
	if result == "" {
		return "", false
	}
	return result, true
}

// showInfo displays an informational message.
func showInfo(title, message string) {
	switch runtime.GOOS {
	case "darwin":
		safeMsg := strings.ReplaceAll(message, `"`, `\"`)
		safeTitle := strings.ReplaceAll(title, `"`, `\"`)
		exec.Command("osascript", "-e",
			`display dialog "`+safeMsg+`" with title "`+safeTitle+`" buttons {"OK"} default button "OK"`).Run()
	default:
		exec.Command("zenity", "--info", "--title="+title, "--text="+message).Run()
	}
}

// confirmYesNo displays a Yes/No question dialog. Returns true if Yes.
func confirmYesNo(title, message string) bool {
	var cmd *exec.Cmd
	switch runtime.GOOS {
	case "darwin":
		safeMsg := strings.ReplaceAll(message, `"`, `\"`)
		safeTitle := strings.ReplaceAll(title, `"`, `\"`)
		cmd = exec.Command("osascript", "-e",
			`display dialog "`+safeMsg+`" with title "`+safeTitle+`" buttons {"No", "Yes"} default button "Yes"`)
	default:
		cmd = exec.Command("zenity", "--question", "--title="+title, "--text="+message)
	}
	return cmd.Run() == nil
}
