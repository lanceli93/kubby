.PHONY: build build-darwin build-windows build-linux clean tidy

# Default: build for current platform
build:
	go build -o kubby .

build-darwin:
	GOOS=darwin GOARCH=arm64 go build -o kubby-darwin-arm64 .

build-darwin-amd64:
	GOOS=darwin GOARCH=amd64 go build -o kubby-darwin-amd64 .

build-windows:
	GOOS=windows GOARCH=amd64 CGO_ENABLED=0 go build -ldflags "-H=windowsgui" -o kubby.exe .

build-linux:
	GOOS=linux GOARCH=amd64 go build -o kubby-linux-amd64 .

tidy:
	go mod tidy

clean:
	rm -f kubby kubby-darwin-arm64 kubby-darwin-amd64 kubby.exe kubby-linux-amd64
