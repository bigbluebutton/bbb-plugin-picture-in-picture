#!/bin/bash

# Copies the built plugin (dist/) into the running BBB Docker container.
# Usage:  ./scripts/copy-plugin-to-container.sh [containerName]
#
# containerName defaults to $LOCAL_CONTAINER_NAME from .env when omitted.

set -e

SCRIPT_DIR=$(dirname "$(readlink -f "$0")")
PLUGIN_ROOT="$SCRIPT_DIR/.."

# Load .env from the plugin root
ENV_FILE="$PLUGIN_ROOT/.env"
if [ -f "$ENV_FILE" ]; then
  set -o allexport
  source "$ENV_FILE"
  set +o allexport
fi

PLUGIN_NAME="picture-in-picture"
CONTAINER_NAME=${1:-$LOCAL_CONTAINER_NAME}

if [ -z "$CONTAINER_NAME" ]; then
  echo "Container name is not provided. Pass it as an argument or set LOCAL_CONTAINER_NAME in .env."
  exit 1
fi

PLUGINS_FOLDER_CONTAINER_PATH="/var/www/bigbluebutton-default/assets/plugins"
PLUGIN_CONTAINER_PATH="$PLUGINS_FOLDER_CONTAINER_PATH/$PLUGIN_NAME"

# Verify the container is running
if ! docker ps -q --filter "name=$CONTAINER_NAME" | grep -q .; then
  echo "Container '$CONTAINER_NAME' is not running. Exiting."
  exit 1
fi

# Verify the dist/ folder exists locally
if [ ! -d "$PLUGIN_ROOT/dist" ]; then
  echo "dist/ folder not found. Run 'npm run build-bundle' first."
  exit 1
fi

# Remove stale files in the container and recreate the target directory
if docker exec "$CONTAINER_NAME" [ -d "$PLUGIN_CONTAINER_PATH" ]; then
  docker exec "$CONTAINER_NAME" rm -rf "$PLUGIN_CONTAINER_PATH"
fi

echo "Creating container path: $PLUGIN_CONTAINER_PATH ..."
docker exec "$CONTAINER_NAME" mkdir -p "$PLUGIN_CONTAINER_PATH"

echo "Copying dist/ to $CONTAINER_NAME:$PLUGIN_CONTAINER_PATH/dist ..."
docker cp "$PLUGIN_ROOT/dist/." "$CONTAINER_NAME:$PLUGIN_CONTAINER_PATH/dist"

echo "Done. Plugin deployed to $CONTAINER_NAME at $PLUGIN_CONTAINER_PATH/dist"
