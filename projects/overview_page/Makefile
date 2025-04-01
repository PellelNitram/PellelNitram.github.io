.PHONY: build serve clean prod

# Default port for the local server
PORT = 8000

# Build the site in development mode (no analytics)
build:
	python3 generate_site.py --dev

# Build the site for production (includes analytics)
prod:
	python3 generate_site.py

# Serve the site locally
serve: build
	@echo "Starting server at http://localhost:$(PORT)"
	@python3 -m http.server $(PORT)

# Clean generated files
clean:
	rm -f index.html 