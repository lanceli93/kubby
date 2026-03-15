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

	// 2. Ensure config directory exists (fixed OS-default location)
	configDir := getDataDir()
	if err := ensureDir(configDir); err != nil {
		log.Fatalf("Failed to create config directory %s: %v", configDir, err)
	}

	// 3. Load or create config
	cfg, err := loadConfig()
	if err != nil {
		log.Fatalf("Failed to load config: %v", err)
	}
	log.Printf("Port: %d", cfg.Port)

	// 4. Resolve effective data directory
	//    Priority: KUBBY_DATA_DIR env > config.dataDir > OS default
	dataDir := configDir
	if cfg.DataDir != "" {
		dataDir = cfg.DataDir
	}
	if envDir := os.Getenv("KUBBY_DATA_DIR"); envDir != "" {
		dataDir = envDir
	}
	if err := ensureDir(dataDir); err != nil {
		log.Fatalf("Failed to create data directory %s: %v", dataDir, err)
	}
	log.Printf("Data directory: %s", dataDir)

	// 5. Single-instance check via lock file
	lockHandle, acquired := tryAcquireLock(dataDir)
	if !acquired {
		log.Printf("Another Kubby instance is running. Opening browser.")
		_ = openBrowser(serverURL(cfg.Port))
		return
	}
	defer releaseLock(lockHandle, dataDir)

	// 6. Load or generate AUTH_SECRET
	authSecret, err := loadOrCreateSecret(dataDir)
	if err != nil {
		log.Fatalf("Failed to load/create auth secret: %v", err)
	}

	// 7. Start Node.js server
	server, err := StartServer(resDir, dataDir, cfg.Port, authSecret)
	if err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}

	// 8. Wait for server to be ready
	if err := WaitReady(cfg.Port, 60*time.Second); err != nil {
		log.Printf("Warning: %v", err)
	}

	// 9. Open browser
	if !*noBrowser {
		url := serverURL(cfg.Port)
		log.Printf("Opening browser: %s", url)
		if err := openBrowser(url); err != nil {
			log.Printf("Failed to open browser: %v (access manually at %s)", err, url)
		}
	}

	// 10. Run with or without system tray
	if *noTray {
		runHeadless(server)
	} else {
		RunTray(&TrayApp{
			port:    cfg.Port,
			dataDir: dataDir,
			cfg:     cfg,
			server:  server,
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
