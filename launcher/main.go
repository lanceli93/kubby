package main

import (
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"
)

func main() {
	// Parse flags
	noTray := flag.Bool("no-tray", false, "Run without system tray (headless mode)")
	noBrowser := flag.Bool("no-browser", false, "Don't open browser on startup")
	flag.Parse()

	log.SetFlags(log.Ldate | log.Ltime | log.Lshortfile)
	log.Println("Kubby launcher starting...")

	// 1. Resolve resource directory (node/, server/, bin/)
	resDir, err := getResourceDir()
	if err != nil {
		log.Fatalf("Failed to determine resource directory: %v", err)
	}
	log.Printf("Resource directory: %s", resDir)

	// 2. Resolve & ensure data directory
	dataDir := getDataDir()
	if envDir := os.Getenv("KUBBY_DATA_DIR"); envDir != "" {
		dataDir = envDir
	}
	if err := ensureDir(dataDir); err != nil {
		log.Fatalf("Failed to create data directory %s: %v", dataDir, err)
	}
	log.Printf("Data directory: %s", dataDir)

	// 3. Load or create config
	cfg, err := loadConfig(dataDir)
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Port: %d", cfg.Port)

	// 4. Check if already running — if so, just open browser and exit
	if !IsPortAvailable(cfg.Port) {
		log.Printf("Port %d already in use — Kubby is likely running. Opening browser.", cfg.Port)
		_ = openBrowser(serverURL(cfg.Port))
		return
	}

	// 5. Load or generate AUTH_SECRET
	authSecret, err := loadOrCreateSecret(dataDir)
	if err != nil {
		log.Fatalf("Failed to load/create auth secret: %v", err)
	}

	// 6. Start Node.js server
	server, err := StartServer(resDir, dataDir, cfg.Port, authSecret)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	// 7. Wait for server to be ready
	if err := WaitReady(cfg.Port, 60*time.Second); err != nil {
		log.Printf("Warning: %v", err)
	}

	// 8. Open browser
	if !*noBrowser {
		url := serverURL(cfg.Port)
		log.Printf("Opening browser: %s", url)
		if err := openBrowser(url); err != nil {
			log.Printf("Failed to open browser: %v (access manually at %s)", err, url)
		}
	}

	// 9. Run with or without system tray
	if *noTray {
		runHeadless(server)
	} else {
		RunTray(&TrayApp{
			port:   cfg.Port,
			server: server,
		})
	}

	fmt.Println("Kubby stopped.")
}

// runHeadless blocks until an OS signal is received, then shuts down.
func runHeadless(server *Server) {
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	log.Println("Running in headless mode (Ctrl+C to quit)")
	sig := <-sigCh
	log.Printf("Received signal: %v", sig)
	server.Stop()
}
