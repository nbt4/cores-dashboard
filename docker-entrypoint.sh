#!/bin/sh
set -eu

# Named volumes are initially created as root. Hand the branding volume to the
# unprivileged application user before starting the server.
chown -R appuser:appgroup /var/lib/branding

exec su-exec appuser:appgroup "$@"
